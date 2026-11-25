// pages/api/cash.js - 現金の一覧と支払者別合計
import { listTransactions } from '../../lib/db'
import { requireAuth } from '../../lib/auth'

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const month = req.query.month || new Date().toISOString().slice(0, 7)
    const rows = await listTransactions({ month, paymentMethod: 'cash' })
    const byPayer = {}
    rows.forEach((r) => {
      const payer = r.payer || '未設定'
      byPayer[payer] = (byPayer[payer] || 0) + r.amount
    })
    return res.status(200).json({
      month,
      total: rows.reduce((s, r) => s + r.amount, 0),
      byPayer,
      transactions: rows,
    })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'サーバーエラー', detail: e.message })
  }
}
