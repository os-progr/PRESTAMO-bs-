const SUPABASE_URL = 'https://ryphrvuljryvwtvssnff.supabase.co';
const SUPABASE_KEY = 'sb_publishable_-wbllkasfqvfCL3E2tX4wA_6EVwctTR';

async function check() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/clients?select=*`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const clients = await res.json();
    console.log(JSON.stringify(clients, null, 2));
}
check();
