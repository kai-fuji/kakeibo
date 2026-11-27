// pages/cash.js - 現金（全期間のプール・支払者別台帳。年1回精算して空になる）
import { useEffect, useState } from 'react'
import Layout, { api, yen, categoryColor } from '../components/Layout'
import EmptyState from '../components/EmptyState'

const SECTION_LIMIT = 30
const WD = ['日', '月', '火', '水', '木', '金', '土']

function groupByPayer(rows) {
  const byPayer = {}
  for (const r of rows) {
    const payer = r.payer || '（支払者なし）'
    if (!byPayer[payer]) byPayer[payer] = { payer, rows: [], total: 0 }
    byPayer[payer].rows.push(r)
    byPayer[payer].total += r.amount
  }
  return Object.values(byPayer).sort((a, b) => b.total - a.total)
}

export default function CashPage() {
  const [data, setData] = useState(null)
  const [openId, setOpenId] = useState(null)
  const [showAllFor, setShowAllFor] = useState({})
  const [showSettled, setShowSettled] = useState(false)
  const [categories, setCategories] = useState([])
  const [members, setMembers] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({ date: '', category: '', amount: '', payer: '', store_memo: '' })
  const [error, setError] = useState('')

  const load = () => {
    api('/api/cash?scope=pool').then(setData).catch(() => setData(null))
  }

  useEffect(load, [])
  useEffect(() => {
    api('/api/categories').then(setCategories).catch(() => {})
    api('/api/members').then(setMembers).catch(() => {})
  }, [])

  const startEdit = (r) => {
    setEditingId(r.id)
    setError('')
    setForm({
      date: r.date,
      category: r.category,
      amount: String(r.amount),
      payer: r.payer || '',
      store_memo: r.store_memo || '',
    })
  }

  const saveEdit = async (r) => {
    setError('')
    try {
      await api('/api/transactions', {
        method: 'PUT',
        body: JSON.stringify({
          id: r.id,
          date: form.date,
          category: form.category,
          amount: Number(form.amount),
          store_memo: form.store_memo,
          payment_method: 'cash',
          payer: form.payer,
        }),
      })
      setEditingId(null)
      load()
    } catch (e) {
      setError(e.message)
    }
  }

  const setSettled = async (id, settled) => {
    await api('/api/transactions', { method: 'PUT', body: JSON.stringify({ id, settled }) })
    load()
  }

  const settleAll = async () => {
    if (!data) return
    if (!confirm('未精算の現金をすべて精算済みにしますか？（年次精算が完了してから押してください）')) return
    for (const r of data.transactions.filter((x) => !x.settled)) {
      await api('/api/transactions', { method: 'PUT', body: JSON.stringify({ id: r.id, settled: true }) })
    }
    load()
  }

  const unsettled = data ? data.transactions.filter((r) => !r.settled) : []
  const settledRows = data ? data.transactions.filter((r) => r.settled) : []
  const settledTotal = settledRows.reduce((s, r) => s + r.amount, 0)
  const sections = groupByPayer(unsettled)
  const settledSections = groupByPayer(settledRows)

  const renderRow = (r) => {
    const open = openId === r.id
    return (
      <div key={r.id} className={r.settled ? 'opacity-50' : ''}>
        <button
          onClick={() => setOpenId(open ? null : r.id)}
          aria-expanded={open}
          className="w-full flex items-center gap-2 py-1 text-sm text-left"
        >
          <span className="text-gray-500 shrink-0 w-[4.6rem]">{r.date.slice(2).replace(/-/g, '/')}</span>
          <span
            className="inline-block text-[10px] rounded-full px-2 py-0.5 font-bold text-white shrink-0"
            style={{ background: categoryColor(r.category) }}
          >{r.category}</span>
          <span className="flex-1 min-w-0 truncate">{r.store_memo || ''}</span>
          <span className="font-medium shrink-0">{yen(r.amount)}</span>
          <span className="text-gray-300 shrink-0 w-3 text-center">{open ? '⌄' : '›'}</span>
        </button>
        {open && (
          <div className="bg-sky-50 rounded-xl px-3 py-2.5 mb-1.5 text-sm space-y-1">
            {editingId === r.id ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full min-w-0 border rounded-xl px-2 py-1.5 bg-white" />
                  <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="金額（円）" className="w-full min-w-0 border rounded-xl px-2 py-1.5 bg-white" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full min-w-0 border rounded-xl px-2 py-1.5 bg-white">
                    {categories.map((c) => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                  <select value={form.payer} onChange={(e) => setForm({ ...form, payer: e.target.value })} className="w-full min-w-0 border rounded-xl px-2 py-1.5 bg-white">
                    <option value="">支払者を選択</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.name}>{m.name}</option>
                    ))}
                  </select>
                </div>
                <input value={form.store_memo} onChange={(e) => setForm({ ...form, store_memo: e.target.value })} placeholder="メモ" className="w-full min-w-0 border rounded-xl px-2 py-1.5 bg-white" />
                {error && <p className="text-red-500 text-xs">{error}</p>}
                <div className="flex gap-2">
                  <button onClick={() => saveEdit(r)} className="flex-1 bg-gradient-to-r from-sleep-orange to-sleep-yellow text-white rounded-full py-1.5 text-xs font-extrabold">
                    保存する
                  </button>
                  <button onClick={() => setEditingId(null)} className="px-4 border rounded-full py-1.5 text-xs font-bold bg-white">
                    キャンセル
                  </button>
                </div>
                <p className="text-[11px] text-gray-400">現金の記録は明細と同じものです。ここで直すと明細・集計にも反映されます</p>
              </div>
            ) : (
              <>
                <div>
                  <span className="text-gray-400 mr-2">日付</span>
                  {r.date}（{WD[new Date(`${r.date}T00:00:00`).getDay()]}）
                </div>
                <div>
                  <span className="text-gray-400 mr-2">カテゴリー</span>
                  {r.category}
                </div>
                <div>
                  <span className="text-gray-400 mr-2">メモ</span>
                  {r.store_memo || '（なし）'}
                </div>
                <div>
                  <span className="text-gray-400 mr-2">支払者</span>
                  {r.payer || '（なし）'}
                </div>
                <div>
                  <span className="text-gray-400 mr-2">金額</span>
                  <span className="font-bold">{yen(r.amount)}</span>
                </div>
                <div>
                  <span className="text-gray-400 mr-2">状態</span>
                  {r.settled ? `精算済み${r.settled_at ? `（${String(r.settled_at).slice(0, 10)}）` : ''}` : '未精算'}
                </div>
                <div className="flex gap-2 pt-1.5">
                  {r.settled ? (
                    <button onClick={() => setSettled(r.id, false)} className="flex-1 border rounded-full py-1.5 text-xs font-bold bg-white">
                      未精算に戻す
                    </button>
                  ) : (
                    <button onClick={() => setSettled(r.id, true)} className="flex-1 bg-gradient-to-r from-sleep-green to-sleep-greendeep text-white rounded-full py-1.5 text-xs font-extrabold">
                      精算済みにする
                    </button>
                  )}
                  <button onClick={() => startEdit(r)} className="flex-1 border rounded-full py-1.5 text-xs font-bold bg-white">
                    編集
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  const renderSection = (sec, keyPrefix) => {
    const key = `${keyPrefix}:${sec.payer}`
    const visible = showAllFor[key] ? sec.rows : sec.rows.slice(0, SECTION_LIMIT)
    return (
      <div key={key} className="bg-white rounded-2xl px-4 py-3 shadow-sm mb-3">
        <div className="flex items-baseline justify-between gap-2 border-b-2 border-sky-100 pb-1.5">
          <span className="font-extrabold">{sec.payer}</span>
          <span className="text-sm font-bold">
            {yen(sec.total)}
            <span className="block text-[11px] font-medium text-gray-400 text-right">{sec.rows.length}件</span>
          </span>
        </div>
        <div className="divide-y divide-gray-100">{visible.map(renderRow)}</div>
        {!showAllFor[key] && sec.rows.length > SECTION_LIMIT && (
          <button
            onClick={() => setShowAllFor({ ...showAllFor, [key]: true })}
            className="w-full pt-2 text-sm font-bold text-sleep-blue"
          >
            あと{sec.rows.length - SECTION_LIMIT}件を表示
          </button>
        )}
      </div>
    )
  }

  return (
    <Layout title="現金">
      {data && (
        <>
          <div className="bg-gradient-to-r from-sleep-blue to-sleep-sky text-white rounded-2xl p-5 shadow-sm mb-3">
            <div className="text-sm font-bold text-white/85">未精算の現金（全期間・精算用）</div>
            <div className="text-3xl font-extrabold mt-0.5">{yen(data.total)}</div>
            <div className="text-xs text-white/80 mt-0.5">{data.count}件</div>
            <div className="mt-3 space-y-1">
              {Object.entries(data.byPayer).sort((a, b) => b[1] - a[1]).map(([payer, amount]) => (
                <div key={payer} className="flex justify-between text-sm font-bold">
                  <span>{payer}</span>
                  <span>{yen(amount)}</span>
                </div>
              ))}
              {data.count === 0 && <div className="text-sm font-bold">未精算の現金はありません</div>}
            </div>
          </div>

          {data.count > 0 && (
            <button onClick={settleAll} className="w-full bg-gradient-to-r from-sleep-green to-sleep-greendeep text-white rounded-full py-2.5 font-extrabold shadow mb-4">
              全て精算済みにする（年次精算）
            </button>
          )}

          {sections.length === 0 && data.count === 0 && (
            <div className="bg-white rounded-2xl p-4 shadow-sm mb-3">
              <EmptyState text="未精算の現金はありません" />
            </div>
          )}

          {sections.map((sec) => renderSection(sec, 'open'))}

          {settledRows.length > 0 && (
            <>
              <button
                onClick={() => setShowSettled(!showSettled)}
                className="w-full text-sm font-bold text-gray-400 py-2"
              >
                精算済みを表示（{settledRows.length}件・{yen(settledTotal)}）{showSettled ? ' ⌄' : ' ›'}
              </button>
              {showSettled && settledSections.map((sec) => renderSection(sec, 'settled'))}
            </>
          )}

          <p className="text-[11px] text-gray-400 mt-2">
            現金の支出自体は各月の集計にも含まれています。精算済みにしても明細は残り、ここ（未精算の残高）からだけ消えます。
          </p>
        </>
      )}
    </Layout>
  )
}
