// pages/api/summary-range.js - 期間集計（今月／3ヶ月／6ヶ月／1年）
// end（終了月）から months ヶ月分の合計と、その直前の同期間との比較を返す
import { getMonthlySummary } from '../../lib/db'
import { requireAuth } from '../../lib/auth'

function shift(month, diff) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + diff, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function merge(list) {
  const out = { total: 0, count: 0, byCategory: {}, byGroup: { variable: 0, special: 0, fixed: 0 } }
  for (const s of list) {
    out.total += s.total
    out.count += s.count
    for (const [k, v] of Object.entries(s.byCategory)) out.byCategory[k] = (out.byCategory[k] || 0) + v
    for (const [k, v] of Object.entries(s.byGroup)) out.byGroup[k] = (out.byGroup[k] || 0) + v
  }
  return out
}

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const end = req.query.end || new Date().toISOString().slice(0, 7)
    const months = Math.min(24, Math.max(1, Number(req.query.months) || 1))
    const curMonths = []
    for (let i = months - 1; i >= 0; i--) curMonths.push(shift(end, -i))
    const prevMonths = []
    for (let i = months * 2 - 1; i >= months; i--) prevMonths.push(shift(end, -i))
    const curList = []
    for (const m of curMonths) curList.push(await getMonthlySummary(m))
    const prevList = []
    for (const m of prevMonths) prevList.push(await getMonthlySummary(m))
    const cur = merge(curList)
    const prev = merge(prevList)
    return res.status(200).json({
      end,
      months: months,
      monthList: curList.map((s) => ({
        month: s.month,
        total: s.total,
        count: s.count,
        byCategory: s.byCategory,
        byGroup: s.byGroup,
      })),
      total: cur.total,
      count: cur.count,
      byCategory: cur.byCategory,
      byGroup: cur.byGroup,
      prevTotal: prev.total,
      prevByCategory: prev.byCategory,
      totalDiff: cur.total - prev.total,
    })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'サーバーエラー', detail: e.message })
  }
}
