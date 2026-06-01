const fs = require('fs');
const content = fs.readFileSync('app.js', 'utf8');

const lines = content.split('\n');
const targetLineIndex = lines.findIndex(l => l.includes('t.className = `toast toast-${type}`;'));
const newCapitalLineIndex = lines.findIndex(l => l.includes('const newCapital = Math.max(0, client.amount - amount);'));

if (targetLineIndex !== -1 && newCapitalLineIndex !== -1) {
    const before = lines.slice(0, targetLineIndex + 1).join('\n');
    const after = lines.slice(newCapitalLineIndex).join('\n');
    
    const restoredCode = `    t.innerHTML = \`<i class="fas \${icons[type]||'fa-info-circle'}"></i><span>\${msg}</span>\`;
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
    if (ctr) ctr.textContent = \`\${_lbIdx+1} / \${_lbImages.length}\`;
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
        const currentInterest = Math.round((client.amount * (client.interest / 100)) * 100) / 100;`;
        
    fs.writeFileSync('app.js', before + '\n' + restoredCode + '\n' + after);
    console.log('Fixed successfully');
} else {
    console.log('Failed to find indices');
}
