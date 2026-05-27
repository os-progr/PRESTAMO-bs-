import { login } from './actions'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>
}) {
  const params = await searchParams
  
  return (
    <div style={{minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
      <form action={login} className="glass" style={{padding: '40px', borderRadius: '20px', width: '100%', maxWidth: '420px'}}>
        <div style={{textAlign: 'center', marginBottom: '30px'}}>
          <h1 className="logo-text" style={{fontSize: '2rem', marginBottom: '5px'}}>QOAN <span>ADMIN</span></h1>
          <p style={{color: 'var(--text-muted)', fontSize: '0.9rem'}}>Acceso Seguro al Sistema</p>
        </div>

        <div className="input-group">
          <label htmlFor="email" style={{color: 'var(--gold-primary)'}}>Email</label>
          <input id="email" name="email" type="email" placeholder="tucorreo@ejemplo.com" required />
        </div>
        
        <div className="input-group">
          <label htmlFor="password" style={{color: 'var(--gold-primary)'}}>Contraseña</label>
          <input id="password" name="password" type="password" placeholder="••••••••" required />
        </div>

        <button className="btn-primary full-width" style={{marginTop: '10px'}}>
          <i className="fas fa-lock"></i> Ingresar al Sistema
        </button>

        {params?.message && (
          <p style={{marginTop: '15px', padding: '12px', background: 'rgba(255,77,77,0.15)', color: 'var(--error-red)', textAlign: 'center', borderRadius: '8px', fontSize: '0.85rem', border: '1px solid rgba(255,77,77,0.3)'}}>
            {params.message}
          </p>
        )}
      </form>
    </div>
  )
}
