# Comprehensive Testing Guide - AI Menu Change Monitor Extension

## Overview

This extension uses **real-time MutationObserver technology** to detect menu changes as they happen on ANY restaurant website, regardless of the platform (WordPress, Wix, GoDaddy, Squarespace, custom sites, etc.).

## How It Works

### Real-Time Detection
1. **MutationObserver** watches the entire page for DOM changes
2. **Intelligent Filtering** - ignores irrelevant changes (ads, scripts, timestamps)
3. **Smart Debouncing** - waits 2 seconds after changes stop before analyzing
4. **AI-Powered Analysis** - Uses Claude API to determine if changes affect dietary restrictions
5. **Instant Notification** - Shows popup immediately when diet-relevant changes detected

### Universal Compatibility
The extension works on ANY website because it:
- Uses semantic HTML analysis (looks for menu keywords)
- Doesn't rely on specific CSS classes or IDs
- Analyzes text content, not just structure
- Uses AI to understand menu context

## Installation & Setup

### Step 1: Install the Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `browser-extension/menu-change-monitor` folder
5. The extension should now appear in your extensions list

### Step 2: Configure API Key (Optional for Testing)

**For Quick Testing: Use Demo Mode**
- Demo mode is enabled by default (`DEMO_MODE = true` in background.js)
- This bypasses API calls and uses mock data
- Perfect for testing the UI and change detection

**For Real AI Analysis:**
1. Get a Claude API key from [console.anthropic.com](https://console.anthropic.com/)
2. Click the extension icon in Chrome toolbar
3. Click "Settings"
4. Enter your API key
5. Set `DEMO_MODE = false` in background.js
6. Reload the extension

## Testing Protocol

### Test 1: WordPress-Style Site

**File:** `test-sites/wordpress-style.html`

1. **Open the test file:**
   ```
   Open test-sites/wordpress-style.html in Chrome
   ```

2. **Start monitoring:**
   - Click the extension icon
   - Click "Start Monitoring"
   - Enter restaurant name: "Luigi's Trattoria"

3. **Test Change Detection:**

   **Test 3a: Add a new dish**
   - Click "➕ Add New Dish" in the WordPress Editor panel
   - Wait 2-3 seconds
   - **Expected:** Notification popup appears saying "Menu Change Detected!"
   - **Verify:** Popup shows link to update allergy info

   **Test 3b: Change allergen info**
   - Click "⚠️ Change Allergen Info"
   - Wait 2-3 seconds
   - **Expected:** Notification with critical warning (⚠️) appears
   - **Verify:** Change is logged in extension popup

   **Test 3c: Edit description**
   - Click "✏️ Edit Description"
   - Wait 2-3 seconds
   - **Expected:** Notification appears
   - **Verify:** Description change is detected

   **Test 3d: Remove a dish**
   - Click "➖ Remove Last Dish"
   - Wait 2-3 seconds
   - **Expected:** Notification about dish removal

4. **Verify in Extension:**
   - Click extension icon
   - Check "Recent Changes" section
   - Should show all detected changes with timestamps

### Test 2: Wix-Style Site

**File:** `test-sites/wix-style.html`

1. **Open the test file:**
   ```
   Open test-sites/wix-style.html in Chrome
   ```

2. **Start monitoring:**
   - Extension should auto-detect this as a new restaurant
   - Click "Start Monitoring"
   - Enter: "The Coastal Grill"

3. **Test Change Detection:**

   **Test 3a: Add menu item**
   - Click "➕ Add Menu Item" in Wix Editor panel
   - **Expected:** Notification popup within 2-3 seconds

   **Test 3b: Update allergens**
   - Click "⚠️ Update Allergens"
   - **Expected:** Critical change notification

   **Test 3c: Change price**
   - Click "💲 Change Price"
   - **Expected:** NO notification (price-only changes should be ignored)
   - **Verify:** AI should determine this doesn't affect dietary restrictions

   **Test 3d: Remove item**
   - Click "➖ Remove Item"
   - **Expected:** Notification about dish removal

### Test 3: GoDaddy-Style Site

**File:** `test-sites/godaddy-style.html`

1. **Open the test file:**
   ```
   Open test-sites/godaddy-style.html in Chrome
   ```

2. **Start monitoring:**
   - Click "Start Monitoring"
   - Enter: "Maria's Mexican Kitchen"

3. **Test Change Detection:**

   **Test 3a: Add item**
   - Click "➕ Add" in the bottom edit bar
   - **Expected:** Notification popup

   **Test 3b: Change allergen**
   - Click "⚠️ Allergen"
   - **Expected:** Critical notification

   **Test 3c: Edit text**
   - Click "✏️ Edit"
   - **Expected:** Notification

   **Test 3d: Remove item**
   - Click "➖ Remove"
   - **Expected:** Notification

### Test 4: Real-World Testing

**Test on actual restaurant websites:**

1. **Find a real restaurant website** (Google "restaurant menu [your city]")
2. **Start monitoring** the site
3. **IF you have access to edit the site:**
   - Make a real edit to a menu item
   - Verify detection works
4. **IF you don't have access:**
   - Use browser DevTools Console:
     ```javascript
     // Simulate adding text to menu
     const menuItem = document.querySelector('h3, .menu-item, [class*="menu"]');
     if (menuItem) {
       menuItem.textContent += ' - Contains Nuts';
     }
     ```
   - This simulates a change and should trigger detection

### Test 5: Performance & Edge Cases

**Test 5a: Ignore irrelevant changes**
- Scroll the page (shouldn't trigger)
- Resize window (shouldn't trigger)
- Ad banners loading (shouldn't trigger)
- **Expected:** No notifications for these

**Test 5b: Cooldown period**
- Make a change
- Immediately make another change within 30 seconds
- **Expected:** Only one notification (cooldown active)

**Test 5c: Multiple monitored sites**
- Monitor all 3 test sites
- Make changes to different sites
- **Expected:** Each site tracked independently

## Validation Checklist

### ✅ Functionality Tests

- [ ] Extension installs without errors
- [ ] Extension icon appears in Chrome toolbar
- [ ] Popup opens and shows current page info
- [ ] "Analyze This Page" button works
- [ ] "Start Monitoring" creates monitoring session
- [ ] Real-time change detection works on WordPress-style
- [ ] Real-time change detection works on Wix-style
- [ ] Real-time change detection works on GoDaddy-style
- [ ] Notification popup appears on changes
- [ ] Notification has "Update Allergy Info" button with link
- [ ] Changes logged in extension history
- [ ] Can stop monitoring a site
- [ ] Multiple sites can be monitored simultaneously

### ✅ AI Analysis Tests (with real API)

- [ ] Detects new dishes added
- [ ] Detects dishes removed
- [ ] Detects allergen information changes
- [ ] Detects description/ingredient changes
- [ ] IGNORES price-only changes
- [ ] IGNORES cosmetic/formatting changes
- [ ] Correctly identifies critical vs minor changes

### ✅ Universal Compatibility

- [ ] Works on WordPress block editor style
- [ ] Works on Wix drag-and-drop style
- [ ] Works on GoDaddy template style
- [ ] Works on plain HTML menus
- [ ] Doesn't require site-specific code

### ✅ User Experience

- [ ] Notification is visible and easy to read
- [ ] Notification doesn't block important content
- [ ] Notification auto-dismisses after 30 seconds
- [ ] Can manually dismiss notification
- [ ] Link to allergy website works
- [ ] Extension popup is responsive and clear

## Troubleshooting

### Issue: No changes detected

**Solutions:**
1. Check console for errors: `Right-click → Inspect → Console`
2. Verify monitoring is active: Check extension popup
3. Ensure changes are meaningful (>10 characters)
4. Wait 2-3 seconds after making change (debounce delay)
5. Check cooldown period hasn't been triggered (30s between checks)

### Issue: Notification doesn't appear

**Solutions:**
1. Check if DEMO_MODE is enabled in background.js
2. Verify Chrome notifications are allowed
3. Check console for JavaScript errors
4. Ensure popup isn't blocked by browser

### Issue: Extension not loading

**Solutions:**
1. Check chrome://extensions/ for errors
2. Verify all files are in correct locations
3. Reload extension: Click reload icon in chrome://extensions/
4. Check manifest.json is valid

### Issue: API errors (if using real Claude API)

**Solutions:**
1. Verify API key is correct in settings
2. Check API key has credits: console.anthropic.com
3. Check browser console for specific error messages
4. Try DEMO_MODE = true for testing without API

## Performance Metrics

### Expected Performance:
- **Detection Speed:** 2-3 seconds after change
- **Memory Usage:** <50MB
- **CPU Impact:** Minimal (only when changes occur)
- **API Calls:** Only when menu changes detected (not on every page load)

### Optimization Features:
- Debouncing prevents spam
- Cooldown prevents excessive API calls
- Smart filtering reduces false positives
- Lightweight content script

## Next Steps After Testing

1. **Update Allergy Website URL** in contentScript.js:
   ```javascript
   function getAllergyWebsiteUrl() {
     return `https://YOUR-ACTUAL-WEBSITE.com/update-menu?restaurant=${restaurantId}`;
   }
   ```

2. **Adjust cooldown/debounce** if needed in contentScript.js

3. **Deploy for real restaurants:**
   - Send installation link to restaurant managers
   - Provide simple setup guide
   - Enable real API (disable DEMO_MODE)

4. **Monitor usage:**
   - Check change history
   - Review AI accuracy
   - Gather feedback from users

## Advanced Testing

### Custom Website Test:
```javascript
// In browser console on any restaurant website:
// Force trigger a change event
window.postMessage({ type: 'AI_MENU_MONITOR_TEST', action: 'trigger' }, '*');
```

### Stress Test:
1. Make 10 rapid changes
2. Verify only triggers once due to debouncing
3. Check memory doesn't leak

### Cross-Browser:
- Test on Chrome (primary)
- Test on Edge (Chromium-based, should work)
- Note: Firefox requires manifest v2 conversion

## Success Criteria

The extension is ready for production when:

- ✅ Works on all 3 test platforms without modification
- ✅ Detects 100% of meaningful menu changes
- ✅ Zero false positives for irrelevant changes
- ✅ Notification appears within 3 seconds
- ✅ No JavaScript errors in console
- ✅ Extension popup shows accurate information
- ✅ Performance is smooth (no lag/freezing)

## Support & Documentation

For issues or questions:
- Check browser console for errors
- Review this testing guide
- Check DEMO_MODE_GUIDE.md for demo mode details
- Review contentScript.js comments for technical details
