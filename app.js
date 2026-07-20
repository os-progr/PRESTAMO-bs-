// --- Supabase Config ---
const SUPABASE_URL = 'https://ryphrvuljryvwtvssnff.supabase.co';
const SUPABASE_KEY = 'sb_publishable_-wbllkasfqvfCL3E2tX4wA_6EVwctTR';
let supabaseClient = null;
if (window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

// Data Storage Keys
const CLIENTS_KEY = 'qoan_clients';
window.showToast = function(msg, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `glass-card toast-${type}`;
    toast.style.padding = '12px 20px';
    toast.style.borderLeft = `4px solid ${type === 'success' ? 'var(--success)' : (type === 'error' ? 'var(--danger)' : 'var(--primary)')}`;
    toast.style.color = 'white';
    toast.style.display = 'flex';
    toast.style.alignItems = 'center';
    toast.style.gap = '8px';
    toast.style.boxShadow = '0 8px 32px rgba(0,0,0,0.3)';
    toast.style.animation = 'slideIn 0.3s ease forwards';
    toast.style.transition = 'opacity 0.3s ease';
    
    const icon = type === 'success' ? '<i class="ph ph-check-circle" style="color:var(--success); font-size:1.2rem;"></i>' : 
                 (type === 'error' ? '<i class="ph ph-warning-circle" style="color:var(--danger); font-size:1.2rem;"></i>' : 
                 '<i class="ph ph-info" style="color:var(--primary); font-size:1.2rem;"></i>');
                 
    toast.innerHTML = `${icon} <span>${msg}</span>`;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

const CONFIG_KEY = 'qoan_config';

// Global Variables
let rendimientoChartInstance = null;
let clients = [];
let clientsLoadedFromSupabase = false;
let editingClientId = null;
let currentChart = null;

function getLocalDateString() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split('T')[0];
}
let currentPaymentClientId = null;
let dirHandle = null;
let currentSortKey = null;
let sortAscending = true;
let searchQuery = '';

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
        showToast('Carpeta vinculada exitosamente. El sistema hará copias de seguridad automáticas aquí.');
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
    interesDiario: 2.5,
    moraAdicional: 5.0,
    telefonoRemitente: '',
    whatsappNum: '900 779 111',
    whatsappName: 'Juan David Puclla Quispe'
};

if (!config.whatsappNum) config.whatsappNum = '900 779 111';
if (!config.whatsappName) config.whatsappName = 'Juan David Puclla Quispe';

function mapSupabaseClientToApp(row) {
    const duration = row.term || 1;
    let date = row.startDate || row.date || getLocalDateString();
    if (date && date.includes('T')) date = date.split('T')[0];
    
    // Función auxiliar para iniciales
    function getInits(n) {
        return (n||'').split(' ').map(x => x[0]).join('').substring(0, 2).toUpperCase();
    }
      const isLiquidado = (row.status === 'Pagado' || parseFloat(row.remainingBalance || 1) <= 0);
    const finalStatus = isLiquidado ? 'Liquidado' : (row.status === 'Pendiente' ? 'Al Día' : (row.status || 'Al Día'));
    
    // Calculate monthly interest rate from row or fallback to config * 30
    const monthlyRateStr = row.interest ? (row.interest / 100) : (config.interesDiario / 100) * 30;
    
    // Extract META
    let penalties = [];
    let lastPenaltyDate = null;
    let cleanNotes = row.notes || '';
    const metaMatch = cleanNotes.match(/<!--META:(.*?)-->/);
    if (metaMatch) {
        try {
            const metaObj = JSON.parse(metaMatch[1]);
            penalties = metaObj.p || [];
            lastPenaltyDate = metaObj.l || null;
            cleanNotes = cleanNotes.replace(/<!--META:.*?-->/g, '').trim();
        } catch(e) {}
    }

    // Generar cuotas si no existen en la BD (para adaptación)
    const installs = generateInstallments(date, parseFloat(row.amount || 0), duration, monthlyRateStr, true);
    
    // Apply META penalties
    installs.forEach((inst, idx) => {
        if (penalties[idx]) inst.penalty = penalties[idx];
    });
    
    const payments = (row.payments || []).map(p => ({
        id: p.id || ('PAY-' + Date.now().toString().slice(-6) + Math.floor(Math.random()*1000)),
        amount: parseFloat(p.amount),
        date: p.date,
        paymentType: p.paymentType || 'abono'
    }));

    // Distribuir el monto total pagado en las cuotas para recuperar abonos parciales
    let totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    
    installs.forEach(inst => {
        let expectedForInst = inst.expectedInterest + inst.penalty + (inst.isFinal ? parseFloat(row.amount || 0) : 0);
        if (isLiquidado) {
            inst.status = 'Pagado';
            inst.paidAmount = expectedForInst;
        } else {
            if (totalPaid >= expectedForInst) {
                inst.status = 'Pagado';
                inst.paidAmount = expectedForInst;
                totalPaid -= expectedForInst;
            } else if (totalPaid > 0) {
                inst.status = 'Pendiente';
                inst.paidAmount = totalPaid;
                totalPaid = 0;
            } else {
                inst.status = 'Pendiente';
                inst.paidAmount = 0;
            }
        }
    });

    return {
        id: row.id,
        name: row.name || 'Sin Nombre',
        initials: getInits(row.name),
        dni: row.dni || '',
        address: row.maps || '', 
        whatsapp: row.phone || '',
        phone2: '',
        startDate: date,
        endDate: getNextMonthDate(date, duration),
        duration: duration,
        amount: parseFloat(row.amount || 0),
        balance: parseFloat(row.remainingBalance || 0),
        notes: cleanNotes,
        status: finalStatus,
        lastPenaltyDate: lastPenaltyDate,
        installments: installs,
        payments: payments
    };
}

function mapAppClientToSupabase(c) {
    const isLiquidado = c.status === 'Liquidado' || c.balance <= 0;
    const mappedStatus = isLiquidado ? 'Pagado' : (c.status === 'Al Día' ? 'Pendiente' : c.status);
    
    // Inject META
    const penalties = c.installments ? c.installments.map(i => i.penalty || 0) : [];
    const metaObj = {
        p: penalties,
        l: c.lastPenaltyDate || null
    };
    const cleanNotes = (c.notes || '').replace(/<!--META:.*?-->/g, '').trim();
    const newNotes = cleanNotes + (Object.keys(metaObj).length > 0 ? ` <!--META:${JSON.stringify(metaObj)}-->` : '');
    
    return {
        id: c.id,
        name: c.name,
        dni: c.dni,
        maps: c.address,
        phone: c.whatsapp,
        startDate: c.startDate,
        term: c.duration,
        amount: c.amount,
        remainingBalance: c.balance,
        notes: newNotes,
        status: mappedStatus,
        interestPaidCount: c.installments ? c.installments.filter(i => i.status === 'Pagado').length : 0,
        interest: c.interest || config.interesDiario || 2.5,
        loanType: c.loanType || 'Diario',
        totalToReturn: c.installments ? c.installments.reduce((sum, i) => sum + (i.expectedInterest || 0) + (i.penalty || 0), c.amount) : c.amount,
        date: new Date().toISOString()
    };
}

async function syncClientToSupabase(c) {
    if (!supabaseClient) return;
    try {
        const rowData = mapAppClientToSupabase(c);
        const { error } = await supabaseClient.from('clients').upsert(rowData);
        if (error) throw error;
        console.log('Synced client to Supabase:', c.id);
    } catch (e) {
        console.error('Error syncing client to Supabase:', e);
    }
}

async function loadClientsFromSupabase() {
    if (!supabaseClient) return;
    try {
        const { data: supaClients, error } = await supabaseClient.from('clients').select('*, payments(*)');
        if (error) throw error;
        
        let supaPayments = null;
        try {
            const { data } = await supabaseClient.from('payments').select('*');
            supaPayments = data;
        } catch(err) {
            console.warn('Separated payment fetch failed (RLS maybe):', err);
        }
        
        if (supaClients && supaClients.length > 0) {
            // Unir pagos manualmente si la relación devolvió vacío y el fetch separado funcionó
            if (supaPayments) {
                supaClients.forEach(c => {
                    if (!c.payments || c.payments.length === 0) {
                        c.payments = supaPayments.filter(p => p.clientId === c.id);
                    }
                });
            }
            
            clients = supaClients.map(mapSupabaseClientToApp);
            clientsLoadedFromSupabase = true;
            saveClientsData(); // Guardar copia local por si acaso
            checkMoras();
            renderAllTables();
            renderChart();
        }
    } catch (e) {
        console.error('Error cargando de Supabase:', e);
        showToast('Error cargando datos: ' + e.message, 'error');
    }
}

// Fallback load local clients if Supabase takes too long or fails
let rawClients = JSON.parse(localStorage.getItem(CLIENTS_KEY)) || [];
clients = rawClients;

function getNextMonthDate(startDate, monthsToAdd) {
    const date = new Date(startDate + 'T12:00:00');
    date.setMonth(date.getMonth() + parseInt(monthsToAdd));
    return date.toISOString().split('T')[0];
}

function generateInstallments(startDate, amount, durationMonths, interestRate, isMonthlyRate = false) {
    let installs = [];
    const monthlyInterest = isMonthlyRate 
        ? amount * interestRate 
        : amount * (interestRate / 100) * 30;
    
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

function updateClientBalance(client) {
    let total = 0;
    if (client.installments) {
        client.installments.forEach(i => {
            const exp = getInstallmentTotal(i, client.amount);
            if (exp > 0) total += exp;
        });
    }
    client.balance = total;
}

function checkMoras() {
    let changed = false;
    const today = getLocalDateString();
    const todayTime = new Date(today).getTime();
    
    clients.forEach(c => {
        if (c.status !== 'Liquidado' && c.status !== 'Incobrable') {
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
                if (c.customMora !== undefined) {
                    currentInst.penalty = c.customMora;
                    c.lastPenaltyDate = today;
                    changed = true;
                    updateClientBalance(c);
                } else {
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
                        updateClientBalance(c);
                    }
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
    const confAllowAdmin = document.getElementById('config-allow-edit-financials');
    
    if (confInteres) confInteres.value = config.interesDiario;
    if (confMora) confMora.value = config.moraAdicional;
    if (confTel) confTel.value = config.telefonoRemitente || '';
    if (confWaNum) confWaNum.value = config.whatsappNum || '';
    if (confWaName) confWaName.value = config.whatsappName || '';
    if (confAllowAdmin) confAllowAdmin.checked = config.allowEditFinancials || false;
    
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
    
    // Cargar de Supabase al iniciar
    loadClientsFromSupabase();
});

document.getElementById('form-config').addEventListener('submit', (e) => {
    e.preventDefault();
    config = {
        interesDiario: parseFloat(document.getElementById('config-interes').value),
        moraAdicional: parseFloat(document.getElementById('config-mora').value),
        telefonoRemitente: document.getElementById('config-telefono').value,
        whatsappNum: document.getElementById('config-whatsapp-num').value,
        whatsappName: document.getElementById('config-whatsapp-name').value,
        allowEditFinancials: document.getElementById('config-allow-edit-financials').checked
    };
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    saveClientsData();
    showToast('Configuración guardada localmente.');
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
        showToast("No hay datos para exportar.", "error");
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
                c.address = '';
                c.whatsapp = document.getElementById('client-whatsapp').value;
                c.phone2 = document.getElementById('client-phone2').value;
                c.notes = document.getElementById('client-notes').value;
                
                if (config.allowEditFinancials) {
                    const manualInt = parseFloat(document.getElementById('client-interest').value);
                    const manualMora = parseFloat(document.getElementById('client-custom-mora').value);
                    
                    if (!isNaN(manualInt)) {
                        c.interest = manualInt;
                        // Recalcular interés esperado para las cuotas pendientes
                        if (c.installments) {
                            const newMonthlyInterest = c.amount * (manualInt / 100);
                            c.installments.forEach(inst => {
                                if (inst.status !== 'Pagado') {
                                    inst.expectedInterest = newMonthlyInterest;
                                }
                            });
                        }
                    }
                    
                    const newDate = document.getElementById('client-date').value;
                    const newDuration = parseInt(document.getElementById('client-duration').value);
                    const newAmount = parseFloat(document.getElementById('client-amount').value);
                    
                    let needsRegen = false;
                    if (newDate && newDate !== c.startDate) {
                        c.startDate = newDate;
                        c.endDate = getNextMonthDate(newDate, c.duration);
                        needsRegen = true;
                    }
                    if (newDuration && newDuration !== parseInt(c.duration)) {
                        c.duration = newDuration;
                        c.endDate = getNextMonthDate(c.startDate, newDuration);
                        needsRegen = true;
                    }
                    if (newAmount && newAmount !== c.amount) {
                        c.amount = newAmount;
                        c.balance = newAmount; // Reset balance to new amount
                        needsRegen = true;
                    }

                    if (needsRegen && c.installments) {
                        // Generate a fresh set of installments
                        const useRate = c.interest !== undefined ? (c.interest / 100) : config.interesDiario;
                        const isMonthly = c.interest !== undefined;
                        const newInstalls = generateInstallments(c.startDate, c.amount, c.duration, useRate, isMonthly);
                        // Overlay any already paid installments
                        newInstalls.forEach((newInst, idx) => {
                            const oldInst = c.installments[idx];
                            if (oldInst && oldInst.status === 'Pagado') {
                                newInst.status = 'Pagado';
                                newInst.paidAmount = oldInst.paidAmount;
                                newInst.penalty = oldInst.penalty;
                                newInst.paymentDate = oldInst.paymentDate;
                            }
                        });
                        c.installments = newInstalls;
                    }
                    if (!isNaN(manualMora)) {
                        c.customMora = manualMora;
                    } else {
                        delete c.customMora;
                    }
                }
            }
            
            updateClientBalance(c);
            saveClientsData();
            if (c && typeof syncClientToSupabase === 'function') {
                syncClientToSupabase(c);
            }
            
            editingClientId = null;
        } else {
            const manualInt = parseFloat(document.getElementById('client-interest').value);
            const manualMora = parseFloat(document.getElementById('client-custom-mora').value);
            
            const useRate = !isNaN(manualInt) ? manualInt : undefined;
            const isMonthly = !isNaN(manualInt);
            const effectiveRate = isMonthly ? (manualInt / 100) : config.interesDiario;
            
            const installs = generateInstallments(date, amount, duration, effectiveRate, isMonthly);
            
            const newClient = {
                id: generateId(),
                name: name,
                initials: getInitials(name),
                dni: document.getElementById('client-dni').value,
                address: '',
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
            
            if (isMonthly) {
                newClient.interest = manualInt;
            }
            if (!isNaN(manualMora)) {
                newClient.customMora = manualMora;
            }
            
            clients.push(newClient);
            
            updateClientBalance(newClient);
            saveClientsData();
            if (typeof syncClientToSupabase === 'function') {
                syncClientToSupabase(newClient);
            }
        }
        
        document.getElementById('form-new-client').reset();
        document.getElementById('modal-new-client').style.display = 'none';
        
        showToast('Cliente guardado exitosamente.');
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
    
    const adminContainer = document.getElementById('admin-financials-container');
    if (adminContainer) adminContainer.style.display = 'none';

    document.getElementById('modal-new-client').style.display = 'flex';
};

window.editClient = function(clientId) {
    const c = clients.find(cl => cl.id === clientId);
    if (!c) return;
    
    editingClientId = clientId;
    document.getElementById('client-name').value = c.name;
    document.getElementById('client-dni').value = c.dni;
    const addrEl = document.getElementById('client-address');
    if (addrEl) addrEl.value = c.address || '';
    document.getElementById('client-whatsapp').value = c.whatsapp;
    document.getElementById('client-phone2').value = c.phone2 || '';
    document.getElementById('client-date').value = c.startDate;
    document.getElementById('client-duration').value = c.duration;
    document.getElementById('client-amount').value = c.amount;
    document.getElementById('client-notes').value = c.notes || '';
    
    // Admin Financials
    const adminContainer = document.getElementById('admin-financials-container');
    if (adminContainer) {
        if (config.allowEditFinancials) {
            adminContainer.style.display = 'grid';
            document.getElementById('client-interest').value = c.interest || 15;
            document.getElementById('client-custom-mora').value = (c.customMora !== undefined) ? c.customMora : '';
        } else {
            adminContainer.style.display = 'none';
        }
    }

    document.getElementById('client-date').disabled = false;
    document.getElementById('client-duration').disabled = false;
    document.getElementById('client-amount').disabled = false;
    
    document.getElementById('modal-new-client').style.display = 'flex';
};

window.deleteClient = async function(clientId) {
    if(!confirm('¿Estás seguro de que deseas eliminar a este cliente?')) return;
    
    // Eliminar de Supabase primero
    if (supabaseClient) {
        try {
            await supabaseClient.from('clients').delete().eq('id', clientId);
            console.log('Client deleted from Supabase:', clientId);
        } catch (e) {
            console.error('Error deleting client from Supabase:', e);
            showToast('Error al eliminar de la base de datos.', 'error');
            return;
        }
    }
    
    clients = clients.filter(c => c.id !== clientId);
    saveClientsData();
    renderAllTables();
    renderChart();
    showToast('Cliente eliminado exitosamente.');
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
    
    const paymentId = 'PAY-' + Date.now().toString().slice(-6);
    const newPayment = {
        id: paymentId,
        date: new Date().toISOString(),
        amount: amountPaid,
        instId: inst.id
    };
    
    if (!client.payments) client.payments = [];
    client.payments.push(newPayment);
    
    const expected = getInstallmentTotal(inst, client.amount);
    
    if (expected <= 0.01) {
        inst.status = 'Pagado';
        client.status = 'Al Día'; // reset mora
        client.lastPenaltyDate = null;
        
        const next = getCurrentInstallment(client);
        if (!next) {
            client.status = 'Liquidado';
            showToast('¡El cliente ha liquidado el préstamo por completo!');
        } else {
            showToast('Cuota mensual pagada correctamente.');
        }
    } else {
        showToast('Abono parcial registrado. Falta cubrir: ' + formatCurrency(expected), 'info');
    }
    
    updateClientBalance(client);
    
    // Sincronizar pago a Supabase si está disponible
    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
        supabaseClient.from('payments').insert([{
            id: paymentId,
            clientId: client.id,
            amount: amountPaid,
            date: new Date().toISOString(),
            paymentType: 'abono'
        }]).then(({error}) => {
            if (error) console.error("Error guardando pago en Supabase:", error);
        });
        
        if (typeof syncClientToSupabase === 'function') {
            syncClientToSupabase(client);
        } else {
            const isLiquidado = client.status === 'Liquidado' || client.balance <= 0;
            const mappedStatus = isLiquidado ? 'Pagado' : (client.status === 'Al Día' ? 'Pendiente' : client.status);
            supabaseClient.from('clients').update({ status: mappedStatus, remainingBalance: client.balance }).eq('id', client.id).then();
        }
    }
    
    saveClientsData();
    document.getElementById('modal-payment').style.display = 'none';
    renderAllTables();
    renderChart();
    
    // Generar Ticket
    generateTicket(client, amountPaid, Math.max(0, expected), paymentId);
});

window.generateTicket = function(client, amountPaid, balance, paymentId) {
    document.getElementById('tkt-date').textContent = new Date().toLocaleString('es-PE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    document.getElementById('tkt-id').textContent = client.dni;
    document.getElementById('tkt-client').textContent = client.name;
    document.getElementById('tkt-amount').textContent = formatCurrency(amountPaid);
    document.getElementById('tkt-balance').textContent = formatCurrency(balance);

    const template = document.getElementById('ticket-template');
    template.style.top = '0';
    template.style.left = '0';
    template.style.zIndex = '-100';

    html2canvas(template, { backgroundColor: '#ffffff', scale: 2 }).then(async canvas => {
        template.style.top = '-9999px';
        template.style.left = '-9999px';
        
        // 1. Descarga para el usuario
        const link = document.createElement('a');
        const fileName = `Ticket_${client.name.replace(/\s+/g, '_')}_${paymentId}.png`;
        link.download = fileName;
        link.href = canvas.toDataURL('image/png');
        link.click();
        
        // 2. Respaldo Automático en la carpeta local si está vinculada
        if (typeof dirHandle !== 'undefined' && dirHandle) {
            try {
                if (await verifyPermission(dirHandle, true)) {
                    // Intentar crear/abrir subcarpeta 'Tickets'
                    let ticketsDir;
                    try {
                        ticketsDir = await dirHandle.getDirectoryHandle('Tickets_QOAN', { create: true });
                    } catch(e) {
                        ticketsDir = dirHandle; // Si falla, guardar en la raíz de la carpeta vinculada
                    }
                    const fileHandle = await ticketsDir.getFileHandle(fileName, { create: true });
                    const writable = await fileHandle.createWritable();
                    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                    await writable.write(blob);
                    await writable.close();
                    console.log('Ticket guardado en respaldo automático:', fileName);
                }
            } catch (e) {
                console.error('Error guardando ticket en respaldo automático', e);
            }
        }
    });
};

window.notifyWhatsApp = function(clientId) {
    const client = clients.find(c => c.id === clientId);
    if (!client) return;

    if (!client.whatsapp) {
        alert('Este cliente no tiene número de WhatsApp registrado.');
        return;
    }

    const inst = getCurrentInstallment(client);
    const expected = inst ? getInstallmentTotal(inst, client.amount) : 0;
    
    const currentIndex = inst ? client.installments.indexOf(inst) + 1 : 0;
    const totalInst = client.installments.length;
    const cuotaText = currentIndex > 0 ? `(Cuota ${currentIndex} de ${totalInst})` : '';

    let phone = client.whatsapp.replace(/[^0-9]/g, '');
    const today = getLocalDateString();
    const isToday = inst && inst.date === today;
    
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Buenos días' : (hour < 19 ? 'Buenas tardes' : 'Buenas noches');

    function formatFancyDate(dString) {
        if (!dString) return '';
        const parts = dString.split('-');
        if (parts.length !== 3) return dString;
        const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        return `${parseInt(parts[2], 10)} de ${months[parseInt(parts[1], 10) - 1]} de ${parts[0]}`;
    }
    const fancyDate = formatFancyDate(inst ? inst.date : '');

    let waType = '';
    let waMessage = '';
    let waIcon = '';
    let waColor = '';
    let waBg = '';
    let waBorder = '';

    if (client.status === 'En Mora' && inst) {
        waType = 'Aviso de Cobranza';
        waIcon = '🚨';
        const missedText = getMissedInstallmentsText(client);
        const specificMissed = missedText ? `${missedText}.` : `(Cuota ${currentIndex} de ${totalInst}).`;
        waMessage = `Le informamos que su cuenta registra un atraso. Su historial crediticio es muy importante. ${specificMissed} Por favor regularice su pago a la brevedad.`;
        waColor = '#ef4444'; // Red
        waBg = 'rgba(239, 68, 68, 0.15)';
        waBorder = 'rgba(239, 68, 68, 0.3)';
    } else if (isToday && inst) {
        waType = 'Vencimiento Hoy';
        waIcon = '⚠️';
        waMessage = `Le recordamos que HOY es la fecha límite para el pago de su cuota. Evite cargos adicionales por mora y mantenga su crédito al día. (Cuota ${currentIndex} de ${totalInst})`;
        waColor = '#f59e0b'; // Amber
        waBg = 'rgba(245, 158, 11, 0.15)';
        waBorder = 'rgba(245, 158, 11, 0.3)';
    } else if (inst) {
        waType = 'Estado de Cuenta';
        waIcon = '💳';
        waMessage = `Esperamos que se encuentre muy bien. Le escribimos para recordarle amablemente que su próxima cuota está por vencer. (Cuota ${currentIndex} de ${totalInst})`;
        waColor = '#4ade80'; // Green
        waBg = 'rgba(74, 222, 128, 0.15)';
        waBorder = 'rgba(74, 222, 128, 0.3)';
    }

    const num = config.whatsappNum || '900 779 111';
    const name = config.whatsappName || 'Juan David Puclla Quispe';
    const introText = `${greeting}, *${client.name}*.\n\nLe envío el detalle de su cuenta en la imagen generada. 👇\n\n_(Por favor, adjunte la imagen descargada en este chat)_\n\n*Método de Pago:*\nCuenta: ${num}\nTitular: ${name}\n\nQuedamos a la espera de la foto de su voucher. ¡Gracias!`;
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(introText)}`;

    if (inst) {
        document.getElementById('wa-type-badge').textContent = waType;
        document.getElementById('wa-type-badge').style.color = waColor;
        document.getElementById('wa-type-badge').style.backgroundColor = waBg;
        document.getElementById('wa-type-badge').style.borderColor = waBorder;
        
        document.getElementById('wa-icon').textContent = waIcon;
        document.getElementById('wa-greeting').textContent = greeting;
        document.getElementById('wa-client').textContent = client.name;
        document.getElementById('wa-message').textContent = waMessage;
        document.getElementById('wa-date').textContent = fancyDate;
        
        const amountEl = document.getElementById('wa-amount');
        amountEl.textContent = formatCurrency(expected);
        amountEl.style.color = waColor;

        const template = document.getElementById('wa-image-template');
        template.style.top = '0';
        template.style.left = '0';
        template.style.zIndex = '-100';

        // Add a small loading indicator or just rely on speed
        html2canvas(template, { backgroundColor: null, scale: 2 }).then(canvas => {
            template.style.top = '-9999px';
            template.style.left = '-9999px';
            
            const link = document.createElement('a');
            const safeName = client.name.replace(/\s+/g, '_');
            link.download = `Estado_Cuenta_${safeName}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
            
            // Open WhatsApp tab
            setTimeout(() => {
                window.open(url, '_blank');
            }, 300);
        });
    } else {
        window.open(url, '_blank');
    }
};

window.markAsPaid = function(clientId) {
    if(!confirm('¿Marcar cuenta como Liquidada (Perdonar todo lo pendiente)?')) return;
    const client = clients.find(c => c.id === clientId);
    if (!client) return;
    client.status = 'Liquidado';
    client.balance = 0;
    if (client.installments) {
        client.installments.forEach(i => i.status = 'Pagado');
    }
    saveClientsData();
    
    if (typeof syncClientToSupabase === 'function') {
        syncClientToSupabase(client);
    }
    
    renderAllTables();
    renderChart();
}

window.undoLiquidado = function(clientId) {
    if(!confirm('¿Restaurar este cliente a estado activo?')) return;
    const c = clients.find(cl => cl.id === clientId);
    if (!c) return;
    
    if (c.installments) {
        c.installments.forEach(inst => {
            inst.paidAmount = 0;
            inst.status = 'Pendiente';
        });
        
        let totalPaid = (c.payments || []).reduce((sum, p) => sum + p.amount, 0);
        c.installments.forEach(inst => {
            let expectedForInst = inst.expectedInterest + (inst.penalty || 0) + (inst.isFinal ? c.amount : 0);
            if (totalPaid >= expectedForInst) {
                inst.status = 'Pagado';
                inst.paidAmount = expectedForInst;
                totalPaid -= expectedForInst;
            } else {
                inst.status = 'Pendiente';
                inst.paidAmount = Math.max(0, totalPaid);
                totalPaid = 0;
            }
        });
        
        const pendingInsts = c.installments.filter(i => i.status !== 'Pagado');
        if (pendingInsts.length === 0) {
            c.status = 'Liquidado';
            c.balance = 0;
            showToast('El cliente ya tiene abonos suficientes para estar liquidado. No se puede restaurar.', 'error');
            return;
        } else {
            const todayStr = getLocalDateString();
            const hasMora = pendingInsts.some(i => i.date < todayStr);
            c.status = hasMora ? 'En Mora' : 'Al Día';
        }
    } else {
        c.status = 'Al Día';
    }
    
    updateClientBalance(c);
    
    if (typeof syncClientToSupabase === 'function') {
        syncClientToSupabase(c);
    }
    
    saveClientsData();
    renderAllTables();
    renderChart();
    
    showToast('Cliente restaurado correctamente.');
};

function renderAllTables() {
    renderDashboardTable();
    renderSociosTable();
    renderHistoryTable();
    renderIncobrablesTable();
    renderAlerts();
    updateStats();
    if (typeof renderAdminPublicTable === 'function') renderAdminPublicTable();
}

function getStatusBadge(status) {
    if(status === 'Al Día') return '<span class="status-badge success">Al Día</span>';
    if(status === 'En Mora') return '<span class="status-badge danger">En Mora</span>';
    if(status === 'En Proceso' || status === 'Al Día') return '<span class="status-badge info">Al Día</span>';
    if(status === 'Liquidado') return '<span class="status-badge success">Liquidado</span>';
    if(status === 'Incobrable') return '<span class="status-badge danger" style="background: rgba(220, 38, 38, 0.2);">Incobrable</span>';
    return `<span class="status-badge info">${status}</span>`;
}



function filterClients(list) {
    if (!searchQuery) return list;
    return list.filter(c => c.name.toLowerCase().includes(searchQuery) || c.id.toLowerCase().includes(searchQuery));
}

window.togglePublic = async function(clientId) {
    const c = clients.find(cl => cl.id === clientId);
    if (!c) return;
    
    const isCurrentlyPublic = (c.notes || '').includes('[PUBLIC]');
    let cleanNotes = (c.notes || '').replace('[PUBLIC]', '').trim();
    
    if (isCurrentlyPublic) {
        c.notes = cleanNotes;
    } else {
        c.notes = cleanNotes + (cleanNotes ? ' ' : '') + '[PUBLIC]';
    }
    
    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
        syncClientToSupabase(c);
    }
    saveClientsData();
    renderAllTables();
};

function renderAdminPublicTable() {
    const tbody = document.getElementById('table-admin-public-body');
    if (!tbody) return;
    
    let list = getSortedList(clients.filter(c => c.status !== 'Liquidado' && c.status !== 'Pagado'));
    if (searchQuery) {
        list = filterClients(list);
    }
    
    tbody.innerHTML = list.map(c => {
        const isPublic = (c.notes || '').includes('[PUBLIC]');
        const inst = getCurrentInstallment(c);
        
        return `
        <tr>
            <td>
                <div class="client-cell">
                    <div class="avatar-sm">${c.initials}</div>
                    <div><strong>${c.name}</strong><span class="id-text">${c.id}</span></div>
                </div>
            </td>
            <td>${formatCurrency(c.amount)}</td>
            <td>${inst ? inst.date : '-'}</td>
            <td>${getStatusBadge(c.status)}</td>
            <td style="text-align: center;">
                <label class="switch" style="position: relative; display: inline-block; width: 44px; height: 24px;">
                    <input type="checkbox" ${isPublic ? 'checked' : ''} onchange="togglePublic('${c.id}')" style="opacity: 0; width: 0; height: 0;">
                    <span class="slider" style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: ${isPublic ? 'var(--primary)' : 'rgba(255,255,255,0.1)'}; transition: .4s; border-radius: 24px; border: 1px solid rgba(255,255,255,0.2);">
                        <span style="position: absolute; height: 18px; width: 18px; left: ${isPublic ? '22px' : '3px'}; bottom: 2px; background-color: white; transition: .4s; border-radius: 50%;"></span>
                    </span>
                </label>
            </td>
        </tr>
    `}).join('');
}

function getActionButtons(c) {
    if (c.status === 'Liquidado') return `
        <button class="icon-btn small" onclick="viewCronograma('${c.id}')" title="Ver Cronograma"><i class="ph ph-calendar-dots"></i></button>
    `;
    return `
        <button class="icon-btn small" onclick="notifyWhatsApp('${c.id}')" title="Notificar"><i class="ph ph-whatsapp-logo"></i></button>
        <button class="icon-btn small" onclick="openPaymentModal('${c.id}')" title="Registrar Pago de Cuota"><i class="ph ph-currency-dollar"></i></button>
        <button class="icon-btn small" onclick="viewCronograma('${c.id}')" title="Ver Cronograma"><i class="ph ph-calendar-dots"></i></button>
        <button class="icon-btn small" onclick="markAsPaid('${c.id}')" title="Liquidar Total"><i class="ph ph-check-circle"></i></button>
        <button class="icon-btn small" style="color:var(--danger);" onclick="markAsIncobrable('${c.id}')" title="Marcar Incobrable"><i class="ph ph-warning-octagon"></i></button>
        <button class="icon-btn small" onclick="editClient('${c.id}')" title="Editar"><i class="ph ph-pencil"></i></button>
        <button class="icon-btn small" onclick="deleteClient('${c.id}')" title="Eliminar"><i class="ph ph-trash"></i></button>
    `;
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
        return `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); color: ${color}; opacity: ${isPaid ? 0.6 : 1};">
                <td style="padding: 10px;">${inst.date}</td>
                <td style="padding: 10px;">${concepto}</td>
                <td style="padding: 10px;">${formatCurrency(expected)}</td>
                <td style="padding: 10px; font-weight: ${isPaid ? 'normal' : 'bold'};">${inst.status}</td>
            </tr>
        `;
    }).join('');

    const tbodyPagos = document.getElementById('pagos-body');
    const payments = c.payments || [];
    if (payments.length === 0) {
        tbodyPagos.innerHTML = `<tr><td colspan="3" style="padding:10px; color:var(--text-muted); text-align:center;">No hay abonos registrados aún.</td></tr>`;
    } else {
        tbodyPagos.innerHTML = payments.map(p => `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                <td style="padding: 10px;">${p.date}</td>
                <td style="padding: 10px; color: var(--text-muted);">${p.id}</td>
                <td style="padding: 10px; color: var(--success); display:flex; justify-content:space-between; align-items:center;">
                    ${formatCurrency(p.amount)}
                    <div>
                        <button class="icon-btn small" onclick="sendWhatsAppTicket('${c.id}', '${p.id}')" title="Enviar Ticket por WhatsApp"><i class="ph ph-whatsapp-logo"></i></button>
                        <button class="icon-btn small" onclick="deletePayment('${c.id}', '${p.id}')" title="Eliminar Abono" style="margin-left: 4px; color: var(--danger);"><i class="ph ph-trash"></i></button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    document.getElementById('modal-cronograma').style.display = 'flex';
};

window.sendWhatsAppTicket = function(clientId, paymentId) {
    const c = clients.find(cl => cl.id === clientId);
    if (!c || !c.payments) return;
    const p = c.payments.find(pay => pay.id === paymentId);
    if (!p) return;
    
    let phone = c.whatsapp.replace(/[^0-9]/g, '');
    let text = `✅ *QOAN Financial - Recibo de Pago* ✅\n\n` +
               `Hola *${c.name}*,\nHemos registrado tu abono por *${formatCurrency(p.amount)}*.\n\n` +
               `🔹 *Folio de Operación:* ${p.id}\n` +
               `🗓️ *Fecha:* ${p.date}\n\n` +
               `¡Muchas gracias por tu pago!`;
               
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
};

window.deletePayment = async function(clientId, paymentId) {
    if(!confirm('¿Estás seguro de que deseas eliminar este abono? El sistema recalculará automáticamente la deuda.')) return;
    
    const c = clients.find(cl => cl.id === clientId);
    if (!c || !c.payments) return;
    
    const p = c.payments.find(p => p.id === paymentId);
    if (!p) return;
    
    // Delete from Supabase
    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
        try {
            await supabaseClient.from('payments').delete().eq('id', paymentId);
        } catch (e) {
            console.error('Error deleting payment in Supabase', e);
        }
    }
    
    // Remove from local array
    c.payments = c.payments.filter(pay => pay.id !== paymentId);
    
    // Reset paid amounts on all installments
    if (c.installments) {
        c.installments.forEach(inst => {
            inst.paidAmount = 0;
            inst.status = 'Pendiente';
        });
        
        // Redistribute totalPaid over installments
        let totalPaid = c.payments.reduce((sum, p) => sum + p.amount, 0);
        c.installments.forEach(inst => {
            let expectedForInst = inst.expectedInterest + (inst.penalty || 0) + (inst.isFinal ? c.amount : 0);
            if (totalPaid >= expectedForInst) {
                inst.status = 'Pagado';
                inst.paidAmount = expectedForInst;
                totalPaid -= expectedForInst;
            } else {
                inst.status = 'Pendiente';
                inst.paidAmount = Math.max(0, totalPaid);
                totalPaid = 0;
            }
        });
        
        // Determine overall status
        const pendingInsts = c.installments.filter(i => i.status !== 'Pagado');
        if (pendingInsts.length === 0) {
            c.status = 'Liquidado';
        } else {
            const todayStr = getLocalDateString();
            const hasMora = pendingInsts.some(i => i.date < todayStr);
            c.status = hasMora ? 'En Mora' : 'Al Día';
        }
    }
    
    updateClientBalance(c);
    saveClientsData();
    
    if (typeof syncClientToSupabase === 'function') {
        syncClientToSupabase(c);
    }
    
    renderAllTables();
    renderChart();
    
    document.getElementById('modal-cronograma').style.display = 'none';
    showToast('Abono eliminado y saldo recalculado exitosamente.');
};

function getMissedInstallmentsText(client) {
    if (!client.installments) return '';
    const todayStr = getLocalDateString();
    const missed = client.installments
        .map((inst, idx) => ({ inst, num: idx + 1 }))
        .filter(x => x.inst.status !== 'Pagado' && x.inst.date < todayStr)
        .map(x => x.num);
    
    if (missed.length === 0) return '';
    if (missed.length === 1) return `No pagó su cuota ${missed[0]}`;
    return `No pagó sus cuotas ${missed.join(', ')}`;
}

function renderDashboardTable() {
    const container = document.getElementById('table-dashboard-body');
    if (!container) return;
    
    let activeClients = getSortedList(filterClients(clients.filter(c => c.status !== 'Liquidado' && c.status !== 'Incobrable')));
    const dashCount = document.getElementById('dashboard-active-count');
    if(dashCount) dashCount.innerText = activeClients.length + ' ACTIVOS';

    container.innerHTML = activeClients.map(c => {
        const inst = getCurrentInstallment(c);
        const expected = inst ? getInstallmentTotal(inst, c.amount) : 0;
        const missedText = getMissedInstallmentsText(c);
        const idHtml = missedText 
            ? `<span class="id-text" style="color: var(--danger); font-weight: 500;">${missedText}</span>` 
            : `<span class="id-text">${c.id}</span>`;
            
        return `
        <div class="client-card-item">
            <div class="client-card-header">
                <div class="client-cell">
                    <div class="avatar-sm">${c.initials}</div>
                    <div>
                        <strong>${c.name}</strong>
                        ${idHtml}
                    </div>
                </div>
                ${getStatusBadge(c.status)}
            </div>
            
            <div class="client-card-amounts">
                <div class="amount-col">
                    <span>Capital Original</span>
                    <strong>${formatCurrency(c.amount)}</strong>
                </div>
                <div class="amount-col">
                    <span>Deuda Total</span>
                    <strong>${formatCurrency(c.balance)}</strong>
                </div>
                <div class="amount-col">
                    <span>Cuota (${inst && inst.isFinal ? 'Cap+Int' : 'Int'})</span>
                    <strong>${formatCurrency(expected)}</strong>
                </div>
            </div>
            
            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
                <i class="ph ph-calendar"></i> Próximo Corte: <strong>${inst ? inst.date : '-'}</strong>
            </div>

            ${c.notes ? `<div class="client-notes">${c.notes}</div>` : ''}
            
            <div class="client-card-footer">
                <span style="font-size: 11px; color: var(--text-tertiary);">
                    <i class="ph ph-phone"></i> ${c.whatsapp || 'Sin número'}
                </span>
                <div style="display: flex; gap: 4px;">
                    ${getActionButtons(c)}
                </div>
            </div>
        </div>
    `}).join('');
}

function renderSociosTable() {
    const tbody = document.getElementById('table-socios-body');
    if (!tbody) return;
    
    let socios = getSortedList(filterClients(clients.filter(c => c.status !== 'Liquidado' && c.status !== 'Incobrable')));
    
    const searchTerm = (document.getElementById('search-socios')?.value || '').toLowerCase();
    if (searchTerm) {
        socios = socios.filter(c => c.name.toLowerCase().includes(searchTerm) || c.dni.includes(searchTerm));
    }

    tbody.innerHTML = socios.map(c => {
        const inst = getCurrentInstallment(c);
        const expected = inst ? getInstallmentTotal(inst, c.amount) : 0;
        const missedText = getMissedInstallmentsText(c);
        const idHtml = missedText 
            ? `<span class="id-text" style="color: var(--danger); font-weight: 500;">${missedText}</span>` 
            : `<span class="id-text">${c.id}</span>`;
            
        return `
        <tr>
            <td>
                <div class="client-cell">
                    <div class="avatar-sm">${c.initials}</div>
                    <div><strong>${c.name}</strong>${idHtml}</div>
                </div>
            </td>
            <td>${formatCurrency(c.amount)}</td>
            <td>${formatCurrency(c.balance)}</td>
            <td>${inst ? inst.date : '-'}</td>
            <td><strong>${formatCurrency(expected)}</strong></td>
            <td>${getStatusBadge(c.status)}</td>
            <td style="display: flex; gap: 4px; justify-content: flex-end;">${getActionButtons(c)}</td>
        </tr>
    `}).join('');
}

function renderHistoryTable() {
    const tbody = document.getElementById('table-history-body');
    if (!tbody) return;
    
    let history = getSortedList(filterClients(clients.filter(c => c.status === 'Liquidado')));

    tbody.innerHTML = history.map(c => `
        <tr>
            <td>
                <div class="client-cell">
                    <div class="avatar-sm">${c.initials}</div>
                    <div><strong>${c.name}</strong><span class="id-text">${c.id}</span></div>
                </div>
            </td>
            <td>${formatCurrency(c.amount)}</td>
            <td>${c.endDate}</td>
            <td>${getStatusBadge(c.status)}</td>
            <td style="display: flex; gap: 4px; justify-content: flex-end;">
                <button class="icon-btn small" onclick="undoLiquidado('${c.id}')" title="Restaurar a Activo"><i class="ph ph-arrow-u-up-left"></i></button>
                <button class="icon-btn small" onclick="viewCronograma('${c.id}')" title="Ver Cronograma"><i class="ph ph-calendar-dots"></i></button>
                <button class="icon-btn small" onclick="deleteClient('${c.id}')" title="Eliminar del Historial"><i class="ph ph-trash"></i></button>
            </td>
        </tr>
    `).join('');
}

function renderIncobrablesTable() {
    const tbody = document.getElementById('table-incobrables-body');
    if (!tbody) return;
    
    let incobrables = getSortedList(filterClients(clients.filter(c => c.status === 'Incobrable')));

    tbody.innerHTML = incobrables.map(c => `
        <tr>
            <td>
                <div class="client-cell">
                    <div class="avatar-sm" style="background: rgba(220, 38, 38, 0.2); color: var(--danger);">${c.initials}</div>
                    <div><strong>${c.name}</strong><span class="id-text">${c.id}</span></div>
                </div>
            </td>
            <td>${formatCurrency(c.amount)}</td>
            <td style="color: var(--danger); font-weight:bold;">${formatCurrency(c.balance)}</td>
            <td>${c.endDate || getLocalDateString()}</td>
            <td style="display: flex; gap: 4px; justify-content: flex-end;">
                <button class="icon-btn small" onclick="undoIncobrable('${c.id}')" title="Restaurar a Activo"><i class="ph ph-arrow-u-up-left"></i></button>
                <button class="icon-btn small" onclick="viewCronograma('${c.id}')" title="Ver Cronograma"><i class="ph ph-calendar-dots"></i></button>
                <button class="icon-btn small" onclick="deleteClient('${c.id}')" title="Eliminar"><i class="ph ph-trash"></i></button>
            </td>
        </tr>
    `).join('');
}

window.markAsIncobrable = async function(clientId) {
    if(!confirm('¿Estás seguro de que deseas marcar a este cliente como INCOBRABLE? Será retirado de los activos.')) return;
    const client = clients.find(c => c.id === clientId);
    if(client) {
        client.status = 'Incobrable';
        client.endDate = getLocalDateString();
        
        if (supabaseClient) {
            try {
                const { error } = await supabaseClient
                    .from('clients')
                    .update({
                        status: client.status,
                        end_date: client.endDate
                    })
                    .eq('id', clientId);
                if (error) console.error("Error al marcar incobrable en Supabase:", error);
            } catch (err) {
                console.error("Excepción en Supabase:", err);
            }
        }
        
        saveClientsData();
        renderAllTables();
        showToast('Cliente marcado como incobrable.');
    }
};

window.undoIncobrable = async function(clientId) {
    if(!confirm('¿Deseas restaurar a este cliente a la lista de activos?')) return;
    const client = clients.find(c => c.id === clientId);
    if(client) {
        client.status = 'Al Día';
        delete client.endDate;
        recalcInstallments(client);
        
        if (supabaseClient) {
            try {
                const { error } = await supabaseClient
                    .from('clients')
                    .update({
                        status: client.status,
                        end_date: null
                    })
                    .eq('id', clientId);
                if (error) console.error("Error al restaurar incobrable en Supabase:", error);
            } catch (err) {
                console.error("Excepción en Supabase:", err);
            }
        }
        
        saveClientsData();
        renderAllTables();
        showToast('Cliente restaurado a Socios Activos.');
    }
};

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

        // Check if final installment is due or past due
        const finalInst = c.installments[c.installments.length - 1];
        const isFinalDue = finalInst && finalInst.status !== 'Pagado' && finalInst.date <= getLocalDateString();
        
        // Calculate total amount due up to today
        let totalDue = 0;
        let daysLate = 0;
        const todayStr = getLocalDateString();
        
        c.installments.forEach(i => {
            if (i.status !== 'Pagado' && i.date <= todayStr) {
                totalDue += getInstallmentTotal(i, c.amount);
            }
        });
        
        // If there's an amount due today or in the past, or if we are about to be due
        if (totalDue === 0) {
            // Not due today, but might be due in <= 3 days
            totalDue = expected; // fallback to the upcoming installment amount
        }

        if (c.status === 'En Mora') {
            let title = isFinalDue ? 'Préstamo Vencido (Final)' : 'Cuenta en Mora';
            let icon = isFinalDue ? '<i class="ph ph-warning-octagon"></i>' : '<i class="ph ph-warning-circle"></i>';
            alertsHtml += `
                <div class="alert-item" style="border-left: 3px solid var(--danger);">
                    <div class="alert-icon" style="color: var(--danger);">${icon}</div>
                    <div class="alert-info">
                        <strong style="color: var(--danger);">${title}</strong>
                        <span>${c.name} - Deuda Vencida: ${formatCurrency(totalDue)}</span>
                    </div>
                    <button class="icon-btn small" onclick="notifyWhatsApp('${c.id}')"><i class="ph ph-whatsapp-logo"></i></button>
                </div>`;
        } else if (diffDays >= 0 && diffDays <= 3) {
            let title = isFinalDue ? 'Vence HOY (Final)' : (diffDays === 0 ? 'Vence HOY' : `Vence en ${diffDays} días`);
            alertsHtml += `
                <div class="alert-item" style="border-left: 3px solid var(--warning);">
                    <div class="alert-icon" style="color: var(--warning);"><i class="ph ph-calendar-warning"></i></div>
                    <div class="alert-info">
                        <strong style="color: var(--warning);">${title}</strong>
                        <span>${c.name} - Cuota: ${formatCurrency(totalDue)}</span>
                    </div>
                    <button class="icon-btn small" onclick="notifyWhatsApp('${c.id}')"><i class="ph ph-whatsapp-logo"></i></button>
                </div>`;
        }
    });

    if (alertsHtml === '') {
        alertsHtml = `
            <div style="text-align: center; color: var(--text-muted); padding: 16px;">
                <i class="ph ph-check-circle" style="font-size: 24px; opacity: 0.5;"></i>
                <p style="margin-top: 8px;">Todo está al día.</p>
            </div>`;
    }
    container.innerHTML = alertsHtml;
}

function updateStats() {
    const filterStart = document.getElementById('filter-start')?.value;
    const filterEnd = document.getElementById('filter-end')?.value;

    const active = clients.filter(c => c.status !== 'Liquidado' && c.status !== 'Incobrable');
    const sociosCount = document.getElementById('socios-activos-count');
    if(sociosCount) sociosCount.innerText = active.length;

    let totalInvertido = 0;
    let totalARecuperar = 0;
    let moraTotal = 0;
    let interesesTotal = 0;

    clients.forEach(c => {
        let includeCapital = true;
        if (filterStart && c.startDate < filterStart) includeCapital = false;
        if (filterEnd && c.startDate > filterEnd) includeCapital = false;
        
        if (includeCapital && c.status !== 'Liquidado' && c.status !== 'Incobrable') {
            totalInvertido += c.amount;
        }

        c.installments.forEach(inst => {
            let includeInst = true;
            if (filterStart && inst.date < filterStart) includeInst = false;
            if (filterEnd && inst.date > filterEnd) includeInst = false;
            
            if (includeInst) {
                if (inst.status !== 'Pagado' && c.status !== 'Liquidado' && c.status !== 'Incobrable') {
                    totalARecuperar += getInstallmentTotal(inst, c.amount);
                    interesesTotal += (inst.expectedInterest || 0);
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
    const elIntereses = document.getElementById('stat-intereses');

    if(elInvertido) elInvertido.innerText = formatCurrency(totalInvertido);
    if(elRecuperar) elRecuperar.innerText = formatCurrency(totalARecuperar);
    if(elMora) elMora.innerText = formatCurrency(moraTotal);
    if(elIntereses) elIntereses.innerText = formatCurrency(interesesTotal);
    
    renderResumenTable(filterStart, filterEnd);
}

function renderResumenTable(filterStart, filterEnd) {
    const tbody = document.getElementById('table-resumen-body');
    if (!tbody) return;
    
    const activeClients = clients.filter(c => c.status !== 'Liquidado' && c.status !== 'Pagado' && c.status !== 'Incobrable');
    
    let filteredClients = activeClients;
    const searchTerm = (document.getElementById('search-resumen')?.value || '').toLowerCase();
    if (searchTerm) {
        filteredClients = filteredClients.filter(c => c.name.toLowerCase().includes(searchTerm) || c.dni.includes(searchTerm));
    }
    
    // Sort by start date as a standard fallback
    filteredClients.sort((a,b) => (a.startDate > b.startDate) ? 1 : -1);

    let html = '';
    
    let sumCapital = 0;
    let sumCuotaInt = 0;
    let sumMora = 0;

    const todayStr = getLocalDateString();

    filteredClients.forEach((c, index) => {
        const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        let monthName = '-';
        if (c.startDate && c.startDate.includes('-')) {
            const mIndex = parseInt(c.startDate.split('-')[1], 10) - 1;
            if (!isNaN(mIndex) && mIndex >= 0 && mIndex < 12) monthName = monthNames[mIndex];
        }

        let clientMora = 0;
        let cuotaInt = 0;
        let c_p = c.installments.filter(i => i.status === 'Pagado').length;
        let f_venc = '-';
        let currentState = 'Vigente';
        let badgeClass = 'badge-vigente';
        
        let pendingInst = c.installments.filter(i => i.status !== 'Pagado');
        if (pendingInst.length > 0) {
            let nextInst = pendingInst[0];
            f_venc = nextInst.date;
            
            pendingInst.forEach(i => {
                clientMora += (i.penalty || 0);
                cuotaInt += (i.expectedInterest || 0);
            });

            if (nextInst.date === todayStr) {
                currentState = 'Vencido Hoy';
                badgeClass = 'badge-vencido';
            } else if (c.status === 'En Mora' || nextInst.date < todayStr) {
                if (clientMora > 15 || pendingInst.filter(i => i.date < todayStr).length > 1) {
                    currentState = 'Muy Atrasado';
                    badgeClass = 'badge-muyatrasado';
                } else {
                    currentState = 'Atrasado';
                    badgeClass = 'badge-atrasado';
                }
            } else if (c.status === 'Al Día' || c.status === 'Pendiente') {
                currentState = c_p > 0 ? 'Al día' : 'Vigente';
                badgeClass = c_p > 0 ? 'badge-aldia' : 'badge-vigente';
            }
        }

        sumCapital += c.amount;
        sumCuotaInt += cuotaInt;
        sumMora += clientMora;

        html += `
            <tr>
                <td>${index + 1}</td>
                <td style="text-align:left;">${c.name}</td>
                <td>${c.dni}</td>
                <td>${formatCurrency(c.amount)}</td>
                <td>${c.interest ? c.interest + '%' : '15%'}</td>
                <td style="text-transform: capitalize;">${monthName}</td>
                <td>${formatCurrency(cuotaInt)}</td>
                <td>${f_venc}</td>
                <td>${c_p}</td>
                <td>${formatCurrency(clientMora)}</td>
                <td><span class="${badgeClass}">${currentState}</span></td>
            </tr>
        `;
    });
    
    if (html === '') {
        html = `<tr><td colspan="11" style="text-align:center; padding: 32px; color: var(--text-muted);">No hay clientes activos.</td></tr>`;
    }
    
    tbody.innerHTML = html;

    const totCap = document.getElementById('tot-capital');
    const totCuota = document.getElementById('tot-cuotaint');
    const totMora = document.getElementById('tot-mora');
    if (totCap) totCap.innerText = formatCurrency(sumCapital);
    if (totCuota) totCuota.innerText = formatCurrency(sumCuotaInt);
    if (totMora) totMora.innerText = formatCurrency(sumMora);
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
    
    const searchSocios = document.getElementById('search-socios');
    if (searchSocios) searchSocios.addEventListener('input', renderSociosTable);
    
    const searchResumen = document.getElementById('search-resumen');
    if (searchResumen) searchResumen.addEventListener('input', () => renderResumenTable());
});
