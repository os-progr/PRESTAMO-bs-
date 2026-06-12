import re
import io

with open("app.js", "r", encoding="utf-8") as f:
    content = f.read()

missing_code = """        }
        
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
    
    let csvContent = headers.join(',') + '\\n' + rows.map(e => e.join(',')).join('\\n');
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
            
            if (config.allowEditFinancials) {
                const manualInt = parseFloat(document.getElementById('client-interest').value);
                const manualMora = parseFloat(document.getElementById('client-custom-mora').value);
                
                if (!isNaN(manualInt)) c.interest = manualInt;
                if (!isNaN(manualMora)) {
                    c.customMora = manualMora;
                } else {
                    delete c.customMora;
                }
            }
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
    document.getElementById('client-address').value = c.address || '';
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
        if (!next) {"""

pattern = re.compile(r"(valB = instB \? instB\.date : '9999-99-99';\s+)client\.status = 'Liquidado';")
new_content = pattern.sub(r"\1" + missing_code + r"\n            client.status = 'Liquidado';", content)

with open("app.js", "w", encoding="utf-8") as f:
    f.write(new_content)

print("Fixed app.js successfully.")
