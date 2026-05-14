export default function TestPage() {
  return (
    <div style={{ padding: 40 }}>
      <h1>Environment Test</h1>
      <p>Supabase URL: {process.env.NEXT_PUBLIC_SUPABASE_URL || 'NOT SET'}</p>
      <p>Anon Key: {process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'SET' : 'NOT SET'}</p>
    </div>
  )
}