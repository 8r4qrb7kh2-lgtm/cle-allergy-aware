-- Fix dish_analytics view to use COUNT(DISTINCT user_id) for accurate user counts
-- This prevents inflated numbers when the same user views a dish multiple times

DROP VIEW IF EXISTS dish_analytics;

CREATE OR REPLACE VIEW dish_analytics AS
SELECT
  restaurant_id,
  dish_name,
  COUNT(*) as total_interactions,
  COUNT(DISTINCT user_id) as unique_users,
  -- Allergen breakdown (unique users, not total interactions)
  COUNT(DISTINCT CASE WHEN 'dairy' = ANY(user_allergens) THEN user_id END) as users_with_dairy_allergy,
  COUNT(DISTINCT CASE WHEN 'egg' = ANY(user_allergens) THEN user_id END) as users_with_egg_allergy,
  COUNT(DISTINCT CASE WHEN 'peanut' = ANY(user_allergens) THEN user_id END) as users_with_peanut_allergy,
  COUNT(DISTINCT CASE WHEN 'tree nut' = ANY(user_allergens) THEN user_id END) as users_with_tree_nut_allergy,
  COUNT(DISTINCT CASE WHEN 'shellfish' = ANY(user_allergens) THEN user_id END) as users_with_shellfish_allergy,
  COUNT(DISTINCT CASE WHEN 'fish' = ANY(user_allergens) THEN user_id END) as users_with_fish_allergy,
  COUNT(DISTINCT CASE WHEN 'soy' = ANY(user_allergens) THEN user_id END) as users_with_soy_allergy,
  COUNT(DISTINCT CASE WHEN 'sesame' = ANY(user_allergens) THEN user_id END) as users_with_sesame_allergy,
  COUNT(DISTINCT CASE WHEN 'wheat' = ANY(user_allergens) THEN user_id END) as users_with_wheat_allergy,
  -- Diet breakdown (unique users, not total interactions)
  COUNT(DISTINCT CASE WHEN 'Vegan' = ANY(user_diets) THEN user_id END) as users_vegan,
  COUNT(DISTINCT CASE WHEN 'Vegetarian' = ANY(user_diets) THEN user_id END) as users_vegetarian,
  COUNT(DISTINCT CASE WHEN 'Pescatarian' = ANY(user_diets) THEN user_id END) as users_pescatarian,
  COUNT(DISTINCT CASE WHEN 'Gluten-free' = ANY(user_diets) THEN user_id END) as users_gluten_free,
  -- Status breakdown (total interactions, not unique users - we want to see frequency)
  COUNT(*) FILTER (WHERE dish_status = 'safe') as safe_interactions,
  COUNT(*) FILTER (WHERE dish_status = 'removable') as removable_interactions,
  COUNT(*) FILTER (WHERE dish_status = 'unsafe') as unsafe_interactions,
  COUNT(*) FILTER (WHERE dish_status = 'neutral') as neutral_interactions,
  -- Unique users by status
  COUNT(DISTINCT CASE WHEN dish_status = 'safe' THEN user_id END) as safe_unique_users,
  COUNT(DISTINCT CASE WHEN dish_status = 'unsafe' THEN user_id END) as unsafe_unique_users,
  MIN(created_at) as first_interaction,
  MAX(created_at) as last_interaction
FROM dish_interactions
GROUP BY restaurant_id, dish_name;

GRANT SELECT ON dish_analytics TO authenticated;

-- Also create a restaurant-level summary view
CREATE OR REPLACE VIEW restaurant_analytics_summary AS
SELECT
  restaurant_id,
  COUNT(*) as total_interactions,
  COUNT(DISTINCT user_id) as total_unique_users,
  COUNT(DISTINCT dish_name) as dishes_with_interactions,
  -- Allergen breakdown across all dishes
  COUNT(DISTINCT CASE WHEN 'dairy' = ANY(user_allergens) THEN user_id END) as users_with_dairy,
  COUNT(DISTINCT CASE WHEN 'egg' = ANY(user_allergens) THEN user_id END) as users_with_egg,
  COUNT(DISTINCT CASE WHEN 'peanut' = ANY(user_allergens) THEN user_id END) as users_with_peanut,
  COUNT(DISTINCT CASE WHEN 'tree nut' = ANY(user_allergens) THEN user_id END) as users_with_tree_nut,
  COUNT(DISTINCT CASE WHEN 'shellfish' = ANY(user_allergens) THEN user_id END) as users_with_shellfish,
  COUNT(DISTINCT CASE WHEN 'fish' = ANY(user_allergens) THEN user_id END) as users_with_fish,
  COUNT(DISTINCT CASE WHEN 'soy' = ANY(user_allergens) THEN user_id END) as users_with_soy,
  COUNT(DISTINCT CASE WHEN 'sesame' = ANY(user_allergens) THEN user_id END) as users_with_sesame,
  COUNT(DISTINCT CASE WHEN 'wheat' = ANY(user_allergens) THEN user_id END) as users_with_wheat,
  -- Diet breakdown
  COUNT(DISTINCT CASE WHEN 'Vegan' = ANY(user_diets) THEN user_id END) as users_vegan,
  COUNT(DISTINCT CASE WHEN 'Vegetarian' = ANY(user_diets) THEN user_id END) as users_vegetarian,
  COUNT(DISTINCT CASE WHEN 'Pescatarian' = ANY(user_diets) THEN user_id END) as users_pescatarian,
  COUNT(DISTINCT CASE WHEN 'Gluten-free' = ANY(user_diets) THEN user_id END) as users_gluten_free,
  -- Users with no dietary restrictions
  COUNT(DISTINCT CASE WHEN array_length(user_allergens, 1) IS NULL AND array_length(user_diets, 1) IS NULL THEN user_id END) as users_no_restrictions
FROM dish_interactions
GROUP BY restaurant_id;

GRANT SELECT ON restaurant_analytics_summary TO authenticated;
