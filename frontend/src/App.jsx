import { useState, useEffect } from 'react'
import io from 'socket.io-client'
import './index.css'

function App() {
  const [clients, setClients] = useState([])
  const [config, setConfig] = useState({})

  useEffect(() => {
    // Initial fetch
    fetchData()

    // Socket.io integration
    const socket = io('http://localhost:3000')
    socket.on('data_updated', () => {
      console.log('Real-time update received!')
      fetchData()
    })

    return () => socket.disconnect()
  }, [])

  const fetchData = async () => {
    try {
      const resClients = await fetch('http://localhost:3000/api/clients')
      const dataClients = await resClients.json()
      setClients(dataClients)

      const resConfig = await fetch('http://localhost:3000/api/config')
      const dataConfig = await resConfig.json()
      setConfig(dataConfig)
    } catch (e) {
      console.error('Error fetching data:', e)
    }
  }

  return (
    <div className="app-container">
      <header className="main-header">
          <div className="logo-area">
              <h1 className="logo-text">QOAN <span>SOLUCIONES FINANCIERAS (REACT)</span></h1>
          </div>
          <div className="greeting-area">
              <span>Bienvenido al nuevo Frontend React</span>
          </div>
      </header>
      
      <main className="content-area">
        <div className="section-header">
          <h2 className="section-title">Cartera de Clientes ({clients.length})</h2>
        </div>
        <div className="clients-list">
          {clients.map(client => (
            <div key={client.id} className="client-card glass">
              <h3 className="card-name" style={{fontFamily:'var(--font-heading)', color:'var(--gold-primary)'}}>{client.name}</h3>
              <p style={{fontSize: '0.8rem', color: 'var(--text-muted)'}}>DNI: {client.dni}</p>
              <div style={{marginTop: '15px'}}>
                <span className="label" style={{color: 'var(--gold-primary)', fontSize: '0.65rem'}}>DEUDA TOTAL</span>
                <p style={{fontSize: '1.5rem', fontWeight: 'bold'}}>{config.currency} {client.remainingBalance}</p>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}

export default App
