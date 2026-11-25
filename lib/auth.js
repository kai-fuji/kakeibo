// lib/auth.js - 認証
// 画面用: APP_PASSWORD を設定するとログインが必要になる（Cookieセッション）
// 外部AI用: API_TOKEN を設定すると Authorization: Bearer <token> でAPIを呼べる
// どちらも未設定の場合はローカル開発用に認証なしで通す
import crypto from 'crypto'

export function sessionToken() {
  const password = process.env.APP_PASSWORD || ''
  if (!password) return null
  return crypto.createHash('sha256').update(`kakeibo:${password}`).digest('hex')
}

function parseCookies(req) {
  const header = req.headers.cookie || ''
  const cookies = {}
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=')
    if (idx > 0) cookies[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim())
  })
  return cookies
}

export function isAuthenticated(req) {
  const apiToken = process.env.API_TOKEN
  const appPassword = process.env.APP_PASSWORD

  // 認証情報が何も設定されていない場合のみ、ローカル開発用に通す
  if (!apiToken && !appPassword) return true

  // 外部AI用トークン
  const authHeader = req.headers.authorization || ''
  if (apiToken && authHeader === `Bearer ${apiToken}`) return true

  // 画面用ログインセッション
  if (appPassword) {
    const token = sessionToken()
    const cookies = parseCookies(req)
    if (cookies.kakeibo_auth === token) return true
  }

  return false
}

export function requireAuth(req, res) {
  if (isAuthenticated(req)) return true
  res.status(401).json({ error: '認証が必要です' })
  return false
}

export function checkPassword(password) {
  if (!process.env.APP_PASSWORD) return true
  return password === process.env.APP_PASSWORD
}
