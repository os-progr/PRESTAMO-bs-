const fs = require('fs');

const SUPABASE_URL = 'https://ryphrvuljryvwtvssnff.supabase.co';
const SUPABASE_KEY = 'sb_publishable_-wbllkasfqvfCL3E2tX4wA_6EVwctTR';

const toDelete = [
    'client_1777040778492', // chuya ingrid (Pagado)
    'client_1777065500359', // Maria Emilia (Pagado)
    'client_1777066043445', // Heidy Melanie (Pagado)
    'client_1777915680631', // Lizandro (Pagado)
    'client_1777310555272'  // Maria Fernanda (Pagado)
];

const toUpdate = [
    { id: 'client_1777048114195', amount: 2000, interest: 14, interestPaidCount: 0, startDate: '2026-07-25', status: 'Pendiente' }, // Nancy
    { id: 'client_1777311094174', amount: 500, interest: 15, interestPaidCount: 2, startDate: '2026-05-21', status: 'Pendiente' }, // Ana
    { id: 'client_1780347204704', amount: 250, interest: 14, interestPaidCount: 0, startDate: '2026-07-01', status: 'Pendiente' }, // Chuya
    { id: 'client_1777064972087', amount: 200, interest: 15, interestPaidCount: 1, startDate: '2026-06-25', status: 'Pendiente' }, // Clever
    { id: 'client_1777046315658', amount: 300, interest: 15, interestPaidCount: 0, startDate: '2026-05-11', status: 'Pendiente' }, // Danfer
    { id: 'client_1777065832239', amount: 400, interest: 15, interestPaidCount: 0, startDate: '2026-03-22', status: 'Pendiente' }, // Emerson
    { id: 'client_1777311441145', amount: 400, interest: 15, interestPaidCount: 2, startDate: '2026-03-12', status: 'Pendiente' }, // Fernando
    { id: 'client_1777934170090', amount: 500, interest: 15, interestPaidCount: 0, startDate: '2026-06-04', status: 'Pendiente' }, // Heidy
    { id: 'client_1780414146550', amount: 500, interest: 15, interestPaidCount: 0, startDate: '2026-06-02', status: 'Pendiente' }, // Lizandro
    { id: 'client_1781034337591', amount: 500, interest: 15, interestPaidCount: 0, startDate: '2026-07-09', status: 'Pendiente' }, // Ruth
    { id: 'client_1777388664260', amount: 500, interest: 15, interestPaidCount: 1, startDate: '2026-04-28', status: 'Pendiente' }  // Bryce
];

async function main() {
    console.log('Deleting obsolete records...');
    for (const id of toDelete) {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/clients?id=eq.${id}`, {
            method: 'DELETE',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });
        if (res.ok) {
            console.log(`Deleted ${id}`);
        } else {
            console.error(`Failed to delete ${id}`, await res.text());
        }
    }

    console.log('Updating 11 main clients...');
    for (const client of toUpdate) {
        const id = client.id;
        delete client.id; // remove id from body
        const res = await fetch(`${SUPABASE_URL}/rest/v1/clients?id=eq.${id}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify(client)
        });
        if (res.ok) {
            console.log(`Updated ${id}`);
        } else {
            console.error(`Failed to update ${id}`, await res.text());
        }
    }
    console.log('DONE');
}
main();
