const fs = require('fs');

const rawData = fs.readFileSync('QOAN_FULL_BACKUP_2026-05-21.json', 'utf8');
const data = JSON.parse(rawData);

function esc(val) {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

// --- 1. CSV de Clients (camelCase) ---
const clientHeaders = ['id','name','dni','amount','interest','term','loanType','totalToReturn','remainingBalance','date','startDate','collectionDate','status','rating','notes','maps','interestPaidCount'];

let clientsCsv = clientHeaders.join(',') + '\n';

for (const c of data.clients) {
    const startDate = c.startDate ? new Date(c.startDate + 'T12:00:00Z').toISOString().replace('T', ' ').replace('Z','') : '';
    const collectionDate = c.collectionDate ? new Date(c.collectionDate + 'T12:00:00Z').toISOString().replace('T', ' ').replace('Z','') : '';
    const dateVal = c.date ? new Date(c.date).toISOString().replace('T', ' ').replace('Z','') : '';

    const row = [
        esc(c.id),
        esc(c.name),
        esc(c.dni),
        c.amount,
        c.interest,
        c.term,
        esc(c.loanType || 'fijo'),
        c.totalToReturn,
        c.remainingBalance,
        esc(dateVal),
        esc(startDate),
        esc(collectionDate),
        esc(c.status || 'Pendiente'),
        c.rating || 3,
        esc(c.notes || ''),
        esc(c.maps || ''),
        c.interestPaidCount || 0
    ];
    clientsCsv += row.join(',') + '\n';
}

fs.writeFileSync('clients.csv', clientsCsv, 'utf8');
console.log(`✅ clients.csv creado con ${data.clients.length} clientes`);

// --- 2. CSV de Payments ---
const paymentHeaders = ['id','clientId','amount','date','paymentType'];
let paymentsCsv = paymentHeaders.join(',') + '\n';
let totalPayments = 0;

for (const c of data.clients) {
    if (c.payments && c.payments.length > 0) {
        for (const p of c.payments) {
            const dateVal = p.date ? new Date(p.date).toISOString().replace('T', ' ').replace('Z','') : '';
            const row = [
                esc(p.id),
                esc(c.id),
                p.amount,
                esc(dateVal),
                esc(p.paymentType)
            ];
            paymentsCsv += row.join(',') + '\n';
            totalPayments++;
        }
    }
}

fs.writeFileSync('payments.csv', paymentsCsv, 'utf8');
console.log(`✅ payments.csv creado con ${totalPayments} pagos`);
console.log('\n🎉 ¡Listos con headers camelCase!');
