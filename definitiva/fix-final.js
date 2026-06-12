const fs = require('fs');
let content = fs.readFileSync('c:/Users/pucll/OneDrive/Desktop/N/app3.js', 'utf8');

content += `
function filterClients(list) {
    if (!searchQuery) return list;
    return list.filter(c => c.name.toLowerCase().includes(searchQuery) || c.id.toLowerCase().includes(searchQuery));
}

function getActionButtons(c) {
    if (c.status === 'Liquidado') return \`
        <button class="icon-btn small" onclick="viewCronograma('\${c.id}')" title="Ver Cronograma"><i class="ph ph-calendar-dots"></i></button>
    \`;
    return \`
        <button class="icon-btn small" onclick="notifyWhatsApp('\${c.id}')" title="Notificar"><i class="ph ph-whatsapp-logo"></i></button>
        <button class="icon-btn small" onclick="openPaymentModal('\${c.id}')" title="Registrar Pago de Cuota"><i class="ph ph-currency-dollar"></i></button>
        <button class="icon-btn small" onclick="viewCronograma('\${c.id}')" title="Ver Cronograma"><i class="ph ph-calendar-dots"></i></button>
        <button class="icon-btn small" onclick="markAsPaid('\${c.id}')" title="Liquidar Total"><i class="ph ph-check-circle"></i></button>
        <button class="icon-btn small" onclick="editClient('\${c.id}')" title="Editar"><i class="ph ph-pencil"></i></button>
        <button class="icon-btn small" onclick="deleteClient('\${c.id}')" title="Eliminar"><i class="ph ph-trash"></i></button>
    \`;
}

window.viewCronograma = function(clientId) {
    const c = clients.find(cl => cl.id === clientId);
    if (!c) return;
    
    const tbody = document.getElementById('cronograma-body');
    if (!tbody) return;

    tbody.innerHTML = c.installments.map(inst => {
        const expected = getInstallmentTotal(inst, c.amount);
        const isPaid = inst.status === 'Pagado';
        const color = isPaid ? 'var(--success)' : (inst.status === 'Pendiente' ? 'var(--text-main)' : 'var(--danger)');
        const concepto = inst.isFinal ? 'Interés + Capital (Final)' : 'Solo Interés';
        return \`
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); color: \${color}; opacity: \${isPaid ? 0.6 : 1};">
                <td style="padding: 10px;">\${inst.date}</td>
                <td style="padding: 10px;">\${concepto}</td>
                <td style="padding: 10px;">\${formatCurrency(expected)}</td>
                <td style="padding: 10px; font-weight: \${isPaid ? 'normal' : 'bold'};">\${inst.status}</td>
            </tr>
        \`;
    }).join('');

    const tbodyPagos = document.getElementById('pagos-body');
    const payments = c.payments || [];
    if (payments.length === 0) {
        tbodyPagos.innerHTML = \`<tr><td colspan="3" style="padding:10px; color:var(--text-muted); text-align:center;">No hay abonos registrados aún.</td></tr>\`;
    } else {
        tbodyPagos.innerHTML = payments.map(p => \`
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                <td style="padding: 10px;">\${p.date}</td>
                <td style="padding: 10px; color: var(--text-muted);">\${p.id}</td>
                <td style="padding: 10px; color: var(--success); display:flex; justify-content:space-between; align-items:center;">
                    \${formatCurrency(p.amount)}
                    <button class="icon-btn small" onclick="sendWhatsAppTicket('\${c.id}', '\${p.id}')" title="Enviar Ticket por WhatsApp"><i class="ph ph-whatsapp-logo"></i></button>
                </td>
            </tr>
        \`).join('');
    }

    document.getElementById('modal-cronograma').style.display = 'flex';
};

window.sendWhatsAppTicket = function(clientId, paymentId) {
    const c = clients.find(cl => cl.id === clientId);
    if (!c || !c.payments) return;
    const p = c.payments.find(pay => pay.id === paymentId);
    if (!p) return;
    
    let phone = c.whatsapp.replace(/[^0-9]/g, '');
    let text = \`✅ *QOAN Financial - Recibo de Pago* ✅\\n\\n\` +
               \`Hola *\${c.name}*,\\nHemos registrado tu abono por *\${formatCurrency(p.amount)}*.\\n\\n\` +
               \`🔹 *Folio de Operación:* \${p.id}\\n\` +
               \`🗓️ *Fecha:* \${p.date}\\n\\n\` +
               \`¡Muchas gracias por tu pago!\`;
               
    const url = \`https://wa.me/\${phone}?text=\${encodeURIComponent(text)}\`;
    window.open(url, '_blank');
};

function renderDashboardTable() {
    const tbody = document.getElementById('table-dashboard-body');
    if (!tbody) return;
    
    let activeClients = getSortedList(filterClients(clients.filter(c => c.status !== 'Liquidado')));
    const dashCount = document.getElementById('dashboard-active-count');
    if(dashCount) dashCount.innerText = activeClients.length + ' ACTIVOS';

    tbody.innerHTML = activeClients.map(c => {
        const inst = getCurrentInstallment(c);
        const expected = inst ? getInstallmentTotal(inst, c.amount) : 0;
        return \`
        <tr>
            <td>
                <div class="client-cell">
                    <div class="avatar-sm">\${c.initials}</div>
                    <div><strong>\${c.name}</strong><span class="id-text">\${c.id}</span></div>
                </div>
            </td>
            <td>\${formatCurrency(c.amount)}</td>
            <td>\${formatCurrency(c.balance)}</td>
            <td>\${inst ? inst.date : '-'}</td>
            <td><strong>\${formatCurrency(expected)}</strong><br><span style="font-size: 11px; opacity: 0.7;">\${inst && inst.isFinal ? '(Capital + Int)' : '(Solo Interés)'}</span></td>
            <td>\${getStatusBadge(c.status)}</td>
            <td style="display: flex; gap: 4px; justify-content: flex-end;">\${getActionButtons(c)}</td>
        </tr>
    \`}).join('');
}

function renderSociosTable() {
    const tbody = document.getElementById('table-socios-body');
    if (!tbody) return;
    
    let socios = getSortedList(filterClients(clients.filter(c => c.status === 'En Proceso' || c.status === 'En Mora')));

    tbody.innerHTML = socios.map(c => {
        const inst = getCurrentInstallment(c);
        const expected = inst ? getInstallmentTotal(inst, c.amount) : 0;
        return \`
        <tr>
            <td>
                <div class="client-cell">
                    <div class="avatar-sm">\${c.initials}</div>
                    <div><strong>\${c.name}</strong><span class="id-text">\${c.id}</span></div>
                </div>
            </td>
            <td>\${formatCurrency(c.amount)}</td>
            <td>\${formatCurrency(c.balance)}</td>
            <td>\${inst ? inst.date : '-'}</td>
            <td><strong>\${formatCurrency(expected)}</strong></td>
            <td>\${getStatusBadge(c.status)}</td>
            <td style="display: flex; gap: 4px; justify-content: flex-end;">\${getActionButtons(c)}</td>
        </tr>
    \`}).join('');
}

function renderHistoryTable() {
    const tbody = document.getElementById('table-history-body');
    if (!tbody) return;
    
    let history = getSortedList(filterClients(clients.filter(c => c.status === 'Liquidado')));

    tbody.innerHTML = history.map(c => \`
        <tr>
            <td>
                <div class="client-cell">
                    <div class="avatar-sm">\${c.initials}</div>
                    <div><strong>\${c.name}</strong><span class="id-text">\${c.id}</span></div>
                </div>
            </td>
            <td>\${formatCurrency(c.amount)}</td>
            <td>\${c.endDate}</td>
            <td>\${getStatusBadge(c.status)}</td>
            <td style="display: flex; gap: 4px; justify-content: flex-end;">
                <button class="icon-btn small" onclick="viewCronograma('\${c.id}')" title="Ver Cronograma"><i class="ph ph-calendar-dots"></i></button>
                <button class="icon-btn small" onclick="deleteClient('\${c.id}')" title="Eliminar del Historial"><i class="ph ph-trash"></i></button>
            </td>
        </tr>
    \`).join('');
}

function renderAlerts() {
    const container = document.getElementById('alerts-container');
    if (!container) return;

    const today = new Date();
    today.setHours(0,0,0,0);
    
    let alertsHtml = '';

    clients.forEach(c => {
        if (c.status === 'Liquidado') return;
        const inst = getCurrentInstallment(c);
        if(!inst) return;

        const dateParts = inst.date.split('-');
        const endDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
        endDate.setHours(0,0,0,0);
        
        const diffDays = Math.round((endDate - today) / (1000 * 60 * 60 * 24));
        const expected = getInstallmentTotal(inst, c.amount);

        if (c.status === 'En Mora') {
            alertsHtml += \`
                <div class="alert-item" style="border-left: 3px solid var(--danger);">
                    <div class="alert-icon" style="color: var(--danger);"><i class="ph ph-warning-circle"></i></div>
                    <div class="alert-info">
                        <strong style="color: var(--danger);">Cuenta en Mora</strong>
                        <span>\${c.name} - Cuota: \${formatCurrency(expected)}</span>
                    </div>
                    <button class="icon-btn small" onclick="notifyWhatsApp('\${c.id}')"><i class="ph ph-whatsapp-logo"></i></button>
                </div>\`;
        } else if (diffDays >= 0 && diffDays <= 3) {
            let limitText = diffDays === 0 ? 'Vence HOY' : \`Vence en \${diffDays} días\`;
            alertsHtml += \`
                <div class="alert-item" style="border-left: 3px solid var(--warning);">
                    <div class="alert-icon" style="color: var(--warning);"><i class="ph ph-calendar-warning"></i></div>
                    <div class="alert-info">
                        <strong style="color: var(--warning);">\${limitText}</strong>
                        <span>\${c.name} - Cuota: \${formatCurrency(expected)}</span>
                    </div>
                    <button class="icon-btn small" onclick="notifyWhatsApp('\${c.id}')"><i class="ph ph-whatsapp-logo"></i></button>
                </div>\`;
        }
    });

    if (alertsHtml === '') {
        alertsHtml = \`
            <div style="text-align: center; color: var(--text-muted); padding: 16px;">
                <i class="ph ph-check-circle" style="font-size: 24px; opacity: 0.5;"></i>
                <p style="margin-top: 8px;">Todo está al día.</p>
            </div>\`;
    }
    container.innerHTML = alertsHtml;
}

function updateStats() {
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
        
        html += \`
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                <td style="padding: 16px;">
                    <div class="client-cell">
                        <div class="avatar-sm">\${c.initials}</div>
                        <div>
                            <strong>\${c.name}</strong>
                            <span class="id-text">\${c.id}</span>
                        </div>
                    </div>
                </td>
                <td style="padding: 16px; color: var(--text-secondary);">\${formatCurrency(c.amount)}</td>
                <td style="padding: 16px; color: \${clientMora > 0 ? 'var(--danger)' : 'var(--text-secondary)'};">
                    \${formatCurrency(clientMora)}
                </td>
                <td style="padding: 16px; color: var(--primary); font-weight: 500;">\${formatCurrency(clientRecuperar)}</td>
                <td style="padding: 16px;"><span class="status-badge \${statusClass}">\${c.status}</span></td>
            </tr>
        \`;
    });
    
    if (html === '') {
        html = \`<tr><td colspan="5" style="text-align:center; padding: 32px; color: var(--text-muted);">No hay clientes activos en este rango de fechas.</td></tr>\`;
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
`;

fs.writeFileSync('c:/Users/pucll/OneDrive/Desktop/N/app.js', content);
