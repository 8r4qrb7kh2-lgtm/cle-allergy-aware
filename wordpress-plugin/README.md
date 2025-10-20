# Clarivore WordPress Plugin

## Complete WordPress Plugin for Restaurant Menu Integration

This directory contains a fully functional WordPress plugin that allows restaurants to manage allergen and dietary information directly from their WordPress admin panel, with automatic syncing to the Clarivore platform.

---

## What's Included

```
wordpress-plugin/
├── clarivore-menu-integration/          # The actual WordPress plugin
│   ├── clarivore-menu-integration.php   # Main plugin file
│   ├── includes/                        # Template files
│   │   ├── admin-settings.php          # Settings page
│   │   ├── meta-box.php                # Allergen meta box
│   │   └── index.php                   # Security
│   ├── assets/                          # Frontend assets
│   │   ├── css/admin.css               # Admin styling
│   │   ├── js/admin.js                 # Admin JavaScript
│   │   └── index.php                   # Security
│   ├── README.md                        # Full plugin documentation
│   ├── INSTALL.md                       # Quick installation guide
│   ├── USAGE-EXAMPLES.md                # Real-world examples
│   └── index.php                        # Security
├── PLUGIN-SUMMARY.md                    # Overview of plugin structure
├── ARCHITECTURE.md                      # Technical architecture diagrams
├── TESTING-CHECKLIST.md                 # Comprehensive testing guide
└── README.md                            # This file
```

---

## Quick Start

### 1. Install the Plugin

```bash
# Copy the plugin to WordPress
cp -r clarivore-menu-integration /path/to/wordpress/wp-content/plugins/

# Or create a ZIP for upload
cd clarivore-menu-integration
zip -r clarivore-menu-integration.zip .
```

Then in WordPress:
- Go to **Plugins > Add New > Upload Plugin**
- Upload the ZIP file
- Click **Activate**

### 2. Configure Settings

- Go to **WordPress Admin > Clarivore**
- Enter your restaurant slug (e.g., "mama-santa")
- Enable **Auto-Sync**
- Save settings

### 3. Add Menu Items

- Go to **Menu Items > Add New**
- Enter dish name and description
- Click **Analyze with AI** (or manually select allergens)
- **Publish**

Your menu automatically syncs to Clarivore!

---

## Key Features

### For Restaurant Owners

- **No Technical Skills Required**: Familiar WordPress interface
- **AI-Powered Analysis**: One-click allergen detection
- **Automatic Syncing**: Changes appear instantly on Clarivore
- **Comprehensive Tracking**: 10 allergens, 8 dietary preferences
- **Removable Ingredients**: Specify customizable items
- **Cross-Contamination Warnings**: Flag shared equipment risks

### Technical Features

- **Custom Post Type**: Dedicated menu item management
- **REST API Integration**: Syncs to Supabase backend
- **AJAX Interface**: Non-blocking AI analysis
- **Real-time Validation**: Prevents conflicting selections
- **WordPress Standards**: Secure, well-coded, maintainable
- **Responsive Design**: Works on all devices

---

## How It Works

```
Restaurant updates WordPress menu
           ↓
Plugin captures allergen data
           ↓
Auto-syncs to Clarivore (Supabase)
           ↓
Customers see updated menu instantly
```

### Data Synced:
- Menu item name
- Allergens (dairy, eggs, fish, nuts, gluten, etc.)
- Dietary preferences (vegan, vegetarian, keto, etc.)
- Removable ingredients
- Cross-contamination warnings

---

## Documentation

### For Users:
- **[README.md](clarivore-menu-integration/README.md)** - Complete user guide
- **[INSTALL.md](clarivore-menu-integration/INSTALL.md)** - Step-by-step installation
- **[USAGE-EXAMPLES.md](clarivore-menu-integration/USAGE-EXAMPLES.md)** - Real-world examples

### For Developers:
- **[PLUGIN-SUMMARY.md](PLUGIN-SUMMARY.md)** - Plugin structure overview
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Technical architecture
- **[TESTING-CHECKLIST.md](TESTING-CHECKLIST.md)** - Testing procedures

---

## Requirements

- WordPress 5.0 or higher
- PHP 7.4 or higher
- Restaurant already created in Clarivore system
- Valid restaurant slug/ID

---

## Integration with Your Existing System

This plugin integrates seamlessly with your current Clarivore setup:

1. **Reads from**: Supabase `restaurants` table
2. **Writes to**: `restaurants.overlays` field
3. **Compatible with**: Your existing restaurant.html interface
4. **No breaking changes**: Works alongside manual menu updates

### Database Structure:

```json
{
  "restaurants": {
    "slug": "mama-santa",
    "overlays": [
      {
        "id": "Grilled Salmon",
        "allergens": ["fish"],
        "diets": ["Gluten-Free", "Keto"],
        "removable": ["lemon butter"],
        "crossContamination": ["shellfish"]
      }
    ]
  }
}
```

---

## Why This Approach?

### Benefits of WordPress Plugin vs Browser Extension:

✅ **Native Integration**: Works naturally within WordPress
✅ **No Extra Installation**: Restaurant already uses WordPress
✅ **Familiar Interface**: Uses WordPress editor they know
✅ **Reliable Syncing**: Automatic, not manual
✅ **Data Ownership**: Stored in both WordPress and Clarivore
✅ **Scalable**: Works for 1 or 100 restaurants
✅ **Professional**: Looks like part of WordPress

### Market Reach:

- 35-43% of restaurants use WordPress
- Easy to distribute and install
- No technical barriers for adoption
- Restaurant owners already trained on WordPress

---

## Next Steps

### To Deploy:

1. **Test Thoroughly**
   - Use [TESTING-CHECKLIST.md](TESTING-CHECKLIST.md)
   - Test with real restaurant data
   - Verify sync works correctly

2. **Package for Distribution**
   ```bash
   cd clarivore-menu-integration
   zip -r clarivore-menu-integration-v1.0.0.zip . -x "*.git*" "*.DS_Store"
   ```

3. **Distribute to Restaurants**
   - Provide ZIP file
   - Send installation instructions
   - Offer setup support

4. **Monitor & Iterate**
   - Collect feedback
   - Fix bugs
   - Add requested features

### Future Enhancements:

- [ ] Bulk import from CSV
- [ ] Menu categories/grouping
- [ ] Nutrition information
- [ ] Multi-language support
- [ ] Analytics dashboard
- [ ] Integration with popular menu plugins
- [ ] Photo-based AI analysis improvements
- [ ] Automatic price syncing

---

## Support

### For Restaurants Using the Plugin:

- Documentation: [README.md](clarivore-menu-integration/README.md)
- Installation Help: [INSTALL.md](clarivore-menu-integration/INSTALL.md)
- Examples: [USAGE-EXAMPLES.md](clarivore-menu-integration/USAGE-EXAMPLES.md)

### For Developers:

- Architecture: [ARCHITECTURE.md](ARCHITECTURE.md)
- Testing: [TESTING-CHECKLIST.md](TESTING-CHECKLIST.md)
- Code is well-commented throughout

---

## License

GPL v2 or later (standard WordPress license)

---

## Version

**Current Version**: 1.0.0
**Release Date**: October 2025
**Status**: Ready for Testing

---

## Success Metrics

If this plugin is successful, you should see:

1. **Restaurants adopt it quickly** (familiar WordPress interface)
2. **Menus stay up-to-date** (automatic syncing)
3. **Reduced manual work** (AI analysis + auto-sync)
4. **Accurate allergen data** (restaurant owners are the source of truth)
5. **Scalability** (handle 10, 100, or 1000 restaurants)

---

## The Vision

This plugin transforms Clarivore from a "we manage your menu" service to a "you manage your menu, we power the technology" platform. Restaurants maintain control and ownership of their menu data, while Clarivore provides the allergen intelligence and customer-facing interface.

**Restaurant Perspective:**
- "I update my menu in WordPress like I always do"
- "Clarivore handles the allergen analysis and customer display"
- "My menu stays current automatically"

**Your Perspective:**
- Restaurants do their own data entry
- You focus on platform improvements
- Scales to hundreds of restaurants
- Sustainable business model

---

**Made with care for safer dining experiences.**

---

## Contact

For questions, support, or feedback about this plugin, contact the Clarivore team.
