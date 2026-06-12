const fs = require('fs');

const SUPABASE_URL = 'https://ryphrvuljryvwtvssnff.supabase.co';
const SUPABASE_KEY = 'sb_publishable_-wbllkasfqvfCL3E2tX4wA_6EVwctTR';

async function main() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/clients?select=*`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const clients = await res.json();
    const activeClients = clients.filter(c => c.status !== 'Liquidado' && c.status !== 'Pagado');
    
    const orderDNI = ['42476659','75946630','81269550','73665595','61305935','75534038','48273908','60299905','07642812','60472454','76628263'];
    activeClients.sort((a,b) => {
        let ia = orderDNI.indexOf(a.dni);
        let ib = orderDNI.indexOf(b.dni);
        if(ia===-1) ia=99;
        if(ib===-1) ib=99;
        return ia - ib;
    });

    console.log('Total:', activeClients.length);
    activeClients.forEach(c => console.log(c.name));
}
main();
