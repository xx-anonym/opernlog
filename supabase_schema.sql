-- OpernLog Database Schema
-- Run this in Supabase SQL Editor

-- Profiles
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  bio TEXT DEFAULT '',
  avatar_initials TEXT DEFAULT '',
  avatar_icon TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles sind öffentlich lesbar" ON profiles FOR SELECT USING (true);
CREATE POLICY "User kann eigenes Profil ändern" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "User kann Profil erstellen" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Visits
CREATE TABLE IF NOT EXISTS visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  house_id TEXT NOT NULL,
  opera_id TEXT NOT NULL,
  date DATE NOT NULL,
  rating DECIMAL(2,1) NOT NULL,
  review TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Visits sind öffentlich lesbar" ON visits FOR SELECT USING (true);
CREATE POLICY "User kann eigene Visits erstellen" ON visits FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "User kann eigene Visits löschen" ON visits FOR DELETE USING (auth.uid() = user_id);

-- Follows
CREATE TABLE IF NOT EXISTS follows (
  follower_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  following_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id)
);

ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Follows sind öffentlich lesbar" ON follows FOR SELECT USING (true);
CREATE POLICY "User kann folgen" ON follows FOR INSERT WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "User kann entfolgen" ON follows FOR DELETE USING (auth.uid() = follower_id);

-- Invites
CREATE TABLE IF NOT EXISTS invites (
  code TEXT PRIMARY KEY,
  created_by UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Invites sind öffentlich lesbar" ON invites FOR SELECT USING (true);
CREATE POLICY "User kann Invites erstellen" ON invites FOR INSERT WITH CHECK (auth.uid() = created_by);

-- RPC Function for accepting invites securely (mutual follow)
CREATE OR REPLACE FUNCTION accept_invite(invite_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
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
    FROM invites
    WHERE code = invite_code AND (expires_at IS NULL OR expires_at > now());

    IF v_inviter_id IS NULL THEN
        RAISE EXCEPTION 'Ungültiger oder abgelaufener Einladungslink';
    END IF;

    IF v_inviter_id = v_accepter_id THEN
        RAISE EXCEPTION 'Du kannst deinen eigenen Einladungslink nicht verwenden';
    END IF;

    -- Create mutual follow
    INSERT INTO follows (follower_id, following_id) 
    VALUES (v_accepter_id, v_inviter_id)
    ON CONFLICT (follower_id, following_id) DO NOTHING;

    INSERT INTO follows (follower_id, following_id) 
    VALUES (v_inviter_id, v_accepter_id)
    ON CONFLICT (follower_id, following_id) DO NOTHING;

    RETURN v_inviter_id;
END;
$$;

-- Lists
CREATE TABLE IF NOT EXISTS lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  type TEXT NOT NULL,
  items TEXT[] NOT NULL DEFAULT '{}',
  is_public BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Öffentliche Listen sind lesbar" ON lists FOR SELECT USING (is_public = true OR auth.uid() = user_id);
CREATE POLICY "User kann Listen erstellen" ON lists FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "User kann eigene Listen löschen" ON lists FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "User kann eigene Listen ändern" ON lists FOR UPDATE USING (auth.uid() = user_id);

-- Likes (für Visits und Listen)
CREATE TABLE IF NOT EXISTS likes (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL, -- 'visit' oder 'list'
  target_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, target_type, target_id)
);

ALTER TABLE likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Likes sind öffentlich lesbar" ON likes FOR SELECT USING (true);
CREATE POLICY "User kann liken" ON likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "User kann unlike" ON likes FOR DELETE USING (auth.uid() = user_id);

-- Comments (für Visits)
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  target_id UUID NOT NULL, -- visit_id
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Comments sind öffentlich lesbar" ON comments FOR SELECT USING (true);
CREATE POLICY "User kann kommentieren" ON comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "User kann eigene Kommentare löschen" ON comments FOR DELETE USING (auth.uid() = user_id);
