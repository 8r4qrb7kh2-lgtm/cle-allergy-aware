-- Fix ingredient_scan_appeals RLS policies that are causing statement timeout
-- This removes the is_admin() function which queries auth.users and causes timeouts
-- Replaces it with simpler policies

-- Drop ALL existing policies to start fresh and avoid conflicts
DROP POLICY IF EXISTS "Admins can view all appeals" ON ingredient_scan_appeals;
DROP POLICY IF EXISTS "Admins can update all appeals" ON ingredient_scan_appeals;
DROP POLICY IF EXISTS "Managers can insert appeals for their restaurants" ON ingredient_scan_appeals;
DROP POLICY IF EXISTS "Managers can view appeals for their restaurants" ON ingredient_scan_appeals;
DROP POLICY IF EXISTS "Anyone can read appeals" ON ingredient_scan_appeals;
DROP POLICY IF EXISTS "Anyone can insert appeals" ON ingredient_scan_appeals;
DROP POLICY IF EXISTS "Service role can manage all appeals" ON ingredient_scan_appeals;
DROP POLICY IF EXISTS "Admin can view appeals by email" ON ingredient_scan_appeals;
DROP POLICY IF EXISTS "Admin can update appeals by email" ON ingredient_scan_appeals;
-- Also drop these in case this migration was run previously
DROP POLICY IF EXISTS "Authenticated users can update appeals" ON ingredient_scan_appeals;
DROP POLICY IF EXISTS "Authenticated users can delete appeals" ON ingredient_scan_appeals;

-- Create public read policy - allows anyone to read appeals
CREATE POLICY "Anyone can read appeals"
ON ingredient_scan_appeals
FOR SELECT
TO public
USING (true);

-- Create public insert policy - allows anyone to insert appeals
CREATE POLICY "Anyone can insert appeals"
ON ingredient_scan_appeals
FOR INSERT
TO public
WITH CHECK (true);

-- Create authenticated update policy - allows authenticated users to update
-- This is needed for admin to approve/deny appeals
-- The application layer (admin-restaurant-view.html) already checks admin email
CREATE POLICY "Authenticated users can update appeals"
ON ingredient_scan_appeals
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Create authenticated delete policy - allows authenticated users to delete
-- This is needed for managers to remove their own appeals
CREATE POLICY "Authenticated users can delete appeals"
ON ingredient_scan_appeals
FOR DELETE
TO authenticated
USING (true);

-- Create service role policy - allows service role full access
CREATE POLICY "Service role can manage all appeals"
ON ingredient_scan_appeals
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Note: Admin authorization handled at application layer via email check
-- This avoids the slow is_admin() function that queries auth.users

