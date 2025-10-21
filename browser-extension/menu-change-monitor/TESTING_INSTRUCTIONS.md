# 🧪 Testing Instructions - Fixed Extension

## ✅ The Bug Has Been Fixed!

**Issue Found:** Missing `"scripting"` permission in manifest.json
**Fix Applied:** Added the permission to line 10

---

## 📋 Steps to Test the Fixed Extension

### Step 1: Reload the Extension

1. Go to `chrome://extensions/`
2. Find "AI Menu Change Monitor"
3. Click the **🔄 Reload** button (circular arrow icon)
4. This will load the updated manifest.json with the scripting permission

### Step 2: Open the Test Menu

The test menu file has been created at:
```
browser-extension/menu-change-monitor/test-menu.html
```

**Option A - Open directly:**
1. Navigate to the file in Finder
2. Double-click `test-menu.html`
3. It will open in Chrome

**Option B - Open via File menu:**
1. In Chrome: File → Open File
2. Navigate to the test-menu.html file
3. Click Open

**Option C - Drag and drop:**
1. Drag `test-menu.html` into a Chrome window

### Step 3: Configure Your API Key (if not done yet)

1. Click the extension icon
2. Click **⚙️ Settings** at the bottom
3. Enter your Claude API key (get from console.anthropic.com)
4. Click **💾 Save Settings**

### Step 4: Test the Analysis

1. With test-menu.html open in Chrome
2. Click the extension icon
3. Click **🔍 Analyze This Page**
4. Wait 10-20 seconds
5. You should see results!

---

## 🎯 Expected Results

The AI should detect these menu items with allergens:

### Appetizers
- **Caesar Salad**: Dairy (parmesan, dressing), Eggs (dressing), Gluten (croutons)
- **Bruschetta**: Gluten (bread)
- **Fried Calamari**: Shellfish, Gluten, Cross-contamination warning (shared fryer)

### Main Courses
- **Grilled Salmon**: Fish, Dairy (butter sauce)
- **Fettuccine Alfredo**: Dairy (cream, parmesan, butter), Eggs (pasta), Gluten
- **Margherita Pizza**: Dairy (mozzarella), Gluten (wheat crust)
- **Eggplant Parmesan**: Dairy, Eggs, Gluten (vegetarian)
- **Chicken Piccata**: Dairy (butter), Gluten

### Desserts
- **Tiramisu**: Dairy (mascarpone), Eggs, Gluten
- **Chocolate Torte**: Dairy, Eggs (gluten-free)
- **Panna Cotta**: Dairy (gluten-free)

---

## 🧪 Advanced Testing: Simulate Menu Changes

To test the change detection feature:

### Test 1: Add New Allergen

1. Right-click on test-menu.html → Open With → TextEdit (or any editor)
2. Find the "Bruschetta" item
3. Change the description from:
   ```
   extra virgin olive oil
   ```
   to:
   ```
   extra virgin olive oil and parmesan cheese
   ```
4. Save the file
5. Reload the page in Chrome
6. Analyze again
7. The AI should detect dairy was added to a previously vegan dish

### Test 2: Remove Allergen

1. Find "Margherita Pizza"
2. Change "fresh mozzarella cheese" to "vegan cheese"
3. Update dietary info to say "Vegan option"
4. Save and reload
5. AI should detect dairy was removed

### Test 3: Change Preparation Method

1. Find "Grilled Atlantic Salmon"
2. Change "grilled" to "fried"
3. Save and reload
4. AI should flag this as a preparation change (potential cross-contamination)

---

## 🐛 Troubleshooting

### If analysis still fails:

1. **Check the Background Service Worker:**
   - Go to `chrome://extensions/`
   - Click "service worker" under AI Menu Monitor
   - Check Console for errors
   - Should now show no TypeError

2. **Verify API Key:**
   - Settings page should show key is saved
   - Key should start with `sk-ant-`
   - Check console.anthropic.com for credits

3. **Check Network:**
   - Open DevTools (F12) on the test menu page
   - Go to Network tab
   - Should see a POST to `api.anthropic.com` when analyzing

### Common Issues:

**"Analysis failed" still showing:**
- Clear error: Check background service worker console
- API key issue: Verify key and credits
- Network issue: Check internet connection

**No menu items detected:**
- The page should have detectable content
- test-menu.html has clear menu structure
- Try on a different public restaurant site

**Extension not loading:**
- Make sure you reloaded after fixing manifest
- Check chrome://extensions for error messages
- Try removing and re-loading the extension

---

## 📊 What Success Looks Like

When working correctly, the popup should show:

```
┌─────────────────────────────────────┐
│ 📊 Analysis Summary                 │
│ Found 10 menu items                 │
├─────────────────────────────────────┤
│ Classic Caesar Salad                │
│ Crisp romaine lettuce...            │
│ 🏷️ dairy  eggs  gluten              │
├─────────────────────────────────────┤
│ Grilled Atlantic Salmon             │
│ Fresh Atlantic salmon...            │
│ 🏷️ fish  dairy                      │
├─────────────────────────────────────┤
│ ... and 8 more items                │
└─────────────────────────────────────┘
```

---

## 🎉 Next Steps After Successful Test

Once the test menu works:

1. **Test on real restaurant websites:**
   - Try a local restaurant's menu page
   - Test on different platforms (WordPress, Wix, etc.)

2. **Start monitoring:**
   - Click "Start Monitoring" on test-menu.html
   - Make changes to the file
   - Run manual check to see change detection

3. **Optimize settings:**
   - Try HTML-only vs HTML+Visual
   - Adjust check frequency
   - Monitor API costs

---

## 📞 Still Having Issues?

If you still get errors after following these steps:

1. Take a screenshot of the background service worker console
2. Take a screenshot of the popup error
3. Check the settings page shows API key is saved
4. Provide the Chrome version: chrome://version

The fix (adding "scripting" permission) should resolve the TypeError you saw!

---

**The extension is now ready to test! 🚀**
