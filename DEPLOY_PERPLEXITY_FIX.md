# Deploy Perplexity Multi-Source Fix

## Quick Deployment Guide

### 1. Deploy to Supabase

```bash
# Navigate to project root
cd /Users/mattdavis/.cursor/worktrees/clarivore-main/2Ypwu

# Deploy the updated function
supabase functions deploy verify-brand-sources

# Or deploy all functions
supabase functions deploy
```

### 2. Verify Environment Variables

Ensure the following environment variable is set in Supabase:

```bash
# Check if PERPLEXITY_API_KEY is set
supabase secrets list

# If not set, add it:
supabase secrets set PERPLEXITY_API_KEY=your_perplexity_api_key_here
```

### 3. Test the Deployment

#### Option A: Test via Frontend (restaurant.html)

1. Open `public/restaurant.html` in browser
2. Scan a product barcode
3. Check browser console for:
   - "Starting [sourceType] search with Perplexity..."
   - Multiple sources returned

#### Option B: Test via cURL

```bash
curl -X POST 'https://YOUR_PROJECT.supabase.co/functions/v1/verify-brand-sources' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "productName": "Pita Chips",
    "brand": "Stacys",
    "barcode": "028400064316",
    "provider": "perplexity",
    "openFoodFactsData": null
  }'
```

#### Option C: Test via JavaScript

```javascript
const response = await fetch('https://YOUR_PROJECT.supabase.co/functions/v1/verify-brand-sources', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_ANON_KEY',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    productName: 'Pita Chips',
    brand: "Stacy's",
    barcode: '028400064316',
    provider: 'perplexity',
    openFoodFactsData: null
  })
});

const result = await response.json();
console.log('Sources found:', result.sourcesFound);
console.log('Sources:', result.sources);
```

### 4. Monitor Logs

```bash
# Watch function logs in real-time
supabase functions logs verify-brand-sources --follow

# Look for:
# ✅ "Starting [sourceType] search with Perplexity..."
# ✅ "=== Perplexity Citations ===" with multiple URLs
# ✅ "Sources in JSON: 2" (or more)
# ✅ "✓ [sourceType] found: [source name]"
```

### 5. Verify Success

A successful deployment should show:

```
Sources found: 3 (or more)
Sources: [
  { name: "Amazon", url: "...", ingredientsText: "...", confidence: 95 },
  { name: "Walmart", url: "...", ingredientsText: "...", confidence: 90 },
  { name: "Target", url: "...", ingredientsText: "...", confidence: 85 }
]
```

## Rollback Plan (If Needed)

If the fix causes issues:

```bash
# Revert to previous version
git checkout HEAD~1 supabase/functions/verify-brand-sources/index.ts

# Redeploy
supabase functions deploy verify-brand-sources
```

## Common Issues

### Issue: "PERPLEXITY_API_KEY not configured"
**Solution:** Set the environment variable in Supabase secrets

### Issue: Still getting only 1 source
**Solution:** Check logs to see if Perplexity is returning multiple sources but they're being filtered out

### Issue: API timeout
**Solution:** Increase timeout in Supabase function settings or reduce max_tokens

### Issue: Rate limit errors
**Solution:** Check Perplexity API quota and upgrade plan if needed

## Files Changed

- ✅ `supabase/functions/verify-brand-sources/index.ts` - Main fix
- ✅ `PERPLEXITY_MULTI_SOURCE_FIX.md` - Technical documentation
- ✅ `PERPLEXITY_FIX_SUMMARY.md` - Summary and testing guide
- ✅ `DEPLOY_PERPLEXITY_FIX.md` - This deployment guide

## Checklist

- [ ] Code changes reviewed
- [ ] No linter errors
- [ ] Environment variables configured
- [ ] Function deployed to Supabase
- [ ] Tested with sample product
- [ ] Logs show multiple sources
- [ ] Frontend integration tested
- [ ] Documentation updated

## Support

If issues persist:
1. Check Supabase function logs
2. Verify Perplexity API key is valid
3. Test with Claude provider as fallback
4. Review console logs for detailed error messages


