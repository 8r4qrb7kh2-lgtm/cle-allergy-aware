const { searchWeb } = require('./src/app/lib/search');

async function testSearch() {
    // Bachan's
    const barcode = "850006883059";
    console.log(`Testing search for: ${barcode}`);

    try {
        const result = await searchWeb(barcode);
        console.log("Result:", JSON.stringify(result.product, null, 2));
        console.log(`Found ${result.urls.length} URLs`);
    } catch (e) {
        console.error("Search failed:", e);
    }
}

testSearch();
