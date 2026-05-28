// --- Supabase Config ---
const SUPABASE_URL = 'https://ryphrvuljryvwtvssnff.supabase.co';
const SUPABASE_KEY = 'sb_publishable_-wbllkasfqvfCL3E2tX4wA_6EVwctTR';
let supabaseClient = null;
if (window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

// --- Mapeo de columnas: Supabase <-> App ---
function mapClientFromDB(row) {
    return {
        id: row.id,
        name: row.name,
        dni: row.dni,
        amount: parseFloat(row.amount),
        interest: parseFloat(row.interest),
        term: row.term,
        loanType: row.loanType,
        totalToReturn: parseFloat(row.totalToReturn),
        remainingBalance: parseFloat(row.remainingBalance),
        date: row.date,
        startDate: row.startDate,
        collectionDate: row.collectionDate,
        status: row.status,
        rating: parseInt(row.rating),
        notes: row.notes,
        maps: row.maps,
        phone: row.phone || '',
        interestPaidCount: parseInt(row.interestPaidCount || 0),
        payments: (row.payments || []).map(p => ({
            id: p.id,
            clientId: p.clientId,
            amount: parseFloat(p.amount),
            date: p.date,
            paymentType: p.paymentType || 'abono'
        })),
        evidences: row.evidences || []
    };
}

function mapClientToDB(client) {
    const obj = { ...client };
    delete obj.payments;
    delete obj.evidences;
    delete obj.phone;
    return obj;
}

function mapPaymentToDB(payment, clientId) {
    return {
        id: payment.id,
        clientId: clientId,
        amount: payment.amount,
        date: payment.date,
        paymentType: payment.paymentType || 'abono'
    };
}

function mapConfigFromDB(row) {
    return {
        moraRate: parseFloat(row.moraRate || 0.50),
        currency: row.currency || 'S/',
        yapeName: row.yapeName || '',
        yapePhone: row.yapePhone || ''
    };
}

function mapConfigToDB(config) {
    return { id: 1, ...config };
}

// --- State Management ---
let state = {
    clients: [],
    config: {
        moraRate: 0.50,
        currency: 'S/',
        yapeName: 'Juan David Puclla Quispe',
        yapePhone: '900 779 111'
    },
    settings: {
        githubRepo: 'os-progr/prestam',
        githubToken: ''
    }
};

// --- DOM Elements ---
const elements = {
    greeting: document.getElementById('dynamic-greeting'),
    clientsContainer: document.getElementById('clients-container'),
    loanForm: document.getElementById('loan-form'),
    modalLoan: document.getElementById('modal-loan'),
    modalPayment: document.getElementById('modal-payment'),
    btnNewLoan: document.getElementById('btn-new-loan'),
    btnExportCsv: document.getElementById('btn-export-csv'),
    searchInput: document.getElementById('client-search'),
    loanAmount: document.getElementById('loan-amount'),
    loanInterest: document.getElementById('loan-interest'),
    loanTerm: document.getElementById('loan-term'),
    calcTotal: document.getElementById('calc-total'),
    calcCuota: document.getElementById('calc-cuota'),
    loanStartDate: document.getElementById('loan-start-date'),
    loanCollectionDate: document.getElementById('loan-collection-date'),
    evidenceInput: document.getElementById('client-evidences'),
    previewThumbnails: document.getElementById('preview-thumbnails'),
    statCapital: document.getElementById('stat-capital-calle'),
    statSocios: document.getElementById('stat-socios-conteo'),
    sortSelect: document.getElementById('sort-select'),
    paymentForm: document.getElementById('payment-form'),
    paymentDetails: document.getElementById('payment-details'),
    paymentClientId: document.getElementById('payment-client-id'),
    paymentAmount: document.getElementById('payment-amount'),
    lightbox: document.getElementById('lightbox'),
    lightboxImg: document.getElementById('lightbox-img'),
    modalHistory: document.getElementById('modal-history'),
    historyContent: document.getElementById('history-content'),
    filterBtns: document.querySelectorAll('.filter-btn'),
    btnSettings: document.getElementById('btn-settings'),
    btnImport: document.getElementById('btn-import'),
    importFileInput: document.getElementById('import-file'),
    modalSettings: document.getElementById('modal-settings'),
    settingsForm: document.getElementById('settings-form'),
    setMoraRate: document.getElementById('set-mora-rate'),
    setCurrency: document.getElementById('set-currency'),
    clientNameInput: document.getElementById('client-name')
};

// --- Initialization ---
async function init() {
    let loadedFromDB = false;

    // 1. Intentar cargar desde Supabase
    if (supabaseClient) {
        try {
            const { data: clients, error: clientsError } = await supabaseClient.from('clients').select('*, payments(*)');
            if (clientsError) alert('Error de Supabase: ' + JSON.stringify(clientsError));
            if (clients && !clientsError) {
                state.clients = clients.map(mapClientFromDB);
                loadedFromDB = true;
            }

            const { data: configRows, error: configError } = await supabaseClient.from('config').select('*').eq('id', 1);
            if (configRows && configRows.length > 0 && !configError) {
                state.config = mapConfigFromDB(configRows[0]);
            }
        } catch (e) {
            console.error('Error cargando datos de Supabase:', e);
        }
    }

    // 2. Respaldo: cargar desde localStorage
    if (!loadedFromDB) {
        console.log('Supabase no disponible. Cargando datos locales (localStorage)...');
        const localData = localStorage.getItem('qoan_data');
        if (localData) {
            try {
                const parsed = JSON.parse(localData);
                if (parsed.clients) state.clients = parsed.clients;
                if (parsed.config) state.config = parsed.config;
            } catch(e) {
                console.error("Error al leer datos locales", e);
            }
        }
    }

    updateGreeting();
    renderClients();
    updateStats();
    updateMonthlySummary();
    setupEventListeners();
    
    elements.setMoraRate.value = state.config.moraRate;
    elements.setCurrency.value = state.config.currency;
    document.getElementById('set-yape-name').value = state.config.yapeName;
    document.getElementById('set-yape-phone').value = state.config.yapePhone;
    
    document.getElementById('set-github-repo').value = state.settings.githubRepo || '';
    document.getElementById('set-github-token').value = state.settings.githubToken || '';

    setInterval(updateGreeting, 60000);
}

// --- Supabase Real-time integration ---
if (supabaseClient) {
    try {
        supabaseClient.channel('custom-all-channel')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, async () => {
              console.log('Datos actualizados en Supabase, refrescando...');
              showToast('Actualizando datos en tiempo real...', 'info');
              try {
                  const { data: clients } = await supabaseClient.from('clients').select('*, payments(*)');
                  if (clients) {
                      state.clients = clients.map(mapClientFromDB);
                      renderClients(elements.searchInput.value, document.querySelector('.filter-btn.active')?.dataset.filter || 'todos');
                      updateStats();
                      updateMonthlySummary();
                  }
              } catch (e) {
                  console.error('Error recargando datos via Supabase Realtime:', e);
              }
          })
          .subscribe();
    } catch(e) {
        console.warn('Supabase Realtime no disponible:', e);
    }
}

// --- Logic Functions ---

function updateGreeting() {
    const hour = new Date().getHours();
    let greeting = "";
    if (hour >= 5 && hour < 12) greeting = "Buenos Días";
    else if (hour >= 12 && hour < 19) greeting = "Buenas Tardes";
    else greeting = "Buenas Noches";
    
    elements.greeting.innerHTML = `<span><i class="fas fa-sun gold"></i> ${greeting}, Gestor</span>`;
}

// --- Toast & Confirm System ---
let _confirmCb = null;

function showToast(msg, type = 'success') {
    const c = document.getElementById('toast-container');
    const t = document.createElement('div');
    const icons = {success:'fa-check-circle',error:'fa-times-circle',warning:'fa-exclamation-triangle',info:'fa-info-circle'};
    t.className = `toast toast-${type}`;
    t.innerHTML = `<i class="fas ${icons[type]||'fa-info-circle'}"></i><span>${msg}</span>`;
    c.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3500);
}

function showConfirm(msg, onOk) {
    document.getElementById('confirm-message').textContent = msg;
    document.getElementById('modal-confirm').style.display = 'flex';
    _confirmCb = onOk;
}

// --- Lightbox Gallery ---
let _lbImages = [], _lbIdx = 0;
function openLightbox(images, idx = 0) {
    _lbImages = images; _lbIdx = idx;
    _updateLb(); elements.lightbox.style.display = 'flex';
}
function _updateLb() {
    elements.lightboxImg.src = _lbImages[_lbIdx];
    const ctr = document.getElementById('lightbox-counter');
    if (ctr) ctr.textContent = `${_lbIdx+1} / ${_lbImages.length}`;
    const showNav = _lbImages.length > 1;
    ['lightbox-prev','lightbox-next'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = showNav ? 'flex' : 'none';
    });
}

// --- Logic Functions ---

async function saveToStorage() {
    // 1. Siempre guardar en localStorage como respaldo
    localStorage.setItem('qoan_data', JSON.stringify({
        clients: state.clients,
        config: state.config
    }));

    // 2. Sincronizar con Supabase
    if (supabaseClient) {
        try {
            if (state.clients.length > 0) {
                const clientsData = state.clients.map(c => mapClientToDB(c));
                const { error: err1 } = await supabaseClient.from('clients').upsert(clientsData);
                if (err1) throw err1;

                const allPayments = [];
                state.clients.forEach(c => {
                    if (c.payments && c.payments.length > 0) {
                        c.payments.forEach(p => allPayments.push(mapPaymentToDB(p, c.id)));
                    }
                });
                
                if (allPayments.length > 0) {
                    const { error: err2 } = await supabaseClient.from('payments').upsert(allPayments);
                    if (err2) throw err2;
                }
            }

            const { error: err3 } = await supabaseClient.from('config').upsert(mapConfigToDB(state.config));
            if (err3) throw err3;
            
        } catch (e) {
            console.error('Error guardando en Supabase:', e);
            alert('Error guardando en Supabase. Detalles: ' + (e.message || e.details || JSON.stringify(e)));
        }
    }
    
    updateStats();
    updateMonthlySummary();
}

function updateSmartProjection() {
    const id = elements.paymentClientId ? elements.paymentClientId.value : null;
    if (!id) return;
    const client = state.clients.find(c => c.id === id);
    const container = document.getElementById('smart-projection');
    
    if (!client || client.loanType !== 'interes' || !container) {
        if(container) container.style.display = 'none';
        return;
    }

    const typeSelect = document.getElementById('payment-type-select');
    const type = typeSelect ? typeSelect.value : 'abono';
    const amount = parseFloat(elements.paymentAmount.value) || 0;

    if (type === 'capital' && amount > 0) {
        const currentInterest = Math.round((client.amount * (client.interest / 100)) * 100) / 100;
        const newCapital = Math.max(0, client.amount - amount);
        const newInterest = Math.round((newCapital * (client.interest / 100)) * 100) / 100;
        const savings = Math.max(0, currentInterest - newInterest);
        
        container.innerHTML = `
            <div style="background:rgba(0, 255, 136, 0.08); border:1px solid rgba(0, 255, 136, 0.2); padding:15px; border-radius:12px; margin:10px 0 20px 0; animation: revealCard 0.4s ease-out;">
                <p style="font-size:0.65rem; color:var(--success-green); font-weight:900; text-transform:uppercase; letter-spacing:1px; margin-bottom:10px;">
                    <i class="fas fa-magic"></i> Proyección de Ahorro
                </p>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <span style="font-size:0.6rem; color:var(--text-muted); display:block; text-transform:uppercase;">Nuevo Interés</span>
                        <span style="font-size:1.2rem; color:#fff; font-weight:800;">${state.config.currency} ${newInterest.toFixed(2)}</span>
                    </div>
                    <div style="text-align:right;">
                        <span style="font-size:0.6rem; color:var(--text-muted); display:block; text-transform:uppercase;">Ahorro Mensual</span>
                        <span style="font-size:1.2rem; color:var(--success-green); font-weight:800;">-${state.config.currency} ${savings.toFixed(2)}</span>
                    </div>
                </div>
                <p style="font-size:0.65rem; color:var(--text-muted); margin-top:8px; font-style:italic;">* El cliente pagará menos interés todos los meses siguientes.</p>
            </div>
        `;
        container.style.display = 'block';
    } else {
        container.style.display = 'none';
    }
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
                saveToStorage();
                renderClients();
                showToast('Datos sincronizados desde GitHub ✓', 'success');
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
        showToast('Configura el Repositorio y el Token en Ajustes.', 'warning');
        openSettings();
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
                message: 'Sync desde Web QOAN',
                content: content,
                sha: sha
            })
        });

        if (putRes.ok) {
            showToast('¡Datos subidos a GitHub correctamente! ✓', 'success');
        } else {
            const error = await putRes.json();
            showToast('Error al subir: ' + error.message, 'error');
        }
    } catch (e) {
        showToast('Error de conexión con GitHub.', 'error');
        console.error(e);
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
        // Flat rate per day
        return diffDays * state.config.moraRate;
    }
    return 0;
}

function updateStats() {
    let totalCobrar = 0; // Total in the street (Balance only)
    let totalMoraEnCalle = 0;
    let totalCapitalEnCalle = 0;
    let totalInteresEnCalle = 0;
    let totalInteresCobrado = 0;
    let activeSocios = 0;
    let upcomingClients = [];
    let reminderToday = []; // Clients due in exactly 4 days

    state.clients.forEach(client => {
        const isInterestOnly = client.loanType === 'interes';
        const monthlyInterest = isInterestOnly ? Math.round((client.amount * (client.interest / 100)) * 100) / 100 : 0;
        const totalInterest = client.totalToReturn - client.amount;
        const interestRatio = client.totalToReturn > 0 ? totalInterest / client.totalToReturn : 0;

        // Calculate interest already collected from payment history
        if (client.payments) {
            client.payments.forEach(p => {
                if (isInterestOnly) {
                    // For interest-only loans, every payment tagged 'interes' is pure interest
                    if (p.paymentType === 'interes') {
                        totalInteresCobrado += p.amount;
                    } else if (p.paymentType === 'final') {
                        // Final payment: only the interest portion counts as gain
                        totalInteresCobrado += monthlyInterest;
                    }
                } else {
                    totalInteresCobrado += (p.amount * interestRatio);
                }
            });
        }

        if (client.status !== 'Pagado') {
            const mora = calculateMora(client);
            totalMoraEnCalle += mora;

            if (isInterestOnly) {
                // For interest-only loans, capital is always the full principal
                const interestPaidCount = client.interestPaidCount || 0;
                const remainingInterestMonths = Math.max(0, (client.term || 1) - interestPaidCount);
                const pendingInterest = Math.round(remainingInterestMonths * monthlyInterest * 100) / 100;
                totalCobrar += client.amount + pendingInterest;
                totalCapitalEnCalle += client.amount;
                totalInteresEnCalle += pendingInterest;
            } else {
                totalCobrar += client.remainingBalance;
                totalCapitalEnCalle += (client.remainingBalance * (client.amount / client.totalToReturn));
                totalInteresEnCalle += (client.remainingBalance * interestRatio);
            }

            activeSocios++;

            const today = new Date();
            today.setHours(0,0,0,0);
            
            if (client.collectionDate) {
                const dueDate = new Date(client.collectionDate);
                const diffTime = dueDate - today;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                // General upcoming (7 days)
                if (diffDays >= 0 && diffDays <= 7) {
                    upcomingClients.push(client);
                }

                // EXACT REMINDER (4 days before)
                if (diffDays === 4) {
                    reminderToday.push(client);
                }
            }
        }
    });

    // Notify user about 4-day reminders
    if (reminderToday.length > 0 && !window._hasNotifiedReminders) {
        setTimeout(() => {
            showToast(`📢 Tienes ${reminderToday.length} recordatorios para enviar hoy (clientes que vencen en 4 días).`, 'info');
            window._hasNotifiedReminders = true;
        }, 1500);
    }

    elements.statCapital.textContent = `${state.config.currency} ${totalCobrar.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    
    // Global stats for charts
    window.currentStats = {
        capitalEnCalle: totalCapitalEnCalle,
        gananciaPendiente: totalInteresEnCalle,
        gananciaCobrada: totalInteresCobrado,
        active: activeSocios,
        inMora: state.clients.filter(c => calculateMora(c) > 0 && c.status !== 'Pagado').length,
        paid: state.clients.filter(c => c.status === 'Pagado').length
    };

    const statMoraAcumulada = document.getElementById('stat-mora-acumulada');
    if (statMoraAcumulada) {
        statMoraAcumulada.textContent = `${state.config.currency} ${totalMoraEnCalle.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    }

    if (document.getElementById('stat-capital-puro')) {
        document.getElementById('stat-capital-puro').textContent = `${state.config.currency} ${totalCapitalEnCalle.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    }
    if (document.getElementById('stat-ganancia-cobrada')) {
        document.getElementById('stat-ganancia-cobrada').textContent = `${state.config.currency} ${totalInteresCobrado.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    }
    if (document.getElementById('stat-ganancia-pendiente')) {
        document.getElementById('stat-ganancia-pendiente').textContent = `${state.config.currency} ${totalInteresEnCalle.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    }
    
    elements.statSocios.textContent = activeSocios;


    
    // Alert for upcoming
    const alertUpcoming = document.getElementById('alert-upcoming');
    const upcomingStat = document.getElementById('stat-upcoming-count');
    const upcomingNamesList = document.getElementById('upcoming-names-list');
    
    if (upcomingClients.length > 0) {
        alertUpcoming.style.display = "flex";
        upcomingStat.textContent = upcomingClients.length;
        upcomingNamesList.innerHTML = upcomingClients.map(c => `• ${c.name} (${c.dni})`).join('<br>');
    } else {
        alertUpcoming.style.display = "none";
    }
}



function calculateLoanPreview() {
    const amount = parseFloat(elements.loanAmount.value) || 0;
    const interest = parseFloat(elements.loanInterest.value) || 0;
    const term = parseInt(elements.loanTerm.value) || 1;
    const type = document.getElementById('loan-type').value;

    const totalInterest = Math.round((amount * (interest / 100) * term) * 100) / 100;
    const totalReturn = Math.round((amount + totalInterest) * 100) / 100;
    
    let previewText = "";
    if (type === 'interes' && term > 1) {
        const monthlyInterest = Math.round((amount * (interest / 100)) * 100) / 100;
        const finalPayment = Math.round((amount + monthlyInterest) * 100) / 100;
        previewText = `${term - 1} cuotas de ${state.config.currency}${monthlyInterest.toFixed(2)} + 1 cuota final de ${state.config.currency}${finalPayment.toFixed(2)}`;
    } else {
        const cuota = Math.round((totalReturn / term) * 100) / 100;
        previewText = `${term} cuotas de ${state.config.currency}${cuota.toFixed(2)}`;
    }

    elements.calcTotal.innerHTML = `<span style="color:var(--gold-primary); font-weight:bold;">${state.config.currency} ${totalReturn.toFixed(2)}</span>`;
    elements.calcCuota.textContent = previewText;
}

// --- Monthly Summary ---
function updateMonthlySummary() {
    const n = new Date(), tM = n.getMonth(), tY = n.getFullYear();
    const lM = tM===0?11:tM-1, lY = tM===0?tY-1:tY;
    let cM=0,cA=0,iM=0,pM=0,nC=0;
    state.clients.forEach(c => {
        const iR = c.totalToReturn>0?(c.totalToReturn-c.amount)/c.totalToReturn:0;
        if(c.date){const d=new Date(c.date);if(d.getMonth()===tM&&d.getFullYear()===tY)nC++;}
        (c.payments||[]).forEach(p=>{
            const d=new Date(p.date);
            if(d.getMonth()===tM&&d.getFullYear()===tY){cM+=p.amount;iM+=p.amount*iR;pM++;}
            if(d.getMonth()===lM&&d.getFullYear()===lY)cA+=p.amount;
        });
    });
    const v=cA>0?(((cM-cA)/cA)*100):(cM>0?100:0);
    const cur=state.config.currency;
    const s=(id,val)=>{const e=document.getElementById(id);if(e)e.textContent=val;};
    s('m-cobrado-mes',`${cur} ${cM.toFixed(2)}`);
    s('m-cobrado-anterior',`${cur} ${cA.toFixed(2)}`);
    s('m-intereses-mes',`${cur} ${iM.toFixed(2)}`);
    s('m-pagos-mes',pM); s('m-clientes-nuevos',nC);
    const ve=document.getElementById('m-variacion');
    if(ve){ve.textContent=`${v>=0?'+':''}${v.toFixed(0)}%`;ve.style.color=v>=0?'var(--success-green)':'var(--error-red)';}
}

// --- Render Functions ---

function renderClients(filterText = "", statusFilter = "todos") {
    const sortBy = elements.sortSelect ? elements.sortSelect.value : 'default';
    elements.clientsContainer.innerHTML = "";
    
    let filtered = state.clients.filter(c => 
        c.name.toLowerCase().includes(filterText.toLowerCase()) || 
        c.dni.includes(filterText)
    );

    // 'todos' only shows active (non-paid) clients; 'pagado' shows paid
    filtered = filtered.filter(c => {
        const mora = calculateMora(c);
        if (statusFilter === "todos")     return c.status !== 'Pagado';
        if (statusFilter === "mora")      return mora > 0 && c.status !== 'Pagado';
        if (statusFilter === "pagado")    return c.status === 'Pagado';
        if (statusFilter === "proximos") {
            if (c.status === 'Pagado' || !c.collectionDate) return false;
            const dueDate = new Date(c.collectionDate);
            const today = new Date(); today.setHours(0,0,0,0);
            const in7 = new Date(); in7.setDate(today.getDate() + 7);
            return dueDate >= today && dueDate <= in7;
        }
        if (statusFilter === "pendiente") return mora === 0 && c.status !== 'Pagado';
        return c.status !== 'Pagado';
    });

    // Sort
    filtered.sort((a,b) => {
        if(sortBy==='nombre') return a.name.localeCompare(b.name);
        if(sortBy==='saldo') return b.remainingBalance - a.remainingBalance;
        if(sortBy==='vencimiento'){
            const da=a.collectionDate?new Date(a.collectionDate):new Date('9999');
            const db=b.collectionDate?new Date(b.collectionDate):new Date('9999');
            return da-db;
        }
        const pri=c=>{
            if(c.status==='Pagado') return 3;
            if(calculateMora(c)>0) return 0;
            const today=new Date();today.setHours(0,0,0,0);
            const in7=new Date();in7.setDate(today.getDate()+7);
            if(c.collectionDate&&new Date(c.collectionDate)>=today&&new Date(c.collectionDate)<=in7) return 1;
            return 2;
        };
        return pri(a)-pri(b);
    });

    if (filtered.length === 0) {
        elements.clientsContainer.innerHTML = `<div class="empty-state"><i class="fas fa-folder-open"></i><p>${filterText ? 'No se encontraron resultados.' : 'No hay préstamos registrados aún.'}</p></div>`;
        return;
    }

    // --- Group by start month ---
    const groups = {};
    filtered.forEach(client => {
        const d = client.startDate ? new Date(client.startDate + 'T12:00:00') : new Date(client.date || Date.now());
        const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        if (!groups[key]) {
            groups[key] = {
                label: d.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' }),
                clients: []
            };
        }
        groups[key].clients.push(client);
    });

    // Newest month first
    const sortedKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));

    sortedKeys.forEach(key => {
        const group = groups[key];
        const monthLabel = group.label.charAt(0).toUpperCase() + group.label.slice(1);
        const totalGrupo = group.clients.reduce((sum, c) => sum + c.remainingBalance + calculateMora(c), 0);

        // Month group container
        const groupContainer = document.createElement('div');
        groupContainer.className = 'month-group-container active';
        
        // Month separator header (Accordion toggle)
        const sep = document.createElement('div');
        sep.className = 'month-separator accordion-header';
        sep.innerHTML = `
            <div class="month-sep-left"></div>
            <div class="month-sep-info accordion-toggle">
                <div style="display:flex; align-items:center; gap:10px;">
                    <i class="fas fa-calendar-alt"></i>
                    <span class="month-sep-title">${monthLabel}</span>
                    <span class="month-sep-count">${group.clients.length} cliente${group.clients.length !== 1 ? 's' : ''}</span>
                    <span class="month-sep-total">${state.config.currency} ${totalGrupo.toFixed(2)}</span>
                </div>
                <div class="accordion-icon"><i class="fas fa-chevron-up"></i></div>
            </div>
            <div class="month-sep-right"></div>
        `;
        
        const contentContainer = document.createElement('div');
        contentContainer.className = 'month-content';
        
        const toggleBtn = sep.querySelector('.accordion-toggle');
        toggleBtn.addEventListener('click', () => {
            groupContainer.classList.toggle('active');
            const icon = sep.querySelector('.accordion-icon i');
            if(groupContainer.classList.contains('active')) {
                icon.className = 'fas fa-chevron-up';
                contentContainer.style.display = 'grid';
            } else {
                icon.className = 'fas fa-chevron-down';
                contentContainer.style.display = 'none';
            }
        });

        groupContainer.appendChild(sep);
        groupContainer.appendChild(contentContainer);
        elements.clientsContainer.appendChild(groupContainer);

        group.clients.forEach(client => {
            const mora = calculateMora(client);
            const hasMora = mora > 0;
            const card = document.createElement('div');

            const statusClass = client.status === 'Pagado' ? 'status-paid' : (hasMora ? 'status-mora' : 'status-pending');
            const statusText  = client.status === 'Pagado' ? 'Pagado' : (hasMora ? 'En Mora' : 'Pendiente');

            let isUpcoming = false;
            let isReminderDay = false;
            if (client.status !== 'Pagado' && client.collectionDate) {
                const dueDate = new Date(client.collectionDate);
                const today = new Date(); today.setHours(0,0,0,0);
                const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
                isUpcoming = diffDays >= 0 && diffDays <= 7;
                isReminderDay = diffDays === 4;
            }

            const isInterestOnly = client.loanType === 'interes';
            const monthlyInterest = isInterestOnly ? Math.round((client.amount * (client.interest / 100)) * 100) / 100 : 0;
            const interestPaid = client.interestPaidCount || 0;
            const totalMonths = client.term || 1;
            const isLastInterestMonth = isInterestOnly && (interestPaid >= totalMonths - 1);

            card.className = `client-card glass ${hasMora ? 'mora-active' : ''} ${isUpcoming ? 'upcoming-active' : ''} ${isReminderDay ? 'reminder-active' : ''} ${isInterestOnly ? 'interest-only-mode' : ''}`;
            card.dataset.clientId = client.id;

            const stars = '⭐'.repeat(client.rating || 3);
            const totalPaid = (client.payments || []).reduce((sum, p) => sum + p.amount, 0);
            const progressPercent = Math.min(100, (totalPaid / client.totalToReturn) * 100);

            const lastPayments = (client.payments || []).slice(-2).reverse();
            let miniHistoryHtml = '';
            if (lastPayments.length > 0) {
                miniHistoryHtml = `
                    <div class="mini-history">
                        <div class="mini-history-title"><span>Historial Reciente</span><i class="fas fa-bolt" style="color:var(--gold-primary);"></i></div>
                        ${lastPayments.map(p => {
                            const icon = p.paymentType === 'interes' ? 'fa-coins' : (p.paymentType === 'amortizacion' ? 'fa-arrow-down' : 'fa-check-double');
                            const color = p.paymentType === 'interes' ? 'var(--gold-primary)' : (p.paymentType === 'amortizacion' ? '#9b59b6' : 'var(--success-green)');
                            return `
                                <div class="mini-history-item">
                                    <div style="display:flex; align-items:center; gap:8px;">
                                        <i class="fas ${icon}" style="font-size:0.6rem; color:${color};"></i>
                                        <span class="mini-history-date">${new Date(p.date).toLocaleDateString()}</span>
                                    </div>
                                    <span class="mini-history-amount">${state.config.currency} ${p.amount.toFixed(2)}</span>
                                </div>`;
                        }).join('')}
                    </div>`;
            }

            card.innerHTML = `
                ${isReminderDay ? '<div class="reminder-tag"><i class="fas fa-bell"></i> Enviar Recordatorio Hoy</div>' : ''}
                ${(isInterestOnly && !hasMora && client.status !== 'Pagado') ? `<div class="modality-tag"><i class="fas fa-sync-alt"></i> Solo Interés (${interestPaid}/${totalMonths})</div>` : ''}
                <div class="card-header" style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:15px;">
                    <div>
                        <h3 class="card-name" style="font-family:var(--font-heading);font-size:1rem;color:var(--gold-primary);margin-bottom:2px;">${client.name}</h3>
                        <div class="card-rating">${stars}</div>
                        <span class="card-dni" style="font-size:0.7rem;color:var(--text-muted);">DNI: ${client.dni}</span>
                    </div>
                    <span class="status-badge ${statusClass}">${statusText}</span>
                </div>
                <div class="card-body">
                    <div class="data-item" style="grid-column:span 2;background:rgba(212,175,55,0.08);padding:12px;border-radius:10px;border-left:3px solid var(--gold-primary);margin-bottom:12px;">
                        <span class="label" style="color:var(--gold-primary);font-size:0.65rem;font-weight:bold;text-transform:uppercase;letter-spacing:1px;">Deuda Total Actual</span>
                        <div style="display:flex;justify-content:space-between;align-items:baseline;">
                            <span class="value" style="font-size:1.5rem;color:#fff;font-weight:800;">${state.config.currency} ${(client.remainingBalance + mora).toFixed(2)}</span>
                            <span style="font-size:0.7rem;color:var(--text-muted);">con mora</span>
                        </div>
                        ${isInterestOnly && client.status !== 'Pagado' ? `
                            <div style="margin-top:15px; padding:15px; background:rgba(212,175,55,0.06); border-radius:12px; border:1px solid rgba(212,175,55,0.15); box-shadow:inset 0 0 15px rgba(212,175,55,0.05); position:relative;">
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                                    <span style="font-size:0.6rem; color:var(--gold-primary); font-weight:900; text-transform:uppercase; letter-spacing:1.5px; background:rgba(212,175,55,0.1); padding:3px 8px; border-radius:4px;">
                                        <i class="fas fa-hand-holding-usd"></i> PRÓXIMO COBRO
                                    </span>
                                    <span style="font-size:0.65rem; color:var(--text-muted); font-style:italic;">${isLastInterestMonth ? 'Pago Final' : 'Interés Mensual'}</span>
                                </div>
                                <div style="display:flex; align-items:baseline; gap:5px;">
                                    <span style="font-size:1.4rem; color:#fff; font-weight:800; font-family:var(--font-heading);">${state.config.currency} ${(isLastInterestMonth ? (client.amount + monthlyInterest + mora) : (monthlyInterest + mora)).toFixed(2)}</span>
                                    <span style="font-size:0.75rem; color:var(--gold-light); opacity:0.8;">${mora > 0 ? '+ mora' : ''}</span>
                                </div>
                            </div>
                        ` : ''}
                    </div>
                    <div class="progress-container"><div class="progress-bar" style="width:${progressPercent}%"></div></div>
                    <div style="display:flex;justify-content:space-between;font-size:0.65rem;color:var(--text-muted);margin-top:-10px;margin-bottom:15px;">
                        <span>Cobrado: ${progressPercent.toFixed(0)}%</span><span>Meta: ${state.config.currency}${client.totalToReturn.toFixed(0)}</span>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
                        <div class="data-item"><span class="label"><i class="fas fa-piggy-bank" style="font-size:0.7rem;margin-right:4px;"></i>Capital</span><span class="value">${state.config.currency}${client.amount.toFixed(2)}</span></div>
                        <div class="data-item"><span class="label"><i class="fas fa-chart-pie" style="font-size:0.7rem;margin-right:4px;"></i>Saldo Neto</span><span class="value">${state.config.currency}${client.remainingBalance.toFixed(2)}</span></div>
                        <div class="data-item"><span class="label"><i class="fas fa-hourglass-half" style="font-size:0.7rem;margin-right:4px;"></i>Mora</span><span class="value" style="color:${hasMora?'var(--error-red)':'inherit'}">${state.config.currency}${mora.toFixed(2)}</span></div>
                        <div class="data-item"><span class="label"><i class="fas fa-calendar-check" style="font-size:0.7rem;margin-right:4px;"></i>Vence</span><span class="value" style="color:${hasMora?'var(--error-red)':'var(--gold-primary)'}">${client.collectionDate ? new Date(client.collectionDate).toLocaleDateString() : '---'}</span></div>
                    </div>
                    ${client.notes ? `<div class="client-notes"><i class="fas fa-sticky-note"></i> ${client.notes}</div>` : ''}
                    ${miniHistoryHtml}
                </div>
                <div class="card-footer" style="margin-top:auto;">
                    <button class="icon-btn" onclick="viewSchedule('${client.id}')" title="Ver Cronograma" style="color:var(--success-green);"><i class="fas fa-calendar-alt"></i></button>
                    ${isReminderDay ? `<button class="icon-btn" onclick="sendWhatsAppReminder('${client.id}')" title="Enviar Recordatorio (4 días)" style="color:#25D366; background:rgba(37,211,102,0.1);"><i class="fas fa-bell"></i></button>` : ''}
                    <button class="icon-btn" onclick="openPaymentModal('${client.id}')" title="Registrar Cobro"><i class="fas fa-cash-register"></i></button>
                    <button class="icon-btn" onclick="viewHistory('${client.id}')" title="Historial"><i class="fas fa-list-ul"></i></button>
                    <button class="icon-btn" onclick="viewEvidences('${client.id}')" title="Evidencias"><i class="fas fa-camera"></i></button>
                    <button class="icon-btn" onclick="openMaps('${client.maps}')" title="Ubicación"><i class="fas fa-map-marker-alt"></i></button>
                    <button class="icon-btn" onclick="duplicateLoan('${client.id}')" title="Nuevo Préstamo" style="color:var(--gold-primary);"><i class="fas fa-plus-circle"></i></button>
                    <button class="icon-btn whatsapp-btn" onclick="sendWhatsApp('${client.id}')" title="WhatsApp"><i class="fab fa-whatsapp"></i></button>
                    <button class="icon-btn" onclick="openEditModal('${client.id}')" title="Editar"><i class="fas fa-pen-fancy"></i></button>
                    <button class="icon-btn" onclick="deleteClient('${client.id}')" title="Eliminar" style="color:var(--error-red);background:rgba(255,77,77,0.05);"><i class="fas fa-trash-alt"></i></button>
                </div>
            `;
function openPaymentModal(id) {
    const client = state.clients.find(c => c.id === id);
    if (!client) return;

    elements.paymentClientId.value = id;
    const mora = calculateMora(client);
    const isInterestOnly = client.loanType === 'interes';
    
    // Show/Hide payment type selector
    const typeGroup = document.getElementById('payment-type-group');
    if (typeGroup) typeGroup.style.display = isInterestOnly ? 'block' : 'none';
    
    const monthlyInterest = isInterestOnly ? Math.round((client.amount * (client.interest / 100)) * 100) / 100 : 0;
    const interestPaid = client.interestPaidCount || 0;
    const totalInterestMonths = client.term || 1;
    // For interest-only: remainingBalance holds the capital. Final payment = capital + 1 month interest.
    const isLastPayment = isInterestOnly && (interestPaid >= totalInterestMonths - 1);
    const finalAmount = isInterestOnly ? Math.round((client.amount + monthlyInterest) * 100) / 100 : 0;

    let detailsHtml = `<div style="margin-bottom:16px;">`;
    detailsHtml += `<p style="margin-bottom:6px;"><strong>Cliente:</strong> ${client.name}</p>`;

    if (isInterestOnly) {
        const interesYaPagado = Math.round(interestPaid * monthlyInterest * 100) / 100;
        detailsHtml += `
            <div style="background:rgba(212,175,55,0.08);border-left:3px solid var(--gold-primary);padding:12px;border-radius:8px;margin:10px 0;">
                <p style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">📋 Modalidad: Solo Interés Mensual</p>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                    <div><span style="font-size:0.7rem;color:var(--text-muted);">Capital</span><br><strong style="color:#fff;">${state.config.currency} ${client.amount.toFixed(2)}</strong></div>
                    <div><span style="font-size:0.7rem;color:var(--text-muted);">Interés/mes</span><br><strong style="color:var(--gold-primary);">${state.config.currency} ${monthlyInterest.toFixed(2)}</strong></div>
                    <div><span style="font-size:0.7rem;color:var(--text-muted);">Cuotas pagadas</span><br><strong style="color:var(--success-green);">${interestPaid} / ${totalInterestMonths}</strong></div>
                    <div><span style="font-size:0.7rem;color:var(--text-muted);">Interés cobrado</span><br><strong style="color:var(--success-green);">${state.config.currency} ${interesYaPagado.toFixed(2)}</strong></div>
                </div>
            </div>`;

        if (mora > 0) {
            detailsHtml += `<p style="color:var(--error-red);margin-top:6px;"><strong>⚠ Mora:</strong> ${state.config.currency} ${mora.toFixed(2)}</p>`;
        }

        if (isLastPayment) {
            detailsHtml += `
                <div style="background:rgba(255,77,77,0.1);border:1px solid var(--error-red);border-radius:8px;padding:12px;margin-top:10px;">
                    <p style="color:var(--error-red);font-weight:700;font-size:0.85rem;">🏁 ÚLTIMO MES — COBRO FINAL</p>
                    <p style="font-size:0.8rem;color:var(--text-muted);margin-top:4px;">El cliente debe pagar el capital + interés del último mes${mora > 0 ? ' + mora' : ''}.</p>
                    <p style="font-size:1.1rem;color:var(--gold-primary);font-weight:800;margin-top:8px;">Total: ${state.config.currency} ${(finalAmount + mora).toFixed(2)}</p>
                </div>`;
        } else {
            detailsHtml += `
                <div style="background:rgba(39,174,96,0.1);border:1px solid var(--success-green);border-radius:8px;padding:12px;margin-top:10px;">
                    <p style="color:var(--success-green);font-weight:700;font-size:0.85rem;">💰 COBRO DE INTERÉS MENSUAL</p>
                    <p style="font-size:0.8rem;color:var(--text-muted);margin-top:4px;">El capital <strong>NO se reduce</strong>. Solo se cobra el interés del mes${mora > 0 ? ' + mora' : ''}.</p>
                    <p style="font-size:1.1rem;color:var(--gold-primary);font-weight:800;margin-top:8px;">A cobrar: ${state.config.currency} ${(monthlyInterest + mora).toFixed(2)}</p>
                </div>`;
        }
    } else {
        detailsHtml += `<p><strong>Saldo Pendiente:</strong> ${state.config.currency} ${client.remainingBalance.toFixed(2)}</p>`;
        if (mora > 0) detailsHtml += `<p style="color:var(--error-red);"><strong>Mora:</strong> ${state.config.currency} ${mora.toFixed(2)}</p>`;
        detailsHtml += `<p style="font-size:1.1rem;color:var(--gold-primary);margin-top:8px;"><strong>Total Sugerido:</strong> ${state.config.currency} ${(client.remainingBalance + mora).toFixed(2)}</p>`;
    }

    detailsHtml += `</div>`;

    // Quick-fill buttons
    let quickBtns = `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">`;
    if (isInterestOnly) {
        quickBtns += `<button type="button" onclick="document.getElementById('payment-amount').value='${(monthlyInterest + mora).toFixed(2)}'" style="flex:1;padding:8px;background:rgba(39,174,96,0.15);border:1px solid var(--success-green);border-radius:8px;color:var(--success-green);font-weight:700;cursor:pointer;font-size:0.8rem;">✔ Solo Interés<br>${state.config.currency}${(monthlyInterest+mora).toFixed(2)}</button>`;
        quickBtns += `<button type="button" onclick="document.getElementById('payment-amount').value='${(finalAmount + mora).toFixed(2)}'" style="flex:1;padding:8px;background:rgba(212,175,55,0.15);border:1px solid var(--gold-primary);border-radius:8px;color:var(--gold-primary);font-weight:700;cursor:pointer;font-size:0.8rem;">🏁 Pago Final<br>${state.config.currency}${(finalAmount+mora).toFixed(2)}</button>`;
    } else {
        quickBtns += `<button type="button" onclick="document.getElementById('payment-amount').value='${(client.remainingBalance + mora).toFixed(2)}'" style="flex:1;padding:8px;background:rgba(212,175,55,0.15);border:1px solid var(--gold-primary);border-radius:8px;color:var(--gold-primary);font-weight:700;cursor:pointer;font-size:0.8rem;">💯 Total<br>${state.config.currency}${(client.remainingBalance+mora).toFixed(2)}</button>`;
    }
    quickBtns += `</div>`;

    elements.paymentDetails.innerHTML = detailsHtml + quickBtns;
    elements.modalPayment.style.display = "flex";
    updateSmartProjection(); // Initialize projection on open
}

function generateReceipt(client, amountPaid, newBalance, nextDueDate, paymentType = 'abono', monthlyInterest = 0) {
    const canvas = document.getElementById('receipt-canvas');
    const ctx = canvas.getContext('2d');
    
    // Set canvas size for a perfect vertical receipt
    canvas.width = 500;
    canvas.height = 780; // Increased height for better fit

    // Background - Deep Black
    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Elegant Border
    ctx.strokeStyle = "#d4af37";
    ctx.lineWidth = 4;
    ctx.strokeRect(15, 15, canvas.width - 30, canvas.height - 30);

    // --- HEADER ---
    ctx.fillStyle = "#d4af37";
    ctx.textAlign = "center";
    ctx.font = "bold 32px Cinzel, serif";
    ctx.fillText("QOAN", canvas.width / 2, 80);
    
    ctx.font = "16px Inter, sans-serif";
    ctx.letterSpacing = "4px";
    ctx.fillText("SOLUCIONES FINANCIERAS", canvas.width / 2, 110);
    ctx.letterSpacing = "0px";

    // Divider
    ctx.strokeStyle = "rgba(212, 175, 55, 0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(120, 135);
    ctx.lineTo(380, 135);
    ctx.stroke();

    // --- VERTICAL CONTENT ---
    let currentY = 180;
    const sectionGap = 75;

    function drawVerticalField(label, value, isGold = false) {
        ctx.textAlign = "center";
        // Label
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.font = "bold 11px Inter, sans-serif";
        ctx.fillText(label.toUpperCase(), canvas.width / 2, currentY);
        
        // Value (with font scaling for long names)
        ctx.fillStyle = isGold ? "#d4af37" : "#ffffff";
        let fontSize = isGold ? 22 : 18;
        if (value.length > 25) fontSize = 15; // Scale down for long names
        if (value.length > 35) fontSize = 13;
        
        ctx.font = `bold ${fontSize}px Inter, sans-serif`;
        ctx.fillText(value, canvas.width / 2, currentY + 25);
        
        currentY += sectionGap;
    }

    drawVerticalField("Fecha de Emisión", new Date().toLocaleDateString());
    drawVerticalField("Nombre del Socio", client.name.toUpperCase());
    drawVerticalField("DNI / Identificación", client.dni);

    // Amount Section (Large and prominent)
    ctx.strokeStyle = "rgba(212, 175, 55, 0.3)";
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(80, currentY - 20);
    ctx.lineTo(420, currentY - 20);
    ctx.stroke();
    ctx.setLineDash([]);

    currentY += 10;
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "bold 13px Inter, sans-serif";
    const receiptLabel = paymentType === 'interes' ? 'COBRO DE INTERÉS MENSUAL' : 
                         (paymentType === 'amortizacion' ? 'ABONO DIRECTO A CAPITAL' :
                         (paymentType === 'final' ? 'PAGO FINAL — CAPITAL + INTERÉS' : 'MONTO TOTAL ABONADO'));
    ctx.fillText(receiptLabel, canvas.width / 2, currentY);
    
    ctx.fillStyle = "#d4af37";
    ctx.font = "bold 58px Inter, sans-serif";
    ctx.fillText(`${state.config.currency} ${amountPaid.toFixed(2)}`, canvas.width / 2, currentY + 65);
    
    currentY += 100;

    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "16px Inter, sans-serif";
    ctx.fillText(`SALDO PENDIENTE: ${state.config.currency} ${newBalance.toFixed(2)}`, canvas.width / 2, currentY);

    // --- YAPE DESTINATION (Clarified per user request) ---
    currentY += 80;
    
    // Purple Confirmation Box (Fixed overlapping)
    ctx.fillStyle = "#7320a1";
    ctx.beginPath();
    ctx.roundRect(50, currentY - 30, 400, 80, 15);
    ctx.fill();
    
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 12px Inter, sans-serif";
    ctx.fillText("CONFIRMACIÓN DE DEPÓSITO VIA YAPE", canvas.width / 2, currentY - 5);
    
    ctx.font = "bold 24px Inter, sans-serif";
    ctx.fillText(state.config.yapePhone || "900 779 111", canvas.width / 2, currentY + 25);
    
    ctx.font = "italic 13px Inter, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fillText(state.config.yapeName || "JUAN DAVID PUCLLA QUISPE", canvas.width / 2, currentY + 45);

    // --- NEXT DUE DATE ---
    if (nextDueDate) {
        currentY += 50;
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.fillText('PRÓXIMO VENCIMIENTO', canvas.width/2, currentY);
        ctx.fillStyle = '#f1c40f';
        ctx.font = 'bold 18px Inter, sans-serif';
        ctx.fillText(new Date(nextDueDate).toLocaleDateString(), canvas.width/2, currentY+22);
    }

    // --- FOOTER ---
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(212, 175, 55, 0.5)";
    ctx.font = "italic 11px Inter, sans-serif";
    ctx.fillText("Este es un comprobante digital de operación financiera.", canvas.width / 2, canvas.height - 55);
    ctx.fillText("Gracias por su confianza y puntualidad.", canvas.width / 2, canvas.height - 35);

    // Convert to image and download
    const link = document.createElement('a');
    link.download = `Recibo_Digital_${client.name.replace(/\s/g, '_')}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
}

function sendWhatsApp(id) {
    const client = state.clients.find(c => c.id === id);
    if (!client) return;

    const mora = calculateMora(client);
    const isInterestOnly = client.loanType === 'interes';
    const monthlyInterest = isInterestOnly ? Math.round((client.amount * (client.interest / 100)) * 100) / 100 : 0;
    
    let cuotaSugerida = client.totalToReturn / (client.term || 1);

    if (isInterestOnly) {
        const interestPaid = client.interestPaidCount || 0;
        const totalMonths = client.term || 1;
        if (interestPaid >= totalMonths - 1) {
            cuotaSugerida = client.amount + monthlyInterest;
        } else {
            cuotaSugerida = monthlyInterest;
        }
    }

    const capitalizedName = client.name.split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');

    const today = new Date(); today.setHours(0,0,0,0);
    const dueDate = client.collectionDate ? new Date(client.collectionDate) : new Date();
    const diffTime = today - dueDate;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    let message = ``;

    if (mora > 0 && diffDays >= 1 && diffDays <= 2) {
        // Nivel 2: Aviso de Vencimiento
        message += `*AVISO DE VENCIMIENTO | QOAN* 🤖%0A%0A`;
        message += `Estimado/a *${capitalizedName}*. Nos comunicamos de QOAN Soluciones Financieras para informarle que su pago por *${state.config.currency} ${(cuotaSugerida).toFixed(2)}*, correspondiente a la fecha *${dueDate.toLocaleDateString()}*, se encuentra actualmente en estado pendiente.%0A%0A`;
        message += `Le invitamos a regularizar su saldo a la brevedad para evitar recargos por mora mayores. (Mora actual generada: ${state.config.currency} ${mora.toFixed(2)}).%0A%0A`;
        message += `*Total a pagar hoy: ${state.config.currency} ${(cuotaSugerida + mora).toFixed(2)}*%0A%0A`;
        message += `_Quedamos atentos a su confirmación o comprobante de pago. ¡Que tenga un excelente día!_%0A%0A`;
    } else if (mora > 0 && diffDays >= 3 && diffDays <= 6) {
        // Nivel 3: Gestión de Cobro Firme
        message += `*NOTIFICACIÓN DE COBRANZA | QOAN* ⚠️%0A%0A`;
        message += `Hola, *${capitalizedName}*. Le notificamos desde el departamento de cobranza de QOAN.%0A%0A`;
        message += `A la fecha, nuestro sistema sigue sin registrar el pago de su cuota del *${dueDate.toLocaleDateString()}*. Es importante regularizar esta situación hoy mismo para mantener el buen estado de su cuenta y evitar la acumulación diaria de intereses moratorios.%0A%0A`;
        message += `*Detalle de la deuda:*%0A`;
        message += `> Cuota pendiente: ${state.config.currency} ${cuotaSugerida.toFixed(2)}%0A`;
        message += `> Mora acumulada (${diffDays} días): ${state.config.currency} ${mora.toFixed(2)}%0A`;
        message += `> *TOTAL A PAGAR: ${state.config.currency} ${(cuotaSugerida + mora).toFixed(2)}*%0A%0A`;
        message += `_Por favor, comuníquese con nosotros a la brevedad para confirmar su pago._%0A%0A`;
    } else if (mora > 0 && diffDays >= 7) {
        // Nivel 4: Último Aviso antes de Escalamiento
        message += `*🚨 IMPORTANTE: AVISO DE ATRASO CRÍTICO | QOAN*%0A%0A`;
        message += `Atención *${capitalizedName}*. Este es un aviso automático del sistema de QOAN Soluciones Financieras.%0A%0A`;
        message += `Su cuenta presenta un atraso significativo desde el *${dueDate.toLocaleDateString()}*. Para evitar la suspensión de servicios financieros o el escalamiento de su caso a instancias superiores, requerimos el pago inmediato del saldo pendiente.%0A%0A`;
        message += `*Monto Exigible Hoy:*%0A`;
        message += `> Cuota Vencida: ${state.config.currency} ${cuotaSugerida.toFixed(2)}%0A`;
        message += `> Intereses Moratorios: ${state.config.currency} ${mora.toFixed(2)}%0A`;
        message += `> *TOTAL EXIGIBLE: ${state.config.currency} ${(cuotaSugerida + mora).toFixed(2)}*%0A%0A`;
        message += `_Por favor, póngase en contacto directo con su asesor dentro de las próximas 24 horas para evitar mayores inconvenientes._%0A%0A`;
    } else {
        // Nivel 0 o por Defecto: Estado de Cuenta Normal
        message += `*--- ESTADO DE CUENTA | QOAN ---*%0A%0A`;
        message += `Hola *${capitalizedName}*, te enviamos tu estado de cuenta actualizado:%0A%0A`;
        message += `*COBRO ACTUAL:*%0A`;
        if (isInterestOnly) {
            message += `> Concepto: *Interés Mensual*%0A`;
        }
        message += `> Monto: *${state.config.currency} ${cuotaSugerida.toFixed(2)}*%0A`;
        if (mora > 0) message += `> Mora: ${state.config.currency} ${mora.toFixed(2)}%0A`;
        message += `> *TOTAL A PAGAR: ${state.config.currency} ${(cuotaSugerida + mora).toFixed(2)}*%0A`;
        if (client.collectionDate) message += `> Vencimiento: ${dueDate.toLocaleDateString()}%0A`;
        message += `%0A`;
    }

    if (client.maps) {
        message += `*Ubicación de Cobro:*%0A`;
        message += `📍 ${client.maps}%0A%0A`;
    }

    message += `*PAGO VIA YAPE:*%0A`;
    message += `Cel: *${state.config.yapePhone || '900 779 111'}*%0A`;
    message += `A nombre de: *${state.config.yapeName || 'Juan David Puclla Quispe'}*%0A%0A`;
    message += `_Por favor, envía tu comprobante para registrar tu pago en el sistema. ¡Gracias!_`;

    window.open(`https://wa.me/${client.phone}?text=${message}`, '_blank');
}

function openMaps(location) {
    if (!location) {
        alert("No hay ubicación registrada para este cliente.");
        return;
    }

    if (location.startsWith('http')) {
        window.open(location, '_blank');
    } else {
        // If it's just text, search for it on Google Maps
        window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`, '_blank');
    }
}

function viewEvidences(id) {
    const client = state.clients.find(c => c.id === id);
    if (!client || !client.evidences || client.evidences.length === 0) {
        showToast('Sin evidencias fotográficas para este cliente.', 'info');
        return;
    }
    openLightbox(client.evidences, 0);
}

function deleteClient(id) {
    showConfirm('¿Eliminar esta operación? Esta acción no se puede deshacer.', async () => {
        state.clients = state.clients.filter(c => c.id !== id);
        if (supabaseClient) {
            try {
                await supabaseClient.from('payments').delete().eq('clientId', id);
                await supabaseClient.from('clients').delete().eq('id', id);
            } catch(e) {
                console.error('Error eliminando de Supabase:', e);
            }
        }
        saveToStorage();
        renderClients();
        showToast('Operación eliminada.', 'warning');
    });
}

function openEditModal(id) {
    const client = state.clients.find(c => c.id === id);
    if (!client) return;

    // Change modal title
    document.querySelector('#modal-loan h2').innerHTML = '<i class="fas fa-edit gold"></i> Editar Operación';
    
    // Fill fields
    document.getElementById('edit-client-id').value = client.id;
    document.getElementById('client-name').value = client.name;
    document.getElementById('client-dni').value = client.dni;
    document.getElementById('client-phone').value = client.phone;
    document.getElementById('client-maps').value = client.maps;
    document.getElementById('client-rating').value = client.rating || 3;
    document.getElementById('loan-amount').value = client.amount;
    document.getElementById('loan-interest').value = client.interest;
    document.getElementById('loan-term').value = client.term;
    document.getElementById('loan-type').value = client.loanType || 'fijo';
    document.getElementById('loan-start-date').value = client.startDate ? client.startDate.split('T')[0] : '';
    document.getElementById('loan-collection-date').value = client.collectionDate ? client.collectionDate.split('T')[0] : '';
    document.getElementById('client-notes').value = client.notes || '';

    calculateLoanPreview();
    
    // Show modal
    elements.modalLoan.style.display = "flex";
}

function duplicateLoan(id) {
    const client = state.clients.find(c => c.id === id);
    if (!client) return;

    // Reset form and set to "New Operation"
    elements.loanForm.reset();
    document.querySelector('#modal-loan h2').innerHTML = '<i class="fas fa-user-plus gold"></i> Nuevo Préstamo (Socio Existente)';
    document.getElementById('edit-client-id').value = ""; // Crucial: Clear ID to create NEW record

    // Fill personal data
    document.getElementById('client-name').value = client.name;
    document.getElementById('client-dni').value = client.dni;
    document.getElementById('client-phone').value = client.phone;
    document.getElementById('client-maps').value = client.maps;
    document.getElementById('client-rating').value = client.rating || 3;

    // Default dates for new loan
    const today = new Date().toISOString().split('T')[0];
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const nextMonthStr = nextMonth.toISOString().split('T')[0];
    
    document.getElementById('loan-start-date').value = today;
    document.getElementById('loan-collection-date').value = nextMonthStr;

    calculateLoanPreview();
    elements.modalLoan.style.display = "flex";
}

function viewHistory(id) {
    const client = state.clients.find(c => c.id === id);
    if (!client) return;

    let html = `
        <div style="background: rgba(212, 175, 55, 0.05); padding: 20px; border-radius: 12px; margin-bottom: 25px; border-left: 4px solid var(--gold-primary);">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <h3 style="color: var(--gold-primary); font-family: var(--font-heading); margin-bottom: 5px;">${client.name}</h3>
                    <p style="font-size: 0.8rem; color: var(--text-muted);">Registro de Abonos y Movimientos</p>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase;">Saldo Actual</div>
                    <div style="font-size: 1.5rem; font-weight: 800; color: #fff;">${state.config.currency} ${client.remainingBalance.toFixed(2)}</div>
                </div>
            </div>
        </div>
        <div style="max-height: 400px; overflow-y: auto;">
            <table class="history-table">
                <thead>
                    <tr>
                        <th>Fecha y Hora</th>
                        <th>Monto Abonado</th>
                        <th>Saldo Posterior</th>
                        <th style="text-align: right;">Acciones</th>
                    </tr>
                </thead>
                <tbody>
    `;

    if (!client.payments || client.payments.length === 0) {
        html += `<tr><td colspan="4" style="text-align:center; padding: 40px; color: var(--text-muted);">No se han registrado pagos para esta operación.</td></tr>`;
    } else {
        [...client.payments].reverse().forEach((p, index) => {
            // Original index is needed for deletion
            const originalIndex = client.payments.indexOf(p);
            const typeLabel = p.paymentType === 'interes' ? '<span style="font-size:0.65rem;background:rgba(39,174,96,0.15);color:var(--success-green);border-radius:4px;padding:2px 6px;margin-left:4px;">Interés</span>'
                : p.paymentType === 'final' ? '<span style="font-size:0.65rem;background:rgba(212,175,55,0.15);color:var(--gold-primary);border-radius:4px;padding:2px 6px;margin-left:4px;">Pago Final</span>'
                : p.paymentType === 'amortizacion' ? '<span style="font-size:0.65rem;background:rgba(155,89,182,0.15);color:#9b59b6;border-radius:4px;padding:2px 6px;margin-left:4px;">Cap. Amortizado</span>'
                : '';
            html += `
                <tr>
                    <td>
                        <div style="font-weight: 600;">${new Date(p.date).toLocaleDateString()}</div>
                        <div style="font-size: 0.7rem; color: var(--text-muted);">${new Date(p.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                    </td>
                    <td style="color: var(--success-green); font-weight: 700;">${state.config.currency} ${p.amount.toFixed(2)}${typeLabel}</td>
                    <td>${state.config.currency} ${p.balanceAfter.toFixed(2)}</td>
                    <td style="text-align: right;">
                        <button class="icon-btn" onclick="deletePayment('${client.id}', ${originalIndex})" title="Anular Pago" style="color: var(--error-red); background: rgba(255, 77, 77, 0.1); border-color: rgba(255, 77, 77, 0.2); width: 32px; height: 32px; font-size: 0.8rem; display: inline-flex;">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
    }

    html += `</tbody></table></div>`;
    elements.historyContent.innerHTML = html;
    elements.modalHistory.style.display = "flex";
}

function viewSchedule(id) {
    const client = state.clients.find(c => c.id === id);
    if (!client) return;

    const isInterestOnly = client.loanType === 'interes';
    const term = client.term || 1;
    const amount = client.amount;
    const interestRate = client.interest;
    const monthlyInterest = Math.round((amount * (interestRate / 100)) * 100) / 100;
    
    let html = `
        <div style="background: rgba(39, 174, 96, 0.05); padding: 15px; border-radius: 12px; margin-bottom: 20px; border-left: 4px solid var(--success-green);">
            <h3 style="color: var(--success-green); margin-bottom: 5px;">Cronograma de Pagos</h3>
            <p style="font-size: 0.8rem; color: var(--text-muted);">Basado en: ${isInterestOnly ? 'Solo Interés Mensual' : 'Cuotas Fijas'}</p>
        </div>
        <table class="history-table">
            <thead>
                <tr>
                    <th>Cuota</th>
                    <th>Fecha Límite</th>
                    <th>Monto (${state.config.currency})</th>
                    <th>Estado</th>
                </tr>
            </thead>
            <tbody>
    `;

    const startDate = client.startDate ? new Date(client.startDate + 'T12:00:00') : new Date();
    const interestPaidCount = client.interestPaidCount || 0;

    for (let i = 1; i <= term; i++) {
        const dueDate = new Date(startDate);
        dueDate.setMonth(dueDate.getMonth() + i);
        
        let montoCuota = 0;
        let tipoLabel = "";

        if (isInterestOnly) {
            if (i === term) {
                montoCuota = amount + monthlyInterest;
                tipoLabel = "Final (Cap + Int)";
            } else {
                montoCuota = monthlyInterest;
                tipoLabel = "Interés";
            }
        } else {
            montoCuota = client.totalToReturn / term;
            tipoLabel = "Cuota Fija";
        }

        const isPaid = isInterestOnly ? (i <= interestPaidCount) : (client.status === 'Pagado' || (client.totalToReturn - client.remainingBalance) >= (montoCuota * i - 1));

        html += `
            <tr style="${isPaid ? 'opacity: 0.6; background: rgba(39,174,96,0.03);' : ''}">
                <td><strong>${i}</strong></td>
                <td>${dueDate.toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' })}</td>
                <td>
                    <div style="font-weight: 700; color: ${i === term ? 'var(--gold-primary)' : 'inherit'}">${state.config.currency} ${montoCuota.toFixed(2)}</div>
                    <div style="font-size: 0.65rem; color: var(--text-muted);">${tipoLabel}</div>
                </td>
                <td>
                    ${isPaid ? '<span style="color: var(--success-green);"><i class="fas fa-check-circle"></i> Pagado</span>' : '<span style="color: var(--text-muted);">Pendiente</span>'}
                </td>
            </tr>
        `;
    }

    html += `</tbody></table>`;
    
    // Reusing history modal for schedule
    document.querySelector('#modal-history h2').innerHTML = '<i class="fas fa-calendar-alt gold"></i> Cronograma de Pagos';
    elements.historyContent.innerHTML = html;
    elements.modalHistory.style.display = "flex";
}

function deletePayment(clientId, paymentIndex) {
    showConfirm('¿Anular este pago? El saldo del cliente volverá a aumentar.', () => {
        const client = state.clients.find(c => c.id === clientId);
        if (!client || !client.payments[paymentIndex]) return;
        const payment = client.payments[paymentIndex];
        const isInterestOnly = client.loanType === 'interes';

        if (isInterestOnly) {
            if (payment.paymentType === 'final') {
                // Reverse final payment: restore capital as remaining balance
                client.remainingBalance = client.amount;
                client.status = 'Pendiente';
                if (client.interestPaidCount > 0) client.interestPaidCount--;
            } else if (payment.paymentType === 'interes') {
                // Reverse an interest payment: just decrement counter, capital unchanged
                if (client.interestPaidCount > 0) client.interestPaidCount--;
                // Roll back collection date
                if (client.collectionDate) {
                    const d = new Date(client.collectionDate);
                    d.setMonth(d.getMonth() - 1);
                    client.collectionDate = d.toISOString().split('T')[0];
                }
                client.status = 'Pendiente';
            }
        } else {
            client.remainingBalance = Math.round((client.remainingBalance + payment.amount) * 100) / 100;
            if (client.remainingBalance > 0) client.status = 'Pendiente';
        }

        client.payments.splice(paymentIndex, 1);
        saveToStorage();
        renderClients();
        viewHistory(clientId);
        showToast('Pago anulado y saldo restaurado.', 'warning');
    });
}

function exportCSV() {
    let csv = "ID,Nombre,DNI,Telefono,Monto,Interes,Plazo,Saldo,Status,Fecha_Inicio,Fecha_Cobro,Calificacion\n";
    state.clients.forEach(c => {
        csv += `${c.id},${c.name},${c.dni},${c.phone},${c.amount},${c.interest},${c.term},${c.remainingBalance},${c.status},${c.startDate || ''},${c.collectionDate || ''},${c.rating || 3}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', 'QOAN_Backup_Excel.csv');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function exportJSON() {
    const data = {
        clients: state.clients,
        config: state.config,
        backupDate: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `QOAN_FULL_BACKUP_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
}

function sendWhatsAppReminder(id) {
    const client = state.clients.find(c => c.id === id);
    if (!client) return;

    const isInterestOnly = client.loanType === 'interes';
    const monthlyInterest = isInterestOnly ? Math.round((client.amount * (client.interest / 100)) * 100) / 100 : 0;
    let cuota = client.totalToReturn / (client.term || 1);

    if (isInterestOnly) {
        const interestPaidCount = client.interestPaidCount || 0;
        const totalMonths = client.term || 1;
        if (interestPaidCount >= totalMonths - 1) {
            cuota = client.amount + monthlyInterest;
        } else {
            cuota = monthlyInterest;
        }
    }

    const capitalizedName = client.name.split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');

    const dateStr = new Date(client.collectionDate).toLocaleDateString('es-PE', { day: '2-digit', month: 'long' });

    let message = `*QOAN Soluciones Financieras* 🤖%0A%0A`;
    message += `Hola, *${capitalizedName}*. Le escribe el asistente virtual de QOAN.%0A%0A`;
    message += `Solo queremos enviarle un cordial recordatorio preventivo de que su próxima fecha de pago está programada para el *${dateStr}*.%0A`;
    message += `Su saldo correspondiente a cancelar es de *${state.config.currency} ${cuota.toFixed(2)}*.%0A%0A`;
    message += `_Si ya realizó el pago, por favor omita este mensaje. ¡Estamos a su disposición para cualquier consulta!_%0A%0A`;
    message += `*PAGO VIA YAPE:*%0A`;
    message += `Cel: *${state.config.yapePhone || '900 779 111'}*%0A`;
    message += `A nombre de: *${state.config.yapeName || 'Juan David Puclla Quispe'}*`;

    window.open(`https://wa.me/${client.phone}?text=${message}`, '_blank');
}

// --- Event Listeners ---

function setupEventListeners() {
    // New Loan Modal
    elements.btnNewLoan.onclick = () => {
        document.querySelector('#modal-loan h2').innerHTML = '<i class="fas fa-file-signature gold"></i> Nueva Operación';
        elements.loanForm.reset();
        
        // Default dates
        const today = new Date().toISOString().split('T')[0];
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        const nextMonthStr = nextMonth.toISOString().split('T')[0];
        
        document.getElementById('loan-start-date').value = today;
        document.getElementById('loan-collection-date').value = nextMonthStr;

        document.getElementById('edit-client-id').value = "";
        elements.previewThumbnails.innerHTML = "";
        elements.modalLoan.style.display = "flex";
    };
    
    // Global Close Logic (Delegation)
    document.addEventListener('click', (e) => {
        // Close with X button
        if (e.target.classList.contains('close-modal')) {
            e.target.closest('.modal').style.display = "none";
        }
        // Close by clicking outside
        if (e.target.classList.contains('modal')) {
            e.target.style.display = "none";
        }
    });

    // Form Calculations
    [elements.loanAmount, elements.loanInterest, elements.loanTerm].forEach(input => {
        input.oninput = calculateLoanPreview;
    });
    document.getElementById('loan-type').onchange = calculateLoanPreview;

    // Evidence Preview
    elements.evidenceInput.onchange = (e) => {
        elements.previewThumbnails.innerHTML = "";
        const files = Array.from(e.target.files);
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = document.createElement('img');
                img.src = event.target.result;
                img.className = "thumb-preview";
                elements.previewThumbnails.appendChild(img);
            };
            reader.readAsDataURL(file);
        });
    };

    // Handle Drop Zone
    const dropZone = document.getElementById('drop-zone');
    dropZone.onclick = () => elements.evidenceInput.click();

    // Submit New/Edit Loan
    elements.loanForm.onsubmit = async (e) => {
        e.preventDefault();
        
        const editId = document.getElementById('edit-client-id').value;
        const evidences = [];
        const files = elements.evidenceInput.files;
        
        if (files.length > 0) {
            for (let file of files) {
                const base64 = await toBase64(file);
                evidences.push(base64);
            }
        }

        const amount = parseFloat(elements.loanAmount.value);
        const interest = parseFloat(elements.loanInterest.value);
        const term = parseInt(elements.loanTerm.value) || 1;
        
        // --- Validation ---
        if (amount <= 0) {
            alert("El monto principal debe ser mayor a 0.");
            return;
        }
        if (term <= 0) {
            alert("El plazo debe ser de al menos 1 mes.");
            return;
        }
        if (files.length > 3) {
            alert("Máximo 3 fotos de evidencia por cliente para optimizar espacio.");
            return;
        }

        const totalToReturn = Math.round((amount + (amount * (interest / 100) * term)) * 100) / 100;

        if (editId) {
            // Update existing
            const index = state.clients.findIndex(c => c.id === editId);
            if (index !== -1) {
                state.clients[index] = {
                    ...state.clients[index],
                    name: document.getElementById('client-name').value,
                    dni: document.getElementById('client-dni').value,
                    phone: document.getElementById('client-phone').value,
                    maps: document.getElementById('client-maps').value,
                    notes: document.getElementById('client-notes').value,
                    amount: amount,
                    interest: interest,
                    term: term,
                    loanType: document.getElementById('loan-type').value,
                    totalToReturn: totalToReturn,
                    rating: parseInt(document.getElementById('client-rating').value),
                    startDate: document.getElementById('loan-start-date').value,
                    collectionDate: document.getElementById('loan-collection-date').value,
                    remainingBalance: totalToReturn - (state.clients[index].totalToReturn - state.clients[index].remainingBalance)
                };
                if (evidences.length > 0) {
                    state.clients[index].evidences = [...state.clients[index].evidences, ...evidences];
                }
            }
        } else {
            // Create new
            const newClient = {
                id: 'client_' + Date.now(),
                name: document.getElementById('client-name').value,
                dni: document.getElementById('client-dni').value,
                phone: document.getElementById('client-phone').value,
                maps: document.getElementById('client-maps').value,
                notes: document.getElementById('client-notes').value,
                amount: amount,
                interest: interest,
                term: term,
                totalToReturn: totalToReturn,
                remainingBalance: totalToReturn,
                date: new Date().toISOString(),
                rating: parseInt(document.getElementById('client-rating').value),
                startDate: document.getElementById('loan-start-date').value,
                collectionDate: document.getElementById('loan-collection-date').value,
                loanType: document.getElementById('loan-type').value,
                status: 'Pendiente',
                evidences: evidences,
                payments: []
            };
            state.clients.push(newClient);
        }

        saveToStorage();
        renderClients();
        elements.modalLoan.style.display = "none";
        elements.loanForm.reset();
        elements.previewThumbnails.innerHTML = "";
    };

    // Submit Payment
    elements.paymentForm.onsubmit = (e) => {
        e.preventDefault();
        const id = elements.paymentClientId.value;
        const amountPaid = parseFloat(elements.paymentAmount.value);
        const clientIndex = state.clients.findIndex(c => c.id === id);
        if (clientIndex === -1) return;
        const client = state.clients[clientIndex];
        if (amountPaid <= 0) { showToast('El monto debe ser mayor a 0.', 'error'); return; }

        const isInterestOnly = client.loanType === 'interes';
        const typeSelect = document.getElementById('payment-type-select');
        const selectedType = isInterestOnly ? typeSelect.value : 'abono';
        
        const monthlyInterest = isInterestOnly ? Math.round((client.amount * (client.interest / 100)) * 100) / 100 : 0;
        const interestPaidCount = client.interestPaidCount || 0;
        const totalInterestMonths = client.term || 1;
        const mora = calculateMora(client);

        if (!client.payments) client.payments = [];

        let nextDueDate = null;
        let paymentType = selectedType;

        if (isInterestOnly) {
            if (selectedType === 'capital') {
                // AMORTIZACIÓN DE CAPITAL
                paymentType = 'amortizacion';
                client.amount = Math.round((client.amount - amountPaid) * 100) / 100;
                client.remainingBalance = Math.round((client.remainingBalance - amountPaid) * 100) / 100;
                
                // Recalculate Total to Return based on new amount
                const remainingMonths = Math.max(1, totalInterestMonths - interestPaidCount);
                client.totalToReturn = Math.round((client.amount + (client.amount * (client.interest / 100) * totalInterestMonths)) * 100) / 100;
                
                // No advance in due date for capital amortization usually
                nextDueDate = client.collectionDate;
            } else {
                // REGULAR INTEREST PAYMENT
                const finalAmount = Math.round((client.amount + monthlyInterest) * 100) / 100;
                const isFinalPayment = amountPaid >= (client.amount - 0.01); 

                if (isFinalPayment) {
                    paymentType = 'final';
                    client.remainingBalance = 0;
                    client.status = 'Pagado';
                    client.interestPaidCount = totalInterestMonths;
                } else {
                    paymentType = 'interes';
                    client.interestPaidCount = interestPaidCount + 1;
                    if (client.collectionDate) {
                        const nd = new Date(client.collectionDate);
                        nd.setMonth(nd.getMonth() + 1);
                        nextDueDate = nd.toISOString().split('T')[0];
                        client.collectionDate = nextDueDate;
                    }
                }
            }
        } else {
            // Standard fixed installment logic
            client.remainingBalance = Math.round((client.remainingBalance - amountPaid) * 100) / 100;
            if (client.remainingBalance > 0 && client.collectionDate) {
                const nd = new Date(client.collectionDate);
                nd.setMonth(nd.getMonth() + 1);
                nextDueDate = nd.toISOString().split('T')[0];
                client.collectionDate = nextDueDate;
            }
            if (client.remainingBalance <= 0) {
                client.remainingBalance = 0;
                client.status = 'Pagado';
            }
        }

        client.payments.push({
            date: new Date().toISOString(),
            amount: amountPaid,
            balanceAfter: client.remainingBalance,
            paymentType: paymentType,
            method: 'yape'
        });

        generateReceipt(client, amountPaid, client.remainingBalance, nextDueDate, paymentType, monthlyInterest);
        saveToStorage();
        renderClients();
        elements.modalPayment.style.display = "none";
        elements.paymentForm.reset();
        
        const typeLabelMap = {
            'interes': 'Interés',
            'amortizacion': 'Abono a Capital',
            'final': 'Pago Final',
            'abono': 'Abono'
        };
        const typeLabel = typeLabelMap[paymentType] || 'Cobro';
        showToast(`${typeLabel} de ${state.config.currency} ${amountPaid.toFixed(2)} registrado ✓`, 'success');
        // Flash paid card
        setTimeout(() => {
            const card = elements.clientsContainer.querySelector(`[data-client-id="${client.id}"]`);
            if (card) { card.classList.add('just-paid'); setTimeout(() => card.classList.remove('just-paid'), 1500); }
        }, 100);
    };

    // Search
    elements.searchInput.oninput = (e) => {
        const activeFilter = document.querySelector('.filter-btn.active').dataset.filter;
        renderClients(e.target.value, activeFilter);
    };

    // Filter Buttons
    elements.filterBtns.forEach(btn => {
        btn.onclick = () => {
            elements.filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderClients(elements.searchInput.value, btn.dataset.filter);
        };
    });

    // Alert Card Click (Quick Filter)
    const alertUpcomingEl = document.getElementById('alert-upcoming');
    if (alertUpcomingEl) {
        alertUpcomingEl.onclick = () => {
            const proximosBtn = document.querySelector('.filter-btn[data-filter="proximos"]');
            if (proximosBtn) proximosBtn.click();
        };
    }

    // Export
    elements.btnExportCsv.onclick = exportJSON; // Changed to full JSON for safety

    // Import
    elements.btnImport.onclick = () => elements.importFileInput.click();
    
    elements.importFileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const importedData = JSON.parse(event.target.result);
                if (importedData.clients && Array.isArray(importedData.clients)) {
                    if (confirm("¿Estás seguro de importar estos datos? Se sobrescribirá la información actual.")) {
                        state.clients = importedData.clients;
                        if (importedData.config) state.config = importedData.config;
                        saveToStorage();
                        renderClients();
                        alert("Copia de seguridad restaurada con éxito.");
                    }
                } else {
                    alert("El archivo no tiene el formato correcto.");
                }
            } catch (err) {
                alert("Error al leer el archivo. Asegúrate de que sea un archivo .json válido.");
            }
        };
        reader.readAsText(file);
    };

    // Settings
    elements.btnSettings.onclick = () => {
        elements.setMoraRate.value = state.config.moraRate;
        elements.setCurrency.value = state.config.currency;
        document.getElementById('set-yape-name').value = state.config.yapeName || '';
        document.getElementById('set-yape-phone').value = state.config.yapePhone || '';
        elements.modalSettings.style.display = "flex";
    };

    elements.settingsForm.onsubmit = (e) => {
        e.preventDefault();
        state.config.moraRate = parseFloat(elements.setMoraRate.value);
        state.config.currency = elements.setCurrency.value;
        state.config.yapeName = document.getElementById('set-yape-name').value;
        state.config.yapePhone = document.getElementById('set-yape-phone').value;
        saveToStorage();
        renderClients();
        elements.modalSettings.style.display = "none";
        showToast('Configuración guardada correctamente ✓', 'success');
    };

    // Auto-Capitalization
    elements.clientNameInput.oninput = (e) => {
        const val = e.target.value;
        const capitalized = val.split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
        
        // Preserve cursor position if possible, though simple replacement is fine for now
        if (val !== capitalized) {
            e.target.value = capitalized;
        }
    };

    // Lightbox close & gallery nav
    document.querySelector('.close-lightbox').onclick = () => { elements.lightbox.style.display = 'none'; };
    const lbPrev = document.getElementById('lightbox-prev');
    const lbNext = document.getElementById('lightbox-next');
    if (lbPrev) lbPrev.onclick = () => { _lbIdx = (_lbIdx-1+_lbImages.length)%_lbImages.length; _updateLb(); };
    if (lbNext) lbNext.onclick = () => { _lbIdx = (_lbIdx+1)%_lbImages.length; _updateLb(); };

    // Sort select
    if (elements.sortSelect) elements.sortSelect.onchange = () => renderClients(elements.searchInput.value, document.querySelector('.filter-btn.active').dataset.filter);

    // Smart Projection Listeners
    const payAmountInput = document.getElementById('payment-amount');
    const payTypeSelect = document.getElementById('payment-type-select');
    if (payAmountInput) payAmountInput.oninput = updateSmartProjection;
    if (payTypeSelect) payTypeSelect.onchange = updateSmartProjection;

    // Confirm modal
    document.getElementById('confirm-ok').onclick = () => {
        document.getElementById('modal-confirm').style.display = 'none';
        if (_confirmCb) { _confirmCb(); _confirmCb = null; }
    };
    document.getElementById('confirm-cancel').onclick = () => {
        document.getElementById('modal-confirm').style.display = 'none';
        _confirmCb = null;
    };
}

// --- Utils ---
function toBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

// Start the app
init();
