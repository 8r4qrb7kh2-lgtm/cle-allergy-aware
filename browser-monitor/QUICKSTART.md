# Quick Start Guide - Menu Change Monitor

Get up and running in 10 minutes!

## What You're Installing

A Chrome extension that automatically detects when you change your restaurant's menu and reminds you to update dietary/allergen information on your allergy awareness website.

## Prerequisites

- ✅ Google Chrome browser
- ✅ Your restaurant's menu page (on any platform - GoDaddy, Wix, WordPress, etc.)
- ✅ An allergy/dietary information website where you manage allergen data
- ✅ 10 minutes of time

## Installation (5 minutes)

### Step 1: Get Claude API Key (3 minutes)

1. Go to https://console.anthropic.com/
2. Sign up (free tier available)
3. Go to "API Keys" section
4. Click "Create Key", name it "Menu Monitor"
5. **Copy the key** (starts with `sk-ant-`)

### Step 2: Load Extension in Chrome (2 minutes)

1. Open Chrome
2. Type `chrome://extensions/` in address bar
3. Turn ON "Developer mode" (top right toggle)
4. Click "Load unpacked"
5. Select the `browser-monitor` folder
6. Done! Icon appears in toolbar

### Step 3: Configure (1 minute)

1. Click extension icon in toolbar
2. Paste your Claude API key
3. Enter your allergy website URL (where managers update info)
4. Click "Save Settings"

## Testing (2 minutes)

Let's verify it works before using on your real site:

### Test 1: Open Test Page

Copy this into Chrome:
```
file:///PATH_TO_FOLDER/browser-monitor/test-pages/godaddy-style-menu.html
```
(Replace PATH_TO_FOLDER with actual location)

### Test 2: Enable Monitoring

1. Click extension icon
2. Toggle "Monitor this website" to ON
3. Click "Test Detection Now"
4. Wait 3-5 seconds (initial scan)

### Test 3: Make a Change

1. On the test page, click "Add New Dish" button
2. Wait 3-5 seconds
3. **Boom! Notification appears!** 🎉

### Test 4: Verify Notification

The popup should show:
- What changed (e.g., "Added: Linguine alle Vongole")
- Button to update allergy info
- Dismiss option

## Real-World Usage (Daily)

### One-Time Setup on Your Site

1. Go to your restaurant's menu page
2. Click extension icon
3. Toggle monitoring ON
4. That's it!

### Ongoing Usage

The extension now works automatically:

1. **You edit your menu** (add/remove/modify items via your CMS)
2. **Extension detects change** (within 2-5 seconds)
3. **Notification appears** showing what changed
4. **You click "Update Allergy Information"**
5. **Your allergy website opens** - update dietary info!
6. **Done!** Customers stay safe 🙌

## What Gets Detected?

✅ **Will notify you for:**
- New dishes added
- Dishes removed
- Description changes (ESPECIALLY allergen info!)
- Ingredient modifications
- Any menu text changes

❌ **Won't bug you about:**
- Navigation changes
- Footer updates
- Ads or promotions
- Social media links
- Non-menu content

## Common Questions

**Q: How much does this cost?**
A: Claude API free tier is generous. Typical usage: < $1/month

**Q: Does it work on my website?**
A: Yes! Works on ALL platforms - tested on GoDaddy, Wix, WordPress, and more

**Q: Do I need to keep Chrome open?**
A: Only while you're editing menus. It detects changes in real-time.

**Q: What if I miss a notification?**
A: Check the extension popup - it shows "Recent Changes" history

**Q: Is my data safe?**
A: Yes. Everything stored locally. Only your menu text is sent to Claude AI for analysis.

**Q: Can multiple staff members use it?**
A: Yes! Each person installs on their own Chrome browser.

## Troubleshooting

**Notification not appearing?**
- Wait 3-5 seconds after making changes (debounced)
- Ensure monitoring is ON for the site
- First scan doesn't show changes (needs baseline)

**"No API key configured" error?**
- Enter your Claude API key in extension settings
- Make sure it starts with `sk-ant-`

**Extension won't load?**
- Check all files are present (run `./verify-installation.sh`)
- Make sure you selected correct folder in Chrome
- Try reload button in chrome://extensions/

## Pro Tips

1. **Test first**: Use test pages before enabling on real site
2. **Pin the icon**: Click puzzle piece in Chrome → pin Menu Monitor
3. **Check regularly**: Review "Recent Changes" in popup periodically
4. **Train staff**: Ensure team knows to watch for notifications
5. **Keep funded**: Monitor API credit balance monthly

## Next Steps

1. ✅ Test on all three test pages (GoDaddy, Wix, WordPress styles)
2. ✅ Enable on your real menu page
3. ✅ Make a small test edit to verify
4. ✅ Train your team on the notification system
5. ✅ Update your allergy site whenever notified!

## Support

- **Full docs**: See [README.md](README.md)
- **Testing guide**: See [TESTING.md](TESTING.md)
- **Installation help**: See [INSTALLATION.md](INSTALLATION.md)
- **Browser console**: Press F12 for debug info

---

## Visual Guide

### Installation Flow
```
Get API Key → Load Extension → Configure Settings → Test → Use!
   (3 min)      (2 min)          (1 min)        (2 min)  (ongoing)
```

### Daily Workflow
```
Edit Menu → Extension Detects → Notification Appears → Update Allergy Site
  (you)        (automatic)         (2-5 seconds)          (you click)
```

### What Extension Does
```
1. Watches your menu page 👀
2. Sends content to Claude AI 🤖
3. AI extracts menu items 🍽️
4. Compares to last scan 📊
5. Finds differences 🔍
6. Shows notification if changed 🔔
7. You update allergy info ✅
```

---

**Ready? Let's go!** 🚀

1. Get your API key from https://console.anthropic.com/
2. Load the extension in Chrome
3. Test on a test page
4. Enable on your real site
5. Edit your menu and watch the magic happen!

**Questions?** Check the full README.md or testing guide.

**Feedback?** Let us know what works and what doesn't!

---

*Built for restaurant managers who care about customer safety* ❤️
