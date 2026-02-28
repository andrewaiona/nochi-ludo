const apiKey = '69a394c3-9808-4884-8055-41f59e0d9f97';

async function testApi() {
    // Create a 512x512 transparent PNG directly to test payload size limits
    const { createCanvas } = require('canvas');
    const canvas = createCanvas(512, 512);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
    ctx.fillRect(0, 0, 512, 512);
    // Add randomness to defeat compression
    for (let i = 0; i < 50000; i++) {
        ctx.fillStyle = `rgba(${Math.random() * 255}, ${Math.random() * 255}, ${Math.random() * 255}, 1)`;
        ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
    }
    const base64Image = canvas.toDataURL('image/png');
    console.log("Size:", Math.round(base64Image.length / 1024) + "KB");

    const payload = {
        initial_image: base64Image,
        motion_prompt: "running fast",
        model: "standard",
        frames: 4,
        duration: 2
    };

    console.log("Sending payload...");
    const response = await fetch("https://api.ludo.ai/api/assets/sprite/animate", {
        method: "POST",
        headers: {
            "Authorization": `ApiKey ${apiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    });

    const data = await response.json();
    console.log(`Status: ${response.status}`);
    console.log("Response:", data);
}

testApi().catch(console.error);
