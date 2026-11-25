// pages/api/login.js - ログイン / ログアウト
import { checkPassword, sessionToken } from '../../lib/auth'

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { password } = req.body || {}
    if (!checkPassword(password)) {
      return res.status(401).json({ error: 'パスワードが違います' })
    }
    const token = sessionToken()
    if (token) {
      res.setHeader(
        'Set-Cookie',
        `kakeibo_auth=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`
      )
    }
    return res.status(200).json({ ok: true })
  }
  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', 'kakeibo_auth=; Path=/; HttpOnly; Max-Age=0')
    return res.status(200).json({ ok: true })
  }
  return res.status(405).json({ error: 'Method not allowed' })
}
