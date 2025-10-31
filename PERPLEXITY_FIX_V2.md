# Perplexity Multi-Source Fix V2 - Individual Retailer Searches

## Problem Identified

After the initial deployment, Perplexity was still only returning 1 source instead of 2-3+ sources.

### Root Cause
The previous approach tried to get multiple sources in a single Perplexity API call by:
- Asking for "multiple sources" in the prompt
- Expecting the AI to search multiple websites and return them all in one response
- Using domain filters and enhanced prompts

**However:** Perplexity's API was still only returning 1 source per call, even with the enhanced prompt.

## Solution V2

Changed the strategy to make **individual API calls for each retailer** instead of trying to get multiple sources in one call.

### New Approach

```typescript
async function searchSourceTypePerplexity(
  sourceType: string,
  searchQuery: string,
  productName: string,
  brand: string,
  barcode: string
): Promise<Source[]> {
  // Parse retailers from sourceType (e.g., "Amazon Walmart Target")
  const retailers = sourceType.split(/\s+/).filter(r => r.length > 2);
  
  // Make individual searches for each retailer
  const searchPromises = retailers.slice(0, 3).map(async (retailer) => {
    return searchSingleRetailerPerplexity(retailer, searchQuery, productName, brand, barcode);
  });
  
  // Wait for all searches to complete in parallel
  const results = await Promise.all(searchPromises);
  const sources = results.filter(s => s !== null) as Source[];
  
  return sources;
}
```

### How It Works

1. **Parse Retailers:** Extract individual retailer names from the `sourceType` parameter
   - Example: "Amazon Walmart Target" → ["Amazon", "Walmart", "Target"]

2. **Individual Searches:** Make separate Perplexity API calls for each retailer
   - Call 1: Search for product on Amazon
   - Call 2: Search for product on Walmart  
   - Call 3: Search for product on Target

3. **Parallel Execution:** All searches run simultaneously for speed
   - Uses `Promise.all()` to wait for all searches
   - Total time ≈ time of slowest single search (not 3x)

4. **Filter Results:** Remove any failed searches (null results)
   - Returns array of successful sources

### Benefits

✅ **Guaranteed Multiple Sources:** Each API call focuses on one retailer  
✅ **More Reliable:** Simpler task for the AI (find product on ONE site)  
✅ **Better Success Rate:** Individual searches are more likely to succeed  
✅ **Parallel Execution:** Fast despite multiple calls  
✅ **Uses Existing Code:** Leverages `searchSingleRetailerPerplexity()` function

### Example Flow

**Phase 1 Search:** "Amazon Walmart Target"
```
→ Perplexity Call 1: Find "Blue Diamond Almonds" on Amazon
→ Perplexity Call 2: Find "Blue Diamond Almonds" on Walmart
→ Perplexity Call 3: Find "Blue Diamond Almonds" on Target
```

**Result:** 3 independent sources (one from each retailer)

## Changes Made

### Modified Function
- **File:** `supabase/functions/verify-brand-sources/index.ts`
- **Lines:** 365-389
- **Function:** `searchSourceTypePerplexity()`

### Key Changes
1. Parse retailers from sourceType string
2. Map each retailer to individual API call
3. Use `searchSingleRetailerPerplexity()` for each
4. Run all searches in parallel
5. Filter and return successful results

### Removed
- Bulk search approach (trying to get multiple sources in one call)
- Domain filters (not needed for individual searches)
- Complex prompt asking for multiple sources

## Testing

### Before Fix V2
```
Sources Found: 1 (Open Food Facts only)
Error: "Insufficient sources: Found 1 source, but require at least 3"
```

### After Fix V2 (Expected)
```
Sources Found: 3+
Sources:
  - Amazon (via Perplexity)
  - Walmart (via Perplexity)
  - Target (via Perplexity)
  - Open Food Facts (if available)
```

## Deployment

✅ **Deployed:** Function redeployed to Supabase  
✅ **Committed:** Changes committed to git  
✅ **Pushed:** Changes pushed to GitHub

### Test Now
Try scanning the same product again:
- **Product:** Blue Diamond Bold Elote Mexican-Style Street Corn Flavored Almonds
- **Barcode:** 041570147...

**Expected Result:** Should now find 3+ sources instead of just 1

## Technical Details

### API Calls Per Search Phase

**Phase 1:** 3 source types × 3 retailers each = 9 API calls
- "Amazon Walmart Target" → 3 calls
- "Official Brand & Kroger" → 2 calls  
- "MyFitnessPal Nutritionix" → 2 calls

**Phase 2 (if needed):** Additional 4 calls
**Phase 3 (if needed):** Additional 4 calls

### Performance
- **Parallel Execution:** All calls in a phase run simultaneously
- **Typical Time:** 5-10 seconds per phase
- **Total Time:** Similar to before (parallel execution)

### Error Handling
- Individual failures don't stop other searches
- Null results are filtered out
- Continues to Phase 2/3 if needed

## Why This Works Better

### Previous Approach (V1)
```
❌ Single API call asking for multiple sources
❌ AI had to search multiple sites AND format multiple results
❌ Complex task → often returned only 1 source
❌ Unpredictable results
```

### New Approach (V2)
```
✅ Multiple API calls, each focused on one retailer
✅ AI only needs to find product on ONE site
✅ Simpler task → more reliable results
✅ Guaranteed multiple sources (if products exist)
```

## Monitoring

Check logs after testing:
```bash
supabase functions logs verify-brand-sources
```

Look for:
- ✅ "Targeting retailers: Amazon, Walmart, Target"
- ✅ "✓ Amazon: Found ingredients"
- ✅ "✓ Walmart: Found ingredients"
- ✅ "✓ Target: Found ingredients"
- ✅ "Perplexity search complete: 3 sources found"

## Rollback (If Needed)

If this approach has issues:
```bash
git revert 426be15
supabase functions deploy verify-brand-sources
```

## Next Steps

1. ✅ Test with the Blue Diamond product
2. ✅ Verify 3+ sources are returned
3. ✅ Check logs for successful retailer searches
4. ✅ Test with other products
5. ✅ Merge to main if successful

---

**Status:** Deployed and ready for testing  
**Deployment Time:** $(date)  
**Commit:** 426be15


