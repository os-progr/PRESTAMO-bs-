const fs = require('fs');
const SUPABASE_URL = 'https://ryphrvuljryvwtvssnff.supabase.co';
const SUPABASE_KEY = 'sb_publishable_-wbllkasfqvfCL3E2tX4wA_6EVwctTR';

async function main() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/clients?select=id,name,dni,amount,interestPaidCount,interest,status`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const clients = await res.json();
    fs.writeFileSync('db_dump.json', JSON.stringify(clients, null, 2));
    console.log('Saved to db_dump.json');
}
main();
