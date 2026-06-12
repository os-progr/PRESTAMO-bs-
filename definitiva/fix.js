const fs = require('fs');
let content = fs.readFileSync('c:/Users/pucll/OneDrive/Desktop/N/app.js', 'utf8');

// Find the start of function updateStats
const idx = content.indexOf('function updateStats() {');
if (idx !== -1) {
    content = content.substring(0, idx);
}

// Ensure clean end
content += unction updateStats() {
    const filterStart = document.getElementById('filter-start')?.value;
    const filterEnd = document.getElementById('filter-end')?.value;

    const active = clients.filter(c => c.status !== 'Liquidado');
    const sociosCount = document.getElementById('socios-activos-count');
    if(sociosCount) sociosCount.innerText = active.length;

    let totalInvertido = 0;
    let totalARecuperar = 0;
    let moraTotal = 0;

    clients.forEach(c => {
        let includeCapital = true;
        if (filterStart && c.startDate < filterStart) includeCapital = false;
        if (filterEnd && c.startDate > filterEnd) includeCapital = false;
        
        if (includeCapital && c.status !== 'Liquidado') {
            totalInvertido += c.amount;
        }

        c.installments.forEach(inst => {
            let includeInst = true;
            if (filterStart && inst.date < filterStart) includeInst = false;
            if (filterEnd && inst.date > filterEnd) includeInst = false;
            
            if (includeInst) {
                if (inst.status !== 'Pagado' && c.status !== 'Liquidado') {
                    totalARecuperar += getInstallmentTotal(inst, c.amount);
                    if (inst.penalty > 0) {
                        moraTotal += inst.penalty;
                    }
                }
            }
        });
    });

    const elInvertido = document.getElementById('stat-capital');
    const elRecuperar = document.getElementById('stat-recuperar');
    const elMora = document.getElementById('stat-mora');

    if(elInvertido) elInvertido.innerText = formatCurrency(totalInvertido);
    if(elRecuperar) elRecuperar.innerText = formatCurrency(totalARecuperar);
    if(elMora) elMora.innerText = formatCurrency(moraTotal);
    
    renderResumenTable(filterStart, filterEnd);
}

function renderResumenTable(filterStart, filterEnd) {
    const tbody = document.getElementById('table-resumen-body');
    if (!tbody) return;
    
    const activeClients = clients.filter(c => c.status !== 'Liquidado');
    let html = '';
    
    activeClients.forEach(c => {
        let includeClient = true;
        if (filterStart && c.startDate < filterStart) includeClient = false;
        if (filterEnd && c.startDate > filterEnd) includeClient = false;
        
        if (!includeClient) return;
        
        let clientRecuperar = 0;
        let clientMora = 0;
        
        c.installments.forEach(inst => {
            if (inst.status !== 'Pagado') {
                clientRecuperar += getInstallmentTotal(inst, c.amount);
                if (inst.penalty > 0) clientMora += inst.penalty;
            }
        });
        
        let statusClass = 'success';
        if (c.status === 'En Mora') statusClass = 'danger';
        
        html += \
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                <td style="padding: 16px;">
                    <div class="client-cell">
                        <div class="avatar-sm">\</div>
                        <div>
                            <strong>\</strong>
                            <span class="id-text">\</span>
                        </div>
                    </div>
                </td>
                <td style="padding: 16px; color: var(--text-secondary);">\</td>
                <td style="padding: 16px; color: \;">
                    \
                </td>
                <td style="padding: 16px; color: var(--primary); font-weight: 500;">\</td>
                <td style="padding: 16px;"><span class="status-badge \">\</span></td>
            </tr>
        \;
    });
    
    if (html === '') {
        html = \<tr><td colspan="5" style="text-align:center; padding: 32px; color: var(--text-muted);">No hay clientes activos en este rango de fechas.</td></tr>\;
    }
    
    tbody.innerHTML = html;
}

function renderChart() {
    const ctx = document.getElementById('rendimientoChart');
    if (!ctx) return;
    
    if (typeof rendimientoChartInstance !== 'undefined' && rendimientoChartInstance) rendimientoChartInstance.destroy();
    
    const monthlyData = {};
    clients.forEach(c => {
        if(c.status === 'Liquidado') return;
        c.installments.forEach(inst => {
            if (inst.status !== 'Pagado') {
                const month = inst.date.substring(0, 7);
                if(!monthlyData[month]) monthlyData[month] = { invertido: 0, recuperar: 0 };
                if (inst.isFinal) monthlyData[month].invertido += c.amount;
                monthlyData[month].recuperar += (inst.expectedInterest || 0) + (inst.penalty || 0);
            }
        });
    });
    
    const labels = Object.keys(monthlyData).sort();
    const dataInvertido = labels.map(l => monthlyData[l].invertido);
    const dataRecuperar = labels.map(l => monthlyData[l].recuperar);

    if (labels.length === 0) {
        labels.push('Sin Datos');
        dataInvertido.push(0);
        dataRecuperar.push(0);
    }
    
    Chart.defaults.color = '#fff';
    rendimientoChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Recuperación de Capital',
                    data: dataInvertido,
                    backgroundColor: 'rgba(125, 211, 252, 0.4)',
                    borderColor: '#7dd3fc',
                    borderWidth: 1
                },
                {
                    label: 'Cobro de Intereses Esperados',
                    data: dataRecuperar,
                    backgroundColor: 'rgba(34, 197, 94, 0.4)',
                    borderColor: '#22c55e',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, grid: { color: 'rgba(255, 255, 255, 0.1)' } }, x: { grid: { display: false } } }
        }
    });
}

// Theme Toggle
function toggleTheme() {
    const isLight = document.body.classList.toggle('light-theme');
    localStorage.setItem('qoan_theme', isLight ? 'light' : 'dark');
    const icon = document.getElementById('theme-icon');
    if (icon) {
        icon.className = isLight ? 'ph ph-sun' : 'ph ph-moon';
    }
}

// Load Theme on Startup
document.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('qoan_theme') === 'light') {
        document.body.classList.add('light-theme');
        const icon = document.getElementById('theme-icon');
        if (icon) icon.className = 'ph ph-sun';
    }
});
;

fs.writeFileSync('c:/Users/pucll/OneDrive/Desktop/N/app.js', content);
