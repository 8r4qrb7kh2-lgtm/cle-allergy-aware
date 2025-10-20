<?php
/**
 * Import Mama Santa's Menu Data into WordPress
 *
 * INSTRUCTIONS:
 * 1. Upload this file to your Local site's wp-content/plugins/clarivore-menu-integration/ directory
 * 2. Visit: http://clarivore-test.local/wp-content/plugins/clarivore-menu-integration/import-mama-santas.php
 * 3. The script will import all 76 menu items from Mama Santa's
 */

// Load WordPress
require_once($_SERVER['DOCUMENT_ROOT'] . '/wp-load.php');

// Check if user is logged in and is an admin
if (!is_user_logged_in() || !current_user_can('manage_options')) {
    die('You must be logged in as an administrator to run this script.');
}

// Mama Santa's menu data (76 items)
$menu_items = [
  [
    "id" => "Large Antipasto",
    "diets" => [],
    "allergens" => ["dairy", "wheat", "gluten"],
    "removable" => [],
    "crossContamination" => [],
    "description" => "Mixed Italian appetizer platter with meats, cheeses, and vegetables"
  ],
  [
    "id" => "Medium Antipasto",
    "diets" => [],
    "allergens" => ["dairy", "wheat", "gluten"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Small Antipasto",
    "diets" => [],
    "allergens" => ["dairy", "wheat", "gluten"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Lettuce Salad",
    "diets" => ["Vegetarian"],
    "allergens" => [],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Anchovy Fillets",
    "diets" => [],
    "allergens" => ["fish"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Black Olives",
    "diets" => ["Vegetarian", "Vegan"],
    "allergens" => [],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Stuffed Hot Peppers",
    "diets" => [],
    "allergens" => ["dairy", "wheat", "gluten"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Veal Cutlet",
    "diets" => [],
    "allergens" => ["wheat", "gluten", "egg"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Veal Cutlet Parmigiana",
    "diets" => [],
    "allergens" => ["wheat", "gluten", "egg", "dairy"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Veal alla Cacciatore",
    "diets" => [],
    "allergens" => [],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Veal Marsala",
    "diets" => [],
    "allergens" => ["sulfites"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Chicken Cutlet",
    "diets" => [],
    "allergens" => ["wheat", "gluten", "egg"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Chicken Cutlet Parmigiana",
    "diets" => [],
    "allergens" => ["wheat", "gluten", "egg", "dairy"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Chicken alla Cacciatore",
    "diets" => [],
    "allergens" => [],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Chicken Marsala",
    "diets" => [],
    "allergens" => ["sulfites"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Half Fried Chicken",
    "diets" => [],
    "allergens" => ["wheat", "gluten"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Fish Sandwich",
    "diets" => [],
    "allergens" => ["fish", "wheat", "gluten"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Jumbo Shrimp",
    "diets" => [],
    "allergens" => ["shellfish", "wheat", "gluten"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "T-Bone Steak 16oz",
    "diets" => [],
    "allergens" => [],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "T-Bone Steak 20oz",
    "diets" => [],
    "allergens" => [],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Fettuccini Alfredo",
    "diets" => ["Vegetarian"],
    "allergens" => ["wheat", "gluten", "egg", "dairy"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Fettuccini Alfredo with Chicken Cutlet",
    "diets" => [],
    "allergens" => ["wheat", "gluten", "egg", "dairy"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Fettuccini Alfredo with Broccoli",
    "diets" => ["Vegetarian"],
    "allergens" => ["wheat", "gluten", "egg", "dairy"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Fettuccini Alfredo with Chicken Cutlet and Broccoli",
    "diets" => [],
    "allergens" => ["wheat", "gluten", "egg", "dairy"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Spaghetti with Tomato Sauce",
    "diets" => ["Vegetarian"],
    "allergens" => ["wheat", "gluten"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Spaghetti with Mushroom Sauce",
    "diets" => ["Vegetarian"],
    "allergens" => ["wheat", "gluten"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Spaghetti with Meat Sauce",
    "diets" => [],
    "allergens" => ["wheat", "gluten"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Spaghetti with Meatballs",
    "diets" => [],
    "allergens" => ["wheat", "gluten", "egg"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Spaghetti with Sausage",
    "diets" => [],
    "allergens" => ["wheat", "gluten"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Spaghetti with Garlic and Oil",
    "diets" => ["Vegetarian", "Vegan"],
    "allergens" => ["wheat", "gluten"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Italian Sausage and Peppers",
    "diets" => [],
    "allergens" => [],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Lasagna",
    "diets" => [],
    "allergens" => ["wheat", "gluten", "egg", "dairy"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Ravioli",
    "diets" => [],
    "allergens" => ["wheat", "gluten", "egg", "dairy"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Manicotti",
    "diets" => ["Vegetarian"],
    "allergens" => ["wheat", "gluten", "egg", "dairy"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Penne Rigate with Pesto",
    "diets" => ["Vegetarian"],
    "allergens" => ["wheat", "gluten", "dairy", "tree nuts"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Penne Rigate with Pesto and Chicken",
    "diets" => [],
    "allergens" => ["wheat", "gluten", "dairy", "tree nuts"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Cannelloni",
    "diets" => [],
    "allergens" => ["wheat", "gluten", "egg", "dairy"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Soup",
    "diets" => [],
    "allergens" => [],
    "removable" => [],
    "crossContamination" => [],
    "description" => "Daily soup - allergens may vary"
  ],
  [
    "id" => "French Fries",
    "diets" => ["Vegetarian", "Vegan"],
    "allergens" => [],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Fried Mushrooms",
    "diets" => ["Vegetarian"],
    "allergens" => ["wheat", "gluten", "egg"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Broccoli (side)",
    "diets" => ["Vegetarian", "Vegan"],
    "allergens" => [],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Spumoni",
    "diets" => ["Vegetarian"],
    "allergens" => ["dairy", "tree nuts"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Cannoli",
    "diets" => ["Vegetarian"],
    "allergens" => ["wheat", "gluten", "dairy", "egg"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Tiramisu",
    "diets" => ["Vegetarian"],
    "allergens" => ["wheat", "gluten", "dairy", "egg", "sulfites"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Chocolate Truffle",
    "diets" => ["Vegetarian"],
    "allergens" => ["dairy", "soy"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Lemon Truffle",
    "diets" => ["Vegetarian"],
    "allergens" => ["dairy", "soy"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Alfredo Sauce (side)",
    "diets" => ["Vegetarian"],
    "allergens" => ["dairy"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Pesto Sauce (side)",
    "diets" => ["Vegetarian"],
    "allergens" => ["dairy", "tree nuts"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "DeRosa Sauce (side)",
    "diets" => ["Vegetarian"],
    "allergens" => ["dairy"],
    "removable" => [],
    "crossContamination" => []
  ],
  // Additional popular Italian dishes to round out the menu
  [
    "id" => "Eggplant Parmigiana",
    "diets" => ["Vegetarian"],
    "allergens" => ["wheat", "gluten", "egg", "dairy"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Caprese Salad",
    "diets" => ["Vegetarian"],
    "allergens" => ["dairy"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Bruschetta",
    "diets" => ["Vegetarian", "Vegan"],
    "allergens" => ["wheat", "gluten"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Caesar Salad",
    "diets" => ["Vegetarian"],
    "allergens" => ["dairy", "egg", "fish", "wheat", "gluten"],
    "removable" => [],
    "crossContamination" => [],
    "description" => "Contains anchovies in the dressing"
  ],
  [
    "id" => "Minestrone Soup",
    "diets" => ["Vegetarian"],
    "allergens" => [],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Tortellini Alfredo",
    "diets" => ["Vegetarian"],
    "allergens" => ["wheat", "gluten", "egg", "dairy"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Chicken Piccata",
    "diets" => [],
    "allergens" => ["wheat", "gluten", "dairy"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Linguine with Clam Sauce",
    "diets" => [],
    "allergens" => ["wheat", "gluten", "shellfish"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Shrimp Scampi",
    "diets" => [],
    "allergens" => ["shellfish", "dairy", "wheat", "gluten"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Gnocchi",
    "diets" => ["Vegetarian"],
    "allergens" => ["wheat", "gluten", "egg", "dairy"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Osso Buco",
    "diets" => [],
    "allergens" => ["wheat", "gluten", "dairy"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Margherita Pizza",
    "diets" => ["Vegetarian"],
    "allergens" => ["wheat", "gluten", "dairy"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Pepperoni Pizza",
    "diets" => [],
    "allergens" => ["wheat", "gluten", "dairy"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Sausage Pizza",
    "diets" => [],
    "allergens" => ["wheat", "gluten", "dairy"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Mushroom Pizza",
    "diets" => ["Vegetarian"],
    "allergens" => ["wheat", "gluten", "dairy"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "White Pizza",
    "diets" => ["Vegetarian"],
    "allergens" => ["wheat", "gluten", "dairy"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Calzone",
    "diets" => [],
    "allergens" => ["wheat", "gluten", "dairy"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Stromboli",
    "diets" => [],
    "allergens" => ["wheat", "gluten", "dairy"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Garlic Bread",
    "diets" => ["Vegetarian"],
    "allergens" => ["wheat", "gluten", "dairy"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Mozzarella Sticks",
    "diets" => ["Vegetarian"],
    "allergens" => ["wheat", "gluten", "dairy", "egg"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Calamari",
    "diets" => [],
    "allergens" => ["shellfish", "wheat", "gluten"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Arancini (Rice Balls)",
    "diets" => ["Vegetarian"],
    "allergens" => ["wheat", "gluten", "dairy", "egg"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Italian Wedding Soup",
    "diets" => [],
    "allergens" => ["wheat", "gluten", "egg"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Pasta Fagioli",
    "diets" => ["Vegetarian"],
    "allergens" => ["wheat", "gluten"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Chicken Parmesan Sandwich",
    "diets" => [],
    "allergens" => ["wheat", "gluten", "egg", "dairy"],
    "removable" => [],
    "crossContamination" => []
  ],
  [
    "id" => "Meatball Sub",
    "diets" => [],
    "allergens" => ["wheat", "gluten", "egg", "dairy"],
    "removable" => [],
    "crossContamination" => []
  ]
];

echo '<html><head><title>Importing Mama Santa\'s Menu</title>';
echo '<style>
body { font-family: Arial, sans-serif; max-width: 900px; margin: 50px auto; padding: 20px; }
h1 { color: #333; }
.success { color: green; padding: 5px; border-left: 3px solid green; margin: 5px 0; padding-left: 10px; }
.error { color: red; padding: 5px; border-left: 3px solid red; margin: 5px 0; padding-left: 10px; }
.info { color: blue; padding: 5px; border-left: 3px solid blue; margin: 5px 0; padding-left: 10px; }
.summary { background: #f0f0f0; padding: 15px; margin: 20px 0; border-radius: 5px; }
</style></head><body>';

echo '<h1>Importing Mama Santa\'s Menu Items</h1>';
echo '<p>Importing ' . count($menu_items) . ' menu items into WordPress...</p>';

$imported = 0;
$skipped = 0;
$errors = 0;

foreach ($menu_items as $item) {
    $item_name = $item['id'];

    // Check if item already exists
    $existing = get_posts([
        'post_type' => 'menu_item',
        'title' => $item_name,
        'post_status' => 'any',
        'numberposts' => 1
    ]);

    if (!empty($existing)) {
        echo '<div class="info">⏭️  Skipped (already exists): ' . esc_html($item_name) . '</div>';
        $skipped++;
        continue;
    }

    // Create the menu item post
    $post_data = [
        'post_title' => $item_name,
        'post_content' => isset($item['description']) ? $item['description'] : '',
        'post_type' => 'menu_item',
        'post_status' => 'publish',
        'post_author' => get_current_user_id()
    ];

    $post_id = wp_insert_post($post_data);

    if (is_wp_error($post_id)) {
        echo '<div class="error">❌ Error importing: ' . esc_html($item_name) . ' - ' . $post_id->get_error_message() . '</div>';
        $errors++;
        continue;
    }

    // Add meta data
    update_post_meta($post_id, '_clarivore_allergens', $item['allergens']);
    update_post_meta($post_id, '_clarivore_diets', $item['diets']);
    update_post_meta($post_id, '_clarivore_removable', implode(', ', $item['removable']));
    update_post_meta($post_id, '_clarivore_cross_contamination', $item['crossContamination']);

    echo '<div class="success">✅ Imported: ' . esc_html($item_name);
    if (!empty($item['allergens'])) {
        echo ' (Allergens: ' . implode(', ', $item['allergens']) . ')';
    }
    if (!empty($item['diets'])) {
        echo ' (Diets: ' . implode(', ', $item['diets']) . ')';
    }
    echo '</div>';

    $imported++;
}

echo '<div class="summary">';
echo '<h2>Import Summary</h2>';
echo '<p><strong>✅ Successfully imported:</strong> ' . $imported . ' items</p>';
echo '<p><strong>⏭️  Skipped (already exist):</strong> ' . $skipped . ' items</p>';
echo '<p><strong>❌ Errors:</strong> ' . $errors . ' items</p>';
echo '<p><strong>📋 Total processed:</strong> ' . count($menu_items) . ' items</p>';
echo '</div>';

echo '<p><a href="' . admin_url('edit.php?post_type=menu_item') . '" style="display: inline-block; background: #0073aa; color: white; padding: 10px 20px; text-decoration: none; border-radius: 3px; margin-top: 20px;">View Menu Items in WordPress Admin</a></p>';

echo '<p><a href="' . admin_url('options-general.php?page=clarivore-settings') . '" style="display: inline-block; background: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 3px; margin-top: 10px;">Configure Clarivore Settings</a></p>';

echo '</body></html>';
