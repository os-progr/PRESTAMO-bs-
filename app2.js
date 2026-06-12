// Data Storage Keys
const CLIENTS_KEY = 'qoan_clients';
const CONFIG_KEY = 'qoan_config';

// Global Variables
let rendimientoChartInstance = null;
let clients = JSON.parse(localStorage.getItem(CLIENTS_KEY)) || [];
let editingClientId = null;
let currentPaymentClientId = null;
let dirHandle = null;
let currentSortKey = null;
let sortAscending = true;

// IndexedDB para permisos de carpeta
function openIDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('qoan_db', 1);
        req.onupgradeneeded = (e) => {
            e.target.result.createObjectStore('settings');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function saveHandle(handle) {
    const db = await openIDB();
    const tx = db.transaction('settings', 'readwrite');
    tx.objectStore('settings').put(handle, 'dirHandle');
    return new Promise(r => tx.oncomplete = r);
}

async function getHandle() {
    const db = await openIDB();
    const tx = db.transaction('settings', 'readonly');
    const req = tx.objectStore('settings').get('dirHandle');
    return new Promise(r => {
        req.onsuccess = () => r(req.result);
        req.onerror = () => r(null);
    });
}

async function verifyPermission(fileHandle, readWrite) {
    const options = {};
    if (readWrite) {
        options.mode = 'readwrite';
    }
    if ((await fileHandle.queryPermission(options)) === 'granted') {
        return true;
    }
    if ((await fileHandle.requestPermission(options)) === 'granted') {
        return true;
    }
    return false;
}

async function autoSave() {
    if (!dirHandle) return;
    try {
        if (await verifyPermission(dirHandle, true)) {
            const fileHandle = await dirHandle.getFileHandle('qoan_backup.json', { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(JSON.stringify({ config, clients }, null, 2));
            await writable.close();
            const statusEl = document.getElementById('dir-status');
            if (statusEl) statusEl.innerHTML = `<span style="color: var(--success)"><i class="ph ph-check-circle"></i> Sincronizando en: ${dirHandle.name}</span>`;
        }
    } catch (e) {
        console.error('Autosave failed', e);
        const statusEl = document.getElementById('dir-status');
        if (statusEl) statusEl.innerHTML = `<span style="color: var(--danger)"><i class="ph ph-warning-circle"></i> Error guardando. Necesita permiso.</span>`;
    }
}

window.selectDirectory = async function() {
    try {
        dirHandle = await window.showDirectoryPicker();
        await saveHandle(dirHandle);
        await autoSave();
        alert('Carpeta vinculada exitosamente. El sistema hará copias de seguridad automáticas aquí.');
    } catch (e) {
        console.error('User cancelled or error', e);
    }
}

async function initFileAccess() {
    dirHandle = await getHandle();
    if (dirHandle) {
        const statusEl = document.getElementById('dir-status');
        if (statusEl) statusEl.innerHTML = `<span><i class="ph ph-folder"></i> Carpeta vinculada: ${dirHandle.name}.</span>`;
    }
}

function saveClientsData() {
    localStorage.setItem(CLIENTS_KEY, JSON.stringify(clients));
    autoSave();
}

// Load initial config
let config = JSON.parse(localStorage.getItem(CONFIG_KEY)) || {
    interesDiario: 0.5,
    moraAdicional: 5.0,
    telefonoRemitente: '',
    whatsappNum: '900 779 111',
    whatsappName: 'Juan David Puclla Quispe'
};

if (!config.whatsappNum) config.whatsappNum = '900 779 111';
if (!config.whatsappName) config.whatsappName = 'Juan David Puclla Quispe';

// Load initial clients
let rawClients = JSON.parse(localStorage.getItem(CLIENTS_KEY)) || [];
clients = rawClients.map(c => {
    if (!c.installments) {
        c.installments = [{
            date: c.endDate,
            expectedInterest: 0,
            penalty: 0,
            status: c.status === 'Liquidado' ? 'Pagado' : 'Pendiente',
            isFinal: true,
            paidAmount: c.status === 'Liquidado' ? c.balance : 0
        }];
        c.balance = c.amount; 
    }
    return c;
});

function getNextMonthDate(startDate, monthsToAdd) {
    const date = new Date(startDate);
    date.setMonth(date.getMonth() + parseInt(monthsToAdd));
    return date.toISOString().split('T')[0];
}

function generateInstallments(startDate, amount, durationMonths, interesDiario) {
    let installs = [];
    const monthlyInterest = amount * (interesDiario / 100) * 30;
    
    for (let i = 1; i <= durationMonths; i++) {
        installs.push({
            id: 'cuota-' + i,
            date: getNextMonthDate(startDate, i),
            expectedInterest: monthlyInterest,
            penalty: 0,
            status: 'Pendiente',
            isFinal: (i == durationMonths),
            paidAmount: 0
        });
    }
    return installs;
}

function getCurrentInstallment(client) {
    return client.installments.find(inst => inst.status !== 'Pagado');
}

function getInstallmentTotal(installment, capital) {
    if (!installment) return 0;
    return installment.expectedInterest + installment.penalty + (installment.isFinal ? capital : 0) - installment.paidAmount;
}

function checkMoras() {
    let changed = false;
    const today = new Date().toISOString().split('T')[0]; 
    const todayTime = new Date(today).getTime();
    
    clients.forEach(c => {
        if (c.status !== 'Liquidado') {
            const currentInst = getCurrentInstallment(c);
            if (!currentInst) {
                c.status = 'Liquidado';
                changed = true;
                return;
            }

            if (currentInst.date < today && c.status !== 'En Mora') {
                c.status = 'En Mora';
                c.lastPenaltyDate = currentInst.date; // The penalty starts counting from the cutoff date
                changed = true;
            }

            if (c.status === 'En Mora') {
                if (!c.lastPenaltyDate) c.lastPenaltyDate = currentInst.date;
                
                const lastPenaltyTime = new Date(c.lastPenaltyDate).getTime();
                const diffTime = todayTime - lastPenaltyTime;
                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                
                if (diffDays > 0) {
                    for (let i = 0; i < diffDays; i++) {
                        // Mora es ahora un monto fijo según contrato
                        const penalty = config.moraAdicional;
                        currentInst.penalty += penalty;
                    }
                    c.lastPenaltyDate = today;
                    changed = true;
                }
            }
        }
    });
    
    if (changed) {
        saveClientsData();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const confInteres = document.getElementById('config-interes');
    const confMora = document.getElementById('config-mora');
    const confTel = document.getElementById('config-telefono');
    const confWaNum = document.getElementById('config-whatsapp-num');
    const confWaName = document.getElementById('config-whatsapp-name');
    
    if (confInteres) confInteres.value = config.interesDiario;
    if (confMora) confMora.value = config.moraAdicional;
    if (confTel) confTel.value = config.telefonoRemitente || '';
    if (confWaNum) confWaNum.value = config.whatsappNum || '';
    if (confWaName) confWaName.value = config.whatsappName || '';
    
    document.getElementById('search-input').addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase();
        renderAllTables();
    });

    const btnExport = document.getElementById('btn-export');
    if (btnExport) btnExport.addEventListener('click', exportToCSV);
    
    const btnFilter = document.getElementById('btn-filter-stats');
    if (btnFilter) btnFilter.addEventListener('click', updateStats);
    
    
    checkMoras();
    renderAllTables();
    renderChart();
    
    initFileAccess();
});

document.getElementById('form-config').addEventListener('submit', (e) => {
    e.preventDefault();
    config = {
        interesDiario: parseFloat(document.getElementById('config-interes').value),
        moraAdicional: parseFloat(document.getElementById('config-mora').value),
        telefonoRemitente: document.getElementById('config-telefono').value,
        whatsappNum: document.getElementById('config-whatsapp-num').value,
        whatsappName: document.getElementById('config-whatsapp-name').value
    };
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    alert('Configuración guardada localmente.');
    renderAllTables();
    renderChart();
});

window.sortClients = function(key) {
    if (currentSortKey === key) {
        sortAscending = !sortAscending;
    } else {
        currentSortKey = key;
        sortAscending = true;
    }
    renderAllTables();
};

function getSortedList(list) {
    if (!currentSortKey) return list;
    return [...list].sort((a, b) => {
        let valA = a[currentSortKey];
        let valB = b[currentSortKey];
        
        if (currentSortKey === 'endDate') {
            const instA = getCurrentInstallment(a);
            const instB = getCurrentInstallment(b);
            valA = instA ? instA.date : '9999-99-99';
            valB = instB ? instB.date : '9999-99-99';
        }
        
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
        
        if (valA < valB) return sortAscending ? -1 : 1;
        if (valA > valB) return sortAscending ? 1 : -1;
        return 0;
    });
}

function exportToCSV() {
    if (clients.length === 0) {
        alert("No hay datos para exportar.");
        return;
    }
    const headers = ['ID', 'Nombre', 'DNI', 'WhatsApp', 'Fecha Inicio', 'Capital Original', 'Estado'];
    const rows = clients.map(c => [
        c.id, `"${c.name}"`, c.dni, c.whatsapp, c.startDate, c.amount, c.status
    ]);
    
    let csvContent = headers.join(',') + '\n' + rows.map(e => e.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "qoan_reporte.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function generateId() {
    return '#' + Math.floor(10000 + Math.random() * 90000) + '-' + String.fromCharCode(65 + Math.floor(Math.random() * 26));
}

function getInitials(name) {
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

document.getElementById('form-new-client').addEventListener('submit', (e) => {
    e.preventDefault();
    
    const name = document.getElementById('client-name').value;
    const date = document.getElementById('client-date').value;
    const duration = document.getElementById('client-duration').value;
    const amount = parseFloat(document.getElementById('client-amount').value);
    
    if (editingClientId) {
        const c = clients.find(cl => cl.id === editingClientId);
        if (c) {
            c.name = name;
            c.initials = getInitials(name);
            c.dni = document.getElementById('client-dni').value;
            c.address = document.getElementById('client-address').value;
            c.whatsapp = document.getElementById('client-whatsapp').value;
            c.phone2 = document.getElementById('client-phone2').value;
            c.notes = document.getElementById('client-notes').value;
        }
        editingClientId = null;
    } else {
        const installs = generateInstallments(date, amount, duration, config.interesDiario);
        const newClient = {
            id: generateId(),
            name: name,
            initials: getInitials(name),
            dni: document.getElementById('client-dni').value,
            address: document.getElementById('client-address').value,
            whatsapp: document.getElementById('client-whatsapp').value,
            phone2: document.getElementById('client-phone2').value,
            startDate: date,
            endDate: getNextMonthDate(date, duration),
            duration: duration,
            amount: amount,
            balance: amount, 
            notes: document.getElementById('client-notes').value,
            status: 'Al Día',
            lastPenaltyDate: null,
            installments: installs,
            payments: []
        };
        clients.push(newClient);
    }

    saveClientsData();
    document.getElementById('form-new-client').reset();
    document.getElementById('modal-new-client').style.display = 'none';
    
    alert('Cliente guardado exitosamente.');
    checkMoras(); 
    renderAllTables();
    renderChart();
});

window.openNewClientModal = function() {
    editingClientId = null;
    document.getElementById('form-new-client').reset();
    document.getElementById('client-date').disabled = false;
    document.getElementById('client-duration').disabled = false;
    document.getElementById('client-amount').disabled = false;
    document.getElementById('modal-new-client').style.display = 'flex';
};

window.editClient = function(clientId) {
    const c = clients.find(cl => cl.id === clientId);
    if (!c) return;
    
    editingClientId = clientId;
    document.getElementById('client-name').value = c.name;
    document.getElementById('client-dni').value = c.dni;
    document.getElementById('client-address').value = c.address || '';
    document.getElementById('client-whatsapp').value = c.whatsapp;
    document.getElementById('client-phone2').value = c.phone2 || '';
    document.getElementById('client-date').value = c.startDate;
    document.getElementById('client-duration').value = c.duration;
    document.getElementById('client-amount').value = c.amount;
    document.getElementById('client-notes').value = c.notes || '';
    
    // Deshabilitar campos financieros en modo edición
    document.getElementById('client-date').disabled = true;
    document.getElementById('client-duration').disabled = true;
    document.getElementById('client-amount').disabled = true;
    
    document.getElementById('modal-new-client').style.display = 'flex';
};

window.deleteClient = function(clientId) {
    if(!confirm('¿Estás seguro de que deseas eliminar a este cliente?')) return;
    clients = clients.filter(c => c.id !== clientId);
    saveClientsData();
    renderAllTables();
    renderChart();
};

window.openPaymentModal = function(clientId) {
    const c = clients.find(cl => cl.id === clientId);
    const inst = getCurrentInstallment(c);
    if(!inst) return;
    
    const expected = getInstallmentTotal(inst, c.amount);
    
    document.getElementById('payment-client-id').value = clientId;
    document.getElementById('payment-amount').value = expected.toFixed(2);
    document.getElementById('modal-payment').style.display = 'flex';
};

document.getElementById('form-payment').addEventListener('submit', (e) => {
    e.preventDefault();
    const clientId = document.getElementById('payment-client-id').value;
    const amountPaid = parseFloat(document.getElementById('payment-amount').value);
    
    const client = clients.find(c => c.id === clientId);
    if (!client) return;

    const inst = getCurrentInstallment(client);
    if(!inst) return;

    inst.paidAmount += amountPaid;
    
    if (!client.payments) client.payments = [];
    client.payments.push({
        id: 'PAY-' + Date.now().toString().slice(-6),
        date: new Date().toLocaleString('es-PE'),
        amount: amountPaid,
        instId: inst.id
    });
    
    const expected = getInstallmentTotal(inst, client.amount);
    
    if (expected <= 0.01) {
        inst.status = 'Pagado';
        client.status = 'Al Día'; // reset mora
        client.lastPenaltyDate = null;
        
        const next = getCurrentInstallment(client);
        if (!next) {
            client.status = 'Liquidado';
            alert('¡El cliente ha liquidado el préstamo por completo!');
        } else {
            alert('Cuota mensual pagada correctamente.');
        }
    } else {
        alert('Abono parcial registrado. Falta cubrir: ' + formatCurrency(expected));
    }
    
    saveClientsData();
    document.getElementById('modal-payment').style.display = 'none';
    renderAllTables();
    renderChart();
});

window.notifyWhatsApp = function(clientId) {
    const client = clients.find(c => c.id === clientId);
    if (!client) return;

    const inst = getCurrentInstallment(client);
    const expected = inst ? getInstallmentTotal(inst, client.amount) : 0;
    
    const currentIndex = inst ? client.installments.indexOf(inst) + 1 : 0;
    const totalInst = client.installments.length;
    const cuotaText = currentIndex > 0 ? `Te recordamos que esta es tu cuota ${currentIndex} de ${totalInst}.` : '';

    let phone = client.whatsapp.replace(/[^0-9]/g, '');
    let text = '';
    const num = config.whatsappNum || '900 779 111';
    const name = config.whatsappName || 'Juan David Puclla Quispe';
    const instrucciones = `Por favor realiza el depósito o transferencia al número *${num}* (A nombre de: ${name}).\n\n📸 *IMPORTANTE:* Una vez realizado el pago, envía una captura de pantalla del voucher por este medio para registrar tu abono.`;

    if (client.status === 'En Mora' && inst) {
        text = `🚨 *QOAN Financial - Aviso de Atraso* 🚨\n\n` +
               `Hola *${client.name}*,\nTu cuenta se encuentra *EN MORA*. Te pedimos regularizar el pago de tu cuota atrasada. ${cuotaText}\n\n` +
               `🔹 *Folio:* ${client.id}\n` +
               `📅 *Fecha de Corte:* ${inst.date}\n` +
               `⚠️ *Mora Acumulada:* ${formatCurrency(inst.penalty)}\n` +
               `💰 *CUOTA A PAGAR: ${formatCurrency(expected)}*\n\n` +
               `📲 *Instrucciones de Pago:*\n` +
               `${instrucciones}`;
    } else if (inst) {
        text = `💳 *QOAN Financial - Estado de Cuenta* 💳\n\n` +
               `Hola *${client.name}*,\nTe recordamos el pago de tu próxima cuota. ${cuotaText}\n\n` +
               `🔹 *Folio:* ${client.id}\n` +
               `🗓️ *Fecha de Corte:* ${inst.date}\n` +
               `💰 *CUOTA ESPERADA: ${formatCurrency(expected)}*\n\n` +
               `📲 *Instrucciones de Pago:*\n` +
               `${instrucciones}`;
    }
    
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
};

window.markAsPaid = function(clientId) {
    if(!confirm('¿Marcar cuenta como Liquidada (Perdonar todo lo pendiente)?')) return;
    const client = clients.find(c => c.id === clientId);
    if (!client) return;
    client.status = 'Liquidado';
    client.installments.forEach(i => i.status = 'Pagado');
    saveClientsData();
    renderAllTables();
    renderChart();
}

function renderAllTables() {
    renderDashboardTable();
    renderSociosTable();
    renderHistoryTable();
    renderAlerts();
    updateStats();
}

function getStatusBadge(status) {
    if(status === 'Al Día') return '<span class="status-badge success">Al Día</span>';
    if(status === 'En Mora') return '<span class="status-badge danger">En Mora</span>';
    if(status === 'En Proceso') return '<span class="status-badge info">En Proceso</span>';
    if(status === 'Liquidado') return '<span class="status-badge success">Liquidado</span>';
    return `<span class="status-badge info">${status}</span>`;
}


