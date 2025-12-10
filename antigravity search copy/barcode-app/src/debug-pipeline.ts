import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { searchWeb } from './app/lib/search';
import { scrapeUrls } from './app/lib/scrape';
import { analyzeIngredients } from './app/lib/ai';
import { getUniqueDomains, isQualitySource, extractBestTitle } from './app/lib/processing';
import * as fs from 'fs';

async function runDebugPipeline(barcode: string) {
    console.log(`\n--- Starting Debug Pipeline for Barcode: ${barcode} ---\n`);
    const logFile = 'debug_output.json';
    const logs: any = { steps: [] };

    const logStep = (step: string, data: any) => {
        console.log(`[${step}] Completed`);
        logs.steps.push({ step, timestamp: new Date().toISOString(), data });
    };

    try {
        // 1. Search
        console.log("Searching web...");
        const searchResult = await searchWeb(barcode);
        logStep('Search', searchResult);

        if (searchResult.urls.length === 0) {
            console.error("No URLs found.");
            return;
        }

        const productInfo = searchResult.product;
        console.log(`Product Info: ${JSON.stringify(productInfo)}`);

        // 2. Scrape
        console.log(`Scraping ${searchResult.urls.length} URLs...`);
        const scrapedData = await scrapeUrls(searchResult.urls);
        logStep('Scrape', { count: scrapedData.length, data: scrapedData.map((d: any) => ({ url: d.url, title: d.title, contentLength: d.content.length })) });

        // 3. Processing & Filtering
        let bestTitle = productInfo?.name || "";
        if (!bestTitle) {
            bestTitle = extractBestTitle(scrapedData, bestTitle);
        }
        console.log(`Best Title: ${bestTitle}`);

        const uniqueData = getUniqueDomains(scrapedData);
        logStep('UniqueDomains', uniqueData.map(d => d.url));

        const qualitySources = uniqueData.filter(d => isQualitySource(d, productInfo || undefined));
        logStep('QualitySources', qualitySources.map(d => d.url));

        console.log(`Found ${qualitySources.length} quality sources.`);

        if (qualitySources.length === 0) {
            console.warn("No quality sources found! Dumping rejected sources for inspection...");
            const rejected = uniqueData.filter(d => !isQualitySource(d, productInfo || undefined));
            logStep('RejectedSources', rejected.map(d => ({ url: d.url, title: d.title, reason: "Failed isQualitySource" })));
        }

        // 4. Analysis
        if (qualitySources.length > 0) {
            console.log("Analyzing with AI...");
            const analysis = await analyzeIngredients(qualitySources.slice(0, 5));
            logStep('Analysis', analysis);
            console.log("\n--- Analysis Result ---\n");
            console.log(JSON.stringify(analysis, null, 2));
        }

    } catch (error: any) {
        console.error("Pipeline failed:", error);
        logStep('Error', { message: error.message, stack: error.stack });
    } finally {
        fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));
        console.log(`\nFull logs written to ${logFile}`);
    }
}

// Get barcode from command line
const barcode = process.argv[2];
if (!barcode) {
    console.error("Please provide a barcode as an argument.");
    console.error("Usage: npx ts-node debug-pipeline.ts <barcode>");
    process.exit(1);
}

runDebugPipeline(barcode);
