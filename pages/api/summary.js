// pages/api/summary.js - 月次集計
import { getMonthlySummary } from '../../lib/db'
import { requireAuth } from '../../lib/auth'

function prevMonth(month) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const month = req.query.month || new Date().toISOString().slice(0, 7)
    const current = await getMonthlySummary(month)
    const previous = await getMonthlySummary(prevMonth(month))
    return res.status(200).json({
      ...current,
      previousMonth: { month: prevMonth(month), total: previous.total, byCategory: previous.byCategory },
      totalDiff: current.total - previous.total,
    })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'サーバーエラー', detail: e.message })
  }
}
