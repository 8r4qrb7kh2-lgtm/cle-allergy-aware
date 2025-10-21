# Menu Monitoring Setup - Final Steps

The automated menu monitoring system is almost ready! Here's what's been done and what you need to do:

## ✅ Completed

1. ✅ Created database migration (`supabase/migrations/20251020_menu_monitoring.sql`)
2. ✅ Created edge function (`supabase/functions/monitor-menus/index.ts`)
3. ✅ Deployed edge function to Supabase

## 🔧 Next Steps (Do These Now)

### Step 1: Run the Database Migration

Go to **Supabase Dashboard → SQL Editor** and run this:

```sql
-- Add menu monitoring fields to restaurants table
ALTER TABLE restaurants
ADD COLUMN IF NOT EXISTS menu_url TEXT,
ADD COLUMN IF NOT EXISTS last_checked TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS monitor_enabled BOOLEAN DEFAULT false;

-- Create menu_snapshots table to store historical menu content
CREATE TABLE IF NOT EXISTS menu_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  content_hash TEXT NOT NULL,
  menu_text TEXT NOT NULL,
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_menu_snapshots_restaurant_id
  ON menu_snapshots(restaurant_id);

CREATE INDEX IF NOT EXISTS idx_menu_snapshots_detected_at
  ON menu_snapshots(detected_at DESC);

-- Create a view for latest menu changes
CREATE OR REPLACE VIEW menu_changes AS
SELECT
  r.id as restaurant_id,
  r.name as restaurant_name,
  r.menu_url,
  current_snapshot.detected_at as last_change,
  previous_snapshot.detected_at as previous_change,
  current_snapshot.content_hash as current_hash,
  previous_snapshot.content_hash as previous_hash,
  CASE
    WHEN current_snapshot.content_hash != previous_snapshot.content_hash
    THEN true
    ELSE false
  END as has_changed
FROM restaurants r
LEFT JOIN LATERAL (
  SELECT * FROM menu_snapshots
  WHERE restaurant_id = r.id
  ORDER BY detected_at DESC
  LIMIT 1
) current_snapshot ON true
LEFT JOIN LATERAL (
  SELECT * FROM menu_snapshots
  WHERE restaurant_id = r.id
  ORDER BY detected_at DESC
  LIMIT 1 OFFSET 1
) previous_snapshot ON true
WHERE r.monitor_enabled = true;

-- Enable RLS
ALTER TABLE menu_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Menu snapshots are viewable by authenticated users"
  ON menu_snapshots FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Menu snapshots are insertable by service role"
  ON menu_snapshots FOR INSERT
  TO service_role
  WITH CHECK (true);

COMMENT ON TABLE menu_snapshots IS 'Stores historical snapshots of restaurant menus for change detection';
COMMENT ON COLUMN restaurants.menu_url IS 'URL of the restaurant menu page to monitor';
COMMENT ON COLUMN restaurants.monitor_enabled IS 'Whether to include this restaurant in automated monitoring';
```

### Step 2: Add a Test Restaurant Menu URL

In **Supabase Dashboard → Table Editor → restaurants**, add a menu URL to one restaurant:

1. Find a restaurant row
2. Add a `menu_url` (e.g., `https://restaurant-website.com/menu`)
3. Set `monitor_enabled` to `true`

Or run this SQL (replace with your actual restaurant):

```sql
-- Example: Update a restaurant with their menu URL
UPDATE restaurants
SET
  menu_url = 'https://example-restaurant.com/menu',
  monitor_enabled = true
WHERE name LIKE '%Restaurant Name%'
LIMIT 1;
```

### Step 3: Test the Function Manually

Go to **Supabase Dashboard → Edge Functions → monitor-menus → Invoke**

Or use curl:

```bash
curl -X POST \
  'https://fgoiyycctnwnghrvsilt.supabase.co/functions/v1/monitor-menus' \
  -H 'Authorization: Bearer YOUR_ANON_KEY'
```

You should get a response like:

```json
{
  "checked": 1,
  "results": [
    {
      "restaurant": "Restaurant Name",
      "status": "baseline_created"
    }
  ]
}
```

### Step 4: (Optional) Set Up Email Notifications

If you want email alerts when menus change:

1. Sign up at [resend.com](https://resend.com) (free tier: 3000 emails/month)
2. Get your API key
3. Set it in Supabase:

```bash
npx supabase secrets set RESEND_API_KEY=re_your_key_here
```

4. Update the email in `supabase/functions/monitor-menus/index.ts` line 257:

```typescript
to: 'your-email@example.com',  // Change to your email
```

5. Redeploy:

```bash
npx supabase functions deploy monitor-menus
```

### Step 5: Schedule Automatic Monitoring

Go to **Supabase Dashboard → SQL Editor** and run:

```sql
SELECT cron.schedule(
  'monitor-restaurant-menus',
  '0 */6 * * *',  -- Every 6 hours
  $$
  SELECT net.http_post(
    url := 'https://fgoiyycctnwnghrvsilt.supabase.co/functions/v1/monitor-menus',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer YOUR_ANON_KEY'
    )
  );
  $$
);
```

**Replace `YOUR_ANON_KEY`** with your actual anon key from:
**Supabase Dashboard → Settings → API → Project API keys → anon/public**

### Step 6: Verify It's Scheduled

Run this to see all cron jobs:

```sql
SELECT * FROM cron.job;
```

You should see `monitor-restaurant-menus` listed.

## 🧪 Testing the Full Flow

1. Add a menu URL to a test restaurant
2. Manually invoke the function (Step 3)
3. Check that a snapshot was created:

```sql
SELECT * FROM menu_snapshots ORDER BY created_at DESC LIMIT 5;
```

4. Manually edit the restaurant's menu (change some text on their website)
5. Wait 6 hours OR manually invoke the function again
6. You should see a new snapshot and get an email notification!

## 📊 Monitoring Dashboard Queries

See what's being monitored:

```sql
-- All restaurants with monitoring enabled
SELECT id, name, menu_url, monitor_enabled, last_checked
FROM restaurants
WHERE monitor_enabled = true;
```

See recent changes:

```sql
-- Recent menu changes
SELECT * FROM menu_changes
WHERE has_changed = true
ORDER BY last_change DESC;
```

See full history for a restaurant:

```sql
-- History for specific restaurant
SELECT
  detected_at,
  LEFT(menu_text, 100) as preview,
  content_hash
FROM menu_snapshots
WHERE restaurant_id = 'YOUR_RESTAURANT_UUID'
ORDER BY detected_at DESC;
```

## 🚨 Troubleshooting

### Function not finding restaurants
- Check `monitor_enabled = true` on at least one restaurant
- Check `menu_url` is not null

### Not detecting changes
- Check the `menu_text` column in snapshots - is it capturing the actual menu?
- Some sites load menus via JavaScript - see docs for Puppeteer solution

### Email not sending
- Check Resend API key is set: `npx supabase secrets list`
- Check function logs: **Supabase Dashboard → Edge Functions → Logs**

## 🎉 You're Done!

Once scheduled, the system will:
- Check all enabled restaurants every 6 hours
- Compare their menu to the last snapshot
- Send you an email if anything changed
- Keep a full history of all changes

No browser extension needed!
