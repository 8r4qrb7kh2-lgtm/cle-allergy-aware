# Usage Examples

## Example 1: Simple Vegetarian Dish

**Dish: Garden Salad**

```
Title: Garden Salad
Description: Fresh mixed greens with tomatoes, cucumbers, and house vinaigrette

Allergens: None
Diets: ✓ Vegetarian, ✓ Vegan, ✓ Gluten-Free
Removable: tomatoes, cucumbers, dressing
Cross-Contamination: None
```

**Result in Clarivore:**
```json
{
  "id": "Garden Salad",
  "allergens": [],
  "diets": ["Vegetarian", "Vegan", "Gluten-Free"],
  "removable": ["tomatoes", "cucumbers", "dressing"],
  "crossContamination": []
}
```

---

## Example 2: Seafood Dish with Allergens

**Dish: Lobster Mac & Cheese**

```
Title: Lobster Mac & Cheese
Description: Fresh Maine lobster over creamy mac and cheese with breadcrumb topping

Allergens: ✓ Dairy, ✓ Wheat, ✓ Gluten, ✓ Shellfish
Diets: None
Removable: breadcrumb topping
Cross-Contamination: ✓ Fish (prepared in same kitchen)
```

**Result in Clarivore:**
```json
{
  "id": "Lobster Mac & Cheese",
  "allergens": ["dairy", "wheat", "gluten", "shellfish"],
  "diets": [],
  "removable": ["breadcrumb topping"],
  "crossContamination": ["fish"]
}
```

---

## Example 3: Customizable Pizza

**Dish: Margherita Pizza**

```
Title: Margherita Pizza
Description: Classic pizza with tomato sauce, fresh mozzarella, and basil

Allergens: ✓ Dairy, ✓ Wheat, ✓ Gluten
Diets: ✓ Vegetarian
Removable: cheese, basil
Cross-Contamination: ✓ Soy (prepared on shared equipment)
```

**Result in Clarivore:**
```json
{
  "id": "Margherita Pizza",
  "allergens": ["dairy", "wheat", "gluten"],
  "diets": ["Vegetarian"],
  "removable": ["cheese", "basil"],
  "crossContamination": ["soy"]
}
```

---

## Example 4: Allergen-Friendly Option

**Dish: Grilled Chicken Breast**

```
Title: Grilled Chicken Breast
Description: Herb-marinated chicken breast grilled to perfection, served plain

Allergens: None
Diets: ✓ Gluten-Free, ✓ Dairy-Free, ✓ Paleo, ✓ Keto
Removable: herbs (can be served plain)
Cross-Contamination: None (prepared on dedicated grill)
```

**Result in Clarivore:**
```json
{
  "id": "Grilled Chicken Breast",
  "allergens": [],
  "diets": ["Gluten-Free", "Dairy-Free", "Paleo", "Keto"],
  "removable": ["herbs"],
  "crossContamination": []
}
```

---

## Example 5: Complex Multi-Allergen Dish

**Dish: Thai Peanut Noodles**

```
Title: Thai Peanut Noodles
Description: Rice noodles in spicy peanut sauce with vegetables, tofu, crushed peanuts, and sesame

Allergens: ✓ Peanuts, ✓ Soy, ✓ Sesame
Diets: ✓ Vegan, ✓ Vegetarian
Removable: peanuts, sesame seeds
Cross-Contamination: ✓ Shellfish, ✓ Fish (kitchen uses fish sauce)
```

**Result in Clarivore:**
```json
{
  "id": "Thai Peanut Noodles",
  "allergens": ["peanuts", "soy", "sesame"],
  "diets": ["Vegan", "Vegetarian"],
  "removable": ["peanuts", "sesame seeds"],
  "crossContamination": ["shellfish", "fish"]
}
```

---

## Workflow Example: Adding Multiple Items

### Step 1: Bulk Add Menu Items

```
1. Menu Items > Add New
2. Add all dish titles and descriptions
3. Save as drafts
```

### Step 2: Use AI Analysis

```
For each draft:
1. Open the menu item
2. Click "Analyze with AI"
3. Review AI suggestions
4. Adjust if needed
5. Publish
```

### Step 3: Verify in Clarivore

```
1. Open Clarivore app
2. Navigate to your restaurant
3. Check that all items appear
4. Verify allergen data is correct
```

---

## Advanced: Programmatic Creation

If you want to programmatically add menu items:

```php
// Create menu item
$post_id = wp_insert_post(array(
    'post_title'   => 'Grilled Salmon',
    'post_content' => 'Fresh Atlantic salmon...',
    'post_status'  => 'publish',
    'post_type'    => 'menu_item'
));

// Add allergen meta
update_post_meta($post_id, '_clarivore_allergens', array('fish'));
update_post_meta($post_id, '_clarivore_diets', array('Gluten-Free', 'Keto'));
update_post_meta($post_id, '_clarivore_removable', 'lemon butter, capers');
update_post_meta($post_id, '_clarivore_cross_contamination', array('shellfish'));

// Trigger sync manually if needed
do_action('save_post', $post_id, get_post($post_id));
```

---

## Tips for Best Results

1. **Be Specific**: Include all ingredients in descriptions for accurate AI analysis
2. **Check Cross-Contamination**: Always mark shared equipment risks
3. **Update Regularly**: When recipes change, update WordPress immediately
4. **Review AI Results**: Always double-check AI suggestions before publishing
5. **Use Removable Items**: Help customers customize their orders safely

---

## Common Patterns

### Gluten-Free Option
```
Base allergens: None (or applicable)
Diets: ✓ Gluten-Free
Cross-Contamination: ✓ Wheat, ✓ Gluten (unless dedicated prep area)
```

### Vegan Dish
```
Allergens: None (no animal products)
Diets: ✓ Vegan, ✓ Vegetarian
Check for: Hidden dairy, eggs, or honey
```

### Kids Menu
```
Common allergens: Often dairy, wheat
Keep removable items simple
Note cross-contamination for nut allergies
```
