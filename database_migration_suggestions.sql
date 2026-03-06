CREATE TABLE IF NOT EXISTS suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('opera', 'house')),
  name TEXT NOT NULL,
  composer TEXT, -- Optional, only used if type = 'opera'
  location TEXT, -- Optional, only used if type = 'house'
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- Only one pending suggestion per user per type is allowed. We can't easily enforce 'pending only' with UNIQUE,
  -- but we can just use application-level checks, or a unique index on pending.
  -- For now, application level logic is enough.
  UNIQUE(id)
);

-- Ensure we only allow one PENDING suggestion per user per type
CREATE UNIQUE INDEX idx_one_pending_suggestion_per_type 
ON suggestions (user_id, type) 
WHERE status = 'pending';

-- Enable RLS
ALTER TABLE suggestions ENABLE ROW LEVEL SECURITY;

-- Users can read their own suggestions
CREATE POLICY "User kann eigene Suggestions lesen" 
ON suggestions FOR SELECT 
USING (auth.uid() = user_id);

-- Users can insert their own suggestions
CREATE POLICY "User kann Suggestions erstellen" 
ON suggestions FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Note: Only Jonas (admin) should be able to update or delete, which can be done via Supabase Dashboard,
-- so no update/delete policies for regular users are needed.
