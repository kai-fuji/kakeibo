// pages/api/items.js - 商品マスターと価格推移
// GET /api/items            … 商品一覧（記録回数・最新価格つき）
// GET /api/items?item_id=1  … その商品の価格履歴（日付・店名・単価）
import { getDb } from '../../lib/db'
import { requireAuth } from '../../lib/auth'

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const db = await getDb()
    if (req.query.item_id) {
      const history = await db.execute({
        sql: `SELECT ti.*, t.date, t.category
              FROM transaction_items ti
              JOIN transactions t ON t.id = ti.transaction_id
              WHERE ti.normalized_item_id = ?
              ORDER BY t.date ASC`,
        args: [Number(req.query.item_id)],
      })
      const item = await db.execute({ sql: 'SELECT * FROM items WHERE id = ?', args: [Number(req.query.item_id)] })
      return res.status(200).json({ item: item.rows[0] || null, history: history.rows })
    }
    const result = await db.execute(`
      SELECT i.*,
        COUNT(ti.id) AS record_count,
        (SELECT ti2.unit_price FROM transaction_items ti2
          JOIN transactions t2 ON t2.id = ti2.transaction_id
          WHERE ti2.normalized_item_id = i.id AND ti2.unit_price IS NOT NULL
          ORDER BY t2.date DESC LIMIT 1) AS latest_price,
        (SELECT t3.date FROM transaction_items ti3
          JOIN transactions t3 ON t3.id = ti3.transaction_id
          WHERE ti3.normalized_item_id = i.id
          ORDER BY t3.date DESC LIMIT 1) AS latest_date
      FROM items i
      LEFT JOIN transaction_items ti ON ti.normalized_item_id = i.id
      GROUP BY i.id
      ORDER BY record_count DESC, i.name
    `)
    return res.status(200).json(result.rows)
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'サーバーエラー', detail: e.message })
  }
}
