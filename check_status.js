const SUPABASE_URL = 'https://ryphrvuljryvwtvssnff.supabase.co';
const SUPABASE_KEY = 'sb_publishable_-wbllkasfqvfCL3E2tX4wA_6EVwctTR';

async function check() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/clients?select=name,status,interestPaidCount`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const clients = await res.json();
    clients.forEach(c => console.log(`${c.name} - Status: ${c.status} - C.P: ${c.interestPaidCount}`));
}
check();
