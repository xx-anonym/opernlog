-- ============================================================
-- OpernLog: Friend Request System Migration
-- ============================================================
-- Run this in the Supabase SQL Editor BEFORE deploying the new frontend code.
-- ============================================================

-- 1. Add privacy setting column to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS friend_request_privacy TEXT DEFAULT 'everyone'
  CHECK (friend_request_privacy IN ('everyone', 'link_only', 'nobody'));

-- 2. Create friend_requests table
CREATE TABLE IF NOT EXISTS friend_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  receiver_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sender_id, receiver_id)
);

-- 3. RLS Policies for friend_requests
ALTER TABLE friend_requests ENABLE ROW LEVEL SECURITY;

-- Users can see requests they sent or received
CREATE POLICY "Users can view own friend requests"
  ON friend_requests FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Insert/Update/Delete handled by SECURITY DEFINER RPCs below
-- But we need a basic insert policy for the RPC to work when not using SECURITY DEFINER on insert
-- Actually, all mutations go through SECURITY DEFINER RPCs, so we don't need INSERT/UPDATE/DELETE policies.

-- 4. RPC: send_friend_request
CREATE OR REPLACE FUNCTION send_friend_request(target_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  privacy_setting TEXT;
  new_id UUID;
  current_user_id UUID;
BEGIN
  current_user_id := auth.uid();

  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF current_user_id = target_user_id THEN
    RAISE EXCEPTION 'Cannot send friend request to yourself';
  END IF;

  -- Check privacy setting of target user
  SELECT friend_request_privacy INTO privacy_setting
    FROM profiles WHERE id = target_user_id;

  IF privacy_setting IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF privacy_setting = 'nobody' THEN
    RAISE EXCEPTION 'User does not accept friend requests';
  END IF;

  IF privacy_setting = 'link_only' THEN
    RAISE EXCEPTION 'User only accepts friend requests via invite link';
  END IF;

  -- Check if already friends (mutual follows)
  IF EXISTS (
    SELECT 1 FROM follows WHERE follower_id = current_user_id AND following_id = target_user_id
  ) AND EXISTS (
    SELECT 1 FROM follows WHERE follower_id = target_user_id AND following_id = current_user_id
  ) THEN
    RAISE EXCEPTION 'Already friends';
  END IF;

  -- Check for existing pending request in either direction
  IF EXISTS (
    SELECT 1 FROM friend_requests
    WHERE sender_id = current_user_id AND receiver_id = target_user_id AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Request already sent';
  END IF;

  -- If there's a pending request FROM the target TO us, auto-accept it instead
  IF EXISTS (
    SELECT 1 FROM friend_requests
    WHERE sender_id = target_user_id AND receiver_id = current_user_id AND status = 'pending'
  ) THEN
    -- Accept that request (mutual friendship)
    UPDATE friend_requests SET status = 'accepted'
      WHERE sender_id = target_user_id AND receiver_id = current_user_id AND status = 'pending'
      RETURNING id INTO new_id;

    INSERT INTO follows (follower_id, following_id)
      VALUES (current_user_id, target_user_id) ON CONFLICT DO NOTHING;
    INSERT INTO follows (follower_id, following_id)
      VALUES (target_user_id, current_user_id) ON CONFLICT DO NOTHING;

    RETURN new_id;
  END IF;

  -- Delete any old declined request so user can re-request
  DELETE FROM friend_requests
    WHERE sender_id = current_user_id AND receiver_id = target_user_id AND status = 'declined';

  -- Create new request
  INSERT INTO friend_requests (sender_id, receiver_id)
    VALUES (current_user_id, target_user_id)
    RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

-- 5. RPC: accept_friend_request
CREATE OR REPLACE FUNCTION accept_friend_request(request_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  req RECORD;
BEGIN
  SELECT * INTO req FROM friend_requests
    WHERE id = request_id AND receiver_id = auth.uid() AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or not authorized';
  END IF;

  -- Create mutual follows
  INSERT INTO follows (follower_id, following_id)
    VALUES (req.sender_id, req.receiver_id) ON CONFLICT DO NOTHING;
  INSERT INTO follows (follower_id, following_id)
    VALUES (req.receiver_id, req.sender_id) ON CONFLICT DO NOTHING;

  -- Mark request as accepted
  UPDATE friend_requests SET status = 'accepted' WHERE id = request_id;
END;
$$;

-- 6. RPC: decline_friend_request
CREATE OR REPLACE FUNCTION decline_friend_request(request_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE friend_requests SET status = 'declined'
    WHERE id = request_id AND receiver_id = auth.uid() AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or not authorized';
  END IF;

  -- Delete declined request so sender can re-request in the future
  DELETE FROM friend_requests
    WHERE id = request_id AND status = 'declined';
END;
$$;

-- 7. RPC: unfriend (removes mutual follows)
CREATE OR REPLACE FUNCTION unfriend(target_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_user_id UUID;
BEGIN
  current_user_id := auth.uid();

  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Delete follows in both directions
  DELETE FROM follows
    WHERE (follower_id = current_user_id AND following_id = target_user_id)
       OR (follower_id = target_user_id AND following_id = current_user_id);

  -- Clean up any friend requests between the two users
  DELETE FROM friend_requests
    WHERE (sender_id = current_user_id AND receiver_id = target_user_id)
       OR (sender_id = target_user_id AND receiver_id = current_user_id);
END;
$$;

-- 8. Data migration: Convert existing one-way follows into friend requests
-- First, find one-way follows (A→B exists but B→A does not)
-- and convert them to pending friend requests.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT f.follower_id, f.following_id
    FROM follows f
    WHERE NOT EXISTS (
      SELECT 1 FROM follows f2
      WHERE f2.follower_id = f.following_id AND f2.following_id = f.follower_id
    )
  LOOP
    -- Create a pending friend request
    INSERT INTO friend_requests (sender_id, receiver_id, status, created_at)
      VALUES (r.follower_id, r.following_id, 'pending', NOW())
      ON CONFLICT (sender_id, receiver_id) DO NOTHING;

    -- Remove the one-way follow
    DELETE FROM follows
      WHERE follower_id = r.follower_id AND following_id = r.following_id;
  END LOOP;
END;
$$;

-- ============================================================
-- OPTIONAL: Email notification via pg_net + Resend
-- Uncomment the following if you have:
-- 1. pg_net extension enabled (Supabase Dashboard > Database > Extensions)
-- 2. A Resend API key configured:
--    ALTER DATABASE postgres SET app.resend_api_key = 'your-key-here';
-- ============================================================

/*
CREATE OR REPLACE FUNCTION notify_friend_request_email()
RETURNS TRIGGER AS $$
DECLARE
  sender_name TEXT;
  receiver_email TEXT;
  app_url TEXT := 'https://jonasschilberg.github.io/opernlog';
BEGIN
  SELECT username INTO sender_name FROM profiles WHERE id = NEW.sender_id;
  SELECT email INTO receiver_email FROM auth.users WHERE id = NEW.receiver_id;

  IF receiver_email IS NOT NULL AND sender_name IS NOT NULL THEN
    PERFORM net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.resend_api_key', true),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'from', 'OpernLog <noreply@opernlog.app>',
        'to', receiver_email,
        'subject', sender_name || ' möchte dein Freund auf OpernLog sein!',
        'html', '<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">'
          || '<h2 style="color:#c8a962">🎭 Neue Freundschaftsanfrage</h2>'
          || '<p><strong>' || sender_name || '</strong> möchte sich mit dir auf OpernLog verbinden.</p>'
          || '<p><a href="' || app_url || '" style="display:inline-block;background:#c8a962;color:#1a1a2e;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Anfrage ansehen</a></p>'
          || '<p style="color:#888;font-size:12px">Du erhältst diese E-Mail, weil du auf OpernLog registriert bist.</p>'
          || '</div>'
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_friend_request_created
  AFTER INSERT ON friend_requests
  FOR EACH ROW
  WHEN (NEW.status = 'pending')
  EXECUTE FUNCTION notify_friend_request_email();
*/
