# 🔍 Automated Menu Monitoring System

Automatically detects when restaurant menus change and sends you notifications - no browser extension required!

## Overview

This system monitors restaurant websites every 6 hours, detects menu changes, and alerts you via email. It works on **any platform** (Wix, WordPress, Square, PDFs, custom sites) without requiring restaurants to install anything.

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                    Restaurant Website                           │
│              (Wix, WordPress, Custom, etc.)                     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│          Supabase Edge Function (runs every 6 hours)            │
│  1. Fetches menu page HTML                                      │
│  2. Extracts text content                                       │
│  3. Calculates SHA-256 hash                                     │
│  4. Compares to previous snapshot                               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                   Supabase Database                             │
│  • menu_snapshots table (historical data)                       │
│  • Stores: content_hash, menu_text, timestamp                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                    ┌─────────────────┐
                    │  Menu Changed?  │
                    └─────────────────┘
                              ↓
                            Yes
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Email Notification                            │
│  Subject: 🚨 Menu Change: [Restaurant Name]                     │
│  Body: Lists added/removed items                                │
│  Action: Update allergen info in Clarivore                      │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Run Database Migration

Go to **[Supabase Dashboard → SQL Editor](https://supabase.com/dashboard/project/fgoiyycctnwnghrvsilt/sql)** and run:

```sql
-- Copy and paste from: supabase/migrations/20251020_menu_monitoring.sql
```

This creates:
- `menu_snapshots` table
- New columns on `restaurants` table (`menu_url`, `monitor_enabled`, `last_checked`)
- `menu_changes` view for easy querying

### 2. Add Restaurant Menu URLs

In **Table Editor → restaurants**, add menu URLs:

```sql
UPDATE restaurants
SET
  menu_url = 'https://restaurant-website.com/menu',
  monitor_enabled = true
WHERE name = 'Your Restaurant Name';
```

### 3. Test the Monitor

```bash
# Run the test script
./scripts/test-menu-monitor.sh
```

Or manually invoke:

```bash
curl -X POST \
  'https://fgoiyycctnwnghrvsilt.supabase.co/functions/v1/monitor-menus' \
  -H 'Authorization: Bearer YOUR_ANON_KEY'
```

### 4. Schedule Automatic Checks

In **SQL Editor**, run:

```sql
SELECT cron.schedule(
  'monitor-restaurant-menus',
  '0 */6 * * *',  -- Every 6 hours
  $$
  SELECT net.http_post(
    url := 'https://fgoiyycctnwnghrvsilt.supabase.co/functions/v1/monitor-menus',
    headers := jsonb_build_object('Authorization', 'Bearer YOUR_ANON_KEY')
  );
  $$
);
```

### 5. (Optional) Enable Email Notifications

```bash
# Sign up at resend.com (free: 3000 emails/month)
# Get API key, then:
npx supabase secrets set RESEND_API_KEY=re_your_key_here

# Update email in supabase/functions/monitor-menus/index.ts line 257
# Redeploy:
npx supabase functions deploy monitor-menus
```

## Features

### ✅ What It Monitors

- Text content changes (dish names, descriptions)
- Added menu items
- Removed menu items
- Ingredient changes
- Works on static HTML and most JavaScript-rendered content

### ✅ What You Get

- **Email notifications** when changes detected
- **Full change history** stored in database
- **Diff view** showing what was added/removed
- **Configurable schedule** (default: every 6 hours)

### ✅ Cost

**$0/month** on free tiers:
- Supabase Free: Unlimited edge function invocations
- Resend Free: 3,000 emails/month
- GitHub Actions: 2,000 free minutes/month (if using as alternative scheduler)

## Usage

### View Monitored Restaurants

```sql
SELECT
  name,
  menu_url,
  monitor_enabled,
  last_checked
FROM restaurants
WHERE monitor_enabled = true;
```

### View Recent Changes

```sql
SELECT * FROM menu_changes
WHERE has_changed = true
ORDER BY last_change DESC;
```

### View Full History

```sql
SELECT
  detected_at,
  LEFT(menu_text, 200) as preview,
  content_hash
FROM menu_snapshots
WHERE restaurant_id = 'restaurant-uuid'
ORDER BY detected_at DESC;
```

### Disable Monitoring for a Restaurant

```sql
UPDATE restaurants
SET monitor_enabled = false
WHERE id = 'restaurant-uuid';
```

## Configuration

### Change Monitoring Frequency

Edit the cron schedule:

```sql
-- Every 12 hours (twice daily)
'0 */12 * * *'

-- Daily at 8 AM
'0 8 * * *'

-- Twice daily at 8 AM and 8 PM
'0 8,20 * * *'
```

### Add Slack Notifications

Edit `supabase/functions/monitor-menus/index.ts`:

```typescript
await fetch('YOUR_SLACK_WEBHOOK_URL', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    text: `🚨 Menu Change: ${params.restaurantName}`,
    blocks: [...]
  })
});
```

### Add SMS Notifications (Twilio)

```typescript
await fetch('https://api.twilio.com/2010-04-01/Accounts/YOUR_SID/Messages.json', {
  method: 'POST',
  // ... see full example in docs/MENU_MONITORING_SETUP.md
});
```

## Troubleshooting

### Function Not Detecting Changes

**Problem:** Menu changed but no notification

**Solutions:**
- Check if `monitor_enabled = true` on the restaurant
- Verify `menu_url` is accessible (try opening in browser)
- Check Supabase logs: **Edge Functions → Logs**
- Look at captured `menu_text` in snapshots table - is it getting the right content?

### JavaScript-Rendered Menus Not Captured

**Problem:** Website loads menu via React/Vue/Angular

**Solution:** Use Puppeteer for headless browser rendering:

```typescript
import puppeteer from 'https://deno.land/x/puppeteer@16.2.0/mod.ts';

const browser = await puppeteer.launch();
const page = await browser.newPage();
await page.goto(menuUrl, { waitUntil: 'networkidle0' });
const menuText = await page.evaluate(() => document.body.innerText);
await browser.close();
```

*Note: Requires Deno Deploy paid tier*

### Too Many False Positives

**Problem:** Detecting changes when menu hasn't actually changed (dates, times, etc.)

**Solution:** Improve text extraction in `extractMenuText()` function:

```typescript
// Filter out dates, times, dynamic content
text = text.replace(/\d{1,2}\/\d{1,2}\/\d{4}/g, ''); // Remove dates
text = text.replace(/\d{1,2}:\d{2}\s*(AM|PM)/gi, ''); // Remove times
```

### Emails Not Sending

**Problem:** Changes detected but no email received

**Check:**
1. Resend API key is set: `npx supabase secrets list`
2. Email address updated in function code
3. Check Resend dashboard for delivery status
4. Check spam folder

## Architecture

### Files

- **`supabase/functions/monitor-menus/index.ts`** - Edge function that does the monitoring
- **`supabase/migrations/20251020_menu_monitoring.sql`** - Database schema
- **`scripts/setup-menu-monitoring.md`** - Detailed setup guide
- **`scripts/test-menu-monitor.sh`** - Test script

### Database Schema

**restaurants** (extended)
```sql
menu_url TEXT                      -- URL to monitor
monitor_enabled BOOLEAN            -- Enable/disable monitoring
last_checked TIMESTAMP             -- Last check time
```

**menu_snapshots** (new)
```sql
id UUID
restaurant_id UUID → restaurants
content_hash TEXT                  -- SHA-256 of menu content
menu_text TEXT                     -- Full extracted text
detected_at TIMESTAMP              -- When this version was found
```

**menu_changes** (view)
```sql
-- Aggregates current vs previous snapshots
-- Shows which restaurants have changed
```

## Examples

### Real-World Example

1. **Restaurant updates their menu** at 2:00 PM
2. **Monitor runs** at 2:00 PM (on schedule)
3. **Detects change:** "gluten-free" added to pasta dish
4. **Sends email:**

```
Subject: 🚨 Menu Change: Mario's Italian Bistro

Changes Detected:
• Added: gluten-free, penne, option
• Removed: (none)

Please review and update allergen information:
https://marios-italian.com/menu

View in Dashboard: [link]
```

5. **You review** the menu change
6. **Update allergen info** in Clarivore system
7. **Customers see** updated allergen info next time they visit

## Advanced: Puppeteer for JavaScript Sites

For sites like Wix that heavily use JavaScript, you need headless browser rendering. See [docs/MENU_MONITORING_SETUP.md](docs/MENU_MONITORING_SETUP.md) for Puppeteer integration guide.

## Support

- 📖 Full setup guide: [scripts/setup-menu-monitoring.md](scripts/setup-menu-monitoring.md)
- 🧪 Test your setup: `./scripts/test-menu-monitor.sh`
- 🐛 Issues: Check Supabase Edge Function logs
- 📧 Questions: [Open an issue](https://github.com/yourusername/cle-allergy-aware/issues)

## Comparison: Browser Extension vs Automated Monitoring

| Feature | Browser Extension | Automated Monitor |
|---------|------------------|-------------------|
| Installation | ❌ Restaurant must install | ✅ No installation |
| Platform Support | ❌ Doesn't work on Wix well | ✅ Works everywhere |
| Reliability | ❌ Depends on staff | ✅ Runs automatically |
| Proactive | ❌ After edit | ✅ You know first |
| Cost | Free | Free (on free tiers) |
| Maintenance | ❌ High | ✅ Low |

**Recommendation:** Use automated monitoring. It's more reliable and doesn't burden restaurant staff.
