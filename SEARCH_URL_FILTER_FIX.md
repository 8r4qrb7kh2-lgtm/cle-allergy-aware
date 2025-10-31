# Search URL Filter Fix

## Problem
The Target link was showing as "Data Available" but the URL was a search results page (`https://www.target.com/s?searchTerm=041570147078`) instead of a specific product page. This happens when the AI can't find the actual product on a retailer's website, so it returns a search URL instead.

## Solution
Added URL validation to reject search URLs and only accept actual product pages.

### Changes Made

#### 1. URL Validation Logic
Added validation in all three search functions:
- `searchSingleRetailerPerplexity()` (Perplexity individual retailer search)
- `searchSourceTypePerplexityBulk()` (Perplexity bulk search - backup method)
- `searchSourceTypeClaude()` (Claude search)

```typescript
// Reject search URLs - we only want actual product pages
const url = source.url || '';
const isSearchUrl = url.includes('/s?') || url.includes('/search?') || url.includes('searchTerm=') || url.includes('/search/');
if (isSearchUrl) {
  console.log(`✗ ${sourceType} rejected: ${source.name || 'Unknown'} - URL is a search page, not a product page: ${url}`);
  continue; // Skip this source
}
```

#### 2. URL Patterns Detected
The filter catches common search URL patterns:
- `/s?` - Target, Amazon style search
- `/search?` - Generic search pages
- `searchTerm=` - Query parameter style
- `/search/` - Path-based search

### Expected Behavior

**Before Fix:**
- Target source would show with URL: `https://www.target.com/s?searchTerm=041570147078`
- User clicks link → sees search results page (no product found)

**After Fix:**
- Target source is rejected during processing
- Only sources with actual product pages are shown
- User only sees valid, clickable product links

### Deployment

✅ **Supabase Function:** Deployed to production
```bash
npx supabase functions deploy verify-brand-sources
```

✅ **Vercel Frontend:** Deployed to production
```bash
vercel --prod --yes
```

### Testing

Visit: **https://clarivore.org/restaurant.html**

Scan a product and verify:
1. ✅ All source URLs are specific product pages (not search pages)
2. ✅ Clicking any source link takes you to the actual product
3. ✅ Sources without valid product pages are automatically filtered out
4. ✅ Logs show rejection messages for search URLs

### Logs to Look For

In Supabase logs, you should see:
```
✗ Target rejected: Target - URL is a search page, not a product page: https://www.target.com/s?searchTerm=041570147078
✓ Amazon found: Amazon (95% confidence) [Allergens: tree nuts] [Diets: vegan, vegetarian, pescatarian]
✓ Official found: Blue Diamond Official Site (98% confidence) [Allergens: tree nuts] [Diets: vegan, vegetarian, pescatarian]
```

### Files Modified
- `/Users/mattdavis/.cursor/worktrees/clarivore-main/2Ypwu/supabase/functions/verify-brand-sources/index.ts`
  - Line 374-380: Added URL validation in `searchSingleRetailerPerplexity()`
  - Line 628-634: Added URL validation in `searchSourceTypePerplexityBulk()`
  - Line 801-807: Added URL validation in `searchSourceTypeClaude()`

---

**Status:** ✅ Deployed and Ready to Test
**Date:** October 31, 2025

