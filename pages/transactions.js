// pages/transactions.js - 毎日家計簿（明細の追加・編集・削除、品目明細つき）
// 入力支援: 前回と同じチップ / 店名サジェスト＋カテゴリー自動入力 / 保存して次へ
// レシート書き込み時の消込: 入力内容と合致する未記入候補を表示し、選んで保存すると候補が消える
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Layout, { api, yen, currentMonth, shiftMonth, categoryColor } from '../components/Layout'
import EmptyState from '../components/EmptyState'

const emptyForm = {
  date: new Date().toISOString().slice(0, 10),
  category: '食費',
  amount: '',
  store_memo: '',
  payment_method: 'card',
  payer: '',
  itemsText: '', // 品目は「商品名,単価,個数」を1行ずつ
}

const TEMPLATE_LIMIT = 4
const RECENT_DAYS_LIMIT = 7

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

export default function TransactionsPage() {
  const [month, setMonth] = useState(currentMonth())
  const [rows, setRows] = useState([])
  const [categories, setCategories] = useState([])
  const [members, setMembers] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  // 入力支援
  const [helpers, setHelpers] = useState({ suggestions: [], rules: [], templates: [] })
  const [showAllTemplates, setShowAllTemplates] = useState(false)
  const [storeFocused, setStoreFocused] = useState(false)
  // 消込（レシート書き込み時の候補照合）
  const [entryMatches, setEntryMatches] = useState([])
  const [linkCandidateId, setLinkCandidateId] = useState(null)
  const matchTimer = useRef(null)
  // 一覧の絞り込み
  const [search, setSearch] = useState('')
  const [showAllDays, setShowAllDays] = useState(false)

  const load = () => {
    api(`/api/transactions?month=${month}`).then(setRows).catch((e) => setError(e.message))
    api('/api/input-helpers').then(setHelpers).catch(() => {})
  }

  useEffect(load, [month])
  useEffect(() => {
    api('/api/categories').then(setCategories).catch(() => {})
    api('/api/members').then(setMembers).catch(() => {})
    api('/api/input-helpers').then(setHelpers).catch(() => {})
  }, [])

  const flash = (msg) => {
    setMessage(msg)
    setTimeout(() => setMessage(''), 3500)
  }

  // 店名サジェスト（最大5件）: 入力中の店名に部分一致するもの
  const storeSuggestions = form.store_memo
    ? helpers.suggestions
        .filter((s) => s.store.includes(form.store_memo) || form.store_memo.includes(s.store))
        .slice(0, 5)
    : helpers.suggestions.slice(0, 5)

  const pickStore = (s) => {
    setForm({ ...form, store_memo: s.store, category: s.category || form.category })
    setStoreFocused(false)
  }

  // 店名が学習ルールに一致したらカテゴリーを自動入力
  const applyRuleForStore = (store) => {
    const rule = helpers.rules.find(
      (r) => r.store === store || store.includes(r.store) || r.store.includes(store)
    )
    if (rule) setForm((f) => ({ ...f, store_memo: store, category: rule.category }))
    else setForm((f) => ({ ...f, store_memo: store }))
  }

  // 消込候補の照合（家族カード払いで金額と日付が入っている時だけ）
  useEffect(() => {
    if (matchTimer.current) clearTimeout(matchTimer.current)
    if (editingId || form.payment_method !== 'card' || !form.date || !form.amount) {
      setEntryMatches([])
      setLinkCandidateId(null)
      return
    }
    matchTimer.current = setTimeout(() => {
      api(
        `/api/candidates?mode=entry-matches&date=${form.date}&amount=${Number(form.amount)}&store=${encodeURIComponent(form.store_memo || '')}`
      )
        .then((matches) => {
          setEntryMatches(matches)
          setLinkCandidateId(matches.length > 0 ? matches[0].candidate.id : null)
        })
        .catch(() => setEntryMatches([]))
    }, 400)
  }, [form.date, form.amount, form.store_memo, form.payment_method, editingId])

  const save = async (keepOpen) => {
    setError('')
    const payload = {
      ...form,
      amount: Number(form.amount),
      items: textToItems(form.itemsText),
    }
    try {
      if (editingId) {
        await api('/api/transactions', {
          method: 'PUT',
          body: JSON.stringify({ id: editingId, ...payload }),
        })
        setEditingId(null)
        setForm({ ...emptyForm, category: form.category })
        flash('更新しました')
      } else {
        const created = await api('/api/transactions', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        // 消込: 選んだ候補をこの明細と照合済みにして未記入から消す
        if (linkCandidateId) {
          await api('/api/candidates', {
            method: 'PUT',
            body: JSON.stringify({ id: linkCandidateId, action: 'link', transactionId: created.id }),
          })
          flash('追加しました（候補と照合済みにして、未記入から消しました）')
        } else {
          flash('追加しました')
        }
        setEntryMatches([])
        setLinkCandidateId(null)
        if (keepOpen) {
          // 連続入力: 日付とカテゴリーを引き継ぐ
          setForm({ ...emptyForm, date: form.date, category: form.category, payment_method: form.payment_method, payer: form.payer })
        } else {
          setForm({ ...emptyForm, category: form.category })
        }
      }
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  const submit = (e) => {
    e.preventDefault()
    save(false)
  }

  const startEdit = (r) => {
    setEditingId(r.id)
    setForm({
      date: r.date,
      category: r.category,
      amount: r.amount,
      store_memo: r.store_memo || '',
      payment_method: r.payment_method,
      payer: r.payer || '',
      itemsText: itemsToText(r.items),
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // 複製（前回と同じ入力）
  const duplicate = (r) => {
    setEditingId(null)
    setForm({
      date: new Date().toISOString().slice(0, 10),
      category: r.category,
      amount: r.amount,
      store_memo: r.store_memo || '',
      payment_method: r.payment_method,
      payer: r.payer || '',
      itemsText: itemsToText(r.items),
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
    flash('複製しました。内容を確認して追加してください')
  }

  const applyTemplate = (t) => {
    setEditingId(null)
    setForm({
      ...form,
      date: new Date().toISOString().slice(0, 10),
      category: t.category,
      amount: t.amount,
      store_memo: t.store_memo || '',
      payment_method: t.payment_method,
      payer: t.payer || '',
      itemsText: itemsToText(t.items),
    })
  }

  const remove = async (id) => {
    if (!confirm('この明細を削除しますか？')) return
    await api(`/api/transactions?id=${id}`, { method: 'DELETE' })
    load()
  }

  // 一覧: 検索で絞り、標準では直近7日分だけ表示
  const filtered = search
    ? rows.filter(
        (r) =>
          (r.store_memo || '').includes(search) ||
          r.category.includes(search) ||
          (r.items || []).some((i) => i.item_name.includes(search))
      )
    : rows
  const byDate = {}
  filtered.forEach((r) => {
    if (!byDate[r.date]) byDate[r.date] = []
    byDate[r.date].push(r)
  })
  const allDates = Object.keys(byDate).sort().reverse()
  const visibleDates = showAllDays || search ? allDates : allDates.slice(0, RECENT_DAYS_LIMIT)

  const templates = helpers.templates
  const visibleTemplates = showAllTemplates ? templates : templates.slice(0, TEMPLATE_LIMIT)

  const inputCls = 'w-full border rounded-xl px-3 py-2 bg-white'

  return (
    <Layout title="明細">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setMonth(shiftMonth(month, -1))} className="px-3 py-2 bg-white rounded-xl border">← 前月</button>
        <span className="font-bold">{month.replace('-', '年')}月</span>
        <button onClick={() => setMonth(shiftMonth(month, 1))} className="px-3 py-2 bg-white rounded-xl border">翌月 →</button>
      </div>

      {message && <p className="text-sm font-bold text-green-600 bg-green-50 rounded-xl px-3 py-2 mb-3">{message}</p>}

      <form onSubmit={submit} className="bg-white rounded-2xl p-4 shadow-sm space-y-3 mb-4">
        <h2 className="font-bold">{editingId ? '明細を編集' : '明細を追加'}</h2>

        {/* 前回と同じ・よく使う（小さなチップ、最初は少しだけ） */}
        {!editingId && templates.length > 0 && (
          <div className="bg-sky-50 rounded-2xl px-2.5 py-2">
            <div className="flex flex-wrap gap-1">
              {visibleTemplates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => applyTemplate(t)}
                  className="text-[11px] leading-tight bg-white border border-sky-200 rounded-full px-2 py-1 font-bold text-gray-600"
                >
                  {t.store_memo || t.category} {yen(t.amount)}
                </button>
              ))}
              {!showAllTemplates && templates.length > TEMPLATE_LIMIT && (
                <button
                  type="button"
                  onClick={() => setShowAllTemplates(true)}
                  className="text-[11px] leading-tight text-sleep-blue font-bold px-1 py-1"
                >
                  あと{templates.length - TEMPLATE_LIMIT}件
                </button>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inputCls} required />
          <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="金額（円）" className={inputCls} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputCls}>
            {categories.map((c) => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>
          <div className="relative">
            <input
              value={form.store_memo}
              onChange={(e) => setForm({ ...form, store_memo: e.target.value })}
              onFocus={() => setStoreFocused(true)}
              onBlur={() => setTimeout(() => { applyRuleForStore(form.store_memo); setStoreFocused(false) }, 150)}
              placeholder="店名・メモ"
              className={inputCls}
            />
            {storeFocused && storeSuggestions.length > 0 && (
              <div className="absolute z-10 inset-x-0 top-full mt-1 bg-white border rounded-xl shadow-lg overflow-hidden">
                {storeSuggestions.map((s) => (
                  <button
                    key={s.store}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pickStore(s)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-sky-50 flex justify-between"
                  >
                    <span>{s.store}</span>
                    <span className="text-xs text-gray-400">{s.category}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <select value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })} className={inputCls}>
            <option value="card">家族カード</option>
            <option value="cash">現金</option>
          </select>
          {form.payment_method === 'cash' ? (
            <select value={form.payer} onChange={(e) => setForm({ ...form, payer: e.target.value })} className={inputCls} required>
              <option value="">支払者を選択</option>
              {members.map((m) => (
                <option key={m.id} value={m.name}>{m.name}</option>
              ))}
            </select>
          ) : (
            <span className="text-sm text-gray-400 self-center">現金のとき支払者を選びます</span>
          )}
        </div>
        <textarea
          value={form.itemsText}
          onChange={(e) => setForm({ ...form, itemsText: e.target.value })}
          placeholder={'品目明細（任意・価格推移用）1行に1品目: 商品名,単価,個数\n例: 牛乳,248,1'}
          className={inputCls}
          rows={3}
        />

        {/* 消込: 合致する未記入候補 */}
        {!editingId && entryMatches.length > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-3 space-y-1.5">
            <div className="text-sm font-extrabold text-orange-600">この内容と合致する未記入候補があります</div>
            {entryMatches.map((m) => (
              <label key={m.candidate.id} className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="link-candidate"
                  checked={linkCandidateId === m.candidate.id}
                  onChange={() => setLinkCandidateId(m.candidate.id)}
                />
                <span className="flex-1">
                  {m.candidate.date} {m.candidate.store || ''} {yen(m.candidate.amount)}
                  <span className="text-xs text-gray-400 ml-1">（{m.reasons.join('・')}）</span>
                </span>
              </label>
            ))}
            <label className="flex items-center gap-2 px-3 py-1 text-sm cursor-pointer text-gray-500">
              <input
                type="radio"
                name="link-candidate"
                checked={linkCandidateId === null}
                onChange={() => setLinkCandidateId(null)}
              />
              照合しない（候補は残す）
            </label>
            <p className="text-xs text-gray-400 px-1">選んで保存すると、その候補は照合済みになって未記入候補から消えます。</p>
          </div>
        )}

        {error && <p className="text-red-500 text-sm">{error}</p>}
        <div className="flex gap-2">
          <button className="flex-1 bg-gradient-to-r from-sleep-blue to-sleep-sky text-white rounded-full py-2.5 font-extrabold shadow">
            {editingId ? '更新する' : '＋ 追加する'}
          </button>
          {!editingId && (
            <button
              type="button"
              onClick={() => save(true)}
              className="flex-1 border-2 border-sleep-blue text-sleep-blue rounded-full py-2.5 font-extrabold bg-white"
            >
              保存して次へ
            </button>
          )}
          {editingId && (
            <button
              type="button"
              onClick={() => { setEditingId(null); setForm(emptyForm) }}
              className="px-4 border rounded-xl"
            >
              キャンセル
            </button>
          )}
        </div>
      </form>

      {/* 検索 */}
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="この月の明細を検索（店名・カテゴリー・品目）"
        className="w-full border rounded-xl px-3 py-2 bg-white mb-4"
      />

      <div className="space-y-4">
        {allDates.length === 0 && <EmptyState text="この月の明細はまだありません" />}
        {visibleDates.map((date) => (
          <div key={date} className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex justify-between font-bold mb-2">
              <span>{date}</span>
              <span>{yen(byDate[date].reduce((s, r) => s + r.amount, 0))}</span>
            </div>
            <div className="divide-y">
              {byDate[date].map((r) => (
                <div key={r.id} className="py-2 flex items-start justify-between gap-2">
                  <div>
                    <span
                      className="inline-block text-xs rounded-full px-2 py-0.5 mr-2 font-bold text-white"
                      style={{ background: categoryColor(r.category) }}
                    >{r.category}</span>
                    <span>{r.store_memo || '（メモなし）'}</span>
                    <span className="text-xs text-gray-400 ml-2">
                      {r.payment_method === 'cash' ? `現金・${r.payer || ''}` : '家族カード'}
                    </span>
                    {r.items && r.items.length > 0 && (
                      <div className="text-xs text-gray-500 mt-1">
                        {r.items.map((i) =>
                          i.normalized_item_id ? (
                            <Link
                              key={i.id}
                              href={`/prices?item_id=${i.normalized_item_id}`}
                              className="text-sleep-blue underline decoration-dotted mr-2"
                            >
                              {i.item_name} {i.unit_price ? yen(i.unit_price) : ''}×{i.quantity}
                            </Link>
                          ) : (
                            <span key={i.id} className="mr-2">{i.item_name} {i.unit_price ? yen(i.unit_price) : ''}×{i.quantity}</span>
                          )
                        )}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-medium">{yen(r.amount)}</div>
                    <button onClick={() => startEdit(r)} className="text-xs text-blue-600 mr-2">編集</button>
                    <button onClick={() => duplicate(r)} className="text-xs text-green-600 mr-2">複製</button>
                    <button onClick={() => remove(r.id)} className="text-xs text-red-500">削除</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {!showAllDays && !search && allDates.length > RECENT_DAYS_LIMIT && (
          <button onClick={() => setShowAllDays(true)} className="w-full bg-white border rounded-full py-2.5 text-sm font-bold text-sleep-blue shadow-sm">
            あと{allDates.length - RECENT_DAYS_LIMIT}日分を表示
          </button>
        )}
      </div>
    </Layout>
  )
}
