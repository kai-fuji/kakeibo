// pages/api/reconciliation.js - 月末の突合チェック
// GET ?month=YYYY-MM … 通知合計 / 記入済みカード合計 / 差額 / 未記入分 / 一致判定
import { getReconciliation } from '../../lib/db'
import { requireAuth } from '../../lib/auth'

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const month = req.query.month || new Date().toISOString().slice(0, 7)
    return res.status(200).json(await getReconciliation(month))
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'サーバーエラー', detail: e.message })
  }
}
