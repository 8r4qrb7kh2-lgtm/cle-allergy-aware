# Deployment Instructions - Perplexity Multi-Source Fix

## ✅ Changes Committed and Pushed

The Perplexity multi-source fix has been:
- ✅ Committed to git (commit: 685e74f)
- ✅ Pushed to branch: `2025-10-30-w6wp-2Ypwu`
- ✅ Available at: https://github.com/8r4qrb7kh2-lgtm/cle-allergy-aware/tree/2025-10-30-w6wp-2Ypwu

## 🚀 Deploy to Supabase

### Option 1: Using the Deployment Script (Recommended)

```bash
cd /Users/mattdavis/.cursor/worktrees/clarivore-main/2Ypwu
./deploy-perplexity-fix.sh
```

The script will:
1. Verify you're in the correct directory
2. Check if Supabase CLI is installed
3. Verify authentication
4. Deploy the function
5. Provide testing instructions

### Option 2: Manual Deployment

#### Step 1: Login to Supabase (if not already logged in)

```bash
# Option A: Interactive login
supabase login

# Option B: Using access token
export SUPABASE_ACCESS_TOKEN='your-token-here'
# Get token from: https://app.supabase.com/account/tokens
```

#### Step 2: Link Project (if not already linked)

```bash
cd /Users/mattdavis/.cursor/worktrees/clarivore-main/2Ypwu
supabase link --project-ref fgoiyycctnwnghrvsilt
```

#### Step 3: Deploy Function

```bash
supabase functions deploy verify-brand-sources
```

### Option 3: Deploy via Supabase Dashboard

1. Go to https://app.supabase.com/project/fgoiyycctnwnghrvsilt/functions
2. Click on "Deploy a new function" or edit existing `verify-brand-sources`
3. Copy the contents of `supabase/functions/verify-brand-sources/index.ts`
4. Paste and deploy

## 🧪 Test the Deployment

### Test 1: Quick API Test

```bash
curl -X POST 'https://fgoiyycctnwnghrvsilt.supabase.co/functions/v1/verify-brand-sources' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnb2l5eWNjdG53bmdocnZzaWx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0MzY1MjYsImV4cCI6MjA3NjAxMjUyNn0.xlSSXr0Gl7j-vsckrj-2anpPmp4BG2SUIdN-_dquSA8' \
  -H 'Content-Type: application/json' \
  -d '{
    "productName": "Pita Chips",
    "brand": "Stacys",
    "barcode": "028400064316",
    "provider": "perplexity",
    "openFoodFactsData": null
  }'
```

### Test 2: Check Logs

```bash
supabase functions logs verify-brand-sources --follow
```

Look for:
- ✅ "Starting [sourceType] search with Perplexity..."
- ✅ "=== Perplexity Citations ===" (showing multiple websites)
- ✅ "Sources in JSON: 2" (or more)
- ✅ "✓ [sourceType] found: Amazon"
- ✅ "✓ [sourceType] found: Walmart"

### Test 3: Verify Response

The response should contain:
```json
{
  "sourcesFound": 3,
  "minimumSourcesRequired": 3,
  "sources": [
    {
      "name": "Amazon",
      "url": "https://...",
      "ingredientsText": "...",
      "allergens": [...],
      "diets": [...],
      "confidence": 95
    },
    {
      "name": "Walmart",
      "url": "https://...",
      "ingredientsText": "...",
      "allergens": [...],
      "diets": [...],
      "confidence": 90
    },
    // ... more sources
  ]
}
```

## 📋 Environment Variables

Ensure these are set in Supabase:

1. **PERPLEXITY_API_KEY** - Required for Perplexity provider
2. **ANTHROPIC_API_KEY** - Required for Claude provider (fallback)

To check/set:
```bash
supabase secrets list
supabase secrets set PERPLEXITY_API_KEY='your-key-here'
```

Or via dashboard:
- Go to https://app.supabase.com/project/fgoiyycctnwnghrvsilt/settings/functions
- Add/update environment variables

## 🔍 Troubleshooting

### Issue: "Access token not provided"
**Solution:** Login first with `supabase login` or set `SUPABASE_ACCESS_TOKEN`

### Issue: "Project not linked"
**Solution:** Run `supabase link --project-ref fgoiyycctnwnghrvsilt`

### Issue: Still getting only 1 source
**Solution:** 
1. Check logs to see if Perplexity is returning multiple sources
2. Verify PERPLEXITY_API_KEY is set correctly
3. Check if sources are being filtered out (look for "ingredient text too short" messages)

### Issue: Function not found
**Solution:** Make sure you're deploying to the correct project

## 📚 Documentation

- **PERPLEXITY_MULTI_SOURCE_FIX.md** - Technical details of the fix
- **PERPLEXITY_FIX_SUMMARY.md** - Summary and testing guide
- **DEPLOY_PERPLEXITY_FIX.md** - Original deployment guide

## 🎯 What Was Fixed

1. **Removed stub** - `searchSourceTypePerplexity()` was returning empty array
2. **Implemented full API call** - Proper Perplexity API integration
3. **Enhanced prompt** - Explicitly requests 2-3+ sources
4. **Added system message** - Guides AI behavior
5. **Added API parameters** - Domain filter, citations, recency filter
6. **Enhanced logging** - Better debugging capabilities

## ✨ Expected Results

**Before Fix:**
- ❌ Perplexity returned 0 sources
- ❌ Function failed with "Insufficient sources"

**After Fix:**
- ✅ Perplexity returns 2-3+ sources
- ✅ Function succeeds with multiple verified sources
- ✅ Each source includes complete ingredient data

## 🔄 Merge to Main

After testing, merge the branch:

```bash
# Create a pull request
# Visit: https://github.com/8r4qrb7kh2-lgtm/cle-allergy-aware/pull/new/2025-10-30-w6wp-2Ypwu

# Or merge directly (if you have permissions)
git checkout main
git merge 2025-10-30-w6wp-2Ypwu
git push origin main
```

## 📞 Support

If you encounter issues:
1. Check function logs: `supabase functions logs verify-brand-sources`
2. Verify environment variables are set
3. Test with Claude provider as fallback
4. Review the detailed documentation files

