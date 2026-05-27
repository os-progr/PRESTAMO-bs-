const fs = require('fs');

const SUPABASE_URL = 'https://ryphrvuljryvwtvssnff.supabase.co';
const SUPABASE_KEY = 'sb_publishable_-wbllkasfqvfCL3E2tX4wA_6EVwctTR';

async function uploadData() {
    console.log('Leyendo archivo JSON...');
    const rawData = fs.readFileSync('QOAN_FULL_BACKUP_2026-05-21.json');
    const data = JSON.parse(rawData);

    const clientsToInsert = [];
    const paymentsToInsert = [];

    for (const client of data.clients) {
        // Extract payments
        if (client.payments && client.payments.length > 0) {
            for (const payment of client.payments) {
                paymentsToInsert.push({
                    id: payment.id,
                    clientId: client.id,
                    amount: payment.amount,
                    date: payment.date,
                    paymentType: payment.paymentType
                });
            }
        }

        // Clean client object for Supabase schema
        const cleanClient = {
            id: client.id,
            name: client.name,
            dni: client.dni || '0',
            amount: client.amount,
            interest: client.interest,
            term: client.term,
            loanType: client.loanType || 'fijo',
            totalToReturn: client.totalToReturn,
            remainingBalance: client.remainingBalance,
            date: client.date,
            startDate: client.startDate || null,
            collectionDate: client.collectionDate || null,
            status: client.status || 'Pendiente',
            rating: client.rating || 3,
            notes: client.notes || null,
            maps: client.maps || null,
            interestPaidCount: client.interestPaidCount || 0
        };
        clientsToInsert.push(cleanClient);
    }

    console.log(`Subiendo ${clientsToInsert.length} clientes...`);
    
    // Config fetch options
    const headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
    };

    // Upload Clients
    const clientsRes = await fetch(`${SUPABASE_URL}/rest/v1/clients`, {
        method: 'POST',
        headers,
        body: JSON.stringify(clientsToInsert)
    });

    if (!clientsRes.ok) {
        console.error('Error subiendo clientes:', await clientsRes.text());
        return;
    }
    console.log('✅ Clientes subidos con éxito.');

    // Upload Payments
    if (paymentsToInsert.length > 0) {
        console.log(`Subiendo ${paymentsToInsert.length} pagos...`);
        const paymentsRes = await fetch(`${SUPABASE_URL}/rest/v1/payments`, {
            method: 'POST',
            headers,
            body: JSON.stringify(paymentsToInsert)
        });

        if (!paymentsRes.ok) {
            console.error('Error subiendo pagos:', await paymentsRes.text());
            return;
        }
        console.log('✅ Pagos subidos con éxito.');
    } else {
        console.log('No hay pagos para subir.');
    }

    console.log('¡Migración de datos completada!');
}

uploadData().catch(console.error);
