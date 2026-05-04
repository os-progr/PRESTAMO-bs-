// --- Admin Data Management ---
const state = {
    clients: JSON.parse(localStorage.getItem('prestamo_elite_clients')) || [],
    config: JSON.parse(localStorage.getItem('prestamo_elite_config')) || { currency: 'S/', moraRate: 0.5 },
    settings: JSON.parse(localStorage.getItem('app_settings')) || { 
        notifReminders: true, 
        notifMora: true, 
        notifSummary: false,
        githubRepo: 'os-progr/prestam',
        githubToken: ''
    }
};

// --- Capacitor Notification Check ---
async function requestPermissions() {
    try {
        if (window.Capacitor && window.Capacitor.Plugins.LocalNotifications) {
            const permission = await window.Capacitor.Plugins.LocalNotifications.requestPermissions();
            console.log('Permisos de notificación:', permission.display);
        }
    } catch (e) {
        console.warn('LocalNotifications no disponible:', e);
    }
}

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

    document.getElementById('kpi-capital').textContent = `${state.config.currency} ${totalCapital.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    document.getElementById('kpi-profit').textContent = `${state.config.currency} ${totalInteresCobrado.toLocaleString(undefined, {minimumFractionDigits: 2})}`;

    initCharts({
        capital: totalCapital,
        cobrado: totalInteresCobrado,
        pendiente: totalInteresPendiente,
        active, moraCount, paidCount
    });
}

let _charts = {};
function initCharts(data) {
    // Destroy previous charts if they exist
    if (_charts.dist) _charts.dist.destroy();
    if (_charts.status) _charts.status.destroy();

    _charts.dist = new Chart(document.getElementById('chart-distribution').getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: ['Capital', 'G. Cobrada', 'G. Pendiente'],
            datasets: [{
                data: [data.capital, data.cobrado, data.pendiente],
                backgroundColor: ['#d4af37', '#27ae60', '#f1c40f'],
                borderWidth: 0,
                hoverOffset: 15
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { 
                    position: 'bottom', 
                    labels: { color: '#fff', font: { size: 10, family: "'Inter', sans-serif" }, padding: 20 } 
                } 
            },
            cutout: '75%'
        }
    });

    _charts.status = new Chart(document.getElementById('chart-status').getContext('2d'), {
        type: 'bar',
        data: {
            labels: ['Activos', 'Mora', 'Finalizados'],
            datasets: [{
                data: [data.active, data.moraCount, data.paidCount],
                backgroundColor: ['#d4af37', '#e74c3c', '#2ecc71'],
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { 
                    display: true, 
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 10 } }
                },
                x: { 
                    ticks: { color: '#fff', font: { size: 11, weight: '600' } }, 
                    grid: { display: false } 
                }
            },
            plugins: { legend: { display: false } }
        }
    });
}

// --- GitHub Sync Logic ---
async function syncFromGitHub() {
    const repo = state.settings.githubRepo;
    if (!repo) return;

    try {
        const url = `https://raw.githubusercontent.com/${repo}/main/data.json?t=${Date.now()}`;
        const response = await fetch(url);
        if (response.ok) {
            const data = await response.json();
            if (data && data.clients) {
                state.clients = data.clients;
                if (data.config) state.config = data.config;
                localStorage.setItem('prestamo_elite_clients', JSON.stringify(state.clients));
                localStorage.setItem('prestamo_elite_config', JSON.stringify(state.config));
                loadDashboard();
                console.log('Datos actualizados desde GitHub ✓');
                return true;
            }
        }
    } catch (e) {
        console.warn('Error sincronizando desde GitHub:', e);
    }
    return false;
}

async function syncToGitHub() {
    const repo = state.settings.githubRepo;
    const token = state.settings.githubToken;
    if (!repo || !token) {
        alert('Configura el Repositorio y el Token en Ajustes para subir datos.');
        return;
    }

    const data = {
        clients: state.clients,
        config: state.config,
        updatedAt: new Date().toISOString()
    };

    const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
    const url = `https://api.github.com/repos/${repo}/contents/data.json`;

    try {
        // Get the current file SHA to update it
        let sha = "";
        const getRes = await fetch(url, {
            headers: { 'Authorization': `token ${token}` }
        });
        if (getRes.ok) {
            const fileData = await getRes.json();
            sha = fileData.sha;
        }

        const putRes = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: 'Actualización automática desde App QOAN',
                content: content,
                sha: sha
            })
        });

        if (putRes.ok) {
            alert('¡Datos subidos a GitHub correctamente! ✓');
        } else {
            const error = await putRes.json();
            alert('Error al subir: ' + error.message);
        }
    } catch (e) {
        alert('Error de conexión con GitHub.');
        console.error(e);
    }
}

// Settings Handlers
function openSettings() {
    document.getElementById('notif-reminders').checked = state.settings.notifReminders;
    document.getElementById('notif-mora').checked = state.settings.notifMora;
    document.getElementById('notif-summary').checked = state.settings.notifSummary;
    document.getElementById('github-repo').value = state.settings.githubRepo || '';
    document.getElementById('github-token').value = state.settings.githubToken || '';
    document.getElementById('modal-settings').style.display = 'flex';
}

function closeSettings() {
    document.getElementById('modal-settings').style.display = 'none';
}

function saveSettings() {
    state.settings = {
        notifReminders: document.getElementById('notif-reminders').checked,
        notifMora: document.getElementById('notif-mora').checked,
        notifSummary: document.getElementById('notif-summary').checked,
        githubRepo: document.getElementById('github-repo').value,
        githubToken: document.getElementById('github-token').value
    };
    localStorage.setItem('app_settings', JSON.stringify(state.settings));
    
    // Show a premium success message
    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = '¡GUARDADO! ✓';
    btn.style.background = '#27ae60';
    
    setTimeout(() => {
        btn.textContent = originalText;
        btn.style.background = '';
        closeSettings();
    }, 1500);
}

// Start
document.addEventListener('DOMContentLoaded', async () => {
    requestPermissions();
    loadDashboard();
    
    // Auto-sync from GitHub on start
    const synced = await syncFromGitHub();
    if (synced) {
        console.log('Sincronización inicial completada.');
    }
});
