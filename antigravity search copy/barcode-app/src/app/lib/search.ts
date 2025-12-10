import axios from 'axios';
import * as cheerio from 'cheerio';

async function getProductDetailsFromOFF(barcode: string): Promise<{ name: string; brand: string } | null> {
    try {
        const apiUrl = `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`;
        const { data } = await axios.get(apiUrl, { timeout: 5000 });
        if (data.status === 1 && data.product) {
            return {
                name: data.product.product_name || '',
                brand: data.product.brands || ''
            };
        }
    } catch (e) {
        // console.error("Failed to get details from OFF:", e);
    }
    return null;
}

async function getProductDetailsFromGoUPC(barcode: string): Promise<{ name: string; brand: string } | null> {
    try {
        const url = `https://go-upc.com/search?q=${barcode}`;
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 5000
        });
        const $ = cheerio.load(data);
        const name = $('h1.product-name').text().trim();
        let brand = '';
        $('.metadata-label').each((i, el) => {
            if ($(el).text().includes('Brand')) {
                brand = $(el).next().text().trim();
            }
        });

        if (name && !name.includes("Not found")) return { name, brand };
    } catch (e) {
        // console.error("GoUPC failed", e);
    }
    return null;
}

async function getProductDetailsFromBarcodeLookup(barcode: string): Promise<{ name: string; brand: string } | null> {
    try {
        const url = `https://www.barcodelookup.com/${barcode}`;
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 5000
        });
        const $ = cheerio.load(data);
        const name = $('h4').first().text().trim();
        let brand = '';
        $('.product-details-label').each((i, el) => {
            if ($(el).text().includes('Brand')) {
                brand = $(el).next().text().trim();
            }
        });

        if (name) return { name, brand };
    } catch (e) {
        // console.error("BarcodeLookup failed", e);
    }
    return null;
}

async function performSearchYahoo(query: string): Promise<string[]> {
    console.log(`Performing Yahoo search for: ${query}`);
    try {
        const searchUrl = `https://search.yahoo.com/search?p=${encodeURIComponent(query)}`;
        const { data } = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5'
            },
            timeout: 10000
        });

        const $ = cheerio.load(data);
        const links: string[] = [];

        $('.algo .compTitle a').each((i, el) => {
            let href = $(el).attr('href');
            if (href && href.includes('/RU=')) {
                const match = href.match(/\/RU=([^/]+)/);
                if (match && match[1]) href = decodeURIComponent(match[1]);
            }
            if (href && !href.includes('yahoo.com') && !href.includes('google.com')) {
                links.push(href);
            }
        });
        return links;
    } catch (error) {
        console.error(`Yahoo search failed:`, error);
        return [];
    }
}

async function performSearchBing(query: string): Promise<string[]> {
    console.log(`Performing Bing search for: ${query}`);
    try {
        const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
        const { data } = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
            },
            timeout: 10000
        });

        const $ = cheerio.load(data);
        const links: string[] = [];

        $('#b_results .b_algo h2 a').each((i, el) => {
            const href = $(el).attr('href');
            if (href && !href.includes('bing.com') && !href.includes('microsoft.com')) {
                links.push(href);
            }
        });
        return links;
    } catch (error) {
        console.error(`Bing search failed:`, error);
        return [];
    }
}

async function performSearchGoogle(query: string): Promise<string[]> {
    console.log(`Performing Google search for: ${query}`);
    try {
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
        const { data } = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
            },
            timeout: 10000
        });

        const $ = cheerio.load(data);
        const links: string[] = [];

        $('h3').each((i, el) => {
            const parent = $(el).parent();
            const href = parent.attr('href');
            if (href && href.startsWith('http') && !href.includes('google.com')) {
                links.push(href);
            }
        });
        return links;
    } catch (error) {
        console.error(`Google search failed:`, error);
        return [];
    }
}

async function performSearchDDGLite(query: string): Promise<string[]> {
    console.log(`Performing DDG Lite search for: ${query}`);
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
        const links: string[] = [];

        $('.result-link').each((i, el) => {
            const href = $(el).attr('href');
            if (href && href.startsWith('http')) {
                links.push(href);
            }
        });
        return links;
    } catch (error) {
        console.error(`DDG Lite search failed:`, error);
        return [];
    }
}

export async function searchWeb(barcode: string): Promise<{ urls: string[]; product: { name: string; brand?: string } | null }> {
    const allLinks = new Set<string>();
    const searchPromises: Promise<string[]>[] = [];

    // 1. Try to get product name and brand from multiple sources
    const [offDetails, goUpcDetails, blDetails] = await Promise.all([
        getProductDetailsFromOFF(barcode),
        getProductDetailsFromGoUPC(barcode),
        getProductDetailsFromBarcodeLookup(barcode)
    ]);

    const productDetails = offDetails || goUpcDetails || blDetails;
    const productName = productDetails?.name;
    const productBrand = productDetails?.brand;

    console.log(`[Search] Identified: ${productName} (${productBrand}) [Source: ${offDetails ? 'OFF' : goUpcDetails ? 'GoUPC' : blDetails ? 'BarcodeLookup' : 'None'}]`);

    // 2. Perform Searches
    // A. Barcode Search (Always do this)
    searchPromises.push(performSearchYahoo(`${barcode} ingredients`));
    searchPromises.push(performSearchBing(`${barcode} ingredients`));
    searchPromises.push(performSearchBing(`${barcode} ingredients`));
    searchPromises.push(performSearchGoogle(`${barcode} ingredients`));
    searchPromises.push(performSearchDDGLite(`${barcode} ingredients`));

    // B. Name Search (if available)
    if (productName) {
        let query = productName;
        if (productBrand) {
            // Clean brand: take first part before comma, remove Inc/LLC, trim
            const cleanBrand = productBrand.split(',')[0].replace(/\s+(inc|llc|ltd|corp)\.?$/i, '').trim();
            query = `${cleanBrand} ${productName}`;
        }

        searchPromises.push(performSearchYahoo(`${query} ingredients`));
        searchPromises.push(performSearchBing(`${query} ingredients`));
        searchPromises.push(performSearchGoogle(`${query} ingredients`));
        searchPromises.push(performSearchDDGLite(`${query} ingredients`));
    } else {
        // Fallback if no name: try broader barcode searches
        searchPromises.push(performSearchYahoo(`${barcode} food product`));
    }

    // Wait for all searches
    const results = await Promise.all(searchPromises);
    results.flat().forEach(link => allLinks.add(link));

    const uniqueLinks = Array.from(allLinks);
    console.log(`Total raw links found: ${uniqueLinks.length}`);

    // 3. Fallbacks (Direct URL construction)
    const directLookups = [
        `https://world.openfoodfacts.org/product/${barcode}`,
        `https://www.upcitemdb.com/upc/${barcode}`,
        `https://www.barcodelookup.com/${barcode}`,
        `https://go-upc.com/search?q=${barcode}`,
        `https://www.itemmaster.com/item/${barcode}`,
        `https://www.foodrepo.org/en/products/${barcode}`,
        `https://world.openfoodfacts.net/product/${barcode}`,
        `https://www.ean-search.org/perl/ean-search.pl?q=${barcode}`,
        `https://www.buycott.com/upc/${barcode}`,
        `https://www.digit-eyes.com/cgi-bin/digiteyes.cgi?upc=${barcode}`
    ];

    for (const site of directLookups) {
        if (!uniqueLinks.includes(site)) {
            uniqueLinks.push(site);
        }
    }

    // Return a larger pool to ensure we survive filtering
    return {
        urls: uniqueLinks.slice(0, 60),
        product: productName ? { name: productName, brand: productBrand } : null
    };
}
