// --- Admin Data Management ---
const state = {
    clients: JSON.parse(localStorage.getItem('prestamo_elite_clients')) || [],
    config: JSON.parse(localStorage.getItem('prestamo_elite_config')) || { currency: 'S/' }
};

function calculateMora(client) {
    if (!client.collectionDate || client.status === 'Pagado') return 0;
    const dueDate = new Date(client.collectionDate);
    const today = new Date();
    today.setHours(0,0,0,0);
    if (today > dueDate) {
        const diffTime = Math.abs(today - dueDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays * (state.config.moraRate || 0.5);
    }
    return 0;
}

function loadDashboard() {
    let totalCapital = 0;
    let totalInteresCobrado = 0;
    let totalInteresPendiente = 0;
    let active = 0, moraCount = 0, paidCount = 0;

    state.clients.forEach(client => {
        const isInterestOnly = client.loanType === 'interes';
        const monthlyInterest = isInterestOnly ? Math.round((client.amount * (client.interest / 100)) * 100) / 100 : 0;
        const totalInterest = client.totalToReturn - client.amount;
        const interestRatio = client.totalToReturn > 0 ? totalInterest / client.totalToReturn : 0;

        // Interest collected
        if (client.payments) {
            client.payments.forEach(p => {
                if (isInterestOnly) {
                    if (p.paymentType === 'interes') totalInteresCobrado += p.amount;
                    else if (p.paymentType === 'final') totalInteresCobrado += monthlyInterest;
                } else {
                    totalInteresCobrado += (p.amount * interestRatio);
                }
            });
        }

        if (client.status === 'Pagado') {
            paidCount++;
        } else {
            active++;
            if (calculateMora(client) > 0) moraCount++;

            if (isInterestOnly) {
                const pendingMonths = (client.term || 1) - (client.interestPaidCount || 0);
                totalInteresPendiente += Math.max(0, pendingMonths * monthlyInterest);
                totalCapital += client.amount;
            } else {
                totalCapital += (client.remainingBalance * (client.amount / client.totalToReturn));
                totalInteresPendiente += (client.remainingBalance * interestRatio);
            }
        }
    });

    // Update KPIs
    document.getElementById('kpi-capital').textContent = `${state.config.currency} ${totalCapital.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    document.getElementById('kpi-profit').textContent = `${state.config.currency} ${totalInteresCobrado.toLocaleString(undefined, {minimumFractionDigits: 2})}`;

    // Charts
    initCharts({
        capital: totalCapital,
        cobrado: totalInteresCobrado,
        pendiente: totalInteresPendiente,
        active, moraCount, paidCount
    });
}

function initCharts(data) {
    // Distribution
    new Chart(document.getElementById('chart-distribution').getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: ['Capital', 'G. Cobrada', 'G. Pendiente'],
            datasets: [{
                data: [data.capital, data.cobrado, data.pendiente],
                backgroundColor: ['#d4af37', '#27ae60', '#f1c40f'],
                borderWidth: 0
            }]
        },
        options: {
            plugins: { legend: { position: 'bottom', labels: { color: '#fff', font: { size: 10 } } } },
            cutout: '75%'
        }
    });

    // Status
    new Chart(document.getElementById('chart-status').getContext('2d'), {
        type: 'bar',
        data: {
            labels: ['Activos', 'Mora', 'Finalizados'],
            datasets: [{
                data: [data.active, data.moraCount, data.paidCount],
                backgroundColor: ['#d4af37', '#e74c3c', '#2ecc71']
            }]
        },
        options: {
            scales: {
                y: { display: false },
                x: { ticks: { color: '#fff' }, grid: { display: false } }
            },
            plugins: { legend: { display: false } }
        }
    });
}

// Start
loadDashboard();
