# Clarivore Menu Manager - Chrome Extension

A universal Chrome extension that detects when restaurant managers edit their menus on **any platform** and reminds them to update allergen information in Clarivore.

## 🎯 Features

### Universal Detection
Works across ALL website builders and CMS platforms:
- ✅ WordPress
- ✅ GoDaddy Website Builder
- ✅ Wix
- ✅ Squarespace
- ✅ Shopify
- ✅ Weebly
- ✅ Custom CMS systems
- ✅ Any admin/editor interface

### Smart Monitoring
- **Detects menu content** using keyword analysis (pizza, pasta, allergen, price, etc.)
- **Tracks text changes** in real-time across all input fields
- **Identifies save actions** on any platform
- **Prompts at the right time** when manager saves menu changes

### Beautiful UI
- **Unobtrusive slide-in prompt** appears when menu changes are saved
- **One-click access** to Clarivore editor
- **Customizable reminders** - remind later or dismiss
- **Platform detection** shows which CMS is detected

## 📦 Installation

### For Development/Testing

1. **Download the extension folder**
   ```
   /Users/mattdavis/Documents/cle-allergy-aware/chrome-extension/
   ```

2. **Open Chrome and go to Extensions**
   - Navigate to `chrome://extensions/`
   - OR click menu (⋮) → More Tools → Extensions

3. **Enable Developer Mode**
   - Toggle the switch in the top-right corner

4. **Load the extension**
   - Click "Load unpacked"
   - Select the `chrome-extension` folder
   - Click "Select Folder"

5. **Extension is now installed!**
   - You should see the Clarivore icon in your extensions bar
   - Click it to configure your restaurant slug

### For Distribution (Chrome Web Store)

To publish to the Chrome Web Store:

1. **Create icons** (currently using placeholders)
   - 16x16, 48x48, 128x128 PNG files
   - Place in `icons/` folder

2. **Zip the extension**
   ```bash
   cd chrome-extension
   zip -r clarivore-extension.zip * -x "*.DS_Store" -x "README.md"
   ```

3. **Upload to Chrome Web Store**
   - Go to [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole)
   - Pay one-time $5 developer fee (if first time)
   - Upload the ZIP file
   - Fill in store listing details
   - Submit for review

## ⚙️ Configuration

### First-Time Setup

1. **Click the extension icon** in your Chrome toolbar
2. **Enter your restaurant slug** (e.g., `mama-santas`)
3. **Click "Save Settings"**
4. **Done!** The extension will now monitor for menu changes

### Settings

- **Restaurant Slug**: Your unique Clarivore identifier
- **Enable Monitoring**: Toggle to turn detection on/off
- **Platform Detection**: Shows which CMS was detected on current page

## 🚀 How It Works

### Detection Algorithm

1. **Platform Detection**
   - Checks URL patterns (wp-admin, godaddy.com, wix.com, etc.)
   - Analyzes HTML for platform signatures
   - Identifies editor/admin interfaces

2. **Menu Content Detection**
   - Monitors all text inputs, textareas, and contenteditable elements
   - Scans for food-related keywords (menu, dish, allergen, ingredients, etc.)
   - Requires 2+ keyword matches for high confidence

3. **Change Tracking**
   - Compares text content every 2 seconds
   - Stores detected changes with timestamps
   - Only tracks when content is growing (additions, not deletions)

4. **Save Action Detection**
   - Finds all save/publish/update buttons
   - Monitors button clicks
   - Shows prompt when save is clicked AND menu content was detected

### Prompt Behavior

When menu changes are saved:
- **Slide-in prompt** appears in bottom-right corner
- **Three options:**
  1. **Update Allergens Now** - Opens Clarivore editor in new tab
  2. **Remind Me Later** - Dismisses for 5 minutes
  3. **Already Updated** - Dismisses and clears detected changes
- **Auto-dismisses** after 30 seconds if no action

## 🔧 Development

### File Structure

```
chrome-extension/
├── manifest.json          # Extension configuration
├── content.js            # Main detection logic (runs on all pages)
├── content.css           # Prompt styling
├── background.js         # Background service worker
├── popup.html            # Extension popup UI
├── popup.js              # Popup functionality
├── icons/                # Extension icons (16, 48, 128px)
└── README.md             # This file
```

### Key Components

**content.js** - The Brain
- Platform detection
- Menu content detection
- Change tracking
- Save button monitoring
- Prompt display

**popup.html/js** - The UI
- Settings configuration
- Status display
- Quick access to Clarivore

**background.js** - The Coordinator
- Message handling
- Analytics tracking
- Default settings

### Testing

1. **Test on different platforms:**
   - WordPress: Go to any WordPress post editor
   - GoDaddy: Visit GoDaddy Website Builder
   - Generic: Any website with admin panel

2. **Test detection:**
   - Type menu-related text (pizza, allergen, $12.99)
   - Watch console for `[Clarivore]` logs
   - Click save button
   - Prompt should appear

3. **Test settings:**
   - Change restaurant slug
   - Toggle monitoring on/off
   - Open Clarivore editor

## 🐛 Debugging

### Enable Console Logs

The extension logs all activity to the console:

```javascript
[Clarivore] Platform detected: { platform: 'WordPress', isEditor: true }
[Clarivore] Menu content detected, matches: 5
[Clarivore] Save action detected on menu content
```

**To view logs:**
1. Right-click on any page
2. Select "Inspect" or press F12
3. Go to "Console" tab
4. Look for `[Clarivore]` messages

### Common Issues

**Prompt not showing:**
- Check if monitoring is enabled (extension icon → toggle)
- Verify restaurant slug is configured
- Make sure you're on an editor/admin page
- Check console for detection logs

**Wrong platform detected:**
- Extension uses heuristics for detection
- May detect "Unknown CMS" for custom platforms
- Still works even if platform name is wrong

**Not detecting menu changes:**
- Try typing more menu-related keywords
- Check if inputs are standard HTML elements
- Some custom editors may use non-standard inputs

## 📝 Customization

### Add More Keywords

Edit `content.js` around line 55:

```javascript
const menuKeywords = [
  'pizza', 'pasta', 'appetizer', // ... add more here
];
```

### Change Detection Sensitivity

Edit `content.js` around line 115:

```javascript
return {
  isMenuContent: matches.length >= 2, // Change threshold here
  ...
};
```

### Customize Prompt Timing

Edit `content.js` around line 412:

```javascript
setTimeout(() => {
  if (document.getElementById('clarivore-prompt')) {
    prompt.remove();
  }
}, 30000); // Auto-dismiss time in milliseconds
```

## 🎨 Branding

### Colors

Primary gradient: `#667eea` → `#764ba2` (Purple)

To change colors, edit:
- `content.css` - Prompt styles
- `popup.html` - Popup styles

### Icons

Replace placeholder icons in `icons/` folder:
- `icon16.png` - 16x16px
- `icon48.png` - 48x48px
- `icon128.png` - 128x128px

Recommended: Shield or food safety related icon with Clarivore branding

## 📄 License

Copyright © 2025 Clarivore. All rights reserved.

## 🤝 Support

For issues or questions:
- Email: support@clarivore.org
- Website: https://clarivore.org

## 🚀 Roadmap

Future features:
- [ ] Firefox extension version
- [ ] Safari extension version
- [ ] Multi-language support
- [ ] Custom reminder schedules
- [ ] Dish-specific tracking
- [ ] Integration with more platforms
- [ ] Analytics dashboard
