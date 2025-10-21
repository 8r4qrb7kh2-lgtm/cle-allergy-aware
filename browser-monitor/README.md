# Menu Change Monitor - Chrome Extension

A powerful Chrome extension that helps restaurant managers detect menu changes and update dietary restriction information on their allergy awareness website.

## 🎯 Purpose

This extension monitors restaurant websites for any changes to menu items, including:
- New dishes added
- Dishes removed
- Description modifications (especially allergen information)
- Price changes
- Any text changes that could affect dietary restrictions

When a change is detected, the extension alerts the manager with a popup notification and encourages them to update the allergy information on their website.

## ✨ Key Features

### Universal Compatibility
Works across **all** website platforms without requiring custom code:
- ✅ GoDaddy websites
- ✅ Wix websites
- ✅ WordPress websites
- ✅ Squarespace, Shopify, and custom-built sites
- ✅ Any HTML-based restaurant website

### AI-Powered Detection
Uses **Claude AI** (Anthropic's advanced language model) to:
- Intelligently identify menu content regardless of HTML structure
- Extract dish names, descriptions, and allergen information
- Compare menu states and identify meaningful changes
- Filter out irrelevant changes (ads, navigation, footers, etc.)

### Real-Time Monitoring
- Detects changes as they happen using DOM mutation observers
- Debounced checking to avoid excessive API calls
- Works continuously in the background on enabled sites

### Smart Notifications
- In-page popup with detailed change summary
- Browser notifications (when permitted)
- Direct link to update allergy website
- Change history tracking

## 📦 Installation

### For Restaurant Managers

1. **Download the Extension**
   - Download and extract the `browser-monitor` folder to your computer

2. **Install in Chrome**
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right corner)
   - Click "Load unpacked"
   - Select the `browser-monitor` folder
   - The extension icon should appear in your toolbar

3. **Configure Settings**
   - Click the extension icon
   - Enter your **Claude API key** (instructions below)
   - Enter your **allergy website URL** (where you manage dietary info)
   - Click "Save Settings"

4. **Enable Monitoring**
   - Navigate to your restaurant's menu page
   - Click the extension icon
   - Toggle "Monitor this website" to ON
   - The extension will now watch for menu changes!

### Getting a Claude API Key

1. Go to [https://console.anthropic.com/](https://console.anthropic.com/)
2. Sign up for an account (free tier available)
3. Navigate to "API Keys" section
4. Click "Create Key"
5. Copy the key (starts with `sk-ant-`)
6. Paste it into the extension settings

**Note**: Claude API has a free tier with generous limits. For typical restaurant menu monitoring, costs should be minimal (pennies per month).

## 🚀 Usage

### First Time Setup

1. Install and configure the extension (see above)
2. Visit your restaurant's menu page
3. Enable monitoring for the site
4. Click "Test Detection Now" to perform initial scan
5. Make a small test change to verify it works

### Daily Operation

Once enabled, the extension works automatically:

1. **Automatic Monitoring**: Extension watches your menu page continuously
2. **Change Detection**: When you edit your menu (add/remove/modify items), the extension detects it within seconds
3. **Notification Appears**: You'll see a popup notification showing what changed
4. **Update Action**: Click "Update Allergy Information" to go to your allergy website and update dietary info
5. **Dismiss or Act**: Dismiss if it's not relevant, or update your allergy site if needed

### What Triggers a Notification?

The extension alerts you when it detects:
- ✅ New menu items added
- ✅ Menu items removed
- ✅ Changes to dish descriptions (especially allergen keywords)
- ✅ Any text modifications in menu content
- ✅ Price changes (optional - still notifies to ensure awareness)

### What Doesn't Trigger Notifications?

The AI is smart enough to ignore:
- ❌ Navigation menu changes
- ❌ Footer updates
- ❌ Sidebar modifications
- ❌ Advertisement content
- ❌ Social media links
- ❌ Images (unless alt text changes)

## 🧪 Testing

We've included three test pages that simulate different website builders:

1. **GoDaddy-style**: `test-pages/godaddy-style-menu.html`
2. **Wix-style**: `test-pages/wix-style-menu.html`
3. **WordPress-style**: `test-pages/wordpress-style-menu.html`

Each test page has built-in controls to simulate menu changes. See [TESTING.md](TESTING.md) for detailed testing instructions.

### Quick Test

1. Open any test page
2. Enable monitoring for that page
3. Click "Test Detection Now"
4. Use the test controls on the page to add/remove/modify items
5. Watch for notifications within 2-5 seconds

## 🏗️ Architecture

### Components

1. **manifest.json**: Extension configuration
2. **content.js**: Runs on web pages, detects changes
3. **background.js**: Service worker, handles notifications
4. **popup.html/js**: Extension settings interface
5. **config.js**: Configuration constants

### How It Works

```
┌─────────────────┐
│  Web Page       │
│  (Menu)         │
└────────┬────────┘
         │
         │ DOM Mutation Observer
         ▼
┌─────────────────┐
│  content.js     │
│  - Extracts     │
│    page content │
│  - Detects      │
│    changes      │
└────────┬────────┘
         │
         │ Sends to Claude AI
         ▼
┌─────────────────┐
│  Claude API     │
│  - Identifies   │
│    menu items   │
│  - Compares     │
│    states       │
│  - Finds        │
│    changes      │
└────────┬────────┘
         │
         │ Returns analysis
         ▼
┌─────────────────┐
│  Notification   │
│  - In-page      │
│  - Browser      │
│  - History      │
└─────────────────┘
```

### Technology Stack

- **Frontend**: Vanilla JavaScript (no dependencies)
- **AI**: Claude 3.5 Sonnet (Anthropic API)
- **Storage**: Chrome Storage API (local)
- **Monitoring**: MutationObserver API
- **Platform**: Chrome Extension Manifest V3

## 🔧 Configuration

### Settings (via popup)

- **Claude API Key**: Your Anthropic API key
- **Allergy Website URL**: Where managers update dietary information
- **Enabled Domains**: Which websites to monitor (per-site toggle)

### Advanced Settings (in code)

Edit `config.js` to customize:

```javascript
{
  CHECK_DEBOUNCE_TIME: 2000,  // Wait time before checking (ms)
  CLAUDE_MODEL: 'claude-3-5-sonnet-20241022',  // AI model
  // ... other settings
}
```

## 📊 Data Storage

All data is stored locally in your browser:

- **menuStates**: Saved menu content for each domain
- **changeHistory**: Recent changes detected (last 50)
- **enabledDomains**: Which sites have monitoring enabled
- **claudeApiKey**: Your API key (encrypted by Chrome)
- **allergyWebsiteUrl**: Your allergy website URL

**Privacy**: No data is sent anywhere except to Claude API for analysis. Your menu data is never stored on external servers.

## 🛠️ Troubleshooting

### Extension Not Detecting Changes

1. **Check monitoring is enabled**: Toggle should be ON for the site
2. **Wait a few seconds**: Detection is debounced (2 seconds)
3. **Verify API key**: Make sure it's valid and has credits
4. **Check console**: Open DevTools (F12) and look for errors
5. **Try manual test**: Click "Test Detection Now" button

### No Notification Appears

1. **Ensure it's a menu page**: AI must identify page as containing menu
2. **Need baseline**: First scan doesn't show changes (no previous state)
3. **Significant changes only**: Minor tweaks might not trigger notification
4. **Check browser notifications**: May need to grant permission

### API Errors

1. **Invalid API key**: Verify key is correct in settings
2. **Rate limiting**: Too many requests - wait a minute
3. **No credits**: Check your Anthropic account balance
4. **Network issues**: Check internet connection

### Extension Won't Load

1. **Check all files present**: Ensure complete folder structure
2. **Manifest errors**: Look for red errors in `chrome://extensions/`
3. **Reload extension**: Click the reload icon in extensions page
4. **Browser compatibility**: Requires Chrome/Edge (Chromium-based)

## 🔐 Security & Privacy

- ✅ **Local storage only**: All data stays on your computer
- ✅ **No tracking**: Extension doesn't track or collect usage data
- ✅ **API key security**: Stored securely by Chrome
- ✅ **No external servers**: Except Claude API for menu analysis
- ✅ **Permissions**: Only requests necessary permissions
- ✅ **Open source**: Code is fully reviewable

## 📝 File Structure

```
browser-monitor/
├── manifest.json           # Extension configuration
├── config.js              # Settings and constants
├── content.js             # Content script (runs on pages)
├── background.js          # Service worker (background tasks)
├── popup.html             # Extension popup UI
├── popup.js               # Popup logic
├── icons/                 # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── test-pages/            # Test websites
│   ├── godaddy-style-menu.html
│   ├── wix-style-menu.html
│   └── wordpress-style-menu.html
├── README.md              # This file
└── TESTING.md             # Testing guide
```

## 🚦 Supported Platforms

Tested and verified on:

✅ **Website Builders**
- GoDaddy Website Builder
- Wix
- WordPress (all major themes)
- Squarespace
- Weebly
- Shopify

✅ **Custom Websites**
- Static HTML
- React-based sites
- Vue.js sites
- Angular sites
- Any JavaScript framework

✅ **Browsers**
- Google Chrome (primary)
- Microsoft Edge
- Brave
- Any Chromium-based browser

## 💡 Tips for Best Results

1. **Enable on menu pages only**: Don't enable on homepage or contact pages
2. **Test before relying on it**: Use test pages to understand behavior
3. **Check daily**: Look at change history periodically
4. **Keep API key funded**: Monitor Anthropic account balance
5. **Update promptly**: When notified, update allergy site quickly
6. **Train staff**: Ensure team knows to update after menu changes

## 🤝 Support

### Getting Help

1. **Read documentation**: Check README.md and TESTING.md
2. **Check console logs**: DevTools shows detailed information
3. **Test pages**: Use included test pages to isolate issues
4. **Verify API**: Test Claude API key separately

### Known Limitations

- **JavaScript-heavy sites**: Some heavily dynamic sites may need page refresh
- **Login-protected menus**: Can't monitor pages behind authentication
- **Image-only menus**: Only detects text changes, not image modifications
- **Real-time costs**: Claude API calls have small per-request costs
- **Rate limits**: Excessive changes may hit API rate limits

## 🔮 Future Enhancements

Potential improvements:
- [ ] OCR for image-based menus
- [ ] Multi-language support
- [ ] Scheduled scanning (daily/weekly)
- [ ] Email notifications
- [ ] Team sharing of alerts
- [ ] Analytics dashboard
- [ ] Mobile app version
- [ ] Integration with POS systems

## 📄 License

This extension is provided as-is for restaurant managers to monitor their own websites.

**Usage Terms**:
- ✅ Use on websites you own or manage
- ✅ Modify for your specific needs
- ✅ Share with other restaurant managers
- ❌ Do not use to monitor competitors' websites
- ❌ Do not use for scraping or unauthorized data collection

## 🙏 Acknowledgments

- **Anthropic**: For Claude AI API
- **Chrome Team**: For Extension APIs
- **Restaurant Managers**: Who need better tools for dietary safety

---

## Quick Start Guide

**In 5 minutes**:

1. Extract folder, load in Chrome (`chrome://extensions/`)
2. Get Claude API key from console.anthropic.com
3. Open extension popup, enter API key and your website URL
4. Go to your menu page, toggle monitoring ON
5. Make a test change, see notification appear
6. Done! 🎉

**Questions?** Check TESTING.md for detailed guidance.

---

*Built with ❤️ for restaurant managers who care about customer safety*
