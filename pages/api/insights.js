// pages/api/insights.js - 気づく系の分析
// GET ?month=YYYY-MM&year=YYYY
// 異常検知 / サブスク・固定の自動検出 / 価格アラート / 店別比較 / 医療費の年間集計 / 月次レポート / 精算書用集計
import { getInsights } from '../../lib/db'
import { requireAuth } from '../../lib/auth'

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const month = req.query.month || new Date().toISOString().slice(0, 7)
    const year = req.query.year || month.slice(0, 4)
    return res.status(200).json(await getInsights(month, Number(year)))
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'サーバーエラー', detail: e.message })
  }
}
