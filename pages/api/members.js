// pages/api/members.js - メンバー（支払者・建て替え対象者）管理
import { getDb } from '../../lib/db'
import { requireAuth } from '../../lib/auth'

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  try {
    const db = await getDb()
    if (req.method === 'GET') {
      const result = await db.execute('SELECT * FROM members ORDER BY id')
      return res.status(200).json(result.rows)
    }
    if (req.method === 'POST') {
      const { name } = req.body || {}
      if (!name) return res.status(400).json({ error: 'name が必要です' })
      const inserted = await db.execute({
        sql: 'INSERT INTO members (name) VALUES (?)',
        args: [name],
      })
      return res.status(201).json({ id: Number(inserted.lastInsertRowid) })
    }
    if (req.method === 'DELETE') {
      const { id } = req.query
      if (!id) return res.status(400).json({ error: 'id が必要です' })
      await db.execute({ sql: 'DELETE FROM members WHERE id = ?', args: [Number(id)] })
      return res.status(200).json({ ok: true })
    }
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'サーバーエラー', detail: e.message })
  }
}
