// pages/api/store-rules.js - 店名→カテゴリーの学習ルール管理
import { listStoreRules, updateStoreRule, deleteStoreRule, seedStoreRulesFromHistory } from '../../lib/db'
import { requireAuth } from '../../lib/auth'

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  try {
    if (req.method === 'GET') {
      await seedStoreRulesFromHistory()
      return res.status(200).json(await listStoreRules())
    }
    if (req.method === 'PUT') {
      const { id, category } = req.body || {}
      if (!id || !category) return res.status(400).json({ error: 'id と category が必要です' })
      await updateStoreRule(id, category)
      return res.status(200).json({ ok: true })
    }
    if (req.method === 'DELETE') {
      const { id } = req.query
      if (!id) return res.status(400).json({ error: 'id が必要です' })
      await deleteStoreRule(Number(id))
      return res.status(200).json({ ok: true })
    }
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'サーバーエラー', detail: e.message })
  }
}
