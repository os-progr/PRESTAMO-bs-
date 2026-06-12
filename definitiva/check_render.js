const fs = require('fs');

const SUPABASE_URL = 'https://ryphrvuljryvwtvssnff.supabase.co';
const SUPABASE_KEY = 'sb_publishable_-wbllkasfqvfCL3E2tX4wA_6EVwctTR';

async function main() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/clients?select=*`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const clients = await res.json();
    const activeClients = clients.filter(c => c.status !== 'Liquidado' && c.status !== 'Pagado');
    console.log('Total active clients:', activeClients.length);
    activeClients.forEach((c, index) => {
        console.log(index+1, c.name, c.dni, c.status);
    });
}
main();
