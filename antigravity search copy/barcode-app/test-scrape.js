const axios = require('axios');
const cheerio = require('cheerio');

// Mock search functions (simplified versions of search.ts)
async function performSearchYahoo(query) {
    console.log(`\n--- Searching Yahoo for: ${query} ---`);
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
    } catch (e) { console.error("Yahoo failed", e.message); return []; }
}

async function performSearchBing(query) {
    console.log(`\n--- Searching Bing for: ${query} ---`);
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
    } catch (e) { console.error("Bing failed", e.message); return []; }
}

async function performSearchGoogle(query) {
    console.log(`\n--- Searching Google for: ${query} ---`);
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
    } catch (e) { console.error("Google failed", e.message); return []; }
}

async function scrapeUrls(urls) {
    console.log(`\n--- Scraping ${urls.length} URLs ---`);
    const results = [];
    for (const url of urls) {
        try {
            const { data } = await axios.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
                timeout: 5000
            });
            const $ = cheerio.load(data);
            const title = $('title').text().trim() || $('h1').first().text().trim() || '';
            const content = $('body').text().replace(/\s+/g, ' ').substring(0, 1000);
            results.push({ url, title, content });
            console.log(`Scraped: ${url.substring(0, 40)}... | Title: ${title}`);
        } catch (e) {
            console.log(`Failed: ${url.substring(0, 40)}... (${e.message})`);
        }
    }
    return results;
}

async function performSearchDDGLite(query) {
    console.log(`\n--- Searching DDG Lite for: ${query} ---`);
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
    } catch (e) { console.error("DDG Lite failed", e.message); return []; }
}

async function run() {
    const barcode = '070662230015'; // Primal Kitchen Buffalo Sauce
    console.log(`\n=== DEBUGGING BARCODE: ${barcode} ===`);

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

    // Helper: Filter Data (Returns valid AND rejected)
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

    // Initial Filter
    if (bestTitle) {
        console.log(`Extracted Product Name: "${bestTitle}"`);
        const filtered = filterData(scrapedData, bestTitle);
        scrapedData = filtered.valid;
        rejectedData = [...rejectedData, ...filtered.rejected];
    }

    let uniqueData = getUniqueDomains(scrapedData);
    console.log(`Initial valid sources found: ${uniqueData.length}`);

    // 3. Retry Loop
    if (uniqueData.length < 5 && bestTitle) {
        const strategies = [
            bestTitle,
            `${bestTitle} ingredients`,
            `${bestTitle} nutrition`,
            `${bestTitle} buy`,
            `${bestTitle} label`,
            `${bestTitle} facts`,
            `${bestTitle} grocery`
        ];

        // If title is long, try a shorter version
        const words = bestTitle.split(' ');
        if (words.length > 4) {
            const shortTitle = words.slice(0, 4).join(' ');
            strategies.push(shortTitle);
            strategies.push(`${shortTitle} ingredients`);
        }

        const visitedUrls = new Set(urls);

        for (const query of strategies) {
            if (uniqueData.length >= 5) break;

            console.log(`\nNot enough sources (${uniqueData.length}/5). Trying strategy: "${query}"...`);

            let newUrls = [];
            newUrls.push(...await performSearchYahoo(query));
            newUrls.push(...await performSearchBing(query));
            newUrls.push(...await performSearchGoogle(query));
            newUrls.push(...await performSearchDDGLite(query));

            const freshUrls = newUrls.filter(u => !visitedUrls.has(u));

            if (freshUrls.length > 0) {
                freshUrls.forEach(u => visitedUrls.add(u));
                console.log(`Scraping ${freshUrls.length} new URLs...`);

                let newScraped = await scrapeUrls(freshUrls);
                const filtered = filterData(newScraped, bestTitle);

                scrapedData = [...scrapedData, ...filtered.valid];
                rejectedData = [...rejectedData, ...filtered.rejected];
                uniqueData = getUniqueDomains(scrapedData);
                console.log(`Current unique count: ${uniqueData.length}`);
            } else {
                console.log("No new URLs found for this strategy.");
            }
        }
    }

    // Fallback: If still < 5, use best rejected items
    if (uniqueData.length < 5 && rejectedData.length > 0) {
        console.log(`Still only ${uniqueData.length} sources. Relaxing filter to fill gaps...`);

        // Sort rejected by relevance
        rejectedData.sort((a, b) => {
            if (a.hasBrand && !b.hasBrand) return -1;
            if (!a.hasBrand && b.hasBrand) return 1;
            return b.matchCount - a.matchCount;
        });

        const uniqueRejected = getUniqueDomains(rejectedData);

        for (const d of uniqueRejected) {
            if (uniqueData.length >= 5) break;
            const domain = new URL(d.url).hostname.replace('www.', '');
            const exists = uniqueData.some(u => new URL(u.url).hostname.replace('www.', '') === domain);

            if (!exists) {
                console.log(`Adding relaxed source: ${d.title}`);
                uniqueData.push(d);
            }
        }
    }

    console.log(`\nFinal Unique Sources: ${uniqueData.length}`);
    uniqueData.forEach(d => console.log(`- ${d.title} (${d.url})`));
}

run();
