const fs = require('fs');
const path = require('path');
const https = require('https');

// Read the data file as a loose object
const dataContent = fs.readFileSync(path.join(__dirname, 'src', 'data', 'operaHouses.js'), 'utf-8');
const match = dataContent.match(/export const operaHouses = (\[[\s\S]*?\]);/);
if (!match) {
    console.error('Could not parse operaHouses.js');
    process.exit(1);
}

let operaHouses;
try {
    // Evaluate the array string to get the JS object
    operaHouses = eval(match[1]);
} catch (e) {
    console.error('Eval error', e);
    process.exit(1);
}

const outDir = path.join(__dirname, 'public', 'images', 'houses');
if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
}

async function fetchWikiImageInfo(title) {
    return new Promise((resolve, reject) => {
        const url = `https://de.wikipedia.org/w/api.php?action=query&prop=pageimages&titles=${encodeURIComponent(title)}&pithumbsize=1200&format=json`;
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    const pages = json.query?.pages;
                    if (!pages) return resolve(null);
                    const pageId = Object.keys(pages)[0];
                    if (pageId === '-1') return resolve(null);
                    const thumbnail = pages[pageId].thumbnail;
                    if (thumbnail && thumbnail.source) {
                        resolve(thumbnail.source);
                    } else {
                        resolve(null);
                    }
                } catch (e) {
                    resolve(null);
                }
            });
        }).on('error', () => resolve(null));
    });
}

async function downloadImage(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (res) => {
            if (res.statusCode === 200) {
                res.pipe(file);
                file.on('finish', () => {
                    file.close(resolve);
                });
            } else {
                // If it's a redirect, we might need to handle it, but Wiki thumbs normally don't
                file.close();
                fs.unlink(dest, () => resolve(false));
            }
        }).on('error', () => {
            fs.unlink(dest, () => resolve(false));
        });
    });
}

async function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function run() {
    let successCount = 0;
    for (const house of operaHouses) {
        const dest = path.join(outDir, `${house.id}.jpg`);
        if (fs.existsSync(dest)) {
            console.log(`[SKIP] ${house.id}.jpg already exists`);
            continue;
        }

        console.log(`[FETCH] Looking for ${house.name}...`);
        let imageUrl = await fetchWikiImageInfo(house.name);

        if (!imageUrl) {
            console.log(`   -> Not found. Trying city: ${house.city}`);
            // If the city is e.g. "Passau / Landshut", just take "Passau"
            const cityName = house.city.split('/')[0].trim();
            imageUrl = await fetchWikiImageInfo(cityName);
        }

        if (imageUrl) {
            console.log(`   -> Found image: ${imageUrl}`);
            await downloadImage(imageUrl, dest);
            successCount++;
        } else {
            console.log(`   -> No image found for ${house.name}`);
        }
        await sleep(200); // Be nice to the API
    }
    console.log(`\nFinished! Downloaded ${successCount} new images.`);
}

run();
