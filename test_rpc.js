import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Read config to get URL and ANON KEY
const configPath = './src/config.js';
const configContent = fs.readFileSync(configPath, 'utf8');
const urlMatch = configContent.match(/export const SUPABASE_URL = '(.*?)'/);
const keyMatch = configContent.match(/export const SUPABASE_ANON_KEY = '(.*?)'/);

if (!urlMatch || !keyMatch) {
    console.error('Could not find Supabase credentials in config.js');
    process.exit(1);
}

const supabaseUrl = urlMatch[1];
const supabaseKey = keyMatch[1];
const supabase = createClient(supabaseUrl, supabaseKey);

async function testRPC() {
    // 1. Get auth tokens for user A (jonas_schi@gmx.de) and B (jonas.schilberg@icloud.com)
    // To do this we first need to auth
    const { data: authA, error: errA } = await supabase.auth.signInWithPassword({
        email: 'jonas_schi@gmx.de',
        password: 'Pauli2006'
    });
    if (errA) { console.error('Login A failed:', errA); return; }
    console.log('Logged in User A:', authA.user.id);

    const { data: authB, error: errB } = await supabase.auth.signInWithPassword({
        email: 'jonas.schilberg@icloud.com',
        password: 'Pauli2006'
    });
    if (errB) { console.error('Login B failed:', errB); return; }
    console.log('Logged in User B:', authB.user.id);
    
    // Switch to User A's session to query the DB directly to check the follows table
    await supabase.auth.setSession({ access_token: authA.session.access_token, refresh_token: authA.session.refresh_token });
    
    // Check follows for User A
    const { data: followsA, error: fErrA } = await supabase.from('follows').select('*').eq('follower_id', authA.user.id);
    console.log('User A is following:', followsA);
    const { data: followersA, error: frErrA } = await supabase.from('follows').select('*').eq('following_id', authA.user.id);
    console.log('User A is followed by:', followersA);

    // Switch to User B's session to query the DB directly to check the follows table
    await supabase.auth.setSession({ access_token: authB.session.access_token, refresh_token: authB.session.refresh_token });
    
    // Check follows for User B
    const { data: followsB, error: fErrB } = await supabase.from('follows').select('*').eq('follower_id', authB.user.id);
    console.log('User B is following:', followsB);
    const { data: followersB, error: frErrB } = await supabase.from('follows').select('*').eq('following_id', authB.user.id);
    console.log('User B is followed by:', followersB);
}

testRPC();
