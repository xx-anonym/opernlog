-- Migration: search_path für alle SECURITY DEFINER-Funktionen festnageln
--
-- SECURITY DEFINER-Funktionen laufen mit den Rechten ihres Besitzers (postgres)
-- und umgehen damit RLS. Ohne festes search_path bestimmt der Aufrufer, in
-- welchen Schemas unqualifizierte Namen wie "profiles" oder "follows" gesucht
-- werden. Wer ein Schema anlegen und in sein search_path aufnehmen kann, kann
-- der Funktion so eigene Tabellen oder Funktionen unterschieben, die dann mit
-- postgres-Rechten laufen. Supabase' Datenbank-Linter meldet das als
-- "Function has a role mutable search_path".
--
-- Die Funktionslogik bleibt unveraendert. Neu ist ausschliesslich:
--   SET search_path = ''   und die Qualifizierung aller Tabellen mit public.
--
-- CREATE OR REPLACE behaelt bestehende GRANTs bei, es muss nichts neu
-- vergeben werden.
--
-- In Supabase im SQL Editor ausfuehren.

-- 1. accept_invite ------------------------------------------------------
CREATE OR REPLACE FUNCTION accept_invite(invite_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_inviter_id uuid;
    v_accepter_id uuid;
BEGIN
    v_accepter_id := auth.uid();
    IF v_accepter_id IS NULL THEN
        RAISE EXCEPTION 'Nicht eingeloggt';
    END IF;

    -- Find valid invite
    SELECT created_by INTO v_inviter_id
    FROM public.invites
    WHERE code = invite_code AND (expires_at IS NULL OR expires_at > now());

    IF v_inviter_id IS NULL THEN
        RAISE EXCEPTION 'Ungültiger oder abgelaufener Einladungslink';
    END IF;

    IF v_inviter_id = v_accepter_id THEN
        RAISE EXCEPTION 'Du kannst deinen eigenen Einladungslink nicht verwenden';
    END IF;

    -- Create mutual follow
    INSERT INTO public.follows (follower_id, following_id)
    VALUES (v_accepter_id, v_inviter_id)
    ON CONFLICT (follower_id, following_id) DO NOTHING;

    INSERT INTO public.follows (follower_id, following_id)
    VALUES (v_inviter_id, v_accepter_id)
    ON CONFLICT (follower_id, following_id) DO NOTHING;

    RETURN v_inviter_id;
END;
$$;

-- 2. send_friend_request ------------------------------------------------
CREATE OR REPLACE FUNCTION send_friend_request(target_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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
    FROM public.profiles WHERE id = target_user_id;

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
    SELECT 1 FROM public.follows WHERE follower_id = current_user_id AND following_id = target_user_id
  ) AND EXISTS (
    SELECT 1 FROM public.follows WHERE follower_id = target_user_id AND following_id = current_user_id
  ) THEN
    RAISE EXCEPTION 'Already friends';
  END IF;

  -- Check for existing pending request in either direction
  IF EXISTS (
    SELECT 1 FROM public.friend_requests
    WHERE sender_id = current_user_id AND receiver_id = target_user_id AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Request already sent';
  END IF;

  -- If there's a pending request FROM the target TO us, auto-accept it instead
  IF EXISTS (
    SELECT 1 FROM public.friend_requests
    WHERE sender_id = target_user_id AND receiver_id = current_user_id AND status = 'pending'
  ) THEN
    -- Accept that request (mutual friendship)
    UPDATE public.friend_requests SET status = 'accepted'
      WHERE sender_id = target_user_id AND receiver_id = current_user_id AND status = 'pending'
      RETURNING id INTO new_id;

    INSERT INTO public.follows (follower_id, following_id)
      VALUES (current_user_id, target_user_id) ON CONFLICT DO NOTHING;
    INSERT INTO public.follows (follower_id, following_id)
      VALUES (target_user_id, current_user_id) ON CONFLICT DO NOTHING;

    RETURN new_id;
  END IF;

  -- Delete any old declined request so user can re-request
  DELETE FROM public.friend_requests
    WHERE sender_id = current_user_id AND receiver_id = target_user_id AND status = 'declined';

  -- Create new request
  INSERT INTO public.friend_requests (sender_id, receiver_id)
    VALUES (current_user_id, target_user_id)
    RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

-- 3. accept_friend_request ----------------------------------------------
CREATE OR REPLACE FUNCTION accept_friend_request(request_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  req RECORD;
BEGIN
  SELECT * INTO req FROM public.friend_requests
    WHERE id = request_id AND receiver_id = auth.uid() AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or not authorized';
  END IF;

  -- Create mutual follows
  INSERT INTO public.follows (follower_id, following_id)
    VALUES (req.sender_id, req.receiver_id) ON CONFLICT DO NOTHING;
  INSERT INTO public.follows (follower_id, following_id)
    VALUES (req.receiver_id, req.sender_id) ON CONFLICT DO NOTHING;

  -- Mark request as accepted
  UPDATE public.friend_requests SET status = 'accepted' WHERE id = request_id;
END;
$$;

-- 4. decline_friend_request ---------------------------------------------
CREATE OR REPLACE FUNCTION decline_friend_request(request_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.friend_requests SET status = 'declined'
    WHERE id = request_id AND receiver_id = auth.uid() AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or not authorized';
  END IF;

  -- Delete declined request so sender can re-request in the future
  DELETE FROM public.friend_requests
    WHERE id = request_id AND receiver_id = auth.uid() AND status = 'declined';
END;
$$;

-- 5. unfriend -----------------------------------------------------------
CREATE OR REPLACE FUNCTION unfriend(target_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id UUID;
BEGIN
  current_user_id := auth.uid();

  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Delete follows in both directions
  DELETE FROM public.follows
    WHERE (follower_id = current_user_id AND following_id = target_user_id)
       OR (follower_id = target_user_id AND following_id = current_user_id);

  -- Clean up any friend requests between the two users
  DELETE FROM public.friend_requests
    WHERE (sender_id = current_user_id AND receiver_id = target_user_id)
       OR (sender_id = target_user_id AND receiver_id = current_user_id);
END;
$$;

-- Kontrolle: alle fuenf Zeilen muessen search_path=... in prosecdef-Funktionen zeigen
--
--   SELECT p.proname, p.prosecdef, p.proconfig
--   FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.prosecdef
--   ORDER BY p.proname;
