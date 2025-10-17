-- Fix Row Level Security policies for restaurants table
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/fgoiyycctnwnghrvsilt/sql

-- First, check if RLS is enabled (it should be)
-- If you need to enable it: ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Allow authenticated users to insert restaurants" ON restaurants;
DROP POLICY IF EXISTS "Allow authenticated users to update restaurants" ON restaurants;
DROP POLICY IF EXISTS "Allow public read access to restaurants" ON restaurants;

-- Allow authenticated users to insert restaurants
CREATE POLICY "Allow authenticated users to insert restaurants"
ON restaurants
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow authenticated users to update restaurants
CREATE POLICY "Allow authenticated users to update restaurants"
ON restaurants
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Allow public read access to restaurants (so anyone can view)
CREATE POLICY "Allow public read access to restaurants"
ON restaurants
FOR SELECT
TO public
USING (true);

-- Verify policies were created
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'restaurants';
