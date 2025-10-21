#!/bin/bash

# Test script for menu monitoring system
# Usage: ./scripts/test-menu-monitor.sh

set -e

echo "🧪 Testing Menu Monitoring System"
echo "=================================="
echo ""

# Check if function is deployed
echo "1️⃣ Checking if monitor-menus function is deployed..."
if npx supabase functions list 2>/dev/null | grep -q "monitor-menus"; then
  echo "   ✅ Function is deployed"
else
  echo "   ❌ Function not found. Run: npx supabase functions deploy monitor-menus"
  exit 1
fi

# Get Supabase URL and key
echo ""
echo "2️⃣ Getting Supabase credentials..."
SUPABASE_URL="https://fgoiyycctnwnghrvsilt.supabase.co"
echo "   Supabase URL: $SUPABASE_URL"
echo "   ⚠️  You'll need to set SUPABASE_ANON_KEY manually"

# Prompt for anon key if not set
if [ -z "$SUPABASE_ANON_KEY" ]; then
  echo ""
  echo "   To test, you need your Supabase anon key."
  echo "   Get it from: Supabase Dashboard → Settings → API"
  echo ""
  read -p "   Enter your SUPABASE_ANON_KEY (or press Enter to skip test): " SUPABASE_ANON_KEY
fi

if [ -z "$SUPABASE_ANON_KEY" ]; then
  echo "   ⏭️  Skipping API test"
else
  echo ""
  echo "3️⃣ Testing function by calling it..."

  RESPONSE=$(curl -s -X POST \
    "${SUPABASE_URL}/functions/v1/monitor-menus" \
    -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
    -H "Content-Type: application/json")

  echo "   Response:"
  echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"

  if echo "$RESPONSE" | grep -q "checked"; then
    echo ""
    echo "   ✅ Function executed successfully!"
  else
    echo ""
    echo "   ⚠️  Unexpected response. Check the output above."
  fi
fi

echo ""
echo "=================================="
echo "✨ Next Steps:"
echo ""
echo "1. Run the database migration in Supabase Dashboard → SQL Editor"
echo "   (Copy from: supabase/migrations/20251020_menu_monitoring.sql)"
echo ""
echo "2. Add menu URLs to restaurants in your database"
echo ""
echo "3. Set up pg_cron scheduling (see scripts/setup-menu-monitoring.md)"
echo ""
echo "4. (Optional) Configure email notifications with Resend"
echo ""
echo "📖 Full setup guide: scripts/setup-menu-monitoring.md"
echo ""
