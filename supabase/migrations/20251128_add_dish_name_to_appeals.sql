-- Add dish_name column to ingredient_scan_appeals to scope appeals per dish
-- Previously appeals were only scoped by restaurant_id and ingredient_name,
-- which caused appeals from one dish to incorrectly appear on other dishes
-- with the same ingredient name at the same restaurant.

ALTER TABLE ingredient_scan_appeals
ADD COLUMN IF NOT EXISTS dish_name TEXT;

-- Create index for efficient queries by restaurant + dish
CREATE INDEX IF NOT EXISTS idx_appeals_restaurant_dish
ON ingredient_scan_appeals(restaurant_id, dish_name);

-- Add comment explaining the column
COMMENT ON COLUMN ingredient_scan_appeals.dish_name IS
'The name of the dish this appeal belongs to. Used to scope appeals to specific dishes within a restaurant.';
