# How to Check Perplexity API Logs

## ✅ Diagnostic Logging Deployed

I've added extensive logging to the function to help diagnose if Perplexity is actually being called.

## 📊 Log Indicators

Look for these emoji indicators in the logs:

| Emoji | Tag | Meaning |
|-------|-----|---------|
| 🎯 | [ROUTER] | Shows which provider (Perplexity/Claude) is being used |
| 🔍 | [PERPLEXITY] | Starting search for a specific retailer |
| 📡 | [PERPLEXITY] | Making actual API call to Perplexity |
| 📥 | [PERPLEXITY] | Received response from Perplexity API |
| ❌ | [PERPLEXITY] | Error occurred (with details) |
| ✅ | [ROUTER] | Confirmed which provider is being used |
| ⚠️ | [ROUTER] | Fallback to Claude (API key issue) |

## 🔍 How to View Logs

### Option 1: Supabase Dashboard (Easiest)

1. Go to: https://supabase.com/dashboard/project/fgoiyycctnwnghrvsilt/logs/edge-functions
2. Select `verify-brand-sources` function
3. Scan the product again
4. Refresh the logs page
5. Look for the emoji indicators above

### Option 2: Browser Console (Real-time)

1. Open browser DevTools (F12)
2. Go to Console tab
3. Scan the product
4. The frontend will show the response
5. Check Supabase dashboard for backend logs

### Option 3: Command Line (if you have access)

```bash
# This requires Supabase CLI access
# Note: May not work in all environments
supabase functions logs verify-brand-sources
```

## 🔎 What to Look For

### ✅ **If Perplexity IS being called:**

You should see:
```
🎯 [ROUTER] Provider requested: perplexity, PERPLEXITY_API_KEY exists: true
✅ [ROUTER] Using Perplexity for Amazon Walmart Target
🔍 [PERPLEXITY] Searching Amazon for Blue Diamond Bold Elote...
📡 [PERPLEXITY] Making API call to Perplexity for Amazon...
📥 [PERPLEXITY] Amazon API response status: 200
✓ Amazon: Found ingredients (XXX chars)
```

### ❌ **If Perplexity is NOT being called:**

You might see:
```
🎯 [ROUTER] Provider requested: perplexity, PERPLEXITY_API_KEY exists: false
⚠️ [ROUTER] Provider perplexity not available or API key missing. Falling back to Claude.
```

Or:
```
🎯 [ROUTER] Provider requested: claude, PERPLEXITY_API_KEY exists: true
✅ [ROUTER] Using Claude for Amazon Walmart Target
```

### ⚠️ **If API call fails:**

You might see:
```
📡 [PERPLEXITY] Making API call to Perplexity for Amazon...
📥 [PERPLEXITY] Amazon API response status: 401
❌ [PERPLEXITY] Amazon search failed: 401 {"error": "Invalid API key"}
```

## 🐛 Troubleshooting Based on Logs

### Scenario 1: "Provider requested: claude" instead of "perplexity"
**Problem:** Frontend is not sending `provider: 'perplexity'`  
**Solution:** Check restaurant.html - should default to 'perplexity'

### Scenario 2: "PERPLEXITY_API_KEY exists: false"
**Problem:** API key not set in Supabase  
**Solution:** 
```bash
supabase secrets set PERPLEXITY_API_KEY='your-key-here'
```

### Scenario 3: "API response status: 401" or "403"
**Problem:** Invalid or expired API key  
**Solution:** Get new key from https://www.perplexity.ai/settings/api

### Scenario 4: "API response status: 429"
**Problem:** Rate limit exceeded  
**Solution:** Wait or upgrade Perplexity plan

### Scenario 5: Perplexity called but returns 0 sources
**Problem:** Product not found or ingredient text too short  
**Look for:** 
```
✗ Amazon rejected: Unknown - ingredient text too short (5 chars)
```
**Solution:** Product might not be available on those retailers

## 📝 Next Steps After Checking Logs

1. **Scan the product** (Blue Diamond Almonds)
2. **Check the logs** using one of the methods above
3. **Share what you see** - Copy the relevant log lines
4. Based on the logs, we can:
   - Confirm Perplexity is being called
   - Identify API key issues
   - See if API is returning data
   - Debug why sources aren't being found

## 🎯 Expected Successful Log Flow

```
========================================
Multi-Source Verification Request
Product: Blue Diamond Bold Elote Mexican-Style Street Corn Flavored Almonds
Barcode: 041570147...
Search Provider: PERPLEXITY
========================================

🎯 [ROUTER] Provider requested: perplexity, PERPLEXITY_API_KEY exists: true, ANTHROPIC_API_KEY exists: true

PHASE 1: Launching parallel searches...

✅ [ROUTER] Using Perplexity for Amazon Walmart Target
Targeting retailers: Amazon, Walmart, Target

🔍 [PERPLEXITY] Searching Amazon for Blue Diamond Bold Elote...
📡 [PERPLEXITY] Making API call to Perplexity for Amazon...
📥 [PERPLEXITY] Amazon API response status: 200
✓ Amazon: Found ingredients (250 chars)

🔍 [PERPLEXITY] Searching Walmart for Blue Diamond Bold Elote...
📡 [PERPLEXITY] Making API call to Perplexity for Walmart...
📥 [PERPLEXITY] Walmart API response status: 200
✓ Walmart: Found ingredients (245 chars)

🔍 [PERPLEXITY] Searching Target for Blue Diamond Bold Elote...
📡 [PERPLEXITY] Making API call to Perplexity for Target...
📥 [PERPLEXITY] Target API response status: 200
✓ Target: Found ingredients (248 chars)

Amazon Walmart Target Perplexity search complete: 3 sources found

Phase 1 complete: 4 total sources (including Open Food Facts)
✓ Found 3 matching sources in Phase 1
✓ SUCCESS: Found sufficient matching sources
```

---

**Status:** Diagnostic logging deployed and ready  
**Next:** Scan product and check logs to see what's happening


