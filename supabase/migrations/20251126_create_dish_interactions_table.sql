-- Create dish_interactions table if it doesn't exist
-- This table tracks when users view/interact with dishes

CREATE TABLE IF NOT EXISTS dish_interactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id uuid REFERENCES restaurants(id) ON DELETE CASCADE,
  dish_name text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  user_allergens text[] DEFAULT '{}',
  user_diets text[] DEFAULT '{}',
  dish_status text, -- 'safe', 'removable', 'unsafe', 'neutral'
  created_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_dish_interactions_restaurant ON dish_interactions(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_dish_interactions_user ON dish_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_dish_interactions_dish ON dish_interactions(dish_name);

-- Enable RLS
ALTER TABLE dish_interactions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can insert their own interactions" ON dish_interactions;
DROP POLICY IF EXISTS "Authenticated users can read interactions" ON dish_interactions;

-- Allow authenticated users to insert their own interactions
CREATE POLICY "Users can insert their own interactions" ON dish_interactions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Allow authenticated users to read all interactions (for analytics)
CREATE POLICY "Authenticated users can read interactions" ON dish_interactions
  FOR SELECT
  USING (auth.role() = 'authenticated');
