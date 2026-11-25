// pages/api/search.js - 横断検索（店名・メモ・カテゴリー・品目名で明細/候補/建て替えを検索）
import { searchAll } from '../../lib/db'
import { requireAuth } from '../../lib/auth'

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  try {
    return res.status(200).json(await searchAll(req.query.q || ''))
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'サーバーエラー', detail: e.message })
  }
}
