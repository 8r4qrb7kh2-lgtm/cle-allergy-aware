const axios = require('axios');
const cheerio = require('cheerio');

async function testExtraction(url) {
    console.log(`\nTesting extraction for: ${url}`);
    try {
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 10000
        });

        const $ = cheerio.load(data);

        // OLD METHOD
        const oldContent = $('body').text().replace(/\s+/g, ' ').substring(0, 500);
        console.log("\n--- OLD METHOD (First 500 chars) ---");
        console.log(oldContent);

        // NEW METHOD
        const $new = cheerio.load(data);
        $new('script').remove();
        $new('style').remove();
        $new('nav').remove();
        $new('footer').remove();
        $new('header').remove();

        $new('br').replaceWith('\n');
        $new('p, div, h1, h2, h3, h4, h5, h6, li, tr').after('\n');

        const newContent = $new('body').text()
            .replace(/[ \t]+/g, ' ')
            .replace(/\n\s*\n/g, '\n')
            .trim();

        console.log("\n--- NEW METHOD (First 500 chars) ---");
        console.log(newContent.substring(0, 500));

    } catch (e) {
        console.error("Error:", e.message);
    }
}

// Test with a known URL from the previous log
testExtraction('https://www.nissinfoods.com/product/cup-noodles-beef');
