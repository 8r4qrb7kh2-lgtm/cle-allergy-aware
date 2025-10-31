# Perplexity API Multi-Source Fix - Summary

## Issue Fixed
The Perplexity API integration was not finding more than one source when searching for product ingredient information.

## Root Cause
The `searchSourceTypePerplexity()` function (lines 365-558) was stubbed out with a comment "Temporary stub to isolate boot error" and was simply returning an empty array `[]` instead of actually calling the Perplexity API.

## Solution Implemented

### 1. **Fully Implemented Perplexity Search Function**
   - Removed the stub and implemented complete API call logic
   - Added proper request formatting with enhanced parameters
   - Implemented response parsing and source extraction
   - Added comprehensive error handling

### 2. **Enhanced Prompt Engineering**
   - Added explicit multi-source requirement in prompt header
   - Emphasized "You MUST find at least 2-3 different sources"
   - Added reminder at end: "Do not stop after finding just one source!"
   - Structured prompt to guide AI to search multiple retailers

### 3. **Added System Message**
   - Included system role message to set context
   - Explicitly instructs model to search multiple retailers
   - Reinforces JSON response format requirement

### 4. **Optimized API Parameters**
   ```typescript
   {
     model: 'llama-3.1-sonar-large-128k-online',
     temperature: 0.2,
     max_tokens: 8000,
     search_domain_filter: [
       'amazon.com', 'walmart.com', 'target.com', 
       'kroger.com', 'wholefoodsmarket.com', 'costco.com',
       'instacart.com', 'myfitnesspal.com', 'nutritionix.com'
     ],
     return_citations: true,
     search_recency_filter: 'month'
   }
   ```

### 5. **Enhanced Debug Logging**
   - Logs Perplexity citations (shows which websites were searched)
   - Logs raw response length and preview
   - Logs parsed sources before filtering
   - Logs each source's ingredient text length
   - Helps identify if sources are being returned but filtered out

## Files Modified

1. **`supabase/functions/verify-brand-sources/index.ts`**
   - Lines 365-558: Implemented `searchSourceTypePerplexity()` function
   - Lines 375-472: Enhanced prompt with multi-source requirements
   - Lines 484-487: Added system message
   - Lines 495-497: Added Perplexity-specific API parameters
   - Lines 508-544: Added comprehensive logging

## Testing Instructions

### Test with Perplexity Provider

1. **Call the function with Perplexity:**
   ```javascript
   const response = await fetch('YOUR_SUPABASE_FUNCTION_URL/verify-brand-sources', {
     method: 'POST',
     headers: {
       'Content-Type': 'application/json',
       'Authorization': 'Bearer YOUR_TOKEN'
     },
     body: JSON.stringify({
       productName: 'Pita Chips',
       brand: "Stacy's",
       barcode: '028400064316',
       provider: 'perplexity',  // <-- Specify Perplexity
       openFoodFactsData: null
     })
   });
   ```

2. **Check Console Logs for:**
   - ✅ "Starting [sourceType] search with Perplexity..."
   - ✅ "=== Perplexity Citations ===" (showing multiple websites)
   - ✅ "Sources in JSON: 2" (or more)
   - ✅ "=== Sources returned by Perplexity ===" (listing each source)
   - ✅ "✓ [sourceType] found: Amazon (95% confidence)"
   - ✅ "✓ [sourceType] found: Walmart (90% confidence)"
   - ✅ Multiple sources in final response

3. **Verify Response Contains:**
   ```json
   {
     "sources": [
       {
         "name": "Amazon",
         "url": "https://amazon.com/...",
         "ingredientsText": "...",
         "allergens": [...],
         "diets": [...],
         "confidence": 95
       },
       {
         "name": "Walmart",
         "url": "https://walmart.com/...",
         "ingredientsText": "...",
         "allergens": [...],
         "diets": [...],
         "confidence": 90
       },
       // ... more sources
     ],
     "sourcesFound": 3,  // Should be >= 3
     "minimumSourcesRequired": 3
   }
   ```

### Compare with Claude Provider

Test the same product with Claude to ensure both providers work:
```javascript
{
  productName: 'Pita Chips',
  brand: "Stacy's",
  barcode: '028400064316',
  provider: 'claude',  // <-- Compare with Claude
  openFoodFactsData: null
}
```

## Expected Behavior After Fix

### Before Fix:
- ❌ Perplexity returned empty array `[]`
- ❌ Only Open Food Facts source was available
- ❌ Function failed with "Insufficient sources" error

### After Fix:
- ✅ Perplexity searches multiple retailer websites
- ✅ Returns 2-3+ sources with complete ingredient data
- ✅ Each source includes allergens, diets, confidence scores
- ✅ Function succeeds with sufficient sources for verification

## Troubleshooting

### If Still Getting Only One Source:

1. **Check API Key:**
   - Ensure `PERPLEXITY_API_KEY` is set in Supabase environment variables
   - Verify the key has sufficient credits/quota

2. **Check Logs:**
   - Look for "Perplexity Citations" - should show multiple URLs
   - Check "Sources returned by Perplexity" - should list 2-3+ sources
   - If sources are returned but filtered out, check ingredient text length

3. **Check Domain Filter:**
   - Ensure the product is available on the filtered domains
   - May need to adjust `search_domain_filter` for specific products

4. **Check Response Format:**
   - Perplexity should return JSON with `sources` array
   - Each source should have `ingredientsText` with >10 characters

### If Perplexity API Fails:

- Check console for HTTP status code
- Verify API endpoint is correct: `https://api.perplexity.ai/chat/completions`
- Check if model name is valid: `llama-3.1-sonar-large-128k-online`
- Ensure request format matches Perplexity API documentation

## Performance Notes

- **Perplexity** typically responds in 5-10 seconds per search
- **Claude** with web search typically responds in 8-15 seconds per search
- Both providers make 3 parallel searches in Phase 1
- Additional searches in Phase 2 and 3 if needed

## Next Steps

1. Deploy the updated function to Supabase
2. Test with various products to ensure consistent multi-source results
3. Monitor logs to verify Perplexity is finding multiple sources
4. Compare results between Perplexity and Claude providers
5. Adjust domain filters or prompts if needed based on results

## Related Files

- `supabase/functions/verify-brand-sources/index.ts` - Main implementation
- `PERPLEXITY_MULTI_SOURCE_FIX.md` - Detailed technical documentation

