// pages/candidates.js - 未記入候補（カード利用通知などから拾った未記入の支出）
// 確定するまで集計には含まれない。確定で明細化、照合で既存明細と紐づけ、却下もできる
import { useEffect, useMemo, useState } from 'react'
import Layout, { api, yen, categoryColor } from '../components/Layout'
import EmptyState from '../components/EmptyState'

const SOURCE_LABEL = { mail: 'メール通知', manual: '手入力', receipt: 'レシート', chat: 'チャット' }
const PENDING_LIMIT = 20
const DONE_LIMIT = 10

const emptyForm = {
  date: new Date().toISOString().slice(0, 10),
  amount: '',
  store: '',
  category: '',
  note: '',
  itemsText: '',
}

function itemsToText(items) {
  return (items || [])
    .map((i) => `${i.item_name},${i.unit_price ?? ''},${i.quantity ?? 1}`)
    .join('\n')
}

function textToItems(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [item_name, unit_price, quantity] = line.split(',').map((s) => s.trim())
      return {
        item_name,
        unit_price: unit_price ? Number(unit_price) : null,
        quantity: quantity ? Number(quantity) : 1,
      }
    })
    .filter((i) => i.item_name)
}

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState([])
  const [categories, setCategories] = useState([])
  const [members, setMembers] = useState([])
  const [anomalies, setAnomalies] = useState([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [chatText, setChatText] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [openId, setOpenId] = useState(null)
  const [confirmForm, setConfirmForm] = useState(null)
  const [matches, setMatches] = useState({})
  const [checked, setChecked] = useState({})
  const [bulkCategories, setBulkCategories] = useState({})
  const [showAllPending, setShowAllPending] = useState(false)
  const [showAllDone, setShowAllDone] = useState(false)

  const load = () => {
    api('/api/candidates').then(setCandidates).catch((e) => setError(e.message))
    const now = new Date()
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    api(`/api/insights?month=${month}&year=${now.getFullYear()}`)
      .then((d) => setAnomalies(d.anomalies || []))
      .catch(() => {})
  }

  useEffect(load, [])
  useEffect(() => {
    api('/api/categories').then(setCategories).catch(() => {})
    api('/api/members').then(setMembers).catch(() => {})
  }, [])

  const pending = candidates.filter((c) => c.status === 'pending')
  const done = candidates.filter((c) => c.status !== 'pending')
  const anomalyByCandidate = useMemo(() => {
    const map = {}
    for (const a of anomalies) {
      if (a.candidateId && !map[a.candidateId]) map[a.candidateId] = a
    }
    return map
  }, [anomalies])

  const flash = (msg) => {
    setMessage(msg)
    setTimeout(() => setMessage(''), 3500)
  }

  // ---- チャット一言入力 ----
  const submitChat = async (e) => {
    e.preventDefault()
    setError('')
    try {
      const result = await api('/api/candidates', {
        method: 'POST',
        body: JSON.stringify({ text: chatText }),
      })
      setChatText('')
      flash(`候補に入れました: ${result.candidate.date} ${result.candidate.store || ''} ${yen(result.candidate.amount)}`)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  // ---- 手入力で候補追加 ----
  const submitForm = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await api('/api/candidates', {
        method: 'POST',
        body: JSON.stringify({
          date: form.date,
          amount: Number(form.amount),
          store: form.store,
          category: form.category || null,
          note: form.note,
          source: 'manual',
          items: textToItems(form.itemsText),
        }),
      })
      setForm({ ...emptyForm, date: form.date })
      flash('候補を追加しました')
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  // ---- 候補を開く（確定フォーム） ----
  const openCandidate = (c) => {
    if (openId === c.id) {
      setOpenId(null)
      setConfirmForm(null)
      return
    }
    setOpenId(c.id)
    setConfirmForm({
      date: c.date,
      amount: c.amount,
      category: c.category || '',
      memo: c.store || '',
      payment_method: c.paymentMethod || 'card',
      payer: c.payer || '',
      itemsText: itemsToText(c.items),
    })
  }

  const confirm = async (c) => {
    setError('')
    try {
      await api('/api/candidates', {
        method: 'PUT',
        body: JSON.stringify({
          id: c.id,
          action: 'confirm',
          date: confirmForm.date,
          amount: Number(confirmForm.amount),
          category: confirmForm.category || undefined,
          memo: confirmForm.memo,
          payment_method: confirmForm.payment_method,
          payer: confirmForm.payer,
          items: textToItems(confirmForm.itemsText),
        }),
      })
      setOpenId(null)
      setConfirmForm(null)
      flash('明細に確定しました（集計に反映されます）')
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  const findMatches = async (c) => {
    try {
      const result = await api(`/api/candidates?mode=matches&id=${c.id}`)
      setMatches({ ...matches, [c.id]: result })
      if (result.length === 0) flash('照合できそうな既存明細はありませんでした')
    } catch (err) {
      setError(err.message)
    }
  }

  const link = async (c, transactionId) => {
    await api('/api/candidates', {
      method: 'PUT',
      body: JSON.stringify({ id: c.id, action: 'link', transactionId }),
    })
    setOpenId(null)
    flash('既存の明細と照合済みにしました')
    load()
  }

  const dismiss = async (c) => {
    if (!confirm('この候補を却下しますか？（返金・取消・対象外の通知用）')) return
    await api('/api/candidates', { method: 'PUT', body: JSON.stringify({ id: c.id, action: 'dismiss' }) })
    setOpenId(null)
    load()
  }

  const reopen = async (c) => {
    await api('/api/candidates', { method: 'PUT', body: JSON.stringify({ id: c.id, action: 'reopen' }) })
    flash('未記入に戻しました')
    load()
  }

  const remove = async (c) => {
    if (!confirm('この候補を削除しますか？')) return
    await api(`/api/candidates?id=${c.id}`, { method: 'DELETE' })
    setOpenId(null)
    load()
  }

  // ---- 一括確定 ----
  const bulkConfirm = async () => {
    const entries = pending
      .filter((c) => checked[c.id])
      .map((c) => ({ id: c.id, category: bulkCategories[c.id] || c.category || undefined }))
    if (entries.length === 0) return
    try {
      const result = await api('/api/candidates', {
        method: 'PUT',
        body: JSON.stringify({ action: 'bulk-confirm', entries }),
      })
      const skippedMsg = result.skipped.length
        ? ` / ${result.skipped.length}件はカテゴリー未定などでスキップ`
        : ''
      flash(`${result.confirmed.length}件を確定しました${skippedMsg}`)
      setChecked({})
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  const inputCls = 'w-full border rounded-xl px-3 py-2 bg-white'
  const visiblePending = showAllPending ? pending : pending.slice(0, PENDING_LIMIT)
  const visibleDone = showAllDone ? done : done.slice(0, DONE_LIMIT)
  const checkedCount = pending.filter((c) => checked[c.id]).length

  const renderCandidate = (c) => {
    const anomaly = anomalyByCandidate[c.id]
    const isOpen = openId === c.id
    return (
      <div key={c.id} className="py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0">
            {c.status === 'pending' && (
              <input
                type="checkbox"
                className="mt-1 w-4 h-4 shrink-0"
                checked={!!checked[c.id]}
                onChange={(e) => setChecked({ ...checked, [c.id]: e.target.checked })}
              />
            )}
            <button onClick={() => openCandidate(c)} className="text-left min-w-0">
              <div className="flex flex-wrap items-center gap-x-2">
                <span className="text-sm text-gray-500">{c.date}</span>
                <span className="font-bold truncate">{c.store || '（店名なし）'}</span>
                {anomaly && (
                  <span className={`text-[10px] font-extrabold rounded-full px-2 py-0.5 text-white ${anomaly.severity === 'high' ? 'bg-red-500' : 'bg-orange-400'}`}>
                    要確認
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                {SOURCE_LABEL[c.source] || c.source}
                {c.category ? ` / ${c.category}` : ' / カテゴリー未定'}
                {c.paymentMethod === 'cash' ? ` / 現金・${c.payer || ''}` : ' / 家族カード'}
                {c.items.length > 0 ? ` / 品目${c.items.length}件` : ''}
                {c.status === 'confirmed' ? ' / 確定済み' : ''}
                {c.status === 'dismissed' ? ' / 却下' : ''}
              </div>
              {anomaly && <div className="text-xs text-orange-600 mt-0.5">{anomaly.title}</div>}
              {c.items.length > 0 && (
                <div className="text-xs text-gray-500 mt-0.5">
                  {c.items.map((i) => `${i.item_name} ${i.unit_price ? yen(i.unit_price) : ''}`).join(' / ')}
                </div>
              )}
            </button>
          </div>
          <div className="font-extrabold shrink-0">{yen(c.amount)}</div>
        </div>

        {isOpen && c.status === 'pending' && confirmForm && (
          <div className="mt-3 bg-sky-50 rounded-2xl p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input type="date" value={confirmForm.date} onChange={(e) => setConfirmForm({ ...confirmForm, date: e.target.value })} className={inputCls} />
              <input type="number" value={confirmForm.amount} onChange={(e) => setConfirmForm({ ...confirmForm, amount: e.target.value })} className={inputCls} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select value={confirmForm.category} onChange={(e) => setConfirmForm({ ...confirmForm, category: e.target.value })} className={inputCls}>
                <option value="">カテゴリーを選択</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.name}>{cat.name}</option>
                ))}
              </select>
              <input value={confirmForm.memo} onChange={(e) => setConfirmForm({ ...confirmForm, memo: e.target.value })} placeholder="店名・メモ" className={inputCls} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select value={confirmForm.payment_method} onChange={(e) => setConfirmForm({ ...confirmForm, payment_method: e.target.value })} className={inputCls}>
                <option value="card">家族カード</option>
                <option value="cash">現金</option>
              </select>
              {confirmForm.payment_method === 'cash' ? (
                <select value={confirmForm.payer} onChange={(e) => setConfirmForm({ ...confirmForm, payer: e.target.value })} className={inputCls}>
                  <option value="">支払者を選択</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.name}>{m.name}</option>
                  ))}
                </select>
              ) : (
                <span className="text-xs text-gray-400 self-center">現金のとき支払者を選びます</span>
              )}
            </div>
            <textarea
              value={confirmForm.itemsText}
              onChange={(e) => setConfirmForm({ ...confirmForm, itemsText: e.target.value })}
              placeholder={'品目（レシート分・任意）1行に1品目: 商品名,単価,個数'}
              className={inputCls}
              rows={2}
            />
            <button onClick={() => confirm(c)} className="w-full bg-gradient-to-r from-sleep-blue to-sleep-sky text-white rounded-full py-2.5 font-extrabold shadow">
              確定して明細に入れる
            </button>
            <div className="flex gap-2">
              <button onClick={() => findMatches(c)} className="flex-1 border border-sleep-blue text-sleep-blue rounded-full py-2 text-sm font-bold bg-white">
                既存明細と照合する
              </button>
              <button onClick={() => dismiss(c)} className="flex-1 border border-gray-300 text-gray-500 rounded-full py-2 text-sm font-bold bg-white">
                却下
              </button>
              <button onClick={() => remove(c)} className="px-4 border border-red-200 text-red-500 rounded-full py-2 text-sm font-bold bg-white">
                削除
              </button>
            </div>
            {matches[c.id] && matches[c.id].length > 0 && (
              <div className="space-y-1">
                {matches[c.id].map((m) => (
                  <div key={m.transaction.id} className="flex items-center justify-between bg-white rounded-xl px-3 py-2 text-sm">
                    <span>
                      {m.transaction.date} {m.transaction.store_memo || ''} {yen(m.transaction.amount)}
                      <span className="text-xs text-gray-400 ml-1">（{m.reasons.join('・')}）</span>
                    </span>
                    <button onClick={() => link(c, m.transaction.id)} className="text-sleep-blue font-bold shrink-0 ml-2">
                      照合済みにする
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {isOpen && c.status !== 'pending' && (
          <div className="mt-2 flex gap-2">
            {c.status === 'dismissed' && (
              <button onClick={() => reopen(c)} className="border border-sleep-blue text-sleep-blue rounded-full px-4 py-1.5 text-sm font-bold bg-white">
                未記入に戻す
              </button>
            )}
            <button onClick={() => remove(c)} className="border border-red-200 text-red-500 rounded-full px-4 py-1.5 text-sm font-bold bg-white">
              削除
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <Layout title="未記入候補">
      <div className="space-y-4">
        <p className="text-sm text-gray-500 bg-white rounded-2xl p-4 shadow-sm">
          カード利用通知などから拾った候補を、集計に入れずに貯めておく場所です。
          Gmail連携後はシロが通知を読んでここへ入れます（メールIDで二重登録を防ぎます）。
          レシートと照合できたら品目を付け足して、確定ボタンで正式な明細にしてください。
        </p>

        {message && <p className="text-sm font-bold text-green-600 bg-green-50 rounded-xl px-3 py-2">{message}</p>}
        {error && <p className="text-sm font-bold text-red-500 bg-red-50 rounded-xl px-3 py-2">{error}</p>}

        {/* チャット一言入力 */}
        <form onSubmit={submitChat} className="bg-white rounded-2xl p-4 shadow-sm space-y-2">
          <h2 className="font-bold">一言で入れる</h2>
          <input
            value={chatText}
            onChange={(e) => setChatText(e.target.value)}
            placeholder="例: 昨日、コンビニで現金1,200円、支払者はかい"
            className={inputCls}
          />
          <button className="w-full bg-gradient-to-r from-sleep-pink to-sleep-coral text-white rounded-full py-2.5 font-extrabold shadow">
            候補に入れる
          </button>
          <p className="text-xs text-gray-400">シロにチャットで伝えた時も、同じ読み取りでここに入ります。</p>
        </form>

        {/* 手入力で候補追加 */}
        <form onSubmit={submitForm} className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          <h2 className="font-bold">候補を手入力で追加</h2>
          <div className="grid grid-cols-2 gap-3">
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inputCls} required />
            <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="金額（円）" className={inputCls} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input value={form.store} onChange={(e) => setForm({ ...form, store: e.target.value })} placeholder="店名" className={inputCls} />
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputCls}>
              <option value="">カテゴリー（推定・任意）</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.name}>{cat.name}</option>
              ))}
            </select>
          </div>
          <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="メモ（任意）" className={inputCls} />
          <textarea
            value={form.itemsText}
            onChange={(e) => setForm({ ...form, itemsText: e.target.value })}
            placeholder={'品目（任意）1行に1品目: 商品名,単価,個数'}
            className={inputCls}
            rows={2}
          />
          <button className="w-full bg-gradient-to-r from-sleep-blue to-sleep-sky text-white rounded-full py-2.5 font-extrabold shadow">
            ＋ 候補に追加
          </button>
        </form>

        {/* 未記入一覧＋一括確定 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-bold">
              未記入の候補
              <span className="text-sm text-gray-400 ml-2">{pending.length}件 / {yen(pending.reduce((s, c) => s + c.amount, 0))}</span>
            </h2>
            {checkedCount > 0 && (
              <button onClick={bulkConfirm} className="bg-sleep-green text-white rounded-full px-4 py-1.5 text-sm font-extrabold shadow-sm">
                {checkedCount}件を一括確定
              </button>
            )}
          </div>
          <p className="text-xs text-gray-400 mb-1">
            チェックを付けた候補はまとめて確定できます（カテゴリー未定の候補はスキップされます）。行をタップすると確定・照合の詳細が開きます。
          </p>
          {checkedCount > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {pending.filter((c) => checked[c.id]).map((c) => (
                <select
                  key={c.id}
                  value={bulkCategories[c.id] || c.category || ''}
                  onChange={(e) => setBulkCategories({ ...bulkCategories, [c.id]: e.target.value })}
                  className="text-xs border rounded-full px-2 py-1 bg-white"
                >
                  <option value="">{c.store || '候補'}: カテゴリー</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.name}>{cat.name}</option>
                  ))}
                </select>
              ))}
            </div>
          )}
          <div className="divide-y">
            {pending.length === 0 && <EmptyState text="未記入の候補はありません" />}
            {visiblePending.map(renderCandidate)}
          </div>
          {!showAllPending && pending.length > PENDING_LIMIT && (
            <button onClick={() => setShowAllPending(true)} className="w-full mt-2 border rounded-full py-2 text-sm font-bold text-sleep-blue">
              あと{pending.length - PENDING_LIMIT}件を表示
            </button>
          )}
        </div>

        {/* 処理済み一覧 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="font-bold mb-1">
            処理済み
            <span className="text-sm text-gray-400 ml-2">{done.length}件</span>
          </h2>
          <div className="divide-y">
            {done.length === 0 && <EmptyState text="処理済みの候補はまだありません" />}
            {visibleDone.map(renderCandidate)}
          </div>
          {!showAllDone && done.length > DONE_LIMIT && (
            <button onClick={() => setShowAllDone(true)} className="w-full mt-2 border rounded-full py-2 text-sm font-bold text-sleep-blue">
              あと{done.length - DONE_LIMIT}件を表示
            </button>
          )}
        </div>
      </div>
    </Layout>
  )
}
