# Installation & Setup Guide

## Step-by-Step Installation

### 1. Prepare the Extension

Ensure you have all files in the `browser-monitor` folder:

```
browser-monitor/
├── manifest.json
├── config.js
├── content.js
├── background.js
├── popup.html
├── popup.js
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── test-pages/
    ├── godaddy-style-menu.html
    ├── wix-style-menu.html
    └── wordpress-style-menu.html
```

### 2. Load Extension in Chrome

1. **Open Chrome Extensions Page**
   - Type `chrome://extensions/` in the address bar, OR
   - Click the three dots menu → More Tools → Extensions

2. **Enable Developer Mode**
   - Look for "Developer mode" toggle in the top right
   - Click to enable it
   - You should now see buttons for "Load unpacked", "Pack extension", etc.

3. **Load the Extension**
   - Click "Load unpacked" button
   - Navigate to and select the `browser-monitor` folder
   - Click "Select Folder" (or "Open" on Mac)

4. **Verify Installation**
   - You should see "Menu Change Monitor" in your extensions list
   - The extension icon should appear in your Chrome toolbar
   - If you don't see the icon, click the puzzle piece icon and pin it

### 3. Get Your Claude API Key

The extension uses Claude AI to analyze menu content. You need an API key:

1. **Create Anthropic Account**
   - Go to: https://console.anthropic.com/
   - Click "Sign up" or "Get started"
   - Complete registration (email verification required)

2. **Access API Keys**
   - Once logged in, navigate to "API Keys" section
   - Or go directly to: https://console.anthropic.com/settings/keys

3. **Create a New Key**
   - Click "Create Key" button
   - Give it a name (e.g., "Menu Monitor")
   - Click "Create"
   - **IMPORTANT**: Copy the key immediately (starts with `sk-ant-`)
   - You won't be able to see it again!

4. **Add Credits (if needed)**
   - Go to "Billing" section
   - Add a payment method
   - The free tier includes $5 credit
   - For restaurant monitoring, you'll likely use < $1/month

### 4. Configure the Extension

1. **Open Extension Settings**
   - Click the Menu Change Monitor icon in your Chrome toolbar
   - The popup window will open

2. **Enter API Key**
   - Paste your Claude API key in the "Claude API Key" field
   - Make sure there are no extra spaces

3. **Enter Your Allergy Website URL**
   - This is where you manage dietary/allergen information
   - Example: `https://your-allergy-site.com/restaurant/edit`
   - This URL will open when the "Update Allergy Information" button is clicked

4. **Save Settings**
   - Click "Save Settings" button
   - You should see a "Settings saved!" confirmation

### 5. Test the Installation

1. **Open a Test Page**
   - Navigate to `file:///path/to/browser-monitor/test-pages/godaddy-style-menu.html`
   - (Replace path with actual path on your computer)

2. **Enable Monitoring**
   - Click the extension icon
   - You should see the current site domain
   - Toggle "Monitor this website" to ON (green)

3. **Run Initial Test**
   - Click "Test Detection Now" button
   - Wait 3-5 seconds (this is the initial scan)
   - Check browser console (F12) for "[Menu Monitor]" messages

4. **Simulate a Change**
   - On the test page, click "Add New Dish" button
   - Wait 3-5 seconds
   - You should see a notification popup appear!

5. **Verify Notification**
   - The notification should show:
     - "Menu Change Detected!" header
     - List of changes (e.g., "Added: Linguine alle Vongole")
     - "Update Allergy Information" button
     - "Dismiss" button

6. **Test the Button**
   - Click "Update Allergy Information"
   - Your allergy website URL should open in a new tab

## Troubleshooting Installation

### Extension Won't Load

**Error: "Manifest file is missing or unreadable"**
- Solution: Make sure you selected the correct folder containing `manifest.json`
- The folder structure must be exact - don't select a parent folder

**Error: "Failed to load extension"**
- Solution: Check that all required files are present
- Run the verification script (see below)

**Extension loads but no icon appears**
- Solution: Click the puzzle piece icon in Chrome toolbar
- Find "Menu Change Monitor" and click the pin icon

### API Key Issues

**"No API key configured" error**
- You haven't entered an API key yet
- Open the popup and enter your key

**"Claude API error: 401"**
- Your API key is invalid
- Double-check you copied it correctly
- Try generating a new key

**"Claude API error: 429"**
- Rate limit exceeded
- Wait a few minutes and try again
- Consider reducing test frequency

**"Claude API error: 403"**
- No credits remaining on your account
- Add credits at console.anthropic.com/settings/billing

### Detection Issues

**Changes not being detected**
- Make sure monitoring is enabled (toggle ON)
- Wait at least 2-3 seconds after making changes (debounce delay)
- Check if page is recognized as a menu page (console logs)
- Try clicking "Test Detection Now" manually

**Notification doesn't appear**
- First scan doesn't show changes (no previous state to compare)
- Make a change, then make another change to see notification
- Check browser console for errors

**Extension not monitoring after page refresh**
- This is normal - monitoring state is per-session
- Re-enable monitoring after each page load
- Or keep the tab open and make changes via CMS

## Verification Script

Run this in your terminal to verify all files are present:

```bash
cd /path/to/browser-monitor

echo "Checking required files..."

files=(
  "manifest.json"
  "config.js"
  "content.js"
  "background.js"
  "popup.html"
  "popup.js"
  "icons/icon16.png"
  "icons/icon48.png"
  "icons/icon128.png"
  "test-pages/godaddy-style-menu.html"
  "test-pages/wix-style-menu.html"
  "test-pages/wordpress-style-menu.html"
)

all_present=true

for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    echo "✓ $file"
  else
    echo "✗ MISSING: $file"
    all_present=false
  fi
done

if $all_present; then
  echo ""
  echo "✅ All files present! Extension is ready to load."
else
  echo ""
  echo "❌ Some files are missing. Please ensure all files are in place."
fi
```

## Quick Start Checklist

Use this checklist to ensure everything is set up correctly:

- [ ] Extension folder contains all required files
- [ ] Chrome Extensions page opened (`chrome://extensions/`)
- [ ] Developer mode enabled
- [ ] Extension loaded via "Load unpacked"
- [ ] Extension icon visible in toolbar (or pinned)
- [ ] Anthropic account created
- [ ] Claude API key obtained
- [ ] API key entered in extension settings
- [ ] Allergy website URL configured
- [ ] Settings saved successfully
- [ ] Test page opened
- [ ] Monitoring enabled for test page
- [ ] Initial test run ("Test Detection Now")
- [ ] Test change made (e.g., "Add New Dish")
- [ ] Notification appeared
- [ ] "Update Allergy Information" button works

## Next Steps

Once installation is verified:

1. **Test all three platforms**: Try GoDaddy, Wix, and WordPress test pages
2. **Enable on real site**: Go to your actual restaurant menu page
3. **Set up monitoring**: Toggle monitoring ON for your real site
4. **Make a test change**: Edit one menu item to verify detection
5. **Train your team**: Ensure staff knows to check notifications

## Support Resources

- **README.md**: Full feature documentation
- **TESTING.md**: Comprehensive testing guide
- **Browser Console**: Press F12 to see debug logs
- **Extension Console**: Go to `chrome://extensions/`, click "Inspect views: background page"

## Security Notes

- API key is stored securely by Chrome's storage API
- No data leaves your computer except Claude API calls
- All menu data is stored locally
- Extension only runs on pages you enable it on
- You can disable/remove anytime from `chrome://extensions/`

---

**Still having issues?**
1. Check the browser console (F12) for error messages
2. Review the TESTING.md file for common problems
3. Try disabling other extensions temporarily
4. Restart Chrome and try again
5. Ensure you're using Chrome version 88 or later
