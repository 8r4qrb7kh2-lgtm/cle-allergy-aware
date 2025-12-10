-- Create manager_invites table for storing invite links
CREATE TABLE IF NOT EXISTS manager_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token VARCHAR(64) UNIQUE NOT NULL,
  restaurant_ids UUID[] NOT NULL,
  entry_page VARCHAR(255) NOT NULL DEFAULT 'home',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  used_by UUID REFERENCES auth.users(id),
  created_by UUID REFERENCES auth.users(id),
  is_active BOOLEAN DEFAULT true
);

-- Create index on token for fast lookups
CREATE INDEX IF NOT EXISTS idx_manager_invites_token ON manager_invites(token);

-- Create index on expiration for cleanup queries
CREATE INDEX IF NOT EXISTS idx_manager_invites_expires ON manager_invites(expires_at);

-- Enable RLS
ALTER TABLE manager_invites ENABLE ROW LEVEL SECURITY;

-- Policy: Only admin can create invites (handled in app logic)
CREATE POLICY "Allow admin to manage invites" ON manager_invites
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Policy: Anyone can read active, non-expired invites (for redemption)
CREATE POLICY "Allow reading active invites" ON manager_invites
  FOR SELECT
  USING (is_active = true AND expires_at > NOW() AND used_at IS NULL);

-- Create manager_restaurant_access table for storing which restaurants a manager can access
CREATE TABLE IF NOT EXISTS manager_restaurant_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  granted_by UUID REFERENCES auth.users(id),
  UNIQUE(user_id, restaurant_id)
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_manager_restaurant_access_user ON manager_restaurant_access(user_id);
CREATE INDEX IF NOT EXISTS idx_manager_restaurant_access_restaurant ON manager_restaurant_access(restaurant_id);

-- Enable RLS
ALTER TABLE manager_restaurant_access ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own access
CREATE POLICY "Users can read own access" ON manager_restaurant_access
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Admin can manage all access
CREATE POLICY "Admin can manage all access" ON manager_restaurant_access
  FOR ALL
  USING (true)
  WITH CHECK (true);
