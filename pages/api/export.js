// pages/api/export.js - 全データのエクスポート (JSON / CSV)
import { getDb } from '../../lib/db'
import { requireAuth } from '../../lib/auth'

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const db = await getDb()
    const [transactions, items, categories, reimbursements, members, candidates, candidateItems, storeRules, quickMemos] = await Promise.all([
      db.execute('SELECT * FROM transactions ORDER BY date'),
      db.execute('SELECT * FROM transaction_items ORDER BY transaction_id'),
      db.execute('SELECT * FROM categories ORDER BY grp, sort_order'),
      db.execute('SELECT * FROM reimbursements ORDER BY date'),
      db.execute('SELECT * FROM members ORDER BY id'),
      db.execute('SELECT * FROM candidates ORDER BY date'),
      db.execute('SELECT * FROM candidate_items ORDER BY candidate_id'),
      db.execute('SELECT * FROM store_rules ORDER BY store_key'),
      db.execute('SELECT * FROM quick_memos ORDER BY id'),
    ])

    if (req.query.format === 'csv') {
      const header = 'date,category,amount,store_memo,payment_method,payer'
      const lines = transactions.rows.map((r) =>
        [r.date, r.category, r.amount, `"${String(r.store_memo || '').replace(/"/g, '""')}"`, r.payment_method, r.payer || ''].join(',')
      )
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', 'attachment; filename="kakeibo-transactions.csv"')
      return res.status(200).send([header, ...lines].join('\n'))
    }

    return res.status(200).json({
      transactions: transactions.rows,
      transaction_items: items.rows,
      categories: categories.rows,
      reimbursements: reimbursements.rows,
      members: members.rows,
      candidates: candidates.rows,
      candidate_items: candidateItems.rows,
      store_rules: storeRules.rows,
      quick_memos: quickMemos.rows,
    })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'サーバーエラー', detail: e.message })
  }
}
