# Perplexity API Diagnosis

## 🔍 Test Results

I ran a test simulating exactly what the frontend does when scanning a product.

### Test Product
- **Product:** Blue Diamond Bold Elote Mexican-Style Street Corn Flavored Almonds
- **Barcode:** 041570147016
- **Provider:** perplexity

### Result
```json
{
  "error": "Insufficient sources",
  "sourcesFound": 0,
  "minimumSourcesRequired": 3,
  "sources": []
}
```

**❌ 0 sources found** - This is the problem!

## 🤔 Possible Causes

### 1. Perplexity Not Being Called (Most Likely)
**Indicators:**
- API key might not be set correctly
- Provider routing might be falling back to Claude
- Function might be using old deployment

**Check logs for:**
```
⚠️ [ROUTER] Provider perplexity not available or API key missing. Falling back to Claude.
```

### 2. Perplexity Called But Failing
**Indicators:**
- API key invalid/expired
- Rate limit exceeded
- Network issues

**Check logs for:**
```
❌ [PERPLEXITY] Amazon search failed: 401 Unauthorized
❌ [PERPLEXITY] Amazon search failed: 429 Rate Limit
```

### 3. Perplexity Called But No Results
**Indicators:**
- Product not found on retailers
- Ingredient text too short (<10 chars)
- JSON parsing issues

**Check logs for:**
```
✓ Amazon: Found ingredients (5 chars)
✗ Amazon rejected: ingredient text too short
```

## 📊 What the Logs Should Show

### ✅ If Working Correctly:
```
🎯 [ROUTER] Provider requested: perplexity, PERPLEXITY_API_KEY exists: true
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

Amazon Walmart Target Perplexity search complete: 2 sources found
```

### ❌ If Not Working:
```
🎯 [ROUTER] Provider requested: perplexity, PERPLEXITY_API_KEY exists: false
⚠️ [ROUTER] Provider perplexity not available or API key missing. Falling back to Claude.
```

OR:
```
🎯 [ROUTER] Provider requested: perplexity, PERPLEXITY_API_KEY exists: true
✅ [ROUTER] Using Perplexity for Amazon Walmart Target
Targeting retailers: Amazon, Walmart, Target

🔍 [PERPLEXITY] Searching Amazon for Blue Diamond Bold Elote...
📡 [PERPLEXITY] Making API call to Perplexity for Amazon...
❌ [PERPLEXITY] Amazon search failed: 401 {"error": "Invalid API key"}
```

## 🔧 How to Check Logs

### Method 1: Supabase Dashboard (Recommended)
1. Go to: https://supabase.com/dashboard/project/fgoiyycctnwnghrvsilt/logs/edge-functions
2. Select `verify-brand-sources` function
3. Look for the emoji indicators above
4. Filter by timestamp (last 5-10 minutes)

### Method 2: Run Test Again
```bash
cd /Users/mattdavis/.cursor/worktrees/clarivore-main/2Ypwu
node test-perplexity-api.js
```

Then immediately check the Supabase logs.

## 🎯 Action Items

### 1. Check Logs First
Go to the Supabase dashboard and look for the emoji indicators. This will tell us exactly what's happening.

### 2. Verify API Key
```bash
supabase secrets list | grep PERPLEXITY
```

Should show:
```
PERPLEXITY_API_KEY | e6991f4fd22f8c4aa9dd9facc976e968c0df9dfbd7bc4a0c3052953b21e7b302
```

### 3. Test API Key Directly
If the API key exists, test it directly:
```bash
curl -X POST 'https://api.perplexity.ai/chat/completions' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_KEY_HERE' \
  -d '{
    "model": "llama-3.1-sonar-large-128k-online",
    "messages": [{"role": "user", "content": "test"}],
    "max_tokens": 100
  }'
```

Should return 200 OK, not 401.

## 🐛 Most Likely Issues

Based on the 0 sources result, here are the most likely scenarios in order:

1. **API Key Issue (70% likely)**
   - Key not set
   - Key invalid/expired
   - Key has no credits

2. **Product Not Found (20% likely)**
   - Product doesn't exist on Amazon/Walmart/Target
   - Product name/brand mismatch
   - Perplexity can't find it

3. **Code Issue (10% likely)**
   - Old deployment still running
   - Routing to Claude instead of Perplexity
   - Parsing error

## 📝 Next Steps

1. **Check the Supabase logs** - This is the most important step
2. **Look for the emoji indicators** (🎯 📡 📥 ❌)
3. **Share what you see** - The logs will tell us exactly what's wrong
4. Based on logs, we can:
   - Fix API key if that's the issue
   - Adjust search logic if product not found
   - Debug code if there's a routing issue

---

**Test Script:** `test-perplexity-api.js`  
**Logs:** https://supabase.com/dashboard/project/fgoiyycctnwnghrvsilt/logs/edge-functions  
**Status:** Waiting for log analysis


