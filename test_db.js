import fs from 'fs';

const configPath = './src/config.js';
const configContent = fs.readFileSync(configPath, 'utf8');
const urlMatch = configContent.match(/export const SUPABASE_URL = '(.*?)'/);
const keyMatch = configContent.match(/export const SUPABASE_ANON_KEY = '(.*?)'/);

const supabaseUrl = urlMatch[1];
const supabaseKey = keyMatch[1];

async function run() {
    // Check follows table broadly
    const res = await fetch(`${supabaseUrl}/rest/v1/follows?select=*`, {
        headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`
        }
    });
    const data = await res.json();
    console.log("All Follows:", JSON.stringify(data, null, 2));

    const pRes = await fetch(`${supabaseUrl}/rest/v1/profiles?select=id,username`, {
        headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`
        }
    });
    const pData = await pRes.json();
    console.log("All Profiles:", JSON.stringify(pData, null, 2));
}

run();
