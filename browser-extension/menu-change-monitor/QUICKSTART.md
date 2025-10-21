# 🚀 Quick Start Guide - AI Menu Monitor

Get up and running in 5 minutes!

## ⏱️ 5-Minute Setup

### Step 1: Install Extension (2 minutes)

1. Open Chrome and go to `chrome://extensions/`
2. Toggle **Developer mode** ON (top right)
3. Click **Load unpacked**
4. Navigate to and select: `browser-extension/menu-change-monitor`
5. You'll see the extension icon appear in your toolbar 🎉

### Step 2: Get API Key (1 minute)

1. Go to [console.anthropic.com](https://console.anthropic.com/)
2. Sign in or create account
3. Navigate to **API Keys**
4. Click **Create Key**
5. Copy your key (starts with `sk-ant-`)

### Step 3: Configure Extension (1 minute)

1. Click the extension icon in Chrome toolbar
2. Click **Settings** button
3. Paste your API key in the **Claude API Key** field
4. Click **Save Settings**
5. That's it! You're ready to go ✅

### Step 4: Test It Out (1 minute)

1. Visit any restaurant menu page (e.g., a local restaurant)
2. Click the extension icon
3. Click **Analyze This Page**
4. See AI-detected menu items and allergens!
5. Click **Start Monitoring** to track this site

## 🎯 First Use Walkthrough

### Example: Monitor Your Favorite Restaurant

Let's say you want to monitor "Joe's Italian Bistro":

1. **Navigate to their menu page**
   ```
   https://joesbistro.com/menu
   ```

2. **Open extension** (click icon in toolbar)

3. **Click "Analyze This Page"**
   - Wait 5-10 seconds for AI analysis
   - See detected menu items with allergens

4. **Click "Start Monitoring"**
   - Enter name: "Joe's Italian Bistro"
   - Extension will check daily for changes

5. **Done!** You'll get notifications when menu changes occur

## 📱 Real-World Example

### Scenario: Allergen Change Detection

**Day 1:** You monitor a restaurant's gluten-free pasta dish:
```
Gluten-Free Penne Arrabiata
Fresh penne pasta with spicy tomato sauce (Gluten-free, Vegan)
```

**Day 7:** The restaurant updates their recipe:
```
Gluten-Free Penne Arrabiata
Fresh penne pasta with creamy vodka sauce (Gluten-free)
```

**What happens:**
- ✅ Extension detects the change
- ✅ AI identifies "creamy" sauce likely contains dairy
- ✅ Marks as **CRITICAL** (removed "Vegan" label, added dairy)
- ✅ Sends you a notification
- ✅ Displays change summary in popup

## ⚙️ Recommended Settings

For most users, use these settings:

| Setting | Value | Why? |
|---------|-------|------|
| **Model** | Claude 3.5 Sonnet | Best cost/accuracy balance |
| **Frequency** | Daily | Catches changes without excessive cost |
| **Sensitivity** | Medium | Important changes only |
| **Visual Analysis** | ✓ ON | Works with image menus |
| **HTML Analysis** | ✓ ON | Fastest for text menus |
| **Cache** | ✓ ON | Saves money |
| **Notifications** | ✓ ON | Get alerted to changes |

**Expected cost:** ~$3-5/month for 3 monitored sites

## 💡 Pro Tips

### Tip 1: Monitor Menu Pages Only
❌ Don't monitor: Homepage, About Us, Contact
✅ Do monitor: Menu page, Specials page

### Tip 2: Use Meaningful Names
❌ Bad: "Restaurant 1"
✅ Good: "Joe's Bistro - Downtown Location"

### Tip 3: Check Analysis Before Monitoring
Always click "Analyze This Page" first to verify the extension can detect menu items before starting monitoring.

### Tip 4: Adjust Frequency Based on Restaurant
- **New/experimental restaurants**: Daily checks
- **Established restaurants**: Weekly checks
- **Chain restaurants**: Manual checks only

### Tip 5: Use HTML-Only for Cost Savings
If the menu is plain text (not images), disable "Visual Analysis" in settings to cut costs in half.

## 🔧 Common Tasks

### Add a Second Restaurant

1. Visit the restaurant's menu page
2. Click extension icon
3. Click "Start Monitoring"
4. Enter restaurant name
5. Done!

### Check for Changes Manually

1. Click extension icon
2. Find restaurant in "Monitored Sites"
3. Click **Check** button
4. Wait for analysis
5. See results in "Recent Changes"

### Stop Monitoring a Site

1. Click extension icon
2. Find restaurant in "Monitored Sites"
3. Click **Remove** button
4. Confirm deletion

### View Change History

1. Click extension icon
2. Scroll to "Recent Changes" section
3. See all detected changes with timestamps

### Update Settings

1. Click extension icon
2. Click **Settings** (⚙️) at bottom
3. Make changes
4. Click **Save Settings**

## 🆘 Quick Troubleshooting

### Extension icon not showing?
- Refresh Chrome
- Check `chrome://extensions/` to ensure it's enabled

### "API key not configured" error?
- Open Settings
- Verify you pasted the full key starting with `sk-ant-`
- Click Save

### "No menu items detected"?
- Ensure you're on the actual menu page
- Try enabling both HTML + Visual analysis
- Some sites may have unconventional layouts

### Analysis taking too long?
- Wait up to 30 seconds for first analysis
- Subsequent checks are cached (faster)
- Check your internet connection

### High costs?
- Reduce check frequency to weekly
- Disable visual analysis if not needed
- Monitor fewer sites
- Switch to Claude Haiku model

## 📊 Understanding Costs

### Real Cost Examples

**Light User** (1 site, weekly, HTML only)
- Checks per month: ~4
- Cost: **~$0.30/month**

**Typical User** (3 sites, daily, HTML+Visual)
- Checks per month: ~90
- Cost: **~$4/month**

**Power User** (10 sites, daily, HTML+Visual)
- Checks per month: ~300
- Cost: **~$12/month**

*All estimates assume medium-sized menus with ~20 items*

## 🎓 Next Steps

Now that you're set up:

1. ✅ **Read the full [AI_README.md](AI_README.md)** for advanced features
2. ✅ **Test different restaurant types** (Wix, WordPress, custom sites)
3. ✅ **Optimize your settings** based on your needs
4. ✅ **Share feedback** if you find issues

## 🙋 Need Help?

- **Full documentation**: See [AI_README.md](AI_README.md)
- **Issues**: [GitHub Issues](https://github.com/your-repo/issues)
- **Questions**: [GitHub Discussions](https://github.com/your-repo/discussions)

---

**Happy monitoring! 🎉**

*Remember: This extension helps you stay informed about menu changes, but always verify allergen information directly with the restaurant before consuming.*
