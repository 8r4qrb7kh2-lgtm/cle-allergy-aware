-- Create dish_interactions table to track when users interact with dishes
-- This allows restaurants to see diet/allergen profiles of users interested in each dish
CREATE TABLE IF NOT EXISTS dish_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  dish_name TEXT NOT NULL,
  -- Snapshot of user's diet/allergen profile at time of interaction
  user_allergens TEXT[] DEFAULT '{}',
  user_diets TEXT[] DEFAULT '{}',
  -- The status of the dish for this user (safe, removable, unsafe, neutral)
  dish_status TEXT NOT NULL,
  -- Allergens that affected this user specifically
  conflicting_allergens TEXT[] DEFAULT '{}',
  -- Diets that the dish doesn't meet for this user
  unmet_diets TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create accommodation_requests table for users to request dish accommodations
CREATE TABLE IF NOT EXISTS accommodation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  dish_name TEXT NOT NULL,
  -- Snapshot of user's profile at time of request
  user_allergens TEXT[] DEFAULT '{}',
  user_diets TEXT[] DEFAULT '{}',
  -- Specific allergens/diets they want accommodated
  requested_allergens TEXT[] DEFAULT '{}',
  requested_diets TEXT[] DEFAULT '{}',
  -- Optional message from user
  user_message TEXT,
  -- Request status: pending, reviewed, implemented, declined
  status TEXT DEFAULT 'pending',
  -- Manager response
  manager_response TEXT,
  manager_reviewed_at TIMESTAMP WITH TIME ZONE,
  manager_reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  -- One request per user per dish per restaurant
  UNIQUE(user_id, restaurant_id, dish_name)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_dish_interactions_restaurant ON dish_interactions(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_dish_interactions_dish ON dish_interactions(restaurant_id, dish_name);
CREATE INDEX IF NOT EXISTS idx_dish_interactions_user ON dish_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_dish_interactions_created ON dish_interactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dish_interactions_status ON dish_interactions(dish_status);

CREATE INDEX IF NOT EXISTS idx_accommodation_requests_restaurant ON accommodation_requests(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_accommodation_requests_dish ON accommodation_requests(restaurant_id, dish_name);
CREATE INDEX IF NOT EXISTS idx_accommodation_requests_user ON accommodation_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_accommodation_requests_status ON accommodation_requests(status);
CREATE INDEX IF NOT EXISTS idx_accommodation_requests_created ON accommodation_requests(created_at DESC);

-- Enable RLS
ALTER TABLE dish_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE accommodation_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies for dish_interactions
-- Users can insert their own interactions
CREATE POLICY "Users can insert own interactions" ON dish_interactions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can view their own interactions
CREATE POLICY "Users can view own interactions" ON dish_interactions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Restaurant managers can view interactions for their restaurants
CREATE POLICY "Managers can view restaurant interactions" ON dish_interactions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM restaurant_managers
      WHERE restaurant_managers.restaurant_id = dish_interactions.restaurant_id
      AND restaurant_managers.user_id = auth.uid()
    )
  );

-- RLS Policies for accommodation_requests
-- Users can insert their own requests
CREATE POLICY "Users can insert own requests" ON accommodation_requests
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can view their own requests
CREATE POLICY "Users can view own requests" ON accommodation_requests
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can update their own pending requests (e.g., add message)
CREATE POLICY "Users can update own pending requests" ON accommodation_requests
  FOR UPDATE
  USING (auth.uid() = user_id AND status = 'pending');

-- Restaurant managers can view requests for their restaurants
CREATE POLICY "Managers can view restaurant requests" ON accommodation_requests
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM restaurant_managers
      WHERE restaurant_managers.restaurant_id = accommodation_requests.restaurant_id
      AND restaurant_managers.user_id = auth.uid()
    )
  );

-- Restaurant managers can update requests for their restaurants (respond)
CREATE POLICY "Managers can update restaurant requests" ON accommodation_requests
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM restaurant_managers
      WHERE restaurant_managers.restaurant_id = accommodation_requests.restaurant_id
      AND restaurant_managers.user_id = auth.uid()
    )
  );

-- Add helpful comments
COMMENT ON TABLE dish_interactions IS 'Tracks user interactions with dishes including their allergen/diet profile for analytics';
COMMENT ON TABLE accommodation_requests IS 'Stores user requests for dish accommodations to help restaurants meet dietary needs';

-- Create view for aggregated dish statistics (for manager dashboard)
CREATE OR REPLACE VIEW dish_analytics AS
SELECT
  restaurant_id,
  dish_name,
  COUNT(*) as total_interactions,
  COUNT(DISTINCT user_id) as unique_users,
  -- Allergen breakdown
  COUNT(*) FILTER (WHERE 'dairy' = ANY(user_allergens)) as users_with_dairy_allergy,
  COUNT(*) FILTER (WHERE 'egg' = ANY(user_allergens)) as users_with_egg_allergy,
  COUNT(*) FILTER (WHERE 'peanut' = ANY(user_allergens)) as users_with_peanut_allergy,
  COUNT(*) FILTER (WHERE 'tree nut' = ANY(user_allergens)) as users_with_tree_nut_allergy,
  COUNT(*) FILTER (WHERE 'shellfish' = ANY(user_allergens)) as users_with_shellfish_allergy,
  COUNT(*) FILTER (WHERE 'fish' = ANY(user_allergens)) as users_with_fish_allergy,
  COUNT(*) FILTER (WHERE 'soy' = ANY(user_allergens)) as users_with_soy_allergy,
  COUNT(*) FILTER (WHERE 'sesame' = ANY(user_allergens)) as users_with_sesame_allergy,
  COUNT(*) FILTER (WHERE 'wheat' = ANY(user_allergens)) as users_with_wheat_allergy,
  -- Diet breakdown
  COUNT(*) FILTER (WHERE 'Vegan' = ANY(user_diets)) as users_vegan,
  COUNT(*) FILTER (WHERE 'Vegetarian' = ANY(user_diets)) as users_vegetarian,
  COUNT(*) FILTER (WHERE 'Pescatarian' = ANY(user_diets)) as users_pescatarian,
  -- Status breakdown
  COUNT(*) FILTER (WHERE dish_status = 'safe') as safe_interactions,
  COUNT(*) FILTER (WHERE dish_status = 'removable') as removable_interactions,
  COUNT(*) FILTER (WHERE dish_status = 'unsafe') as unsafe_interactions,
  COUNT(*) FILTER (WHERE dish_status = 'neutral') as neutral_interactions,
  MIN(created_at) as first_interaction,
  MAX(created_at) as last_interaction
FROM dish_interactions
GROUP BY restaurant_id, dish_name;

-- Grant access to the view for authenticated users (managers will filter by their restaurants)
GRANT SELECT ON dish_analytics TO authenticated;

-- Create view for accommodation request summaries
CREATE OR REPLACE VIEW accommodation_request_summary AS
SELECT
  restaurant_id,
  dish_name,
  COUNT(*) as total_requests,
  COUNT(*) FILTER (WHERE status = 'pending') as pending_requests,
  COUNT(*) FILTER (WHERE status = 'reviewed') as reviewed_requests,
  COUNT(*) FILTER (WHERE status = 'implemented') as implemented_requests,
  COUNT(*) FILTER (WHERE status = 'declined') as declined_requests,
  -- Most requested allergen accommodations
  (
    SELECT array_agg(DISTINCT allergen ORDER BY allergen)
    FROM accommodation_requests ar2,
    LATERAL unnest(ar2.requested_allergens) as allergen
    WHERE ar2.restaurant_id = accommodation_requests.restaurant_id
    AND ar2.dish_name = accommodation_requests.dish_name
  ) as all_requested_allergens,
  -- Most requested diet accommodations
  (
    SELECT array_agg(DISTINCT diet ORDER BY diet)
    FROM accommodation_requests ar3,
    LATERAL unnest(ar3.requested_diets) as diet
    WHERE ar3.restaurant_id = accommodation_requests.restaurant_id
    AND ar3.dish_name = accommodation_requests.dish_name
  ) as all_requested_diets
FROM accommodation_requests
GROUP BY restaurant_id, dish_name;

GRANT SELECT ON accommodation_request_summary TO authenticated;
