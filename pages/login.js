import { useState } from 'react'
import { useRouter } from 'next/router'

export default function Login() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (res.ok) router.push('/')
    else setError('パスワードが違います')
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form onSubmit={submit} className="bg-white rounded-3xl shadow p-6 w-full max-w-sm space-y-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/mickey-accountant.png" alt="ミッキー" className="w-24 h-24 rounded-full mx-auto object-cover border-4 border-sleep-cyan" />
        <h1 className="font-extrabold text-xl text-center">家計簿ログイン</h1>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="パスワード"
          className="w-full border rounded-xl px-4 py-3"
          autoFocus
        />
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button className="w-full bg-gradient-to-r from-sleep-blue to-sleep-sky text-white rounded-full py-3 font-extrabold shadow">ログイン</button>
      </form>
    </div>
  )
}
