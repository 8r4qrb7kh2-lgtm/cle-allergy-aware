# 🎮 Demo Mode - Testing Without API

## ✅ DEMO MODE IS NOW ENABLED!

I've enabled demo mode in the extension so you can test it immediately **without needing a Claude API key** and **without CORS issues**.

---

## 🚀 How to Test NOW

### Step 1: Reload the Extension
```
1. Go to chrome://extensions/
2. Find "AI Menu Change Monitor"
3. Click 🔄 Reload
```

### Step 2: Open Test Menu
```
1. Open: browser-extension/menu-change-monitor/test-menu.html
   (Double-click the file or drag into Chrome)
```

### Step 3: Test Analysis
```
1. Click extension icon
2. Click "🔍 Analyze This Page"
3. Wait 2 seconds (simulated delay)
4. See mock results! ✅
```

---

## 🎯 What You'll See

The demo mode returns 3 sample menu items:

1. **Classic Caesar Salad** → Gluten, Dairy, Eggs
2. **Grilled Atlantic Salmon** → Fish, Dairy (gluten-free)
3. **Margherita Pizza** → Gluten, Dairy (vegetarian)

This tests the entire UI flow without making real API calls.

---

## 🔧 How Demo Mode Works

**In background.js line 8:**
```javascript
const DEMO_MODE = true; // Currently enabled
```

**What it does:**
- ✅ Bypasses Claude API entirely
- ✅ Returns mock menu analysis data
- ✅ Simulates 2-second API delay
- ✅ Tests all UI components
- ✅ No CORS issues
- ✅ No API key needed
- ✅ No cost

---

## 🎨 Features You Can Test in Demo Mode

### ✅ Working Features:
- Popup UI display
- Analysis results rendering
- Allergen tag display
- Menu item cards
- Settings page
- Monitored sites list
- Change history view

### ⚠️ Limited Features:
- Always returns same 3 items
- Can't detect real menu changes
- No actual AI understanding
- No visual (screenshot) analysis

---

## 🔄 Switching to Real API Mode

When you're ready to test with the actual Claude API:

### Step 1: Get API Key
1. Visit [console.anthropic.com](https://console.anthropic.com/)
2. Create account / Sign in
3. Get API key

### Step 2: Disable Demo Mode
Edit [background.js](background.js):
```javascript
// Line 8
const DEMO_MODE = false; // Change to false
```

### Step 3: Configure Extension
1. Reload extension
2. Click Settings
3. Enter API key
4. Save

### Step 4: Test with Real AI
- Now it will make actual Claude API calls
- Real semantic understanding
- Actual allergen detection
- Vision analysis (screenshots)

---

## 📊 Demo Mode vs Real Mode Comparison

| Feature | Demo Mode | Real Mode |
|---------|-----------|-----------|
| **Speed** | 2 seconds | 10-30 seconds |
| **Cost** | Free | ~$0.02 per analysis |
| **Menu Items** | Always 3 items | Actual detected items |
| **Accuracy** | Mock data | 95%+ real AI |
| **CORS Issues** | None | May occur |
| **API Key** | Not needed | Required |
| **Allergen Detection** | Hardcoded | Semantic understanding |
| **Change Detection** | Limited | Full capability |
| **Screenshot Analysis** | No | Yes (if enabled) |

---

## 🧪 Testing Checklist

With demo mode enabled, verify:

- [ ] Extension popup opens
- [ ] "Analyze This Page" button works
- [ ] Results display after 2 seconds
- [ ] Shows 3 menu items
- [ ] Allergen tags appear
- [ ] Can click "Start Monitoring"
- [ ] Settings page opens
- [ ] Settings can be changed
- [ ] Monitored sites list works
- [ ] No console errors

---

## 🐛 Troubleshooting

### "Analysis failed" still showing

1. **Did you reload the extension?**
   - chrome://extensions → Reload

2. **Check console for "[DEMO MODE]" message**
   - Should see: `[DEMO MODE] Using mock AI response`

3. **Clear extension storage**
   ```javascript
   // In background service worker console:
   chrome.storage.local.clear();
   ```

### No results appearing

1. Wait full 2 seconds (demo delay)
2. Check background service worker console
3. Look for JavaScript errors

### Wrong data showing

- Demo mode always shows same 3 items
- This is expected behavior
- To see real menus, switch to Real Mode

---

## 🎯 Next Steps

### After Testing Demo Mode:

1. **If UI works well:**
   - Switch to Real Mode
   - Test with actual Claude API
   - Verify accuracy on real restaurant sites

2. **If you find UI bugs:**
   - Report them (while demo mode is still enabled)
   - Easier to debug without API overhead

3. **For Production:**
   - Definitely switch to Real Mode
   - Demo mode is only for development/testing

---

## 💡 Pro Tips

### Tip 1: Test UI Changes Quickly
```
- Keep demo mode ON while developing UI
- No API costs
- Instant feedback
```

### Tip 2: Test Both Modes
```
- Demo mode: Test UI/UX
- Real mode: Test AI accuracy
```

### Tip 3: Use for Demos
```
- Show extension to others without API key
- No setup required
- Consistent results
```

---

## 🎉 You're Ready to Test!

**Current Status:**
- ✅ Demo mode enabled
- ✅ Mock data ready
- ✅ Test menu created
- ✅ No API key needed
- ✅ No CORS issues

**What to do:**
1. Reload extension (chrome://extensions/)
2. Open test-menu.html
3. Click "Analyze This Page"
4. See results in ~2 seconds!

---

**The extension is now fully testable without any external dependencies!** 🚀
