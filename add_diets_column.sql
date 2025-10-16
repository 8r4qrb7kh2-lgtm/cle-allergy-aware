-- Add diets column to user_allergies table
-- This column will store an array of dietary preference strings
-- Run this SQL in your Supabase SQL Editor

ALTER TABLE user_allergies
ADD COLUMN IF NOT EXISTS diets text[] DEFAULT '{}';

-- Add a comment to document the column
COMMENT ON COLUMN user_allergies.diets IS 'Array of dietary preferences (Vegan, Vegetarian, Pescatarian, Kosher, Halal)';
