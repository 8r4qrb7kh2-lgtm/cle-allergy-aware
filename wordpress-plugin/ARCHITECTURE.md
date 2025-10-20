# Clarivore WordPress Plugin Architecture

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         RESTAURANT OWNER                         │
│                    (WordPress Admin Interface)                   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      WORDPRESS DASHBOARD                         │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │   Settings   │  │  Menu Items  │  │   Meta Box UI        │  │
│  │              │  │              │  │  - Allergens         │  │
│  │ Restaurant   │  │ Create/Edit  │  │  - Dietary Prefs     │  │
│  │ ID Setup     │  │ Menu Items   │  │  - AI Analysis Btn   │  │
│  │              │  │              │  │  - Cross-Contam      │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
│         │                 │                      │              │
└─────────┼─────────────────┼──────────────────────┼──────────────┘
          │                 │                      │
          │                 │                      │
          ▼                 ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                  CLARIVORE WORDPRESS PLUGIN                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Main Plugin Class (clarivore-menu-integration.php)             │
│  ┌────────────────────────────────────────────────────────┐    │
│  │                                                         │    │
│  │  ┌─────────────────┐        ┌──────────────────────┐  │    │
│  │  │  Registration   │        │   Event Handlers     │  │    │
│  │  ├─────────────────┤        ├──────────────────────┤  │    │
│  │  │ - Post Type     │        │ - save_post          │  │    │
│  │  │ - Meta Boxes    │        │ - admin_enqueue      │  │    │
│  │  │ - Admin Menu    │        │ - ajax_analyze       │  │    │
│  │  │ - Settings      │        │                      │  │    │
│  │  └─────────────────┘        └──────────────────────┘  │    │
│  │                                                         │    │
│  │  ┌─────────────────────────────────────────────────┐  │    │
│  │  │          Sync Engine                            │  │    │
│  │  ├─────────────────────────────────────────────────┤  │    │
│  │  │  1. Get menu item data                         │  │    │
│  │  │  2. Package as overlay object                  │  │    │
│  │  │  3. Fetch current restaurant overlays          │  │    │
│  │  │  4. Update or append menu item                 │  │    │
│  │  │  5. PATCH to Supabase                          │  │    │
│  │  └─────────────────────────────────────────────────┘  │    │
│  │                                                         │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Frontend Assets                                                │
│  ┌────────────────┐              ┌──────────────────────┐      │
│  │   admin.js     │              │     admin.css        │      │
│  ├────────────────┤              ├──────────────────────┤      │
│  │ - AI Analysis  │              │ - Meta box styling   │      │
│  │ - Validation   │              │ - Button states      │      │
│  │ - Form enhance │              │ - Responsive design  │      │
│  └────────────────┘              └──────────────────────┘      │
│                                                                  │
└────────────────────────┬─────────────────────────────────────────┘
                         │
                         │ HTTP REST API Calls
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SUPABASE BACKEND                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  REST API Endpoint: /rest/v1/restaurants                        │
│  ┌────────────────────────────────────────────────────────┐    │
│  │                                                         │    │
│  │  GET  /restaurants?slug=eq.{slug}                      │    │
│  │  → Fetch current restaurant data                       │    │
│  │                                                         │    │
│  │  PATCH /restaurants?slug=eq.{slug}                     │    │
│  │  → Update overlays array with menu item data           │    │
│  │                                                         │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Database: PostgreSQL                                           │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  Table: restaurants                                     │    │
│  │  ┌─────────────────────────────────────────────────┐   │    │
│  │  │  id          │  integer (primary key)           │   │    │
│  │  │  name        │  text                            │   │    │
│  │  │  slug        │  text (unique)                   │   │    │
│  │  │  overlays    │  jsonb[]                         │   │    │
│  │  │  menu_image  │  text (url)                      │   │    │
│  │  │  created_at  │  timestamp                       │   │    │
│  │  └─────────────────────────────────────────────────┘   │    │
│  │                                                         │    │
│  │  overlays structure:                                    │    │
│  │  [                                                      │    │
│  │    {                                                    │    │
│  │      "id": "Dish Name",                                │    │
│  │      "allergens": ["dairy", "wheat"],                  │    │
│  │      "diets": ["Vegetarian"],                          │    │
│  │      "removable": ["cheese"],                          │    │
│  │      "crossContamination": ["nuts"],                   │    │
│  │      "x": 10, "y": 20, "w": 30, "h": 2                │    │
│  │    }                                                    │    │
│  │  ]                                                      │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
└────────────────────────┬─────────────────────────────────────────┘
                         │
                         │ Data flows to
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                       CLARIVORE WEB APP                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  restaurant.html?slug={slug}                                    │
│  ┌────────────────────────────────────────────────────────┐    │
│  │                                                         │    │
│  │  1. Loads restaurant data from Supabase                │    │
│  │  2. Displays menu image                                │    │
│  │  3. Renders overlays with allergen data                │    │
│  │  4. Shows allergen filters                             │    │
│  │                                                         │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
└────────────────────────┬─────────────────────────────────────────┘
                         │
                         │ Customers view
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                          END USERS                               │
│                   (Restaurant Customers)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  - Browse menu with allergen information                        │
│  - Filter by dietary preferences                                │
│  - See removable ingredients                                    │
│  - View cross-contamination warnings                            │
│  - Make informed dining decisions                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow Sequence

### Scenario: Restaurant Owner Adds New Menu Item

```
1. Owner logs into WordPress
   └─> Opens Menu Items > Add New

2. Owner enters dish information
   ├─> Title: "Grilled Salmon"
   ├─> Description: "Fresh Atlantic salmon..."
   └─> Featured Image: uploads photo

3. Owner scrolls to Clarivore meta box
   └─> Clicks "Analyze with AI"

4. JavaScript (admin.js) triggers
   ├─> Collects title, description, image URL
   ├─> Sends AJAX request to WordPress
   └─> Shows "Analyzing..." status

5. WordPress receives AJAX call
   ├─> Validates nonce
   ├─> Calls AI proxy endpoint (optional)
   └─> Returns analysis results

6. JavaScript applies results
   ├─> Checks allergen boxes (e.g., "fish")
   ├─> Checks diet boxes (e.g., "Gluten-Free")
   ├─> Fills removable ingredients
   └─> Shows success message

7. Owner reviews and clicks "Publish"
   └─> WordPress save_post hook fires

8. Plugin save_post handler executes
   ├─> Validates nonce and permissions
   ├─> Saves meta data to WordPress database
   └─> Checks if auto-sync is enabled

9. If auto-sync enabled, sync_to_clarivore() runs
   ├─> Gets restaurant ID from settings
   ├─> Packages menu item data as overlay object
   │   {
   │     "id": "Grilled Salmon",
   │     "allergens": ["fish"],
   │     "diets": ["Gluten-Free", "Keto"],
   │     ...
   │   }
   ├─> GET current restaurant from Supabase
   ├─> Merges/appends to overlays array
   └─> PATCH updated overlays back to Supabase

10. Supabase updates database
    └─> restaurants.overlays now includes new item

11. Clarivore app immediately reflects changes
    └─> Customers see updated menu with allergen info

12. WordPress shows success message
    └─> "Menu item published and synced to Clarivore"
```

## Component Responsibilities

### Main Plugin File
- **Purpose**: Orchestrator and controller
- **Responsibilities**:
  - Plugin lifecycle (activation/deactivation)
  - Hook registration
  - Custom post type registration
  - Settings management
  - Meta box registration
  - Sync logic
  - AJAX handlers

### Admin Settings Page
- **Purpose**: Configuration interface
- **Responsibilities**:
  - Display settings form
  - Save restaurant ID
  - Toggle auto-sync
  - Show help documentation

### Meta Box Template
- **Purpose**: Data entry interface
- **Responsibilities**:
  - Display allergen checkboxes
  - Display dietary checkboxes
  - Show AI analysis button
  - Capture removable ingredients
  - Show cross-contamination options
  - Display sync status

### Admin JavaScript
- **Purpose**: Interactive functionality
- **Responsibilities**:
  - Handle AI analysis clicks
  - Make AJAX requests
  - Apply analysis results to form
  - Validate selections
  - Provide visual feedback
  - Warn on unsaved changes

### Admin CSS
- **Purpose**: Visual presentation
- **Responsibilities**:
  - Style meta boxes
  - Style buttons and forms
  - Responsive layouts
  - Status message styling
  - Hover states and transitions

## Security Layers

```
Request Flow                Security Check
─────────────                ──────────────
User Action
    │
    ├─> Nonce Verification    ✓ wp_verify_nonce()
    │
    ├─> Capability Check      ✓ current_user_can('edit_post')
    │
    ├─> Data Sanitization     ✓ sanitize_text_field()
    │                         ✓ sanitize_textarea_field()
    │                         ✓ esc_url_raw()
    │
    ├─> Input Validation      ✓ Check required fields
    │                         ✓ Validate data types
    │
    └─> Database Operation    ✓ Prepared statements (WordPress handles)
                              ✓ Escaped output
```

## Extension Points for Future Development

### 1. Additional Post Meta
```php
// Add custom fields
add_action('clarivore_meta_box', function($post) {
    // Add price field
    // Add spice level
    // Add preparation time
});
```

### 2. Custom Sync Logic
```php
// Modify sync behavior
add_filter('clarivore_sync_data', function($data, $post_id) {
    // Add custom data to sync
    $data['custom_field'] = get_post_meta($post_id, 'custom', true);
    return $data;
}, 10, 2);
```

### 3. Third-Party Integrations
```php
// Integrate with WooCommerce
add_action('woocommerce_product_meta_end', function() {
    // Display allergen info on product pages
});
```

### 4. Analytics Tracking
```php
// Track sync events
add_action('clarivore_after_sync', function($post_id, $result) {
    // Log sync to analytics
    // Track which items sync most often
}, 10, 2);
```

## Performance Considerations

- **Lazy Loading**: Assets only load on relevant admin pages
- **Caching**: WordPress handles post meta caching
- **Async Operations**: AJAX for AI analysis (non-blocking)
- **Batch Processing**: Future: bulk sync operations
- **Database Optimization**: Uses WordPress indexing for post meta

## Compatibility Matrix

| Component          | Minimum Version | Recommended |
|--------------------|----------------|-------------|
| WordPress          | 5.0            | 6.0+        |
| PHP                | 7.4            | 8.0+        |
| MySQL/MariaDB      | 5.6            | 8.0+        |
| Browser (Admin)    | Modern ES6     | Latest      |
| Supabase           | Any            | Latest      |

---

**This architecture provides a solid foundation for seamless WordPress-Clarivore integration.**
