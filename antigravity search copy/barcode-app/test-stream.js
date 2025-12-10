
async function testStream() {
    const barcode = "070662230015"; // Nissin Cup Noodles
    const port = 3001;
    const url = `http://localhost:${port}/api/analyze`;

    console.log(`Testing stream for barcode: ${barcode} at ${url}`);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ barcode }),
        });

        if (!response.ok) {
            console.error(`Error: ${response.status} ${response.statusText}`);
            const text = await response.text();
            console.error(text);
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const text = decoder.decode(value);
            console.log("Received chunk:", text);
        }
        console.log("Stream ended.");

    } catch (error) {
        console.error("Request failed:", error);
    }
}

testStream();
