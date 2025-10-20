# Quick Installation Guide

## 1. Upload Plugin

**Via FTP/File Manager:**
```
1. Upload clarivore-menu-integration folder to /wp-content/plugins/
2. Go to WordPress Admin > Plugins
3. Click "Activate" on Clarivore Menu Integration
```

**Via WordPress Admin:**
```
1. Zip the clarivore-menu-integration folder
2. WordPress Admin > Plugins > Add New > Upload Plugin
3. Choose ZIP file and click Install Now
4. Click Activate
```

## 2. Configure Settings

```
1. Go to: WordPress Admin > Clarivore
2. Enter your Restaurant Slug/ID (e.g., "mama-santa")
3. Check "Auto-Sync" to enable automatic syncing
4. Click "Save Settings"
```

## 3. Add Your First Menu Item

```
1. Go to: Menu Items > Add New
2. Title: "Grilled Salmon"
3. Description: "Fresh Atlantic salmon grilled to perfection..."
4. Add a photo (optional)
5. Click "Analyze with AI" in the Clarivore box
6. Review and adjust allergen selections
7. Click "Publish"
```

## 4. Verify Sync

```
1. Check your Clarivore app
2. Look for your restaurant
3. The menu item should appear with allergen data
```

## Requirements

- WordPress 5.0+
- PHP 7.4+
- Restaurant already created in Clarivore system
- Valid Clarivore restaurant slug

## Troubleshooting

**Plugin won't activate:**
- Check PHP version (must be 7.4+)
- Check for plugin conflicts

**Items not syncing:**
- Verify Auto-Sync is enabled
- Check Restaurant Slug matches exactly
- View WordPress debug log for errors

**AI Analysis fails:**
- Ensure title and description are filled
- Check internet connection
- Verify Supabase API credentials

## Need Help?

Email: support@clarivore.com
Docs: https://clarivore.com/docs
