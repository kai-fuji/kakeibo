// pages/api/reimbursements.js - 建て替え台帳 CRUD と年次精算
import { getDb, listReimbursements, getSettlement } from '../../lib/db'
import { requireAuth } from '../../lib/auth'

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  try {
    const db = await getDb()

    if (req.method === 'GET') {
      // /api/reimbursements?mode=settlement&year=2026 で年次精算を返す
      if (req.query.mode === 'settlement') {
        const year = req.query.year || new Date().getFullYear()
        return res.status(200).json(await getSettlement(year))
      }
      const rows = await listReimbursements({ year: req.query.year, member: req.query.member })
      return res.status(200).json(rows)
    }

    if (req.method === 'POST') {
      const { date, member, direction, amount, detail = '' } = req.body || {}
      if (!date || !member || !direction || amount === undefined) {
        return res.status(400).json({ error: 'date, member, direction, amount が必要です' })
      }
      if (!['family_to_member', 'member_to_family'].includes(direction)) {
        return res.status(400).json({ error: 'direction が不正です' })
      }
      const fiscalYear = Number(String(date).slice(0, 4))
      const inserted = await db.execute({
        sql: `INSERT INTO reimbursements (date, member, direction, amount, detail, fiscal_year)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [date, member, direction, Math.round(Number(amount)), detail, fiscalYear],
      })
      return res.status(201).json({ id: Number(inserted.lastInsertRowid) })
    }

    if (req.method === 'PUT') {
      const { id, date, member, direction, amount, detail = '', settled } = req.body || {}
      if (!id) return res.status(400).json({ error: 'id が必要です' })
      if (settled !== undefined && date === undefined) {
        // 精算フラグだけの更新
        await db.execute({
          sql: `UPDATE reimbursements SET settled = ?, settled_at = ? WHERE id = ?`,
          args: [settled ? 1 : 0, settled ? new Date().toISOString() : null, id],
        })
        return res.status(200).json({ ok: true })
      }
      const fiscalYear = Number(String(date).slice(0, 4))
      await db.execute({
        sql: `UPDATE reimbursements SET date = ?, member = ?, direction = ?, amount = ?, detail = ?, fiscal_year = ? WHERE id = ?`,
        args: [date, member, direction, Math.round(Number(amount)), detail, fiscalYear, id],
      })
      return res.status(200).json({ ok: true })
    }

    if (req.method === 'DELETE') {
      const { id } = req.query
      if (!id) return res.status(400).json({ error: 'id が必要です' })
      await db.execute({ sql: 'DELETE FROM reimbursements WHERE id = ?', args: [Number(id)] })
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'サーバーエラー', detail: e.message })
  }
}
