const https = require('https');

const apiKey = '69a394c3-9808-4884-8055-41f59e0d9f97';

async function testApi(promptText) {
    // 1x1 transparent png with prefix
    const base64Image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

    const payload = JSON.stringify({
        initial_image: base64Image,
        motion_prompt: promptText,
        model: "standard",
        frames: 36,
        frame_size: 256,
        duration: 2,
        individual_frames: false  // <--- TESTING THIS
    });

    return new Promise((resolve, reject) => {
        const req = https.request('https://api.ludo.ai/api/assets/sprite/animate', {
            method: 'POST',
            headers: {
                "Authorization": `ApiKey ${apiKey}`,
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log(`[${promptText}] STATUS: ${res.statusCode}`);
                console.log(`[${promptText}] RESP: ${data}`);
                resolve(res.statusCode);
            });
        });

        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

(async () => {
    console.log("Testing API with individual_frames: false...");
    await testApi("walk");
})();
