const axios = require('axios');
const cheerio = require('cheerio');

// Mock search functions (simplified versions of search.ts)
async function performSearchYahoo(query) {
    // ... (same as before)
    try {
        const { data } = await axios.get(`https://search.yahoo.com/search?p=${encodeURIComponent(query)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        });
        const $ = cheerio.load(data);
        const links = [];
        $('.algo .compTitle a').each((i, el) => {
            let href = $(el).attr('href');
            if (href && href.includes('/RU=')) {
                const match = href.match(/\/RU=([^/]+)/);
                if (match && match[1]) href = decodeURIComponent(match[1]);
            }
            if (href && !href.includes('yahoo.com')) links.push(href);
        });
        return links;
    } catch (e) { return []; }
}

async function performSearchBing(query) {
    try {
        const { data } = await axios.get(`https://www.bing.com/search?q=${encodeURIComponent(query)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        });
        const $ = cheerio.load(data);
        const links = [];
        $('#b_results .b_algo h2 a').each((i, el) => {
            const href = $(el).attr('href');
            if (href && !href.includes('bing.com')) links.push(href);
        });
        return links;
    } catch (e) { return []; }
}

async function performSearchGoogle(query) {
    try {
        const { data } = await axios.get(`https://www.google.com/search?q=${encodeURIComponent(query)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        });
        const $ = cheerio.load(data);
        const links = [];
        $('h3').each((i, el) => {
            const href = $(el).parent().attr('href');
            if (href && href.startsWith('http') && !href.includes('google.com')) links.push(href);
        });
        return links;
    } catch (e) { return []; }
}

async function performSearchDDGLite(query) {
    try {
        const { data } = await axios.post(`https://lite.duckduckgo.com/lite/`,
            `q=${encodeURIComponent(query)}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            timeout: 10000
        });

        const $ = cheerio.load(data);
        const links = [];
        $('.result-link').each((i, el) => {
            const href = $(el).attr('href');
            if (href && href.startsWith('http')) links.push(href);
        });
        return links;
    } catch (e) { return []; }
}

// EXACT COPY OF scrapeUrls FROM src/app/lib/scrape.ts
async function scrapeUrls(urls) {
    console.log(`\n--- Scraping ${urls.length} URLs (Parallel) ---`);
    const results = await Promise.all(
        urls.map(async (url) => {
            try {
                // Special handling for OpenFoodFacts to use their JSON API
                if (url.includes('openfoodfacts.org')) {
                    const barcodeMatch = url.match(/product\/(\d+)/);
                    if (barcodeMatch) {
                        const barcode = barcodeMatch[1];
                        const apiUrl = `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`;
                        try {
                            const { data } = await axios.get(apiUrl);
                            if (data.status === 1 && data.product) {
                                const product = data.product;
                                // Check multiple fields for ingredients
                                const ingredients = product.ingredients_text ||
                                    product.ingredients_text_en ||
                                    product.ingredients_text_with_allergens ||
                                    "";

                                if (ingredients) {
                                    const content = `
                                        Product Name: ${product.product_name || "Unknown"}
                                        Ingredients: ${ingredients}
                                        Allergens: ${product.allergens || "None listed"}
                                        Brands: ${product.brands || "Unknown"}
                                    `;
                                    return { url, content, title: product.product_name || "Unknown" };
                                }
                            }
                        } catch (e) {
                            console.error("OFF API failed, falling back to HTML", e);
                        }
                    }
                }

                // General scraping for other sites
                const { data } = await axios.get(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Cache-Control': 'no-cache',
                        'Pragma': 'no-cache',
                        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                        'Sec-Ch-Ua-Mobile': '?0',
                        'Sec-Ch-Ua-Platform': '"Windows"',
                        'Sec-Fetch-Dest': 'document',
                        'Sec-Fetch-Mode': 'navigate',
                        'Sec-Fetch-Site': 'none',
                        'Sec-Fetch-User': '?1',
                        'Upgrade-Insecure-Requests': '1'
                    },
                    timeout: 10000 // Increased timeout
                });

                const $ = cheerio.load(data);

                // Remove scripts, styles, and irrelevant tags
                $('script').remove();
                $('style').remove();
                $('nav').remove();
                $('footer').remove();
                $('header').remove();
                $('iframe').remove();
                $('noscript').remove();
                $('svg').remove();
                $('img').remove();

                // Try to find specific ingredient containers first (common patterns)
                let content = '';
                const ingredientSelectors = [
                    '.ingredients', '#ingredients', '[itemprop="ingredients"]',
                    '.product-ingredients', '.ingredients-list',
                    '#ingredients-list', '.field--name-field-ingredients'
                ];

                for (const selector of ingredientSelectors) {
                    const text = $(selector).text().trim();
                    if (text.length > 20) {
                        content += "Found Ingredients Section: " + text + "\n";
                    }
                }

                // Append full body text as fallback/context
                $('br').replaceWith('\n');
                $('p, div, h1, h2, h3, h4, h5, h6, li, tr').after('\n');

                const cleanText = $('body').text()
                    .replace(/[ \t]+/g, ' ') // Collapse spaces/tabs but keep newlines
                    .replace(/\n\s*\n/g, '\n') // Remove multiple empty lines
                    .trim();

                content += "\nFull Page Text: " + cleanText.substring(0, 20000);

                if (content.length < 50) {
                    console.log(`Warning: Scraped content for ${url} is very short (${content.length} chars)`);
                }
                // Extract title
                const title = $('title').text().trim() || $('h1').first().text().trim() || '';

                console.log(`Scraped: ${url.substring(0, 40)}... | Title: ${title} | Content Len: ${content.length}`);

                return {
                    url,
                    content: content,
                    title
                };
            } catch (error) {
                console.error(`Failed to scrape ${url}:`, error.message);
                return null;
            }
        })
    );

    return results.filter((result) => result !== null && result.content.length > 0);
}

async function run() {
    const barcode = '074117000147';
    console.log(`\n=== DEBUGGING BARCODE: ${barcode} (Exact Scrape Logic) ===`);

    // 1. Initial Search
    let urls = [];
    urls.push(...await performSearchYahoo(`${barcode} ingredients`));
    urls.push(...await performSearchBing(`${barcode} ingredients`));
    urls.push(...await performSearchGoogle(`${barcode} ingredients`));
    urls.push(...await performSearchDDGLite(`${barcode} ingredients`));

    // Fallbacks
    urls.push(`https://world.openfoodfacts.org/product/${barcode}`);
    urls.push(`https://www.upcitemdb.com/upc/${barcode}`);
    urls.push(`https://www.buycott.com/upc/${barcode}`);
    urls.push(`https://www.digit-eyes.com/cgi-bin/digiteyes.cgi?upc=${barcode}`);

    urls = [...new Set(urls)];
    console.log(`\nFound ${urls.length} initial URLs.`);

    // 2. Initial Scrape
    let scrapedData = await scrapeUrls(urls);
    console.log(`\nScraped ${scrapedData.length} valid pages.`);

    let bestTitle = "";

    // Helper: Extract Best Title
    const extractBestTitle = (data) => {
        const titleBlacklist = ["nutrition facts", "calories in", "upc lookup", "barcode lookup", "search results", "item", "product", "food"];
        for (const d of data) {
            if (d.title && d.title.length > 5 && !d.title.includes("Access Denied") && !d.title.includes("404")) {
                const titleLower = d.title.toLowerCase();
                if (titleBlacklist.some(term => titleLower.includes(term))) continue;

                let cleanTitle = d.title
                    .replace(/UPC\s*\d+/i, '')
                    .replace(/Barcode\s*lookup/i, '')
                    .replace(/\|\s*.*$/, '')
                    .replace(/-\s*.*$/, '')
                    .replace(/Nutrition\s*Facts/i, '')
                    .trim();

                if (cleanTitle.length > 5) return cleanTitle;
            }
        }
        return "";
    };

    bestTitle = extractBestTitle(scrapedData);
    console.log(`\nExtracted Best Title: "${bestTitle}"`);

    // Helper: Filter Data
    const filterData = (data, title) => {
        const result = { valid: [], rejected: [] };
        if (!title) {
            result.valid = data;
            return result;
        }

        const brandBlacklist = ["nutrition", "calories", "facts", "the", "a", "an", "food", "product", "item", "search", "results", "shop", "buy", "online"];
        const keywords = title.toLowerCase().split(' ').filter(w => w.length > 2 && !brandBlacklist.includes(w));

        if (keywords.length === 0) {
            result.valid = data;
            return result;
        }

        const brand = keywords[0].replace(/[^\w\s]/g, '');
        console.log(`Filtering based on: ${brand} [${keywords.join(', ')}]`);

        data.forEach(d => {
            if (!d.title) return;
            const titleLower = d.title.toLowerCase().replace(/[^\w\s]/g, '');
            const hasBrand = titleLower.includes(brand);
            const matchCount = keywords.reduce((acc, k) => {
                const kClean = k.replace(/[^\w\s]/g, '');
                return titleLower.includes(kClean) ? acc + 1 : acc;
            }, 0);

            // Strict check
            const isRelevant = hasBrand && (matchCount >= 2 || keywords.length < 3);

            console.log(`Checking: ${d.title} | Has Brand: ${hasBrand} | Match Count: ${matchCount} | Relevant: ${isRelevant}`);

            if (isRelevant) {
                result.valid.push(d);
            } else {
                d.matchCount = matchCount;
                d.hasBrand = hasBrand;
                result.rejected.push(d);
            }
        });
        return result;
    };

    let rejectedData = [];

    // Initial Filter
    if (bestTitle) {
        const filtered = filterData(scrapedData, bestTitle);
        scrapedData = filtered.valid;
        rejectedData = [...rejectedData, ...filtered.rejected];
    }

    // Helper: Deduplicate Domains
    const getUniqueDomains = (data) => {
        const unique = [];
        const seen = new Set();
        for (const d of data) {
            try {
                const domain = new URL(d.url).hostname.replace('www.', '');
                if (!seen.has(domain)) {
                    seen.add(domain);
                    unique.push(d);
                }
            } catch (e) { unique.push(d); }
        }
        return unique;
    };

    let uniqueData = getUniqueDomains(scrapedData);
    console.log(`Initial valid sources found: ${uniqueData.length}`);

    // ... (Skipping retry loop for brevity as we just want to see if initial scrape fails) ...

    console.log(`\nFinal Unique Sources: ${uniqueData.length}`);
    uniqueData.forEach(d => console.log(`- ${d.title} (${d.url})`));
}

run();
