# Automated Menu Monitoring Setup Guide

This system automatically monitors restaurant websites for menu changes and sends you notifications.

## Why This Approach?

- **No browser extension needed** - Restaurants don't install anything
- **Works on any platform** - Wix, WordPress, Square, PDFs, custom sites
- **Proactive alerts** - You know about changes before customers ask
- **Centralized control** - Manage all monitoring from one place

## Architecture

```
Restaurant Website → Supabase Edge Function (every 6 hours)
                     ↓
                     Check for changes (content hash comparison)
                     ↓
                     If changed → Save snapshot + Send notification
```

## Setup Steps

### 1. Run the Database Migration

```bash
# Apply the migration to create menu_snapshots table
npx supabase db push
```

Or run the SQL manually in Supabase Dashboard → SQL Editor:
- Copy contents of `supabase/migrations/20251020_menu_monitoring.sql`
- Execute

### 2. Deploy the Edge Function

```bash
# Deploy the monitor function
npx supabase functions deploy monitor-menus

# Set up environment variables (if using email notifications)
npx supabase secrets set RESEND_API_KEY=your_resend_api_key_here
```

### 3. Configure Restaurants for Monitoring

Add menu URLs to your restaurants in the database:

```sql
-- Example: Add menu URLs for participating restaurants
UPDATE restaurants
SET
  menu_url = 'https://restaurant-website.com/menu',
  monitor_enabled = true
WHERE name = 'Sample Restaurant';
```

Or use the Supabase Dashboard UI:
1. Go to Table Editor → `restaurants`
2. For each restaurant, add their menu URL
3. Set `monitor_enabled` to `true`

### 4. Set Up Automated Scheduling

#### Option A: Supabase pg_cron (Recommended - Free)

Run this in Supabase SQL Editor:

```sql
SELECT cron.schedule(
  'monitor-restaurant-menus',
  '0 */6 * * *',  -- Every 6 hours
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/monitor-menus',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer YOUR_ANON_KEY'
    )
  );
  $$
);
```

Replace:
- `YOUR_PROJECT_REF` - Find in Supabase Dashboard → Settings → API
- `YOUR_ANON_KEY` - Find in Supabase Dashboard → Settings → API

#### Option B: Vercel Cron Jobs

Create `vercel.json`:

```json
{
  "crons": [{
    "path": "/api/cron/check-menus",
    "schedule": "0 */6 * * *"
  }]
}
```

Create `api/cron/check-menus.js`:

```javascript
export default async function handler(req, res) {
  const response = await fetch(
    'https://YOUR_PROJECT_REF.supabase.co/functions/v1/monitor-menus',
    {
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
      }
    }
  );

  const data = await response.json();
  res.json(data);
}
```

#### Option C: GitHub Actions (Completely Free)

Create `.github/workflows/monitor-menus.yml`:

```yaml
name: Monitor Restaurant Menus
on:
  schedule:
    - cron: '0 */6 * * *'  # Every 6 hours
  workflow_dispatch:  # Allow manual trigger

jobs:
  monitor:
    runs-on: ubuntu-latest
    steps:
      - name: Call Supabase Function
        run: |
          curl -X POST \
            'https://YOUR_PROJECT_REF.supabase.co/functions/v1/monitor-menus' \
            -H 'Authorization: Bearer ${{ secrets.SUPABASE_ANON_KEY }}'
```

### 5. Configure Email Notifications

#### Using Resend (Recommended - 3000 free emails/month)

1. Sign up at [resend.com](https://resend.com)
2. Verify your domain (or use their test domain)
3. Get your API key
4. Set it in Supabase:

```bash
npx supabase secrets set RESEND_API_KEY=re_your_key_here
```

5. Update the email address in `supabase/functions/monitor-menus/index.ts`:

```typescript
to: 'your-email@example.com',  // Change this to your email
```

#### Using SendGrid

Similar setup - just modify the `sendNotification` function to use SendGrid API.

### 6. Test It

Manual test:

```bash
# Trigger the function manually
curl -X POST \
  'https://YOUR_PROJECT_REF.supabase.co/functions/v1/monitor-menus' \
  -H 'Authorization: Bearer YOUR_ANON_KEY'
```

Or test in Supabase Dashboard:
1. Edge Functions → `monitor-menus` → Invoke

## How It Works

1. **Every 6 hours**, the edge function runs automatically
2. For each restaurant with `monitor_enabled = true`:
   - Fetches the menu URL
   - Extracts text content from HTML
   - Calculates SHA-256 hash
   - Compares to previous snapshot
3. **If changed**:
   - Saves new snapshot to `menu_snapshots` table
   - Detects what changed (added/removed words)
   - Sends email notification with details
4. **If unchanged**: Just updates `last_checked` timestamp

## Viewing Changes

Query recent changes:

```sql
-- See all recent menu changes
SELECT
  restaurant_name,
  last_change,
  has_changed
FROM menu_changes
WHERE has_changed = true
ORDER BY last_change DESC;

-- Get full history for a specific restaurant
SELECT
  detected_at,
  LEFT(menu_text, 200) as preview
FROM menu_snapshots
WHERE restaurant_id = 'restaurant-uuid-here'
ORDER BY detected_at DESC;
```

## Customization

### Change Monitoring Frequency

Edit the cron schedule:
- `0 */6 * * *` - Every 6 hours
- `0 */12 * * *` - Every 12 hours (twice daily)
- `0 8 * * *` - Daily at 8 AM
- `0 8,20 * * *` - Twice daily at 8 AM and 8 PM

### Add SMS Notifications

Install Twilio and modify `sendNotification()`:

```typescript
await fetch('https://api.twilio.com/2010-04-01/Accounts/YOUR_ACCOUNT_SID/Messages.json', {
  method: 'POST',
  headers: {
    'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`,
    'Content-Type': 'application/x-www-form-urlencoded'
  },
  body: new URLSearchParams({
    To: '+1234567890',
    From: '+1234567890',
    Body: `Menu changed at ${params.restaurantName}: ${params.changes.join(', ')}`
  })
});
```

### Add Slack Notifications

```typescript
await fetch('YOUR_SLACK_WEBHOOK_URL', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    text: `🚨 Menu Change: ${params.restaurantName}`,
    blocks: [{
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${params.restaurantName}* menu has changed:\n${params.changes.join('\n')}`
      }
    }, {
      type: 'actions',
      elements: [{
        type: 'button',
        text: { type: 'plain_text', text: 'View Menu' },
        url: params.restaurantUrl
      }]
    }]
  })
});
```

## Troubleshooting

### Function not running automatically
- Check pg_cron is enabled: `SELECT * FROM cron.job;`
- Check logs: Supabase Dashboard → Edge Functions → Logs

### Not detecting changes
- Menu might be loaded via JavaScript (see "Advanced: Puppeteer" below)
- Check the `menu_text` in snapshots table to see what's being captured

### Too many false positives
- Adjust the `extractMenuText()` function to be more selective
- Filter out date/time stamps that change daily

## Advanced: Detecting JavaScript-Rendered Menus

Some restaurants (like Wix) load menus via JavaScript. For these, you need a headless browser:

```typescript
// Use Puppeteer or Playwright in a separate Deno Deploy function
import puppeteer from 'https://deno.land/x/puppeteer@16.2.0/mod.ts';

const browser = await puppeteer.launch();
const page = await browser.newPage();
await page.goto(menuUrl, { waitUntil: 'networkidle0' });
const menuText = await page.evaluate(() => document.body.innerText);
await browser.close();
```

This requires Deno Deploy paid tier or a separate service.

## Cost Estimate

- **Supabase Free Tier**: Unlimited edge function calls, 500MB database
- **Resend Free Tier**: 3,000 emails/month
- **GitHub Actions**: 2,000 minutes/month free

**Total: $0/month** for small-scale monitoring (<20 restaurants)

## Next Steps

1. Run the migration
2. Deploy the edge function
3. Add menu URLs to 2-3 restaurants as a test
4. Set up cron schedule
5. Wait 6 hours or trigger manually
6. Check your email for notifications!
