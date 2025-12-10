import { scrapeUrls } from './src/app/lib/scrape';

async function run() {
    const urls = [
        'https://world.openfoodfacts.org/product/074117000147',
        'https://www.upcitemdb.com/upc/074117000147'
    ];
    console.log("Testing real scrape.ts...");
    const results = await scrapeUrls(urls);
    console.log("Results:", results);
}

run();
