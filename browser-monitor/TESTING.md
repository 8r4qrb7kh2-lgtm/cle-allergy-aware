# Menu Change Monitor - Testing Guide

This guide will help you test the Menu Change Monitor extension across different website platforms.

## Setup Instructions

### 1. Install the Extension

1. Open Google Chrome
2. Navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the `browser-monitor` folder
6. The extension should now appear in your extensions list

### 2. Configure the Extension

1. Click the extension icon in Chrome toolbar
2. Enter your Claude API Key (get one from https://console.anthropic.com/)
3. Enter your allergy website URL (where managers should update menus)
4. Click "Save Settings"

## Testing Procedure

### Test 1: GoDaddy-Style Website

1. Open `test-pages/godaddy-style-menu.html` in Chrome
2. Click the extension icon
3. Toggle "Monitor this website" to ON
4. Click "Test Detection Now" (initial scan may take a few seconds)
5. Try the following changes using the test controls:
   - **Add New Dish**: Should detect a new menu item added
   - **Modify Description**: Should detect allergen change (nuts added to Carbonara)
   - **Change Price**: Should detect price modification
   - **Remove Item**: Should detect item removal
6. Verify that each change triggers the notification popup
7. Check that the notification shows correct change details

### Test 2: Wix-Style Website

1. Open `test-pages/wix-style-menu.html` in Chrome
2. Enable monitoring for this site
3. Click "Test Detection Now"
4. Use test controls to:
   - **Add New Dish**: Lobster Bisque should be detected
   - **Add Allergen**: Tree nuts added to Mushroom Risotto - CRITICAL allergen change!
   - **Change Price**: Price modification should be detected
   - **Remove Dish**: Removal should be detected
5. Verify notifications appear for each change
6. Check the extension popup's "Recent Changes" section

### Test 3: WordPress-Style Website

1. Open `test-pages/wordpress-style-menu.html` in Chrome
2. Enable monitoring
3. Click "Test Detection Now"
4. Test all change types:
   - **Add Menu Item**: Chia Seed Pudding
   - **Add Allergen**: Peanuts added to Lentil Curry - CRITICAL!
   - **Modify Description**: Cashew butter added to Quinoa Bowl
   - **Remove Item**: Item removal
5. Verify detection across different DOM structures

## What to Verify

### ✓ Detection Accuracy

- [ ] New items are correctly identified
- [ ] Removed items are tracked
- [ ] Description changes are caught (especially allergen additions)
- [ ] Price changes are detected
- [ ] False positives are minimal

### ✓ Notification System

- [ ] In-page notification appears within 2-5 seconds of change
- [ ] Notification shows clear change summary
- [ ] "Update Allergy Information" button opens correct URL
- [ ] Notification can be dismissed
- [ ] Browser notification also appears (if permissions granted)

### ✓ Cross-Platform Compatibility

- [ ] Works on GoDaddy-style layout (basic HTML structure)
- [ ] Works on Wix-style layout (modern grid-based design)
- [ ] Works on WordPress-style layout (article/sidebar structure)
- [ ] Handles different HTML structures correctly
- [ ] Extracts menu content regardless of class names/IDs

### ✓ Claude AI Analysis

- [ ] Correctly identifies pages as menu pages
- [ ] Accurately extracts dish names
- [ ] Captures descriptions and allergen information
- [ ] Detects differences between menu states
- [ ] Handles different text formats and layouts

### ✓ Performance

- [ ] Page load time not significantly affected
- [ ] Changes detected within reasonable time (2-5 seconds)
- [ ] No excessive API calls
- [ ] Browser remains responsive
- [ ] Memory usage is acceptable

### ✓ Storage & State

- [ ] Menu state is saved correctly
- [ ] Previous state is compared accurately
- [ ] Change history is maintained
- [ ] Settings persist across browser sessions
- [ ] Multiple domains tracked independently

## Common Issues & Solutions

### Issue: "No API key configured" error
**Solution**: Make sure you've entered your Claude API key in the extension popup and saved settings.

### Issue: Changes not being detected
**Solution**:
1. Ensure monitoring is enabled for the site (toggle in popup)
2. Wait 2-3 seconds after making changes (debounce timer)
3. Check browser console for errors (F12 → Console tab)
4. Try clicking "Test Detection Now" manually

### Issue: Notification doesn't appear
**Solution**:
1. Check if the page is a recognized menu page (see console logs)
2. Make sure there's a previous state saved (first scan won't show changes)
3. Verify the change is significant enough (must affect menu content)

### Issue: Extension not loading
**Solution**:
1. Check that all files are present in the directory
2. Verify manifest.json is valid
3. Check for errors in `chrome://extensions/`
4. Try removing and re-adding the extension

## Testing Checklist

### Initial Setup
- [ ] Extension loads without errors
- [ ] Icons display correctly
- [ ] Popup opens and displays UI
- [ ] Settings can be saved

### GoDaddy-Style Tests
- [ ] Initial menu detection works
- [ ] Add item detected
- [ ] Remove item detected
- [ ] Description modification detected
- [ ] Allergen addition detected
- [ ] Price change detected

### Wix-Style Tests
- [ ] Works with grid layout
- [ ] Card-based items detected
- [ ] Badge/tag changes caught
- [ ] All test scenarios pass

### WordPress-Style Tests
- [ ] Article-based layout handled
- [ ] Sidebar doesn't interfere
- [ ] Widget structure ignored correctly
- [ ] Menu content extracted accurately

### Advanced Tests
- [ ] Multiple tabs monitored simultaneously
- [ ] Extension survives page refresh
- [ ] Works after browser restart
- [ ] Change history persists
- [ ] Can disable/enable monitoring per site

## Expected Behavior

1. **First Visit**: Extension scans page, identifies if it's a menu, saves baseline
2. **Subsequent Visits**: Compares current content to saved state
3. **Change Detected**: Shows notification with specific changes
4. **Manager Action**: Clicks notification → Opens allergy website update page
5. **New Baseline**: After notification, new state becomes baseline for future comparisons

## Performance Benchmarks

- **Initial scan**: < 3 seconds
- **Change detection**: 2-5 seconds after DOM modification
- **API response**: 1-3 seconds (depends on Claude API)
- **Memory footprint**: < 10MB per tab
- **CPU impact**: Minimal (event-driven, not continuous polling)

## Debugging Tips

1. **Enable verbose logging**:
   - Open DevTools (F12)
   - Look for `[Menu Monitor]` prefixed messages
   - Watch for Claude API responses

2. **Check extension console**:
   - Go to `chrome://extensions/`
   - Click "Inspect views: background page"
   - View service worker logs

3. **Test Claude API directly**:
   - Check API key is valid
   - Verify you have API credits
   - Look for rate limiting issues

4. **Examine stored data**:
   ```javascript
   // Run in DevTools console
   chrome.storage.local.get(null, (data) => console.log(data));
   ```

## Next Steps After Testing

1. Document any bugs or unexpected behavior
2. Note which website structures work best
3. Identify any false positives/negatives
4. Test on real restaurant websites
5. Gather feedback from actual restaurant managers

## Real-World Testing

After testing the sample pages, try these real websites:
1. Find 3 restaurant websites built on different platforms
2. Enable monitoring on each
3. Contact the restaurant and ask them to make a small menu change
4. Verify the extension detects the change
5. Document results and any edge cases

---

## Reporting Issues

When reporting issues, please include:
- Browser version
- Extension version
- Website URL or test page used
- Steps to reproduce
- Console error messages
- Screenshots if applicable
