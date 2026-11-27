// pages/api/transactions.js - 支出明細 CRUD（品目明細つき）
// 外部AI（Muse）からの登録もこのAPIを使う: Authorization: Bearer <API_TOKEN>
import { getDb, listTransactions, getTransactionItems, createTransaction, updateTransaction, deleteTransaction, setTransactionSettled } from '../../lib/db'
import { requireAuth } from '../../lib/auth'

function validate(body) {
  if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) return 'date は YYYY-MM-DD 形式で入力してください'
  if (!body.category) return 'category が必要です'
  if (body.amount === undefined || isNaN(Number(body.amount))) return 'amount が必要です'
  if (body.payment_method === 'cash' && !body.payer) return '現金の場合は payer（支払者）が必要です'
  return null
}

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  try {
    if (req.method === 'GET') {
      const { month, category, payment_method } = req.query
      const rows = await listTransactions({ month, category, paymentMethod: payment_method })
      const withItems = await Promise.all(
        rows.map(async (r) => ({ ...r, items: await getTransactionItems(r.id) }))
      )
      return res.status(200).json(withItems)
    }

    if (req.method === 'POST') {
      const err = validate(req.body || {})
      if (err) return res.status(400).json({ error: err })
      const id = await createTransaction({
        ...req.body,
        amount: Math.round(Number(req.body.amount)),
      })
      return res.status(201).json({ id })
    }

    if (req.method === 'PUT') {
      const { id, ...rest } = req.body || {}
      if (!id) return res.status(400).json({ error: 'id が必要です' })
      // 精算済みフラグだけの部分更新（現金の年次精算用）
      if (rest.settled !== undefined && rest.date === undefined) {
        await setTransactionSettled(id, !!rest.settled)
        return res.status(200).json({ ok: true })
      }
      const err = validate(rest)
      if (err) return res.status(400).json({ error: err })
      await updateTransaction(id, { ...rest, amount: Math.round(Number(rest.amount)) })
      return res.status(200).json({ ok: true })
    }

    if (req.method === 'DELETE') {
      const { id } = req.query
      if (!id) return res.status(400).json({ error: 'id が必要です' })
      await deleteTransaction(Number(id))
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'サーバーエラー', detail: e.message })
  }
}
