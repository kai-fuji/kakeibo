// pages/api/quick-memos.js - 金額だけクイックメモ（受け箱）
// GET … 一覧 / POST { amount, memo? } … 追加
// PUT { id, action: 'convert', date, category, store_memo?, payment_method?, payer? } … 明細化
// DELETE ?id= … 削除
import { listQuickMemos, createQuickMemo, deleteQuickMemo, convertQuickMemo } from '../../lib/db'
import { requireAuth } from '../../lib/auth'

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  try {
    if (req.method === 'GET') {
      return res.status(200).json(await listQuickMemos())
    }
    if (req.method === 'POST') {
      const { amount, memo = '' } = req.body || {}
      if (amount === undefined || isNaN(Number(amount)) || Number(amount) <= 0) {
        return res.status(400).json({ error: 'amount が必要です' })
      }
      const id = await createQuickMemo({ amount, memo })
      return res.status(201).json({ id })
    }
    if (req.method === 'PUT') {
      const body = req.body || {}
      if (body.action !== 'convert') return res.status(400).json({ error: 'action が不正です' })
      if (!body.id) return res.status(400).json({ error: 'id が必要です' })
      if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) return res.status(400).json({ error: 'date は YYYY-MM-DD 形式で入力してください' })
      if (!body.category) return res.status(400).json({ error: 'category が必要です' })
      if (body.payment_method === 'cash' && !body.payer) return res.status(400).json({ error: '現金の場合は payer（支払者）が必要です' })
      const result = await convertQuickMemo(body.id, body)
      if (result.error) return res.status(400).json({ error: result.error })
      return res.status(200).json({ ok: true, ...result })
    }
    if (req.method === 'DELETE') {
      const { id } = req.query
      if (!id) return res.status(400).json({ error: 'id が必要です' })
      await deleteQuickMemo(Number(id))
      return res.status(200).json({ ok: true })
    }
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'サーバーエラー', detail: e.message })
  }
}
