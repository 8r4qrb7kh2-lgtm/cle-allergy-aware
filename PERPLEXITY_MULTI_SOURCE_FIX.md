# Perplexity API Multi-Source Fix

## Problem
The Perplexity API was only finding one source instead of multiple sources when searching for product ingredient information.

## Root Cause
The `searchSourceTypePerplexity` function was stubbed out and returning an empty array `[]` instead of actually calling the Perplexity API and processing results.

## Changes Made

### 1. **Implemented the Perplexity Search Function** (Lines 365-558)
- Removed the stub that was returning empty array
- Implemented full Perplexity API call with proper request/response handling
- Added comprehensive JSON parsing and source extraction logic

### 2. **Enhanced Prompt for Multiple Sources** (Lines 375-472)
- Added explicit instruction: "Find ingredient information for this food product from MULTIPLE SOURCES"
- Emphasized: "You MUST find at least 2-3 different sources. Search each retailer/website separately."
- Added reminder at end of prompt: "You MUST search multiple websites and return 2-3+ sources in the sources array. Do not stop after finding just one source!"

### 3. **Added System Message** (Lines 484-487)
- Included a system role message to guide the AI model
- Explicitly instructs the model to search multiple retailers
- Reinforces the requirement to return JSON with multiple sources

### 4. **Added Perplexity-Specific Parameters** (Lines 495-497)
- `search_domain_filter`: Limits searches to relevant retailer domains (Amazon, Walmart, Target, Kroger, etc.)
- `return_citations`: Enables citation tracking to see which websites were searched
- `search_recency_filter`: Set to 'month' to get recent product information

### 5. **Enhanced Logging and Debugging** (Lines 502-529)
- Added logging for Perplexity citations to track which websites were searched
- Added detailed logging of sources returned by Perplexity before filtering
- Shows ingredient text length for each source to help debug filtering issues
- Logs full response text for troubleshooting JSON parsing issues

## Technical Details

### API Request Structure
```typescript
{
  model: 'llama-3.1-sonar-large-128k-online',
  messages: [
    {
      role: 'system',
      content: 'You are a food product research assistant...'
    },
    {
      role: 'user',
      content: searchPrompt
    }
  ],
  temperature: 0.2,
  max_tokens: 8000,
  search_domain_filter: [...],
  return_citations: true,
  search_recency_filter: 'month'
}
```

### Response Processing
1. Extract citations from Perplexity response
2. Parse JSON from response text using regex: `/\{[\s\S]*\}/`
3. Validate each source has sufficient ingredient text (>10 chars)
4. Build Source objects with all required fields
5. Return array of valid sources

## Expected Behavior After Fix

When using the Perplexity provider:
- The function will now actually call the Perplexity API (instead of returning empty array)
- Perplexity will search multiple retailer websites
- The response should contain 2-3+ sources with ingredient information
- Each source will include:
  - Source name (e.g., "Amazon", "Walmart")
  - URL to the product page
  - Complete ingredient list
  - Allergen information
  - Dietary compatibility
  - Confidence score

## Testing

To test the fix:
1. Call the `verify-brand-sources` function with `provider: 'perplexity'`
2. Check the console logs for:
   - "Starting [sourceType] search with Perplexity..."
   - "Perplexity Citations" showing multiple websites
   - "Sources returned by Perplexity" showing 2-3+ sources
   - "✓ [sourceType] found: [source name]" for each valid source
3. Verify the response contains multiple sources in the `sources` array

## Notes

- The function now properly implements the same multi-source search logic that was working in the Claude version
- The enhanced prompt and system message help guide Perplexity to search multiple websites
- The domain filter ensures searches focus on relevant retailer websites
- Comprehensive logging helps debug any issues with source retrieval or filtering


