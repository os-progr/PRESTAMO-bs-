'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { logout } from '@/app/login/actions'

interface Payment {
  id: string
  clientId: string
  amount: number
  date: string
  paymentType: string
}

interface Client {
  id: string
  name: string
  dni: string
  amount: number
  interest: number
  term: number
  loanType: string
  totalToReturn: number
  remainingBalance: number
  date: string
  startDate: string | null
  collectionDate: string | null
  status: string
  rating: number
  notes: string | null
  maps: string | null
  interestPaidCount: number
  payments: Payment[]
}

interface Config {
  moraRate: number
  currency: string
  yapeName: string
  yapePhone: string
}

interface Props {
  initialClients: Client[]
  config: Config
  userEmail: string
}

export default function Dashboard({ initialClients, config, userEmail }: Props) {
  const [clients, setClients] = useState<Client[]>(initialClients)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('todos')
  const [showLoanModal, setShowLoanModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const supabase = createClient()

  // Toast system
  const showToast = (msg: string, type: string = 'success') => {
    const container = document.getElementById('toast-container')
    if (!container) return
    const icons: Record<string, string> = { success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' }
    const t = document.createElement('div')
    t.className = `toast toast-${type}`
    t.innerHTML = `<i class="fas ${icons[type] || 'fa-info-circle'}"></i><span>${msg}</span>`
    container.appendChild(t)
    requestAnimationFrame(() => t.classList.add('show'))
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400) }, 3500)
  }

  // Greeting
  const getGreeting = () => {
    const h = new Date().getHours()
    if (h >= 5 && h < 12) return 'Buenos Días'
    if (h >= 12 && h < 19) return 'Buenas Tardes'
    return 'Buenas Noches'
  }

  // Mora calculation
  const calculateMora = (client: Client): number => {
    if (!client.collectionDate || client.status === 'Pagado') return 0
    const dueDate = new Date(client.collectionDate)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (today > dueDate) {
      const diffDays = Math.ceil(Math.abs(today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
      return diffDays * config.moraRate
    }
    return 0
  }

  // Stats
  const getStats = () => {
    let totalRecuperar = 0, totalMora = 0, capitalInvertido = 0, gananciaCobrada = 0, interesesPorCobrar = 0, activos = 0
    clients.forEach(c => {
      if (c.status !== 'Pagado') {
        const mora = calculateMora(c)
        const isIO = c.loanType === 'interes'
        const monthlyInt = isIO ? Math.round((c.amount * (c.interest / 100)) * 100) / 100 : 0
        totalMora += mora
        activos++
        if (isIO) {
          const paidCount = c.interestPaidCount || 0
          const remaining = Math.max(0, (c.term || 1) - paidCount)
          const pending = Math.round(remaining * monthlyInt * 100) / 100
          totalRecuperar += c.amount + pending
          capitalInvertido += c.amount
          interesesPorCobrar += pending
        } else {
          totalRecuperar += c.remainingBalance
          const ratio = c.totalToReturn > 0 ? (c.totalToReturn - c.amount) / c.totalToReturn : 0
          capitalInvertido += c.remainingBalance * (c.amount / c.totalToReturn)
          interesesPorCobrar += c.remainingBalance * ratio
        }
      }
      const isIO = c.loanType === 'interes'
      const monthlyInt = isIO ? Math.round((c.amount * (c.interest / 100)) * 100) / 100 : 0
      const ratio = c.totalToReturn > 0 ? (c.totalToReturn - c.amount) / c.totalToReturn : 0
      ;(c.payments || []).forEach(p => {
        if (isIO) {
          if (p.paymentType === 'interes') gananciaCobrada += p.amount
          else if (p.paymentType === 'final') gananciaCobrada += monthlyInt
        } else {
          gananciaCobrada += p.amount * ratio
        }
      })
    })
    return { totalRecuperar, totalMora, capitalInvertido, gananciaCobrada, interesesPorCobrar, activos }
  }

  const stats = getStats()
  const cur = config.currency

  // Filtering
  const filtered = clients.filter(c => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) || c.dni.includes(search)
    if (!matchSearch) return false
    const mora = calculateMora(c)
    if (filter === 'todos') return c.status !== 'Pagado'
    if (filter === 'mora') return mora > 0 && c.status !== 'Pagado'
    if (filter === 'pagado') return c.status === 'Pagado'
    if (filter === 'proximos') {
      if (c.status === 'Pagado' || !c.collectionDate) return false
      const d = new Date(c.collectionDate), t = new Date(); t.setHours(0,0,0,0)
      const in7 = new Date(); in7.setDate(t.getDate() + 7)
      return d >= t && d <= in7
    }
    if (filter === 'pendiente') return mora === 0 && c.status !== 'Pagado'
    return true
  }).sort((a, b) => {
    const pri = (c: Client) => {
      if (c.status === 'Pagado') return 3
      if (calculateMora(c) > 0) return 0
      return 2
    }
    return pri(a) - pri(b)
  })

  // Reload from Supabase
  const reloadClients = async () => {
    const { data } = await supabase.from('clients').select('*, payments(*)').order('date', { ascending: false })
    if (data) setClients(data)
  }

  // Delete client
  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta operación? Esta acción no se puede deshacer.')) return
    await supabase.from('clients').delete().eq('id', id)
    showToast('Operación eliminada.', 'warning')
    reloadClients()
  }

  // Payment
  const handlePayment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!selectedClient) return
    const form = e.currentTarget
    const amount = parseFloat((form.elements.namedItem('paymentAmount') as HTMLInputElement).value)
    if (amount <= 0) { showToast('El monto debe ser mayor a 0.', 'error'); return }

    const client = selectedClient
    const isIO = client.loanType === 'interes'
    const monthlyInt = isIO ? Math.round((client.amount * (client.interest / 100)) * 100) / 100 : 0
    let newBalance = client.remainingBalance
    let newStatus = client.status
    let newInterestCount = client.interestPaidCount || 0
    let newCollDate = client.collectionDate
    let paymentType = 'abono'

    if (isIO) {
      const isFinal = amount >= (client.amount - 0.01)
      if (isFinal) {
        paymentType = 'final'; newBalance = 0; newStatus = 'Pagado'; newInterestCount = client.term || 1
      } else {
        paymentType = 'interes'; newInterestCount++
        if (newCollDate) { const nd = new Date(newCollDate); nd.setMonth(nd.getMonth() + 1); newCollDate = nd.toISOString().split('T')[0] }
      }
    } else {
      newBalance = Math.round((newBalance - amount) * 100) / 100
      if (newBalance <= 0) { newBalance = 0; newStatus = 'Pagado' }
      else if (newCollDate) { const nd = new Date(newCollDate); nd.setMonth(nd.getMonth() + 1); newCollDate = nd.toISOString().split('T')[0] }
    }

    await supabase.from('payments').insert({ clientId: client.id, amount, date: new Date().toISOString(), paymentType })
    await supabase.from('clients').update({ remainingBalance: newBalance, status: newStatus, interestPaidCount: newInterestCount, collectionDate: newCollDate }).eq('id', client.id)

    showToast(`Cobro de ${cur} ${amount.toFixed(2)} registrado ✓`, 'success')
    setShowPaymentModal(false)
    setSelectedClient(null)
    reloadClients()
  }

  // New Loan
  const handleNewLoan = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const name = (form.elements.namedItem('name') as HTMLInputElement).value
    const dni = (form.elements.namedItem('dni') as HTMLInputElement).value
    const amount = parseFloat((form.elements.namedItem('amount') as HTMLInputElement).value)
    const interest = parseFloat((form.elements.namedItem('interest') as HTMLInputElement).value)
    const term = parseInt((form.elements.namedItem('term') as HTMLInputElement).value) || 1
    const loanType = (form.elements.namedItem('loanType') as HTMLSelectElement).value
    const startDate = (form.elements.namedItem('startDate') as HTMLInputElement).value
    const collectionDate = (form.elements.namedItem('collectionDate') as HTMLInputElement).value
    const rating = parseInt((form.elements.namedItem('rating') as HTMLSelectElement).value)
    const notes = (form.elements.namedItem('notes') as HTMLTextAreaElement).value

    const totalToReturn = Math.round((amount + (amount * (interest / 100) * term)) * 100) / 100

    if (editingClient) {
      await supabase.from('clients').update({
        name, dni, amount, interest, term, loanType, totalToReturn, remainingBalance: totalToReturn - (editingClient.totalToReturn - editingClient.remainingBalance),
        startDate: startDate || null, collectionDate: collectionDate || null, rating, notes: notes || null
      }).eq('id', editingClient.id)
      showToast('Operación actualizada ✓', 'success')
    } else {
      await supabase.from('clients').insert({
        name, dni, amount, interest, term, loanType, totalToReturn, remainingBalance: totalToReturn,
        date: new Date().toISOString(), startDate: startDate || null, collectionDate: collectionDate || null,
        status: 'Pendiente', rating, notes: notes || null
      })
      showToast('Préstamo registrado ✓', 'success')
    }

    setShowLoanModal(false)
    setEditingClient(null)
    reloadClients()
  }

  const filters = [
    { key: 'todos', label: 'Activos' },
    { key: 'mora', label: '🚩 En Mora' },
    { key: 'proximos', label: '🔔 Por Vencer' },
    { key: 'pendiente', label: '⏳ Al Día' },
    { key: 'pagado', label: '✅ Pagados' },
  ]

  return (
    <div className="app-container">
      {/* Header */}
      <header className="main-header">
        <div><h1 className="logo-text">QOAN <span>SOLUCIONES FINANCIERAS</span></h1></div>
        <div className="greeting-area"><i className="fas fa-sun" style={{color:'var(--gold-primary)', marginRight: 8}}></i>{getGreeting()}, Gestor</div>
        <div className="header-actions">
          <form action={logout}>
            <button type="submit" className="btn-secondary" style={{color:'var(--error-red)', borderColor:'var(--error-red)'}}>
              <i className="fas fa-sign-out-alt"></i> Salir
            </button>
          </form>
          <button className="btn-primary" onClick={() => { setEditingClient(null); setShowLoanModal(true) }}>
            <i className="fas fa-plus"></i> Nueva Operación
          </button>
        </div>
      </header>

      {/* Stats */}
      <section className="stats-grid">
        {[
          { icon: 'fa-money-bill-trend-up', label: 'Total a Recuperar', value: `${cur} ${stats.totalRecuperar.toFixed(2)}`, color: '' },
          { icon: 'fa-calendar-times', label: 'Mora por Cobrar', value: `${cur} ${stats.totalMora.toFixed(2)}`, color: 'var(--error-red)' },
          { icon: 'fa-hand-holding-heart', label: 'Capital Invertido', value: `${cur} ${stats.capitalInvertido.toFixed(2)}`, color: '' },
          { icon: 'fa-sack-dollar', label: 'Ganancia Cobrada', value: `${cur} ${stats.gananciaCobrada.toFixed(2)}`, color: 'var(--success-green)' },
          { icon: 'fa-chart-line', label: 'Intereses por Cobrar', value: `${cur} ${stats.interesesPorCobrar.toFixed(2)}`, color: '' },
          { icon: 'fa-users', label: 'Socios Activos', value: `${stats.activos}`, color: '' },
        ].map((s, i) => (
          <div key={i} className="stat-card glass">
            <div className="stat-icon" style={s.color ? { background: `${s.color}15`, color: s.color } : {}}>
              <i className={`fas ${s.icon}`}></i>
            </div>
            <div>
              <span className="stat-label">{s.label}</span>
              <h2 className="stat-value" style={s.color ? { color: s.color } : {}}>{s.value}</h2>
            </div>
          </div>
        ))}
      </section>

      {/* Filters & Search */}
      <main className="content-area">
        <div className="section-header">
          <h2 className="section-title">Cartera de Clientes</h2>
          <div className="filter-tabs">
            {filters.map(f => (
              <button key={f.key} className={`filter-btn ${filter === f.key ? 'active' : ''}`} onClick={() => setFilter(f.key)}>{f.label}</button>
            ))}
          </div>
          <div className="search-box">
            <i className="fas fa-search" style={{color:'var(--gold-primary)', marginRight: 15}}></i>
            <input placeholder="Buscar socio..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>

        {/* Client Cards */}
        <div className="clients-list">
          {filtered.length === 0 ? (
            <div style={{gridColumn:'1/-1', textAlign:'center', padding:60, color:'var(--text-muted)'}}>
              <i className="fas fa-folder-open" style={{fontSize:'4rem', opacity:0.3, display:'block', marginBottom:20}}></i>
              <p>{search ? 'No se encontraron resultados.' : 'No hay préstamos registrados aún.'}</p>
            </div>
          ) : filtered.map(client => {
            const mora = calculateMora(client)
            const hasMora = mora > 0
            const statusClass = client.status === 'Pagado' ? 'status-paid' : hasMora ? 'status-mora' : 'status-pending'
            const statusText = client.status === 'Pagado' ? 'Pagado' : hasMora ? 'En Mora' : 'Pendiente'
            const totalPaid = (client.payments || []).reduce((s, p) => s + p.amount, 0)
            const progress = Math.min(100, (totalPaid / client.totalToReturn) * 100)
            const stars = '⭐'.repeat(client.rating || 3)

            return (
              <div key={client.id} className={`client-card ${hasMora ? 'mora-active' : ''}`}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:15}}>
                  <div>
                    <h3 style={{fontFamily:'var(--font-heading)', fontSize:'1rem', color:'var(--gold-primary)', marginBottom:2}}>{client.name}</h3>
                    <div>{stars}</div>
                    <span style={{fontSize:'0.7rem', color:'var(--text-muted)'}}>DNI: {client.dni}</span>
                  </div>
                  <span className={`status-badge ${statusClass}`}>{statusText}</span>
                </div>

                <div style={{gridColumn:'span 2', background:'rgba(212,175,55,0.08)', padding:12, borderRadius:10, borderLeft:'3px solid var(--gold-primary)', marginBottom:12}}>
                  <span style={{color:'var(--gold-primary)', fontSize:'0.65rem', fontWeight:'bold', textTransform:'uppercase', letterSpacing:1}}>Deuda Total Actual</span>
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline'}}>
                    <span style={{fontSize:'1.5rem', color:'#fff', fontWeight:800}}>{cur} {(client.remainingBalance + mora).toFixed(2)}</span>
                    {mora > 0 && <span style={{fontSize:'0.7rem', color:'var(--text-muted)'}}>con mora</span>}
                  </div>
                </div>

                <div className="progress-container"><div className="progress-bar" style={{width:`${progress}%`}}></div></div>
                <div style={{display:'flex', justifyContent:'space-between', fontSize:'0.65rem', color:'var(--text-muted)', marginTop:-10, marginBottom:15}}>
                  <span>Cobrado: {progress.toFixed(0)}%</span><span>Meta: {cur}{client.totalToReturn.toFixed(0)}</span>
                </div>

                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10}}>
                  <div className="data-item"><span className="label">Capital</span><span className="value">{cur}{client.amount.toFixed(2)}</span></div>
                  <div className="data-item"><span className="label">Saldo Neto</span><span className="value">{cur}{client.remainingBalance.toFixed(2)}</span></div>
                  <div className="data-item"><span className="label">Mora</span><span className="value" style={{color: hasMora ? 'var(--error-red)' : 'inherit'}}>{cur}{mora.toFixed(2)}</span></div>
                  <div className="data-item"><span className="label">Vence</span><span className="value" style={{color: hasMora ? 'var(--error-red)' : 'var(--gold-primary)'}}>{client.collectionDate ? new Date(client.collectionDate).toLocaleDateString() : '---'}</span></div>
                </div>

                {client.notes && <div style={{marginTop:10, padding:'8px 12px', background:'rgba(212,175,55,0.06)', borderRadius:8, borderLeft:'2px solid var(--gold-primary)', fontSize:'0.75rem', color:'var(--text-muted)', fontStyle:'italic'}}><i className="fas fa-sticky-note" style={{color:'var(--gold-primary)', marginRight:5}}></i>{client.notes}</div>}

                <div className="card-footer" style={{marginTop:'auto'}}>
                  <button className="icon-btn" onClick={() => { setSelectedClient(client); setShowPaymentModal(true) }} title="Registrar Cobro"><i className="fas fa-cash-register"></i></button>
                  <button className="icon-btn" onClick={() => { setEditingClient(client); setShowLoanModal(true) }} title="Editar"><i className="fas fa-pen-fancy"></i></button>
                  <button className="icon-btn" onClick={() => handleDelete(client.id)} title="Eliminar" style={{color:'var(--error-red)', background:'rgba(255,77,77,0.05)'}}><i className="fas fa-trash-alt"></i></button>
                </div>
              </div>
            )
          })}
        </div>
      </main>

      {/* Loan Modal */}
      {showLoanModal && (
        <div className="modal active" onClick={e => { if (e.target === e.currentTarget) { setShowLoanModal(false); setEditingClient(null) } }}>
          <div className="modal-content glass">
            <div className="modal-header">
              <h2><i className="fas fa-file-signature" style={{color:'var(--gold-primary)', marginRight:10}}></i>{editingClient ? 'Editar Operación' : 'Nueva Operación'}</h2>
              <span className="close-modal" onClick={() => { setShowLoanModal(false); setEditingClient(null) }}>&times;</span>
            </div>
            <form onSubmit={handleNewLoan}>
              <div className="form-section">
                <h3>Datos Personales</h3>
                <div className="form-grid">
                  <div className="input-group"><label>Nombre Completo</label><input name="name" defaultValue={editingClient?.name || ''} required /></div>
                  <div className="input-group"><label>DNI / ID</label><input name="dni" defaultValue={editingClient?.dni || ''} required /></div>
                  <div className="input-group"><label>Calificación</label>
                    <select name="rating" defaultValue={editingClient?.rating || 3}>
                      <option value="5">⭐⭐⭐⭐⭐ Excelente</option>
                      <option value="4">⭐⭐⭐⭐ Bueno</option>
                      <option value="3">⭐⭐⭐ Regular</option>
                      <option value="2">⭐⭐ Riesgoso</option>
                      <option value="1">⭐ Muy Riesgoso</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="form-section">
                <h3>Parámetros Financieros</h3>
                <div className="form-grid">
                  <div className="input-group"><label>Monto Principal</label><input name="amount" type="number" step="0.01" defaultValue={editingClient?.amount || ''} required /></div>
                  <div className="input-group"><label>Interés (%)</label><input name="interest" type="number" step="0.1" defaultValue={editingClient?.interest || 10} required /></div>
                  <div className="input-group"><label>Plazo (Meses)</label><input name="term" type="number" defaultValue={editingClient?.term || 1} required /></div>
                  <div className="input-group"><label>Tipo de Cobro</label>
                    <select name="loanType" defaultValue={editingClient?.loanType || 'fijo'}>
                      <option value="fijo">Cuotas Fijas (Cap + Int)</option>
                      <option value="interes">Solo Interés Mensual</option>
                    </select>
                  </div>
                  <div className="input-group"><label>Fecha de Inicio</label><input name="startDate" type="date" defaultValue={editingClient?.startDate?.split('T')[0] || new Date().toISOString().split('T')[0]} required /></div>
                  <div className="input-group"><label>Próximo Cobro</label><input name="collectionDate" type="date" defaultValue={editingClient?.collectionDate?.split('T')[0] || ''} required /></div>
                </div>
              </div>
              <div className="form-section">
                <h3>Notas Internas</h3>
                <div className="input-group"><textarea name="notes" rows={2} placeholder="Observaciones..." defaultValue={editingClient?.notes || ''}></textarea></div>
              </div>
              <button type="submit" className="btn-primary full-width">{editingClient ? 'Guardar Cambios' : 'Registrar Préstamo'}</button>
            </form>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPaymentModal && selectedClient && (
        <div className="modal active" onClick={e => { if (e.target === e.currentTarget) { setShowPaymentModal(false); setSelectedClient(null) } }}>
          <div className="modal-content glass small-modal">
            <div className="modal-header">
              <h2><i className="fas fa-cash-register" style={{color:'var(--gold-primary)', marginRight:10}}></i>Registrar Cobro</h2>
              <span className="close-modal" onClick={() => { setShowPaymentModal(false); setSelectedClient(null) }}>&times;</span>
            </div>
            <div style={{marginBottom:16}}>
              <p><strong>Cliente:</strong> {selectedClient.name}</p>
              <p><strong>Saldo:</strong> {cur} {selectedClient.remainingBalance.toFixed(2)}</p>
              {calculateMora(selectedClient) > 0 && <p style={{color:'var(--error-red)'}}><strong>Mora:</strong> {cur} {calculateMora(selectedClient).toFixed(2)}</p>}
              <p style={{fontSize:'1.1rem', color:'var(--gold-primary)', marginTop:8}}><strong>Total Sugerido:</strong> {cur} {(selectedClient.remainingBalance + calculateMora(selectedClient)).toFixed(2)}</p>
            </div>
            <form onSubmit={handlePayment}>
              <div className="input-group"><label>Monto Recibido</label><input name="paymentAmount" type="number" step="0.01" required /></div>
              <button type="submit" className="btn-primary full-width">Confirmar Cobro</button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
