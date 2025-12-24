const fs = require('fs');
const path = require('path');

async function testFunction() {
    const projectRef = 'fgoiyycctnwnghrvsilt';
    const functionName = 'extract-ingredients-from-photo';
    const url = `https://${projectRef}.supabase.co/functions/v1/${functionName}`;

    // Path to an artifact image
    const imagePath = '/Users/mattdavis/.gemini/antigravity/brain/e5f0dd93-66e4-45a4-9c39-d430bd8a03ac/uploaded_image_1766102789173.png';

    if (!fs.existsSync(imagePath)) {
        console.error('Image not found:', imagePath);
        return;
    }

    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    const dataUrl = `data:image/png;base64,${base64Image}`;

    console.log(`Calling ${url}...`);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Add Authorization if needed, e.g. Bearer <ANON_KEY>
                // For now assuming no-verify-jwt allows access or we don't have the key easily.
                // If it fails with 401, we know we need a key.
            },
            body: JSON.stringify({
                imageData: dataUrl
            })
        });

        if (!response.ok) {
            console.error('Error status:', response.status);
            const text = await response.text();
            console.error('Error body:', text);
            return;
        }

        const data = await response.json();
        console.log('Success:', data.success);

        if (data.ingredientLines) {
            console.log(`Found ${data.ingredientLines.length} lines.`);
            data.ingredientLines.forEach((line, i) => {
                console.log(`Line ${i}: [${line.text.substring(0, 30)}...] Box: x=${line.x}, y=${line.y}, w=${line.w}, h=${line.h}`);
            });
        } else {
            console.log('No ingredientLines returned.');
            console.log('Full response:', JSON.stringify(data, null, 2));
        }

    } catch (err) {
        console.error('Request failed:', err);
    }
}

testFunction();
