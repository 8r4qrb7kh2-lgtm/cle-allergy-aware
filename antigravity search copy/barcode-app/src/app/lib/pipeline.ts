import { searchWeb } from './search';
import { scrapeUrls } from './scrape';

export interface ScrapedSource {
    url: string;
    content: string;
    title: string;
    matchCount?: number;
    hasBrand?: boolean;
}

// Helper: Extract Best Title
function extractBestTitle(data: ScrapedSource[]): string {
    const titleBlacklist = [
        "nutrition facts", "calories in", "upc lookup", "barcode lookup",
        "search results", "item", "product", "food", "amazon.com",
        "walmart.com", "target.com", "access denied", "captcha",
        "verify you are human", "page not found", "404", "error",
        "log in", "sign in", "register", "create account", "cart", "checkout",
        "ndc lookup", "drug codes", "medication", "pharmacy",
        "incidecoder", "skinsort", "cosdna", "ewg", "skincarisma"
    ];

    for (const d of data) {
        if (d.title && d.title.length > 5) {
            const titleLower = d.title.toLowerCase();
            if (titleBlacklist.some(term => titleLower.includes(term))) continue;

            let cleanTitle = d.title
                .replace(/UPC\s*\d+/i, '')
                .replace(/Barcode\s*lookup/i, '')
                .replace(/\|\s*.*$/, '') // Remove pipe and everything after (e.g. " | Amazon.com")
                .replace(/-\s*.*$/, '')  // Remove dash and everything after
                .replace(/Nutrition\s*Facts/i, '')
                .trim();

            if (cleanTitle.length > 5) return cleanTitle;
        }
    }
    return "";
}

// Helper: Filter Data
function filterData(data: ScrapedSource[], title: string) {
    const result = { valid: [] as ScrapedSource[], rejected: [] as ScrapedSource[] };
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
}

// Helper: Deduplicate Domains
function getUniqueDomains(data: ScrapedSource[]) {
    const unique: ScrapedSource[] = [];
    const seen = new Set<string>();
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
}

export async function findAndScrapeSources(
    barcode: string,
    existingUrls: Set<string>,
    targetCount: number,
    onStatus: (msg: string) => void,
    knownTitle?: string // New optional parameter
): Promise<{ sources: ScrapedSource[], title: string }> {

    let urls: string[] = [];
    let bestTitle = knownTitle || "";
    let scrapedData: ScrapedSource[] = [];

    // 1. Initial Search (Only if we don't have a title or just to be safe)
    // Even if we have a title, searching the barcode might yield new results we missed?
    // But primarily we want to skip to broad search if we already have a title and barcode search is exhausted.

    const searchResult = await searchWeb(barcode);
    urls = searchResult.urls.filter(u => !existingUrls.has(u));

    if (urls.length > 0) {
        onStatus(`Found ${urls.length} new candidates via barcode. Scraping...`);
        urls.forEach(u => existingUrls.add(u));

        const newScraped = await scrapeUrls(urls);
        scrapedData = [...scrapedData, ...newScraped];

        if (!bestTitle) {
            bestTitle = extractBestTitle(scrapedData);
            if (!bestTitle && searchResult.product?.name) {
                bestTitle = searchResult.product.name;
            }
        }
    } else if (!bestTitle) {
        // No new URLs and no known title -> We are stuck.
        return { sources: [], title: "" };
    }

    let rejectedData: ScrapedSource[] = [];

    // 3. Filter (using whatever data we have so far)
    if (bestTitle) {
        if (!knownTitle) onStatus(`Identified product: "${bestTitle}"`);
        const filtered = filterData(scrapedData, bestTitle);
        scrapedData = filtered.valid;
        rejectedData = filtered.rejected;
    }

    let uniqueData = getUniqueDomains(scrapedData);

    // 4. Retry Loop (Broad Search) - NOW GUARANTEED TO RUN IF WE HAVE A TITLE
    if (uniqueData.length < targetCount && bestTitle) {
        const strategies = [
            bestTitle,
            `${bestTitle} ingredients`,
            `${bestTitle} nutrition facts`,
            `${bestTitle} label`,
            `${bestTitle} ingredients list`,
            `${bestTitle} grocery`,
            `buy ${bestTitle} online`,
            `${bestTitle} product details`
        ];

        const words = bestTitle.split(' ');
        if (words.length > 3) {
            const shortTitle = words.slice(0, 3).join(' ');
            strategies.push(`${shortTitle} ingredients`);
            strategies.push(`${shortTitle} nutrition`);
        }

        for (const query of strategies) {
            if (uniqueData.length >= targetCount) break;

            onStatus(`Need more sources (${uniqueData.length}/${targetCount}). Searching for "${query}"...`);
            const res = await searchWeb(query);
            const freshUrls = res.urls.filter(u => !existingUrls.has(u));

            if (freshUrls.length > 0) {
                freshUrls.forEach(u => existingUrls.add(u));
                let newScraped = await scrapeUrls(freshUrls);
                const filtered = filterData(newScraped, bestTitle);

                scrapedData = [...scrapedData, ...filtered.valid];
                rejectedData = [...rejectedData, ...filtered.rejected];
                uniqueData = getUniqueDomains(scrapedData);
            }
        }
    }

    // 5. Relaxed Filter Fallback
    if (uniqueData.length < targetCount && rejectedData.length > 0) {
        onStatus(`Relaxing filters to meet quota...`);
        rejectedData.sort((a, b) => {
            if (a.hasBrand && !b.hasBrand) return -1;
            if (!a.hasBrand && b.hasBrand) return 1;
            return (b.matchCount || 0) - (a.matchCount || 0);
        });

        const uniqueRejected = getUniqueDomains(rejectedData);
        for (const d of uniqueRejected) {
            if (uniqueData.length >= targetCount) break;
            const domain = new URL(d.url).hostname.replace('www.', '');
            const exists = uniqueData.some(u => new URL(u.url).hostname.replace('www.', '') === domain);
            if (!exists) uniqueData.push(d);
        }
    }

    return { sources: uniqueData, title: bestTitle };
}
