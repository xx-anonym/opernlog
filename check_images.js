const fs = require('fs');

const content = fs.readFileSync('/Users/jonasschilberg/.gemini/antigravity/scratch/opernlog/src/data/operas.js', 'utf8');

// Use regex to find all image URLs
const regex = /image:\s*'([^']+)'/g;
let match;
const urls = [];

while ((match = regex.exec(content)) !== null) {
    urls.push(match[1]);
}

async function checkUrls() {
    console.log(`Checking ${urls.length} URLs...`);
    for (const url of urls) {
        try {
            const res = await fetch(url, { method: 'HEAD' });
            if (!res.ok) {
                console.log(`ERROR ${res.status}: ${url}`);
            }
        } catch (e) {
            console.log(`FETCH ERROR: ${url} - ${e.message}`);
        }
    }
    console.log('Done.');
}

checkUrls();
