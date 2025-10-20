# Clarivore Menu Integration for WordPress

Seamlessly integrate allergen and dietary preference analysis directly into your WordPress menu editor. Automatically sync menu items with Clarivore's database for comprehensive allergy-aware menu management.

## Features

- **Custom Menu Item Post Type**: Dedicated post type for managing restaurant menu items
- **Allergen Tracking**: Check boxes for 10+ common allergens (dairy, eggs, fish, nuts, gluten, etc.)
- **Dietary Preferences**: Mark items as Vegetarian, Vegan, Gluten-Free, Keto, and more
- **AI-Powered Analysis**: Analyze dish descriptions and images to automatically detect allergens
- **Auto-Sync**: Automatically sync menu items to Clarivore's database when saved
- **Removable Ingredients**: Specify ingredients that can be removed upon customer request
- **Cross-Contamination Warnings**: Flag potential allergen cross-contamination risks
- **User-Friendly Interface**: Clean, intuitive meta boxes integrated into WordPress editor

## Installation

### Method 1: Direct Upload

1. Download the `clarivore-menu-integration` folder
2. Upload to your WordPress site's `/wp-content/plugins/` directory
3. Go to **WordPress Admin > Plugins**
4. Find "Clarivore Menu Integration" and click **Activate**

### Method 2: ZIP Upload

1. Zip the `clarivore-menu-integration` folder
2. Go to **WordPress Admin > Plugins > Add New**
3. Click **Upload Plugin** and select the ZIP file
4. Click **Install Now**, then **Activate**

## Setup

### Step 1: Configure Settings

1. Go to **WordPress Admin > Clarivore** (in the sidebar)
2. Enter your **Restaurant Slug/ID** (from your Clarivore account)
3. Enable **Auto-Sync** to automatically update Clarivore when you save menu items
4. Leave Supabase URL and API Key as default (unless you have a custom installation)
5. Click **Save Settings**

### Step 2: Create Your Restaurant in Clarivore

Before using the plugin, make sure your restaurant exists in the Clarivore system:

1. Visit the Clarivore app
2. Add your restaurant with a unique slug (e.g., "mama-santa")
3. Use this exact slug in the WordPress plugin settings

### Step 3: Add Menu Items

1. Go to **WordPress Admin > Menu Items > Add New**
2. Enter the dish name as the **Title**
3. Add a description in the **Content** area
4. Optionally add a **Featured Image** of the dish
5. Scroll to the **Clarivore** meta box

### Step 4: Add Allergen Information

**Option 1: AI Analysis (Recommended)**
1. Click the **Analyze with AI** button
2. The AI will analyze your dish description and image
3. Allergens and dietary info will be automatically filled in
4. Review and adjust as needed

**Option 2: Manual Entry**
1. Check all applicable allergens
2. Select dietary preferences the dish satisfies
3. List any removable ingredients
4. Mark cross-contamination warnings if applicable

### Step 5: Publish

1. Click **Publish** or **Update**
2. If Auto-Sync is enabled, the item automatically syncs to Clarivore
3. Your menu is now up-to-date on both WordPress and Clarivore!

## How It Works

### Data Flow

```
WordPress Menu Item
       ↓
  [Save/Update]
       ↓
Clarivore Plugin
       ↓
 Supabase API
       ↓
Clarivore Database
       ↓
 Clarivore App
```

When you save a menu item:
1. WordPress stores the data locally
2. Plugin packages the allergen/dietary data
3. Sends it to Clarivore's Supabase backend
4. Updates the restaurant's `overlays` array
5. Changes appear instantly on Clarivore app

### Database Structure

The plugin syncs menu items to Clarivore's `restaurants` table under the `overlays` field:

```json
{
  "id": "Grilled Salmon",
  "allergens": ["fish"],
  "diets": ["Gluten-Free", "Keto"],
  "removable": ["lemon butter", "capers"],
  "crossContamination": ["shellfish"],
  "details": {}
}
```

## Available Allergens

- Dairy
- Eggs
- Fish
- Shellfish
- Tree Nuts
- Peanuts
- Wheat
- Gluten
- Soy
- Sesame

## Available Dietary Preferences

- Vegetarian
- Vegan
- Gluten-Free
- Dairy-Free
- Keto
- Paleo
- Halal
- Kosher

## Troubleshooting

### Menu items aren't syncing

**Check these:**
1. Is Auto-Sync enabled? (**Clarivore > Settings**)
2. Is your Restaurant Slug/ID correct?
3. Does the restaurant exist in Clarivore's database?
4. Check WordPress error logs for API errors

### AI Analysis button doesn't work

**Possible causes:**
1. Missing dish title or description
2. API endpoint not configured (requires server-side proxy)
3. JavaScript errors - check browser console

### "Restaurant not found" error

**Solution:**
1. Verify restaurant exists in Clarivore database
2. Check that the slug in WordPress settings matches exactly
3. Slug is case-sensitive

## Extending the Plugin

### Adding Custom Allergens

Edit `clarivore-menu-integration.php` and add to the `$available_allergens` array in `render_allergen_meta_box()`:

```php
$available_allergens = array(
    // ... existing allergens
    'custom-allergen' => 'Custom Allergen Name'
);
```

### Adding Custom Dietary Preferences

Similarly, add to `$available_diets`:

```php
$available_diets = array(
    // ... existing diets
    'Custom-Diet' => 'Custom Diet Name'
);
```

### Customizing Sync Behavior

Hook into the sync process:

```php
add_action('clarivore_before_sync', function($post_id, $menu_data) {
    // Custom logic before sync
}, 10, 2);
```

## Compatibility

- **WordPress Version**: 5.0 or higher
- **PHP Version**: 7.4 or higher
- **Works With**:
  - WordPress classic editor
  - Gutenberg/Block editor
  - Popular restaurant menu plugins
  - WooCommerce (for menu products)

## Support

- **Documentation**: [https://clarivore.com/docs](https://clarivore.com/docs)
- **Email**: support@clarivore.com
- **Issues**: Report bugs on GitHub

## Changelog

### Version 1.0.0 (2025-01-20)

- Initial release
- Custom menu item post type
- Allergen and dietary tracking
- AI-powered analysis
- Auto-sync to Clarivore database
- Admin settings page
- Real-time validation

## License

GPL v2 or later

## Credits

Developed by Clarivore for restaurants committed to allergy-aware dining.

---

**Made with care for safer dining experiences.**
