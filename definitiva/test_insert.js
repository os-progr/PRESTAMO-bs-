const SUPABASE_URL = 'https://ryphrvuljryvwtvssnff.supabase.co';
const SUPABASE_KEY = 'sb_publishable_-wbllkasfqvfCL3E2tX4wA_6EVwctTR';

async function main() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/payments`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Prefer': 'return=representation'
        },
        body: JSON.stringify({
            client_id: 'client_1777048114195', // Nancy
            amount: 1,
            date: new Date().toISOString(),
            paymentType: 'test'
        })
    });
    console.log(res.status, await res.text());
}
main();
