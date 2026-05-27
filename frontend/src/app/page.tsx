import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Dashboard from '@/components/Dashboard'

export default async function Home() {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: clients } = await supabase
    .from('clients')
    .select('*, payments(*)')
    .order('date', { ascending: false })

  const { data: configRows } = await supabase
    .from('config')
    .select('*')
    .eq('id', 1)
    .single()

  const config = configRows || {
    moraRate: 0.50,
    currency: 'S/',
    yapeName: 'Juan David Puclla Quispe',
    yapePhone: '900 779 111'
  }

  return <Dashboard initialClients={clients || []} config={config} userEmail={user.email || ''} />
}
