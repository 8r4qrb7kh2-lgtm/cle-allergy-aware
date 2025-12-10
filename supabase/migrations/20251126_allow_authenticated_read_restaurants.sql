-- Allow all authenticated users to read restaurants
-- This fixes the issue where new users see no restaurants

-- First, ensure RLS is enabled (in case it's not)
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;

-- Drop existing select policy if any (to avoid conflicts)
DROP POLICY IF EXISTS "Authenticated users can read restaurants" ON restaurants;
DROP POLICY IF EXISTS "Anyone can read restaurants" ON restaurants;

-- Create policy allowing authenticated users to read all restaurants
CREATE POLICY "Authenticated users can read restaurants" ON restaurants
  FOR SELECT
  USING (auth.role() = 'authenticated');
