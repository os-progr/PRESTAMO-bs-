const SUPABASE_URL = 'https://ryphrvuljryvwtvssnff.supabase.co';
const SUPABASE_KEY = 'sb_publishable_-wbllkasfqvfCL3E2tX4wA_6EVwctTR';

async function main() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/clients?id=eq.client_1777388664260`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ term: 2 })
    });
    if (res.ok) {
        console.log("Updated Bryce's term to 2");
    } else {
        console.error("Failed", await res.text());
    }
}
main();
