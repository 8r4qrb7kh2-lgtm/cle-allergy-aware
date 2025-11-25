import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

interface IngredientSource {
  sourceName: string;
  url: string;
  ingredientsText: string;
  productName: string;
  urlValid?: boolean;
  productImage?: string;
}

interface BarcodeLookupResult {
  success: boolean;
  needsPhoto: boolean;
  productName?: string;
  ingredientList?: string;
  sources?: IngredientSource[];
  productImage?: string;
  message?: string;
  consistencyInfo?: {
    totalSources: number;
    matchingSources: number;
    differentSources: number;
    differences?: Array<{
      sourceName: string;
      ingredientsText: string;
      groupSize: number;
    }>;
  };
}

// Normalize ingredient text for comparison
function normalizeIngredients(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')  // Remove punctuation
    .replace(/\s+/g, ' ')       // Normalize whitespace
    .trim();
}

// Check if two ingredient lists are substantially similar (85%+ match)
function areIngredientsSimilar(text1: string, text2: string): boolean {
  const normalized1 = normalizeIngredients(text1);
  const normalized2 = normalizeIngredients(text2);
  
  // If identical, they match
  if (normalized1 === normalized2) return true;
  
  // Calculate word overlap
  const words1 = new Set(normalized1.split(' ').filter(w => w.length > 2));
  const words2 = new Set(normalized2.split(' ').filter(w => w.length > 2));
  
  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);
  
  const similarity = intersection.size / union.size;
  return similarity >= 0.65;
}

// Legacy validateUrl function - now calls validateUrlWithReason for backward compatibility
async function validateUrl(url: string): Promise<boolean> {
  const result = await validateUrlWithReason(url);
  return result.isValid;
}

// Validate all URLs in parallel and filter out dead links
async function validateAndFilterSources(sources: IngredientSource[]): Promise<IngredientSource[]> {
  console.log(`Validating ${sources.length} source URLs...`);
  
  const validationPromises = sources.map(async (source) => {
    const result = await validateUrlWithReason(source.url);
    return { source, isValid: result.isValid, reason: result.reason };
  });
  
  const results = await Promise.all(validationPromises);
  const validSources = results
    .filter(({ isValid }) => isValid)
    .map(({ source }) => ({ ...source, urlValid: true }));
  
  const invalidCount = results.length - validSources.length;
  if (invalidCount > 0) {
    console.log(`Filtered out ${invalidCount} invalid/dead URLs`);
    results.filter(({ isValid }) => !isValid).forEach(({ source, reason }) => {
      console.log(`  - Invalid: ${source.sourceName} (${source.url}) - Reason: ${reason || 'Unknown'}`);
    });
  }
  
  return validSources;
}

// Validate URL and return reason for failure
async function validateUrlWithReason(url: string): Promise<{ isValid: boolean; reason: string | null }> {
  if (!url || !url.startsWith('http')) {
    return { isValid: false, reason: 'Invalid URL format' };
  }
  
  const isAmazonUrl = url.includes('amazon.com') || url.includes('amazon.co.uk') || url.includes('amazon.ca');
  
  try {
    // Try HEAD request first (faster)
    const headResponse = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000), // 5 second timeout (increased from 3)
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      redirect: 'follow'
    });
    
    // Consider 200-299, 300-399 (redirects), 403 (forbidden but exists), 405 (method not allowed but exists) as valid
    const isValid = headResponse.status >= 200 && headResponse.status < 400 || 
                    headResponse.status === 403 || 
                    headResponse.status === 405;
    
    if (isValid) {
      return { isValid: true, reason: null };
    }
    
    // If HEAD failed but it's Amazon, try GET (Amazon often blocks HEAD but allows GET)
    if (!isValid && isAmazonUrl) {
      console.log(`HEAD request failed (${headResponse.status}) for Amazon URL, trying GET...`);
      try {
        const getResponse = await fetch(url, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9'
          },
          redirect: 'follow'
        });
        const getIsValid = getResponse.status >= 200 && getResponse.status < 400;
        if (getIsValid) {
          console.log(`GET request succeeded for Amazon URL (${getResponse.status})`);
          return { isValid: true, reason: null };
        }
        return { isValid: false, reason: `GET request returned status ${getResponse.status}` };
      } catch (getError) {
        const errorMsg = (getError as any).message || 'Unknown error';
        console.log(`GET request also failed for Amazon URL:`, errorMsg);
        return { isValid: false, reason: `GET request failed: ${errorMsg}` };
      }
    }
    
    return { isValid: false, reason: `HEAD request returned status ${headResponse.status}` };
  } catch (error) {
    const errorMsg = (error as any).message || 'Unknown error';
    console.log(`URL validation failed for ${url}:`, errorMsg);
    
    // For Amazon URLs, if it's a timeout or network error, be more lenient
    // Amazon URLs often work when manually tested even if automated validation fails
    if (isAmazonUrl && (errorMsg.includes('timeout') || errorMsg.includes('fetch') || errorMsg.includes('network'))) {
      console.log(`Amazon URL validation had network/timeout issue, but URL may still be valid`);
      // Return true for Amazon URLs with network issues - they're often valid but blocked by automated checks
      return { isValid: true, reason: null };
    }
    
    return { isValid: false, reason: errorMsg };
  }
}

// Group sources by matching ingredients
function groupSourcesBySimilarity(sources: IngredientSource[]): Map<string, IngredientSource[]> {
  const groups = new Map<string, IngredientSource[]>();
  
  for (const source of sources) {
    let added = false;
    
    // Check if this source matches any existing group
    for (const [key, group] of groups.entries()) {
      if (areIngredientsSimilar(source.ingredientsText, key)) {
        group.push(source);
        added = true;
        break;
      }
    }
    
    // If no match, create new group
    if (!added) {
      groups.set(source.ingredientsText, [source]);
    }
  }
  
  return groups;
}

// Fetch from Open Food Facts
async function fetchFromOpenFoodFacts(barcode: string): Promise<{ source: IngredientSource | null; brand: string }> {
  try {
    console.log('Trying Open Food Facts...');
    const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
    if (!response.ok) return { source: null, brand: '' };

    const data = await response.json();
    if (data.status !== 1 || !data.product) return { source: null, brand: '' };

    const product = data.product;
    const ingredientsText = product.ingredients_text_en || 
                           product.ingredients_text || 
                           product.ingredients_original || 
                           '';

    if (!ingredientsText || ingredientsText.trim().length < 10) {
      console.log('Open Food Facts found product but no ingredients');
      return { source: null, brand: '' };
    }

    // Extract brand name - try multiple fields, prioritizing brand_owner
    let brandName = product.brand_owner || 
                   product.brands || 
                   product.brand || 
                   product.brands_tags?.[0]?.replace(/^en:/, '').replace(/-/g, ' ') || 
                   '';
    
    // If brand is still empty, try to extract from product_name (e.g., "Weis Classic Pasta Fettuccine")
    if (!brandName && product.product_name) {
      const productName = product.product_name;
      // Common brand patterns at the start of product names
      const brandMatch = productName.match(/^([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\s+(.+)$/);
      if (brandMatch && brandMatch[1].length < 30) { // Reasonable brand name length
        brandName = brandMatch[1].trim();
        console.log(`Extracted brand "${brandName}" from product_name`);
      }
    }
    
    // Clean up brand name
    if (brandName.includes(',')) {
      brandName = brandName.split(',')[0].trim();
    }
    
    // Remove common suffixes that appear in brand_owner field (e.g., "WEIS QUALITY" -> "WEIS")
    const commonSuffixes = ['QUALITY', 'BRANDS', 'FOODS', 'COMPANY', 'INC', 'LLC', 'CORP', 'CORPORATION', 'GROCERY', 'MARKETS'];
    for (const suffix of commonSuffixes) {
      const regex = new RegExp(`\\s+${suffix}\\s*$`, 'i');
      if (regex.test(brandName)) {
        brandName = brandName.replace(regex, '').trim();
        console.log(`Removed suffix "${suffix}" from brand name`);
        break; // Only remove one suffix
      }
    }
    
    brandName = brandName.trim();
    
    // Normalize to title case for better search matching (e.g., "WEIS" -> "Weis", "WEIS QUALITY" -> "Weis")
    if (brandName) {
      const words = brandName.split(/\s+/);
      if (words.length === 1) {
        // Single word: capitalize first letter, lowercase rest
        brandName = words[0].charAt(0).toUpperCase() + words[0].slice(1).toLowerCase();
      } else {
        // Multiple words: title case each word
        brandName = words.map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
      }
    }
    
    // Log available brand-related fields for debugging
    if (!brandName) {
      console.log('⚠️ No brand found. Available fields:', {
        brands: product.brands,
        brand: product.brand,
        brand_owner: product.brand_owner,
        brands_tags: product.brands_tags,
        product_name: product.product_name
      });
    } else {
      console.log(`✓ Found brand: "${brandName}"`);
    }

    console.log('✓ Found in Open Food Facts');
    return {
      source: {
        sourceName: 'Open Food Facts',
        url: product.url || `https://world.openfoodfacts.org/product/${barcode}`,
        ingredientsText: ingredientsText.trim(),
        productName: product.product_name || product.brands || 'Unknown Product',
        productImage: product.image_front_small_url || product.image_front_url || product.image_url || ''
      },
      brand: brandName
    };
  } catch (err) {
    console.log('✗ Open Food Facts failed:', (err as any).message);
    return { source: null, brand: '' };
  }
}

// Fetch from UPCitemdb
async function fetchFromUPCitemdb(barcode: string): Promise<IngredientSource | null> {
  try {
    console.log('Trying UPCitemdb...');
    const response = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${barcode}`);
    if (!response.ok) return null;

    const data = await response.json();
    if (!data.items || data.items.length === 0) return null;

    const item = data.items[0];
    
    // UPCitemdb usually doesn't have ingredients, so this is just for product info
    console.log('✓ Found in UPCitemdb (product info only)');
    return {
      sourceName: 'UPCitemdb',
      url: item.images && item.images.length > 0 ? item.images[0] : '',
      ingredientsText: '', // UPCitemdb doesn't provide ingredients
      productName: item.title || 'Unknown Product'
    };
  } catch (err) {
    console.log('✗ UPCitemdb failed:', (err as any).message);
    return null;
  }
}

// Search web for product information using Claude with web search by barcode
async function searchProductByBarcodeWithClaude(barcode: string, model: string = 'claude-haiku-4-5-20251001'): Promise<{ productName: string; sources: IngredientSource[] } | null> {
  console.log(`Searching web for barcode: ${barcode} using ${model}`);
  
  if (!ANTHROPIC_API_KEY) {
    console.log('Anthropic API key not available, skipping web search');
    return null;
  }

  try {
    const searchPrompt = `Please search the internet for the product with barcode ${barcode}. From the search results, identify the exact product name, brand, and ingredient lists.

🚨 CRITICAL REQUIREMENT: You MUST find and return EXACTLY 5 sources with complete ingredient lists. This is MANDATORY.

STRATEGY FOR FINDING 5 SOURCES:

STEP 1 - CHECK FIG FIRST: Before searching for any other sources, you MUST first search for the product with barcode ${barcode} on Fig (foodisgood.com). Search for the barcode ${barcode} on foodisgood.com. 

🚨 CRITICAL: When checking Fig, you MUST verify that the brand name and product name match what you find from your search results. If Fig shows a different brand than what you discover from other sources, DO NOT include that Fig source - it's the wrong product. Only include Fig as a source if the brand and product name match exactly.

If Fig has ingredient information for the CORRECT brand and product, include it as one of your 5 sources. Only after checking Fig should you proceed to find other sources.

STEP 2 - FIND REMAINING SOURCES: When searching the web for the remaining sources, always put both the product name and the brand name in the same search so that you don't get results for different brands that have similar product names. Do a web search of the item name and brand name and then look through all of the site results. Don't stop looking until you find 5 good sources with full ingredient lists. You must not stop searching.

EXTRACTION REQUIREMENTS:
- Extract the ingredient lists DIRECTLY from the search result summaries provided by web search
- Copy ingredient lists VERBATIM (character-by-character) - do not paraphrase or summarize
- Include ALL ingredients exactly as written on the product page
- If a search result shows ingredient information, use it even if incomplete - partial lists are acceptable

Return your response with both explanatory text AND a complete JSON object. Include your explanation of how you found the sources, then include the complete JSON object below.

Return your response in this EXACT JSON format:
{
  "productName": "Exact product name with brand",
  "sources": [
    {
      "sourceName": "Website name (e.g., 'Walmart', 'Amazon', 'Kroger')",
      "url": "Full URL to the product page",
      "ingredientsText": "Complete ingredient list extracted from search results - copy VERBATIM"
    },
    {
      "sourceName": "Second different website name",
      "url": "Full URL to this product page",
      "ingredientsText": "Complete ingredient list extracted from search results"
    },
    {
      "sourceName": "Third different website name",
      "url": "Full URL to this product page",
      "ingredientsText": "Complete ingredient list extracted from search results"
    },
    {
      "sourceName": "Fourth different website name",
      "url": "Full URL to this product page",
      "ingredientsText": "Complete ingredient list extracted from search results"
    },
    {
      "sourceName": "Fifth different website name",
      "url": "Full URL to this product page",
      "ingredientsText": "Complete ingredient list extracted from search results"
    }
  ]
}

CRITICAL REQUIREMENTS:
1. **MANDATORY**: Return EXACTLY 5 sources - use multiple web searches if needed to find 5 different retailers
2. Each source MUST have a DIFFERENT domain (different retailer/website)
3. Each source MUST include a complete ingredient list (even if partial - copy what you find)
4. **BRAND VALIDATION**: ${brand ? `Every source MUST be for the EXACT brand "${brand}". If you find a source with a different brand (e.g., looking for "${brand}" but finding "Great Value" or another brand), DO NOT include it - it's the wrong product. Verify the brand name matches exactly before including any source.` : 'Verify that all sources are for the same product and brand before including them.'}
5. Use your 10 web search attempts strategically to find different retailers - you have plenty of searches available, so don't hesitate to search multiple times if needed
6. Do NOT return fewer than 5 sources unless you have exhausted ALL search attempts and truly cannot find 5 sources with ingredient information
7. If you find the same product on multiple pages of the same retailer, that still counts as only ONE source - you need 5 DIFFERENT retailers/domains

⚠️ RESPONSE FORMAT: You may include explanatory text about your search process, but you MUST also include a complete, valid JSON object with all 5 sources. The JSON object can be wrapped in markdown code blocks (\`\`\`json ... \`\`\`) or appear as plain JSON in your response.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 8000,
        temperature: 0.1,
        messages: [
          {
            role: 'user',
            content: searchPrompt
          }
        ],
        tools: [{
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 10
        }]
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`Claude search failed: ${response.status} - ${errorText}`);
      return null;
    }

    const data = await response.json();
    
    // Extract text response from Claude
    let responseText = '';
    for (const block of data.content) {
      if (block.type === 'text') {
        responseText += block.text;
      }
    }
    
    console.log(`Claude response length: ${responseText.length} chars`);
    
    // Parse JSON from response - try multiple strategies
    let searchResult;
    
    // Strategy 1: Try to find JSON in markdown code blocks (most common format)
    const codeBlockMatch = responseText.match(/```json\n([\s\S]*?)\n```/) || 
                           responseText.match(/```json([\s\S]*?)```/) ||
                           responseText.match(/```\n([\s\S]*?)\n```/);
    if (codeBlockMatch) {
      try {
        const jsonText = codeBlockMatch[1].trim();
        searchResult = JSON.parse(jsonText);
        console.log('Successfully parsed JSON from code block');
      } catch (e) {
        console.log('JSON parse error from code block:', (e as any).message);
        // Fall through to next strategy
      }
    }
    
    // Strategy 2: Try to find all JSON objects in the response and parse the largest one
    if (!searchResult) {
      const jsonObjects: Array<{start: number, end: number, text: string}> = [];
      
      // Find all potential JSON objects by looking for opening braces
      for (let i = 0; i < responseText.length; i++) {
        if (responseText[i] === '{') {
          let braceCount = 0;
          let jsonEnd = i;
          
          // Find the matching closing brace
          for (let j = i; j < responseText.length; j++) {
            if (responseText[j] === '{') braceCount++;
            if (responseText[j] === '}') braceCount--;
            if (braceCount === 0) {
              jsonEnd = j;
              break;
            }
          }
          
          if (braceCount === 0 && jsonEnd > i) {
            const jsonCandidate = responseText.substring(i, jsonEnd + 1);
            // Check if it looks like valid JSON (has common keys)
            if (jsonCandidate.includes('"sources"') || jsonCandidate.includes('"productName"') || 
                jsonCandidate.includes('sources') || jsonCandidate.includes('productName')) {
              jsonObjects.push({ start: i, end: jsonEnd, text: jsonCandidate });
            }
          }
        }
      }
      
      // Try to parse each JSON object, starting with the largest
      jsonObjects.sort((a, b) => b.text.length - a.text.length);
      
      for (const obj of jsonObjects) {
        try {
          searchResult = JSON.parse(obj.text);
          console.log(`Successfully parsed JSON from response text (${obj.text.length} chars)`);
          break;
        } catch (parseError) {
          // Try next object
          continue;
        }
      }
      
      // If still no result, try regex-based extraction for JSON with "sources" key
      if (!searchResult) {
        const sourcesMatch = responseText.match(/\{[^}]*"sources"\s*:\s*\[[\s\S]*?\][^}]*\}/) ||
                            responseText.match(/\{[\s\S]*?"sources"[\s\S]*?\}/);
        if (sourcesMatch) {
          try {
            searchResult = JSON.parse(sourcesMatch[0]);
            console.log('Successfully parsed JSON using sources key match');
          } catch (e) {
            console.log('Alternative JSON parse also failed');
          }
        }
      }
    }
    
    if (!searchResult) {
      console.log('Could not parse Claude response as JSON');
      console.log('Response preview:', responseText.substring(0, 1000));
      // Check if Claude returned an error/apology message
      if (responseText.toLowerCase().includes('apologize') || 
          responseText.toLowerCase().includes('unable to') ||
          responseText.toLowerCase().includes('cannot') ||
          responseText.toLowerCase().includes('error')) {
        console.log('Claude appears to have returned an error or apology message');
      }
      return null;
    }
    
    if (!searchResult.productName || !searchResult.sources || searchResult.sources.length < 1) {
      console.log(`No sources found from Claude: ${searchResult.sources?.length || 0} sources`);
      return null;
    }
    

    const mappedSources = searchResult.sources.map((s: any) => ({
      sourceName: s.sourceName,
      url: s.url,
      ingredientsText: s.ingredientsText || '',
      productName: searchResult.productName
    }));
    
    console.log(`Mapped ${mappedSources.length} sources from Claude response`);
    const validSources = mappedSources.filter((s: IngredientSource) => {
      const text = s.ingredientsText || '';
      const trimmed = text.trim();
      
      // Filter out sources with error messages or placeholder text
      const errorIndicators = [
        'unable to extract',
        'ingredients section not fully displayed',
        'ingredients not available',
        'no ingredient list found',
        'could not find ingredients',
        'unable to access',
        'incomplete ingredient',
        'ingredient information not found'
      ];
      
      const hasErrorIndicator = errorIndicators.some(indicator => 
        trimmed.toLowerCase().includes(indicator)
      );
      
      // Check minimum length (at least 10 chars for a real ingredient list)
      const isLongEnough = trimmed.length > 10;
      
      // Check if it looks like an actual ingredient list (contains commas or common ingredients)
      const looksLikeIngredients = /[,;]|water|salt|sugar|oil|flour|milk|egg/.test(trimmed.toLowerCase());
      
      const isValid = isLongEnough && looksLikeIngredients && !hasErrorIndicator;
      
      if (!isValid) {
        if (hasErrorIndicator) {
          console.log(`Filtering out source ${s.sourceName}: error message detected`);
        } else if (!isLongEnough) {
          console.log(`Filtering out source ${s.sourceName}: ingredients too short (${trimmed.length} chars)`);
        } else if (!looksLikeIngredients) {
          console.log(`Filtering out source ${s.sourceName}: doesn't look like ingredient list`);
        }
      }
      
      return isValid;
    });
    
    console.log(`Returning ${validSources.length} valid sources (filtered ${mappedSources.length - validSources.length} invalid sources)`);
    
    // If we filtered out too many, try to get more sources
    if (validSources.length < 3 && mappedSources.length >= 3) {
      console.log(`Only ${validSources.length} valid sources found. Requesting additional sources...`);
    }
    
    return {
      productName: searchResult.productName,
      sources: validSources
    };

  } catch (error) {
    console.log('Claude search error:', (error as any).message);
    return null;
  }
}

// Search web for product information using Claude with web search by name
async function searchProductWithClaude(productName: string, brand: string, barcode: string = '', model: string = 'claude-haiku-4-5-20251001'): Promise<IngredientSource[]> {
  console.log(`Searching web for: ${brand ? `"${brand} ${productName}"` : `"${productName}"`}${barcode ? ` (UPC: ${barcode})` : ''} using ${model}`);
  if (brand) {
    console.log(`🚨 BRAND REQUIRED: Every web search MUST include brand "${brand}" in the query`);
  }
  
  if (!ANTHROPIC_API_KEY) {
    console.log('Anthropic API key not available, skipping web search');
    return [];
  }

  try {
    const searchPrompt = `Please search the internet for the product: ${brand ? `${brand} ` : ''}${productName}${barcode ? ` (UPC: ${barcode})` : ''}.

🚨 CRITICAL: ${brand ? `The brand name is "${brand}". You MUST include "${brand}" in EVERY web search query you perform. Do NOT search for just "${productName}" - you must search for "${brand} ${productName}" in every search.` : 'Search for the product name provided.'}

CRITICAL REQUIREMENT: You MUST find and return EXACTLY 5 sources with complete ingredient lists. This is MANDATORY.

STRATEGY FOR FINDING 5 SOURCES:

STEP 1 - CHECK FIG FIRST: Before searching for any other sources, you MUST first search for the product on Fig (foodisgood.com). Search for "${brand ? `${brand} ${productName}` : productName}" on foodisgood.com. 

🚨 CRITICAL: When checking Fig, you MUST verify that the brand name matches EXACTLY. If Fig shows a different brand (e.g., you're looking for "Horizon Organic" but Fig shows "Great Value"), DO NOT include that source - it's the wrong product. Only include Fig as a source if the brand name matches exactly what you're searching for: "${brand || 'N/A'}".

If Fig has ingredient information for the CORRECT brand and product, include it as one of your 5 sources. Only after checking Fig should you proceed to find other sources.

STEP 2 - FIND REMAINING SOURCES: When searching the web for the remaining sources, always put both the product name and the brand name in the same search so that you don't get results for different brands that have similar product names. Do a web search of the item name and brand name and then look through all of the site results. Don't stop looking until you find 5 good sources with full ingredient lists. You must not stop searching.

EXTRACTION REQUIREMENTS:
- Extract the ingredient lists DIRECTLY from the search result summaries provided by web search
- Copy ingredient lists VERBATIM (character-by-character) - do not paraphrase or summarize
- Include ALL ingredients exactly as written on the product page
- If a search result shows ingredient information, use it even if incomplete - partial lists are acceptable

CRITICAL: You MUST respond with ONLY valid JSON. No explanations, no markdown, no text before or after the JSON. Return ONLY the JSON object below.

Return your response in this EXACT JSON format:
{
  "sources": [
    {
      "sourceName": "Website name (e.g., 'Walmart', 'Amazon', 'Target')",
      "url": "Full URL to the product page",
      "ingredientsText": "Complete ingredient list extracted from search results"
    },
    {
      "sourceName": "Second different website name",
      "url": "Full URL to this product page",
      "ingredientsText": "Complete ingredient list extracted from search results"
    },
    {
      "sourceName": "Third different website name",
      "url": "Full URL to this product page",
      "ingredientsText": "Complete ingredient list extracted from search results"
    },
    {
      "sourceName": "Fourth different website name",
      "url": "Full URL to this product page",
      "ingredientsText": "Complete ingredient list extracted from search results"
    },
    {
      "sourceName": "Fifth different website name",
      "url": "Full URL to this product page",
      "ingredientsText": "Complete ingredient list extracted from search results"
    }
  ]
}

CRITICAL REQUIREMENTS:
1. **MANDATORY**: Return EXACTLY 5 sources - use multiple web searches if needed to find 5 different retailers
2. Each source MUST have a DIFFERENT domain (different retailer/website)
3. Each source MUST include a complete ingredient list (even if partial - copy what you find)
4. **BRAND VALIDATION**: ${brand ? `Every source MUST be for the EXACT brand "${brand}". If you find a source with a different brand (e.g., looking for "${brand}" but finding "Great Value" or another brand), DO NOT include it - it's the wrong product. Verify the brand name matches exactly before including any source.` : 'Verify that all sources are for the same product and brand before including them.'}
5. Use your 10 web search attempts strategically to find different retailers - you have plenty of searches available, so don't hesitate to search multiple times if needed
6. Do NOT return fewer than 5 sources unless you have exhausted ALL search attempts and truly cannot find 5 sources with ingredient information
7. If you find the same product on multiple pages of the same retailer, that still counts as only ONE source - you need 5 DIFFERENT retailers/domains

⚠️ RESPONSE FORMAT: You may include explanatory text about your search process, but you MUST also include a complete, valid JSON object with all 5 sources. The JSON object can be wrapped in markdown code blocks (\`\`\`json ... \`\`\`) or appear as plain JSON in your response.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 8000,
        temperature: 0.1,
        messages: [
          {
            role: 'user',
            content: searchPrompt
          }
        ],
        tools: [{
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 10
        }]
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`Claude search failed: ${response.status} - ${errorText}`);
      return [];
    }

    const data = await response.json();
    
    // Extract text response from Claude
    let responseText = '';
    for (const block of data.content) {
      if (block.type === 'text') {
        responseText += block.text;
      }
    }
    
    // Parse JSON from response - try multiple strategies
    let searchResult;
    
    // Strategy 1: Try to find JSON in markdown code blocks (most common format)
    const codeBlockMatch = responseText.match(/```json\n([\s\S]*?)\n```/) || 
                           responseText.match(/```json([\s\S]*?)```/) ||
                           responseText.match(/```\n([\s\S]*?)\n```/);
    if (codeBlockMatch) {
      try {
        const jsonText = codeBlockMatch[1].trim();
        searchResult = JSON.parse(jsonText);
        console.log('Successfully parsed JSON from code block');
      } catch (e) {
        console.log('JSON parse error from code block:', (e as any).message);
        // Fall through to next strategy
      }
    }
    
    // Strategy 2: Try to find all JSON objects in the response and parse the largest one
    if (!searchResult) {
      const jsonObjects: Array<{start: number, end: number, text: string}> = [];
      
      // Find all potential JSON objects by looking for opening braces
      for (let i = 0; i < responseText.length; i++) {
        if (responseText[i] === '{') {
          let braceCount = 0;
          let jsonEnd = i;
          
          // Find the matching closing brace
          for (let j = i; j < responseText.length; j++) {
            if (responseText[j] === '{') braceCount++;
            if (responseText[j] === '}') braceCount--;
            if (braceCount === 0) {
              jsonEnd = j;
              break;
            }
          }
          
          if (braceCount === 0 && jsonEnd > i) {
            const jsonCandidate = responseText.substring(i, jsonEnd + 1);
            // Check if it looks like valid JSON (has common keys)
            if (jsonCandidate.includes('"sources"') || jsonCandidate.includes('"sourceName"') || 
                jsonCandidate.includes('sources') || jsonCandidate.includes('sourceName')) {
              jsonObjects.push({ start: i, end: jsonEnd, text: jsonCandidate });
            }
          }
        }
      }
      
      // Try to parse each JSON object, starting with the largest
      jsonObjects.sort((a, b) => b.text.length - a.text.length);
      
      for (const obj of jsonObjects) {
        try {
          searchResult = JSON.parse(obj.text);
          console.log(`Successfully parsed JSON from response text (${obj.text.length} chars)`);
          break;
        } catch (parseError) {
          // Try next object
          continue;
        }
      }
      
      // If still no result, try regex-based extraction for JSON with "sources" key
      if (!searchResult) {
        const sourcesMatch = responseText.match(/\{[^}]*"sources"\s*:\s*\[[\s\S]*?\][^}]*\}/) ||
                            responseText.match(/\{[\s\S]*?"sources"[\s\S]*?\}/);
        if (sourcesMatch) {
          try {
            searchResult = JSON.parse(sourcesMatch[0]);
            console.log('Successfully parsed JSON using sources key match');
          } catch (e) {
            console.log('Alternative JSON parse also failed');
          }
        }
      }
    }
    
    // Strategy 3: Try to extract structured data from text if JSON parsing failed
    // Look for source patterns in the text response (handles numbered lists, bullet points, etc.)
    if (!searchResult && responseText.toLowerCase().includes('source')) {
      console.log('Attempting to extract sources from text response...');
      const sources: any[] = [];
      
      // Pattern 1: Numbered list format (e.g., "1. **Amazon** - UPC: ... Ingredients: ...")
      const numberedListPattern = /(\d+)\.\s*\*?\*?([^*\n]+?)\*?\*?[:\-]?\s*UPC:?\s*[^\n]*?Ingredients?:?\s*([^0-9*]+?)(?=\d+\.|$)/gi;
      let match;
      while ((match = numberedListPattern.exec(responseText)) !== null) {
        const sourceName = match[2].trim().replace(/\*\*/g, '').replace(/^Official Website$/i, '');
        const ingredientsText = match[3].trim().replace(/\.\s*$/, '');
        
        if (sourceName && ingredientsText && ingredientsText.length > 10) {
          // Try to extract URL if mentioned
          const urlMatch = responseText.substring(match.index).match(/https?:\/\/[^\s\)]+/);
          const url = urlMatch ? urlMatch[0] : '';
          
          sources.push({
            sourceName: sourceName,
            url: url || `https://www.${sourceName.toLowerCase().replace(/\s+/g, '').replace(/officialwebsite/i, '')}.com`,
            ingredientsText: ingredientsText
          });
        }
      }
      
      // Pattern 2: Named source format (e.g., "**Amazon** - Ingredients: ...")
      const namedSourcePatterns = [
        { name: 'Amazon', url: 'https://www.amazon.com' },
        { name: 'Applegate', url: 'https://www.applegate.com' },
        { name: 'Walmart', url: 'https://www.walmart.com' },
        { name: 'Target', url: 'https://www.target.com' },
        { name: 'Kroger', url: 'https://www.kroger.com' },
        { name: 'Safeway', url: 'https://www.safeway.com' },
        { name: 'Publix', url: 'https://www.publix.com' },
        { name: 'Whole Foods', url: 'https://www.wholefoodsmarket.com' },
        { name: 'Stop & Shop', url: 'https://www.stopandshop.com' }
      ];
      
      for (const retailer of namedSourcePatterns) {
        const pattern = new RegExp(`${retailer.name}[^]*?Ingredients?:?\\s*([^\\n]+(?:\\.\\s*[^\\n]+)*)`, 'i');
        const match = responseText.match(pattern);
        if (match && !sources.find(s => s.sourceName.toLowerCase().includes(retailer.name.toLowerCase()))) {
          const ingredientsText = match[1].trim();
          if (ingredientsText && ingredientsText.length > 10) {
            sources.push({
              sourceName: retailer.name,
              url: retailer.url,
              ingredientsText: ingredientsText
            });
          }
        }
      }
      
      if (sources.length > 0) {
        console.log(`Extracted ${sources.length} sources from text response`);
        searchResult = { sources };
      }
    }
    
    if (!searchResult) {
      console.log('Could not parse Claude response as JSON');
      console.log('Response preview:', responseText.substring(0, 1000));
      // Check if Claude returned an error/apology message
      if (responseText.toLowerCase().includes('apologize') || 
          responseText.toLowerCase().includes('unable to') ||
          responseText.toLowerCase().includes('cannot') ||
          responseText.toLowerCase().includes('error')) {
        console.log('Claude appears to have returned an error or apology message');
      }
      return [];
    }
    
    if (!searchResult.sources || searchResult.sources.length === 0) {
      console.log('No sources found from Claude');
      return [];
    }

    const mappedSources = searchResult.sources.map((s: any) => ({
      sourceName: s.sourceName,
      url: s.url,
      ingredientsText: s.ingredientsText || '',
      productName: productName
    }));
    
    console.log(`Mapped ${mappedSources.length} sources from Claude product name search`);
    const validSources = mappedSources.filter((s: IngredientSource) => {
      const text = s.ingredientsText || '';
      const trimmed = text.trim();
      
      // Filter out sources with error messages or placeholder text
      const errorIndicators = [
        'unable to extract',
        'ingredients section not fully displayed',
        'ingredients not available',
        'no ingredient list found',
        'could not find ingredients',
        'unable to access',
        'incomplete ingredient',
        'ingredient information not found'
      ];
      
      const hasErrorIndicator = errorIndicators.some(indicator => 
        trimmed.toLowerCase().includes(indicator)
      );
      
      // Check minimum length (at least 10 chars for a real ingredient list)
      const isLongEnough = trimmed.length > 10;
      
      // Check if it looks like an actual ingredient list (contains commas or common ingredients)
      const looksLikeIngredients = /[,;]|water|salt|sugar|oil|flour|milk|egg/.test(trimmed.toLowerCase());
      
      const isValid = isLongEnough && looksLikeIngredients && !hasErrorIndicator;
      
      if (!isValid) {
        if (hasErrorIndicator) {
          console.log(`Filtering out source ${s.sourceName}: error message detected`);
        } else if (!isLongEnough) {
          console.log(`Filtering out source ${s.sourceName}: ingredients too short (${trimmed.length} chars)`);
        } else if (!looksLikeIngredients) {
          console.log(`Filtering out source ${s.sourceName}: doesn't look like ingredient list`);
        }
      }
      
      return isValid;
    });
    
    console.log(`Returning ${validSources.length} valid sources from product name search (filtered ${mappedSources.length - validSources.length} invalid)`);
    return validSources;

  } catch (error) {
    console.log('Claude search error:', (error as any).message);
    return [];
  }
}

// Main barcode lookup function
async function lookupBarcode(barcode: string): Promise<BarcodeLookupResult> {
  console.log(`\n=== Barcode Lookup: ${barcode} ===`);

  // Step 1: FIRST, get exact product name and brand from Open Food Facts
  const { source: offSource, brand: brandName } = await fetchFromOpenFoodFacts(barcode);
  
  if (!offSource || !offSource.productName) {
    console.log('❌ Product not found in Open Food Facts');
    return {
      success: false,
      needsPhoto: true,
      message: 'Product not found in our databases. Please take a photo of the ingredient list.'
    };
  }
  
  const exactProductName = offSource.productName;
  console.log(`✅ Found exact product name from Open Food Facts: ${exactProductName}`);
  if (brandName) {
    console.log(`✅ Found brand from Open Food Facts: ${brandName}`);
  }
  
  // Step 2: Use the exact product name and brand from Open Food Facts to search with Claude
  let allSources: IngredientSource[] = [offSource]; // Start with Open Food Facts
  let productName = exactProductName;
  
  console.log(`Searching web with Claude using product name: "${exactProductName}"${brandName ? ` and brand: "${brandName}"` : ' (NO BRAND AVAILABLE)'}`);
  if (brandName) {
    console.log(`🚨 IMPORTANT: Search query MUST be "${brandName} ${exactProductName}" not just "${exactProductName}"`);
  }
  const claudeSources = await searchProductWithClaude(exactProductName, brandName, barcode);
  
  if (claudeSources && claudeSources.length > 0) {
    console.log(`✅ Found ${claudeSources.length} additional sources from Claude web search`);
    
    // Add all Claude sources - don't filter by ingredient similarity
    // (Different sources for the same product should all be kept for verification)
    // Only filter by domain later to avoid duplicate domains
    for (const newSource of claudeSources) {
      // Only skip if it's the exact same URL (same page)
      // Don't filter by ingredient text - different retailers are independent sources
      const isSameUrl = allSources.some(s => s.url === newSource.url);
      
      if (!isSameUrl) {
        allSources.push(newSource);
        console.log(`Added source: ${newSource.sourceName}`);
      } else {
        console.log(`Skipped source with duplicate URL: ${newSource.sourceName}`);
      }
    }
  } else {
    console.log('⚠️ Claude web search did not find additional sources');
  }

  console.log(`Found product: ${productName}`);
  console.log(`Total sources before URL validation: ${allSources.length}`);
  
  // Step 5: Validate URLs and filter out dead links
  allSources = await validateAndFilterSources(allSources);
  console.log(`Total sources after URL validation: ${allSources.length}`);
  
  // Step 5.5: Ensure we have exactly 5 valid sources - replace any that were filtered out
  const targetSourceCount = 5; // Target number of sources - defined here so it's accessible throughout
  
  if (allSources.length < targetSourceCount) {
    const needed = targetSourceCount - allSources.length;
    console.log(`⚠️ Only have ${allSources.length} valid sources, need ${needed} more. Searching for replacements...`);
    
    // Get existing domains to avoid duplicates
    const existingDomains = new Set<string>();
    allSources.forEach(source => {
      try {
        const url = new URL(source.url);
        const domain = url.hostname.replace(/^www\./, '');
        existingDomains.add(domain);
      } catch (e) {
        // Skip invalid URLs
      }
    });
    
    // Search for additional sources until we have 5
    let searchAttempts = 0;
    const maxSearchAttempts = 3; // Limit to avoid infinite loops
    
    while (allSources.length < targetSourceCount && searchAttempts < maxSearchAttempts) {
      searchAttempts++;
      console.log(`Search attempt ${searchAttempts} for replacement sources...`);
      
      const replacementSources = await searchProductWithClaude(productName, brandName, barcode);
      
      if (replacementSources.length > 0) {
        // Filter out duplicates and invalid sources
        for (const newSource of replacementSources) {
          if (allSources.length >= targetSourceCount) break;
          
          // Check if URL is already in our sources
          const isDuplicateUrl = allSources.some(s => s.url === newSource.url);
          if (isDuplicateUrl) {
            console.log(`Skipping duplicate URL: ${newSource.sourceName} (${newSource.url})`);
            continue;
          }
          
          // Check if domain is already represented
          try {
            const url = new URL(newSource.url);
            const domain = url.hostname.replace(/^www\./, '');
            if (existingDomains.has(domain)) {
              console.log(`Skipping duplicate domain: ${newSource.sourceName} (${domain})`);
              continue;
            }
          } catch (e) {
            // Invalid URL format, skip
            continue;
          }
          
          // Validate the URL
          const validationResult = await validateUrlWithReason(newSource.url);
          if (validationResult.isValid) {
            newSource.urlValid = true;
            allSources.push(newSource);
            try {
              const url = new URL(newSource.url);
              const domain = url.hostname.replace(/^www\./, '');
              existingDomains.add(domain);
            } catch (e) {
              // Skip domain tracking for invalid URLs
            }
            console.log(`✅ Added replacement source: ${newSource.sourceName} (${newSource.url})`);
          } else {
            console.log(`❌ Replacement source failed validation: ${newSource.sourceName} - ${validationResult.reason}`);
          }
        }
      }
      
      console.log(`After search attempt ${searchAttempts}: ${allSources.length}/${targetSourceCount} sources`);
    }
    
    if (allSources.length < targetSourceCount) {
      console.log(`⚠️ Could only find ${allSources.length} valid sources after ${searchAttempts} attempts (target: ${targetSourceCount})`);
    } else {
      console.log(`✅ Successfully reached ${allSources.length} valid sources`);
    }
  }
  
  // Step 6: Filter out duplicate domains - keep only one source per domain
  const domainCounts = new Map<string, number>();
  const sourcesByDomain = new Map<string, IngredientSource[]>();
  
  // Group sources by domain
  allSources.forEach(source => {
    try {
      const url = new URL(source.url);
      const domain = url.hostname.replace(/^www\./, ''); // Remove www. prefix
      if (!sourcesByDomain.has(domain)) {
        sourcesByDomain.set(domain, []);
      }
      sourcesByDomain.get(domain)!.push(source);
    } catch (e) {
      // Invalid URL - keep it but don't group
      console.log(`Invalid URL for domain filtering: ${source.url}`);
    }
  });
  
  // For each domain with multiple sources, keep only the first one
  const deduplicatedSources: IngredientSource[] = [];
  const removedDomains: string[] = [];
  
  allSources.forEach(source => {
    try {
      const url = new URL(source.url);
      const domain = url.hostname.replace(/^www\./, '');
      const domainSources = sourcesByDomain.get(domain) || [];
      
      if (domainSources.length > 1) {
        // Multiple sources from same domain - only keep the first one
        if (domainSources[0] === source) {
          deduplicatedSources.push(source);
          if (!removedDomains.includes(domain)) {
            removedDomains.push(domain);
            console.log(`Keeping first source from ${domain}, removing ${domainSources.length - 1} duplicate(s)`);
            domainSources.slice(1).forEach(removed => {
              console.log(`  - Removed duplicate: ${removed.sourceName} (${removed.url})`);
            });
          }
        }
        // Otherwise, skip this duplicate
      } else {
        // Only one source from this domain, keep it
        deduplicatedSources.push(source);
      }
    } catch (e) {
      // Invalid URL - keep it
      deduplicatedSources.push(source);
    }
  });
  
  const removedCount = allSources.length - deduplicatedSources.length;
  allSources = deduplicatedSources;
  console.log(`Total sources after domain deduplication: ${allSources.length} (removed ${removedCount} duplicates)`);
  
  // If domain deduplication removed sources and we're below 5, try to replace them
  if (allSources.length < targetSourceCount && removedCount > 0) {
    const stillNeeded = targetSourceCount - allSources.length;
    console.log(`⚠️ After domain deduplication, only have ${allSources.length} sources, need ${stillNeeded} more. Searching for replacements...`);
    
    // Get existing domains to avoid duplicates
    const existingDomainsAfterDedup = new Set<string>();
    allSources.forEach(source => {
      try {
        const url = new URL(source.url);
        const domain = url.hostname.replace(/^www\./, '');
        existingDomainsAfterDedup.add(domain);
      } catch (e) {
        // Skip invalid URLs
      }
    });
    
    // Search for additional sources until we have 5
    let searchAttempts = 0;
    const maxSearchAttempts = 2; // Limit to avoid too many API calls
    
    while (allSources.length < targetSourceCount && searchAttempts < maxSearchAttempts) {
      searchAttempts++;
      console.log(`Post-deduplication search attempt ${searchAttempts} for replacement sources...`);
      
      const replacementSources = await searchProductWithClaude(productName, brandName, barcode);
      
      if (replacementSources.length > 0) {
        // Filter out duplicates and invalid sources
        for (const newSource of replacementSources) {
          if (allSources.length >= targetSourceCount) break;
          
          // Check if URL is already in our sources
          const isDuplicateUrl = allSources.some(s => s.url === newSource.url);
          if (isDuplicateUrl) {
            console.log(`Skipping duplicate URL: ${newSource.sourceName} (${newSource.url})`);
            continue;
          }
          
          // Check if domain is already represented
          try {
            const url = new URL(newSource.url);
            const domain = url.hostname.replace(/^www\./, '');
            if (existingDomainsAfterDedup.has(domain)) {
              console.log(`Skipping duplicate domain: ${newSource.sourceName} (${domain})`);
              continue;
            }
          } catch (e) {
            // Invalid URL format, skip
            continue;
          }
          
          // Validate the URL
          const validationResult = await validateUrlWithReason(newSource.url);
          if (validationResult.isValid) {
            newSource.urlValid = true;
            allSources.push(newSource);
            try {
              const url = new URL(newSource.url);
              const domain = url.hostname.replace(/^www\./, '');
              existingDomainsAfterDedup.add(domain);
            } catch (e) {
              // Skip domain tracking for invalid URLs
            }
            console.log(`✅ Added post-deduplication replacement source: ${newSource.sourceName} (${newSource.url})`);
          } else {
            console.log(`❌ Replacement source failed validation: ${newSource.sourceName} - ${validationResult.reason}`);
          }
        }
      }
      
      console.log(`After post-deduplication search attempt ${searchAttempts}: ${allSources.length}/${targetSourceCount} sources`);
    }
    
    if (allSources.length < targetSourceCount) {
      console.log(`⚠️ Could only find ${allSources.length} valid sources after post-deduplication searches (target: ${targetSourceCount})`);
    } else {
      console.log(`✅ Successfully reached ${allSources.length} valid sources after post-deduplication replacement`);
    }
  }
  
  console.log('All sources:', allSources.map(s => ({ name: s.sourceName, url: s.url, urlValid: s.urlValid, ingredientsLength: s.ingredientsText?.length || 0 })));

  // Step 6: Analyze consistency of sources
  const groups = groupSourcesBySimilarity(allSources);
  const largestGroupSize = Math.max(...Array.from(groups.values()).map(g => g.length));
  const differentCount = groups.size;

  // Collect differences (one example from each group)
  const differences = Array.from(groups.entries()).map(([ingredientsText, group]) => ({
    sourceName: group[0].sourceName,
    ingredientsText: ingredientsText,
    groupSize: group.length
  }));

  console.log(`Consistency analysis: ${differentCount} different ingredient lists, largest group has ${largestGroupSize} sources`);
  console.log('Differences:', differences.map(d => ({ source: d.sourceName, groupSize: d.groupSize })));

  // Get product image from Open Food Facts (first source if available)
  const productImage = allSources.length > 0 && allSources[0].productImage 
    ? allSources[0].productImage 
    : '';

  // Step 7: Decision logic based on number of sources
  if (allSources.length >= 3 && largestGroupSize >= 3) {
    // At least 3 sources and they all match - SUCCESS
    const winningGroup = Array.from(groups.entries()).find(([_, group]) => group.length === largestGroupSize);
    const consensusIngredients = winningGroup ? winningGroup[0] : allSources[0].ingredientsText;
    return {
      success: true,
      needsPhoto: false,
      productName: productName,
      ingredientList: consensusIngredients,
      sources: allSources,
      productImage: productImage,
      message: `Successfully verified ingredient list from ${allSources.length} sources.`,
      consistencyInfo: {
        totalSources: allSources.length,
        matchingSources: largestGroupSize,
        differentSources: differentCount,
        differences: differences
      }
    };
  } else if (allSources.length >= 2 && largestGroupSize >= 2) {
    // At least 2 sources and they match - SUCCESS
    const winningGroup = Array.from(groups.entries()).find(([_, group]) => group.length === largestGroupSize);
    const consensusIngredients = winningGroup ? winningGroup[0] : allSources[0].ingredientsText;
    return {
      success: true,
      needsPhoto: false,
      productName: productName,
      ingredientList: consensusIngredients,
      sources: allSources,
      productImage: productImage,
      message: `Successfully verified ingredient list from ${allSources.length} sources.`,
      consistencyInfo: {
        totalSources: allSources.length,
        matchingSources: largestGroupSize,
        differentSources: differentCount,
        differences: differences
      }
    };
  } else if (allSources.length >= 3 && largestGroupSize === 2 && differentCount === 2) {
    // 3 sources: 2 match, 1 is different - try to get more sources
    console.log('2 sources match, 1 is different. Trying to fetch additional sources...');
    
    // Fetch 2 more sources using Claude with product name and barcode
    const additionalSources = await searchProductWithClaude(productName, brandName, barcode);
    
    if (additionalSources.length >= 1) {
      // Add new sources to the existing ones
      const combinedSources = [...allSources];
      for (const newSource of additionalSources) {
        const isDuplicate = combinedSources.some(s => 
          areIngredientsSimilar(s.ingredientsText, newSource.ingredientsText)
        );
        if (!isDuplicate) {
          combinedSources.push(newSource);
        }
      }
      
      // Re-evaluate with combined sources
      const newGroups = groupSourcesBySimilarity(combinedSources);
      const newLargestGroupSize = Math.max(...Array.from(newGroups.values()).map(g => g.length));
      const newDifferentCount = newGroups.size;
      
      if (newLargestGroupSize >= 3) {
        const winningGroup = Array.from(newGroups.entries()).find(([_, group]) => group.length >= 3);
        const consensusIngredients = winningGroup ? winningGroup[0] : combinedSources[0].ingredientsText;
        
        return {
          success: true,
          needsPhoto: false,
          productName: productName,
          ingredientList: consensusIngredients,
          sources: combinedSources,
          productImage: productImage,
          message: `Successfully verified ingredient list from ${combinedSources.length} sources.`,
          consistencyInfo: {
            totalSources: combinedSources.length,
            matchingSources: newLargestGroupSize,
            differentSources: newDifferentCount
          }
        };
      }
    }

    // If we still don't have enough consensus, return what we have
    const winningGroup = Array.from(groups.entries()).find(([_, group]) => group.length === largestGroupSize);
    const consensusIngredients = winningGroup ? winningGroup[0] : allSources[0].ingredientsText;
    return {
      success: true,
      needsPhoto: false,
      productName: productName,
      ingredientList: consensusIngredients,
      sources: allSources,
      productImage: productImage,
      message: `Found ${allSources.length} sources. ${largestGroupSize} sources agree on ingredients.`,
      consistencyInfo: {
        totalSources: allSources.length,
        matchingSources: largestGroupSize,
        differentSources: differentCount,
        differences: differences
      }
    };
  } else {
    // Single source or sources don't match well - return with what we have
    const consensusIngredients = allSources[0].ingredientsText;
    return {
      success: true,
      needsPhoto: false,
      productName: productName,
      ingredientList: consensusIngredients,
      sources: allSources,
      productImage: productImage,
      message: allSources.length === 1 
        ? 'Found ingredient information from 1 source.' 
        : `Found ${allSources.length} sources with different ingredient lists. Using the first source.`,
      consistencyInfo: {
        totalSources: allSources.length,
        matchingSources: largestGroupSize,
        differentSources: differentCount,
        differences: differences
      }
    };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    let requestData;
    try {
      requestData = await req.json();
    } catch (parseError) {
      console.error('Failed to parse request JSON:', parseError);
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const { barcode } = requestData;

    if (!barcode || !barcode.trim()) {
      return new Response(
        JSON.stringify({ error: 'Barcode is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Add timeout handling (2 minutes max)
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Request timeout - lookup took too long')), 120000)
    );

    const lookupPromise = lookupBarcode(barcode.trim()).catch(err => {
      console.error('Error in lookupBarcode function:', err);
      throw err;
    });

    const result = await Promise.race([lookupPromise, timeoutPromise]);

    // Ensure result is valid
    if (!result || typeof result !== 'object') {
      throw new Error('Lookup returned invalid result');
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in lookup-barcode:', error);
    console.error('Error stack:', error.stack);
    
    // Ensure we always return a valid JSON response
    try {
      return new Response(
        JSON.stringify({
          success: false,
          needsPhoto: true,
          message: error.message?.includes('timeout') 
            ? 'Lookup took too long. Please try again or take a photo of the ingredient list.'
            : `Error: ${error.message || 'Unknown error'}. Please take a photo of the ingredient list.`
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    } catch (jsonError) {
      // Fallback if JSON.stringify fails
      return new Response(
        JSON.stringify({
          success: false,
          needsPhoto: true,
          message: 'An error occurred. Please take a photo of the ingredient list.'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    }
  }
});
