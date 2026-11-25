// pages/api/candidates.js - 未記入候補（カード利用通知などから拾った未記入の支出）
// 外部AI（Muse）がメール通知を読む時もこのAPIを使う:
//   POST /api/candidates { date, amount, store, source: 'mail', externalId: '<メールID>' }
//   externalId が同じ候補が既にある場合は二重登録せず { duplicated: true } を返す
// GET    ?status=pending|confirmed|dismissed … 一覧（省略時は全件）
// GET    ?mode=matches&id=1 … その候補と照合できそうな既存明細
// GET    ?mode=entry-matches&date=&amount=&store= … 明細登録時の消込候補
// POST   { text: '昨日、コンビニで現金1,200円、支払者はかい' } … チャット一言入力から候補化
// POST   通常 … 候補を1件登録
// PUT    { id, action: 'confirm', category?, date?, amount?, memo?, items? } … 確定して明細化
// PUT    { id, action: 'dismiss' } … 却下 / { id, action: 'reopen' } … 未記入に戻す
// PUT    { id, action: 'link', transactionId } … 既存明細と照合済みにする
// PUT    { id, action: 'bulk-confirm', entries: [{id, category?}] } … 一括確定（この場合は id 不要）
// PUT    { id, ...fields } … 候補の編集（items は置き換え）
// DELETE ?id= … 候補と品目を削除
import {
  listCandidates, getCandidate, createCandidate, updateCandidate, deleteCandidate,
  confirmCandidate, dismissCandidate, reopenCandidate, linkCandidateToTransaction,
  bulkConfirmCandidates, findCandidateMatches, findEntryCandidateMatches, parseCandidateText,
} from '../../lib/db'
import { getDb } from '../../lib/db'
import { requireAuth } from '../../lib/auth'

const SOURCES = ['mail', 'manual', 'receipt', 'chat']

function validateCandidate(body) {
  if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) return 'date は YYYY-MM-DD 形式で入力してください'
  if (body.amount === undefined || isNaN(Number(body.amount)) || Number(body.amount) <= 0) return 'amount が必要です'
  if (body.source && !SOURCES.includes(body.source)) return 'source が不正です'
  if (body.payment_method === 'cash' && !body.payer) return '現金の場合は payer（支払者）が必要です'
  return null
}

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  try {
    if (req.method === 'GET') {
      if (req.query.mode === 'matches') {
        const id = Number(req.query.id)
        if (!id) return res.status(400).json({ error: 'id が必要です' })
        return res.status(200).json(await findCandidateMatches(id))
      }
      if (req.query.mode === 'entry-matches') {
        const { date, amount, store } = req.query
        if (!date || amount === undefined) return res.status(400).json({ error: 'date と amount が必要です' })
        return res.status(200).json(
          await findEntryCandidateMatches({ date, amount: Number(amount), store: store || '' })
        )
      }
      const rows = await listCandidates({ status: req.query.status || undefined })
      return res.status(200).json(rows)
    }

    if (req.method === 'POST') {
      const body = req.body || {}
      // チャット一言入力
      if (body.text) {
        const db = await getDb()
        const memberRows = await db.execute('SELECT name FROM members')
        const parsed = parseCandidateText(body.text, memberRows.rows.map((r) => r.name))
        if (parsed.error) return res.status(400).json({ error: parsed.error })
        if (parsed.payment_method === 'cash' && !parsed.payer) {
          return res.status(400).json({ error: '現金の場合は支払者が読み取れませんでした。「支払者は○○」と入れてください' })
        }
        const created = await createCandidate({ ...parsed, note: body.text })
        const candidate = await getCandidate(created.id)
        return res.status(201).json({ ...created, candidate })
      }
      const err = validateCandidate(body)
      if (err) return res.status(400).json({ error: err })
      const created = await createCandidate(body)
      return res.status(created.duplicated ? 200 : 201).json(created)
    }

    if (req.method === 'PUT') {
      const body = req.body || {}
      if (body.action === 'bulk-confirm') {
        if (!Array.isArray(body.entries) || body.entries.length === 0) {
          return res.status(400).json({ error: 'entries が必要です' })
        }
        return res.status(200).json(await bulkConfirmCandidates(body.entries))
      }
      const id = Number(body.id)
      if (!id) return res.status(400).json({ error: 'id が必要です' })
      const candidate = await getCandidate(id)
      if (!candidate) return res.status(404).json({ error: '候補が見つかりません' })

      if (body.action === 'confirm') {
        const result = await confirmCandidate(id, body)
        if (result.error) return res.status(400).json({ error: result.error })
        return res.status(200).json({ ok: true, ...result })
      }
      if (body.action === 'dismiss') {
        await dismissCandidate(id)
        return res.status(200).json({ ok: true })
      }
      if (body.action === 'reopen') {
        await reopenCandidate(id)
        return res.status(200).json({ ok: true })
      }
      if (body.action === 'link') {
        if (!body.transactionId) return res.status(400).json({ error: 'transactionId が必要です' })
        await linkCandidateToTransaction(id, body.transactionId)
        return res.status(200).json({ ok: true })
      }
      // 通常の編集
      const { id: _id, action: _action, ...fields } = body
      await updateCandidate(id, fields)
      return res.status(200).json({ ok: true, candidate: await getCandidate(id) })
    }

    if (req.method === 'DELETE') {
      const { id } = req.query
      if (!id) return res.status(400).json({ error: 'id が必要です' })
      await deleteCandidate(Number(id))
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'サーバーエラー', detail: e.message })
  }
}
