// pages/api/input-helpers.js - 入力補助（店名サジェスト / 学習ルール / 前回と同じテンプレート）
import { getInputHelpers } from '../../lib/db'
import { requireAuth } from '../../lib/auth'

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  try {
    return res.status(200).json(await getInputHelpers())
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'サーバーエラー', detail: e.message })
  }
}
