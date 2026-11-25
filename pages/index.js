// pages/index.js - 月次集計（ホーム）ポケモンスリープ風デザイン
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Layout, { api, yen, currentMonth, shiftMonth, categoryColor } from '../components/Layout'
import EmptyState from '../components/EmptyState'

const GROUP_LABEL = { variable: '変動支出', special: '特別支出', fixed: '固定支出' }
const GROUP_COLOR = { variable: '#1c9dff', special: '#ff6b57', fixed: '#ffa726' }
const CAT_DETAIL_LIMIT = 30
const MEMO_LIMIT = 5

export default function SummaryPage() {
  const [month, setMonth] = useState(currentMonth())
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  // 未記入リマインド・異常アラート
  const [pendingCandidates, setPendingCandidates] = useState([])
  const [insights, setInsights] = useState(null)
  // 突合チェック
  const [reconciliation, setReconciliation] = useState(null)
  // カテゴリー詳細
  const [monthTx, setMonthTx] = useState([])
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [showAllCatDetail, setShowAllCatDetail] = useState(false)
  // クイックメモ
  const [memos, setMemos] = useState([])
  const [memoAmount, setMemoAmount] = useState('')
  const [memoText, setMemoText] = useState('')
  const [showAllMemos, setShowAllMemos] = useState(false)
  const [convertingId, setConvertingId] = useState(null)
  const [convertForm, setConvertForm] = useState(null)
  const [categoryList, setCategoryList] = useState([])
  const [members, setMembers] = useState([])

  useEffect(() => {
    api(`/api/summary?month=${month}`).then(setData).catch((e) => setError(e.message))
    api(`/api/transactions?month=${month}`).then(setMonthTx).catch(() => setMonthTx([]))
    api(`/api/reconciliation?month=${month}`).then(setReconciliation).catch(() => setReconciliation(null))
    const [y] = month.split('-')
    api(`/api/insights?month=${month}&year=${y}`).then(setInsights).catch(() => setInsights(null))
  }, [month])

  const loadMemos = () => api('/api/quick-memos').then(setMemos).catch(() => {})

  useEffect(() => {
    api('/api/candidates?status=pending').then(setPendingCandidates).catch(() => {})
    api('/api/categories').then(setCategoryList).catch(() => {})
    api('/api/members').then(setMembers).catch(() => {})
    loadMemos()
  }, [])

  const categories = data
    ? Object.entries(data.byCategory).sort((a, b) => b[1] - a[1])
    : []
  const maxAmount = categories.length ? categories[0][1] : 0

  // ヒーロー内の日別バー（その月の日数分）
  const [yy, mm] = month.split('-').map(Number)
  const daysInMonth = new Date(yy, mm, 0).getDate()
  const daily = []
  let maxDaily = 0
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${month}-${String(d).padStart(2, '0')}`
    const v = data ? data.byDate[key] || 0 : 0
    daily.push({ day: d, value: v })
    if (v > maxDaily) maxDaily = v
  }

  // 未記入リマインド（一番古い候補の経過日数）
  const pendingTotal = pendingCandidates.reduce((s, c) => s + c.amount, 0)
  const oldestDays = pendingCandidates.length
    ? Math.max(
        ...pendingCandidates.map((c) =>
          Math.floor((Date.now() - new Date(`${c.date}T00:00:00`).getTime()) / 86400000)
        )
      )
    : 0

  // カテゴリー詳細
  const catTx = selectedCategory ? monthTx.filter((t) => t.category === selectedCategory) : []
  const catPrevTotal = selectedCategory && data ? data.previousMonth.byCategory[selectedCategory] || 0 : 0
  const catTotal = catTx.reduce((s, t) => s + t.amount, 0)
  const visibleCatTx = showAllCatDetail ? catTx : catTx.slice(0, CAT_DETAIL_LIMIT)

  // クイックメモ
  const addMemo = async (e) => {
    e.preventDefault()
    if (!memoAmount) return
    await api('/api/quick-memos', {
      method: 'POST',
      body: JSON.stringify({ amount: Number(memoAmount), memo: memoText }),
    })
    setMemoAmount('')
    setMemoText('')
    loadMemos()
  }
  const deleteMemo = async (id) => {
    await api(`/api/quick-memos?id=${id}`, { method: 'DELETE' })
    loadMemos()
  }
  const startConvert = (memo) => {
    setConvertingId(memo.id)
    setConvertForm({
      date: new Date().toISOString().slice(0, 10),
      category: '食費',
      store_memo: memo.memo || '',
      payment_method: 'card',
      payer: '',
    })
  }
  const doConvert = async (memo) => {
    try {
      await api('/api/quick-memos', {
        method: 'PUT',
        body: JSON.stringify({ id: memo.id, action: 'convert', ...convertForm }),
      })
      setConvertingId(null)
      setConvertForm(null)
      loadMemos()
      api(`/api/summary?month=${month}`).then(setData).catch(() => {})
      api(`/api/transactions?month=${month}`).then(setMonthTx).catch(() => {})
    } catch (e) {
      setError(e.message)
    }
  }
  const visibleMemos = showAllMemos ? memos : memos.slice(0, MEMO_LIMIT)

  const monthBtn = 'px-4 py-2 bg-white rounded-full border-2 border-sleep-cyan font-bold text-sleep-deep shadow-sm'
  const inputCls = 'border rounded-xl px-3 py-2 bg-white'

  return (
    <Layout title="月次集計">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setMonth(shiftMonth(month, -1))} className={monthBtn}>← 前月</button>
        <span className="font-extrabold text-lg">{month.replace('-', '年')}月</span>
        <button onClick={() => setMonth(shiftMonth(month, 1))} className={monthBtn}>翌月 →</button>
      </div>

      {error && <p className="text-red-500 mb-3">{error}</p>}
      {!data && !error && <p className="text-gray-400">読み込み中…</p>}

      {/* 未記入リマインド */}
      {pendingCandidates.length > 0 && (
        <Link href="/candidates" className="block bg-orange-50 border-2 border-orange-300 rounded-3xl p-4 mb-4 shadow-sm">
          <div className="font-extrabold text-orange-600">
            未記入の候補が {pendingCandidates.length}件 あります（{yen(pendingTotal)}）
          </div>
          <div className="text-sm text-orange-500">
            一番古い候補は {oldestDays}日 経っています。タップして候補タブへ →
          </div>
        </Link>
      )}

      {/* 異常アラート */}
      {insights && insights.anomalies.length > 0 && (
        <Link href="/insights" className="block bg-red-50 border-2 border-red-300 rounded-3xl p-4 mb-4 shadow-sm">
          <div className="font-extrabold text-red-500">
            気になる支出が {insights.anomalies.length}件 見つかりました
          </div>
          <div className="text-sm text-red-400">
            {insights.anomalies[0].title}（{yen(insights.anomalies[0].amount)}）など。タップして「気づく」タブへ →
          </div>
        </Link>
      )}

      {data && (
        <div className="space-y-5">
          {/* 青グラデーションのヒーローカード + 日別バー */}
          <div className="rounded-4xl p-5 text-white shadow-lg bg-gradient-to-b from-sleep-sky via-sleep-blue to-sleep-deep overflow-hidden">
            <div className="flex items-center gap-3 mb-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/mickey-accountant.png" alt="ミッキー" className="w-14 h-14 rounded-full border-[3px] border-yellow-200 object-cover bg-white shadow" />
              <div>
                <div className="text-xs font-bold text-white/85">Kakeibo</div>
                <div className="font-extrabold text-lg leading-tight">メインメニュー</div>
              </div>
            </div>
            <div className="text-sm font-bold text-white/85">今月の支出合計</div>
            <div className="text-4xl font-extrabold drop-shadow">{yen(data.total)}</div>
            <div className="text-sm mt-1 font-bold">
              先月比{' '}
              <span className={data.totalDiff > 0 ? 'text-yellow-200' : 'text-green-200'}>
                {data.totalDiff > 0 ? '+' : ''}{yen(data.totalDiff)}
              </span>
              <span className="text-white/80">（{data.count}件）</span>
            </div>
            <div className="flex items-end gap-[3px] h-24 mt-4">
              {daily.map(({ day, value }) => (
                <div key={day} className="flex-1 flex flex-col items-center justify-end h-full">
                  <div
                    className="w-full rounded-t"
                    title={`${day}日 ${yen(value)}`}
                    style={{
                      height: `${value > 0 ? Math.max(8, (value / (maxDaily || 1)) * 100) : 2}%`,
                      background: value === maxDaily && value > 0 ? '#6ee7ff' : 'rgba(255,255,255,0.55)',
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-white/85 mt-1 font-bold">
              <span>1日</span><span>{daysInMonth}日</span>
            </div>
          </div>

          {/* 区分カード（カラフルな縁取り） */}
          <div className="grid grid-cols-3 gap-3">
            {Object.keys(GROUP_LABEL).map((g) => (
              <div
                key={g}
                className="bg-white rounded-3xl p-4 shadow-sm border-2"
                style={{ borderColor: GROUP_COLOR[g] }}
              >
                <div className="text-xs font-bold" style={{ color: GROUP_COLOR[g] }}>{GROUP_LABEL[g]}</div>
                <div className="font-extrabold">{yen(data.byGroup[g])}</div>
              </div>
            ))}
          </div>

          {/* カテゴリー別（タップで詳細） */}
          <div>
            <span className="ribbon">カテゴリー別</span>
            <div className="bg-white rounded-3xl p-5 shadow-sm mt-3">
              {categories.length === 0 && <EmptyState text="この月の記録はまだありません" />}
              <div className="space-y-3">
                {categories.map(([name, amount]) => (
                  <button
                    key={name}
                    onClick={() => {
                      setSelectedCategory(selectedCategory === name ? null : name)
                      setShowAllCatDetail(false)
                    }}
                    className="block w-full text-left"
                  >
                    <div className="flex justify-between text-sm font-bold">
                      <span>
                        <span
                          className="inline-block w-3 h-3 rounded-full mr-2 align-middle"
                          style={{ background: categoryColor(name) }}
                        />
                        {name}
                        <span className="text-gray-300 ml-1">{selectedCategory === name ? '▲' : '▼'}</span>
                      </span>
                      <span>
                        {yen(amount)}
                        <span className="text-gray-400 ml-2 font-medium">
                          {data.total ? Math.round((amount / data.total) * 100) : 0}%
                        </span>
                      </span>
                    </div>
                    <div className="h-2.5 bg-sky-50 rounded-full mt-1">
                      <div
                        className="h-2.5 rounded-full"
                        style={{
                          width: `${maxAmount ? (amount / maxAmount) * 100 : 0}%`,
                          background: categoryColor(name),
                        }}
                      />
                    </div>
                  </button>
                ))}
              </div>

              {/* カテゴリー詳細 */}
              {selectedCategory && (
                <div className="mt-4 border-t pt-3">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-bold mb-2">
                    <span>{selectedCategory} の明細</span>
                    <span>合計 {yen(catTotal)}</span>
                    <span className="text-gray-400">{catTx.length}件 / 全体の{data.total ? Math.round((catTotal / data.total) * 100) : 0}%</span>
                    <span className={catTotal - catPrevTotal > 0 ? 'text-orange-500' : 'text-green-600'}>
                      先月比 {catTotal - catPrevTotal > 0 ? '+' : ''}{yen(catTotal - catPrevTotal)}
                    </span>
                  </div>
                  <div className="divide-y">
                    {visibleCatTx.map((t) => (
                      <div key={t.id} className="py-1.5 flex justify-between text-sm">
                        <span>
                          <span className="text-gray-500 mr-2">{t.date}</span>
                          {t.store_memo || '（メモなし）'}
                          <span className="text-xs text-gray-400 ml-1">
                            {t.payment_method === 'cash' ? `現金・${t.payer || ''}` : '家族カード'}
                          </span>
                        </span>
                        <span className="font-medium shrink-0 ml-2">{yen(t.amount)}</span>
                      </div>
                    ))}
                    {catTx.length === 0 && <p className="text-sm text-gray-400">明細がありません</p>}
                  </div>
                  {!showAllCatDetail && catTx.length > CAT_DETAIL_LIMIT && (
                    <button onClick={() => setShowAllCatDetail(true)} className="w-full mt-2 border rounded-full py-2 text-sm font-bold text-sleep-blue">
                      あと{catTx.length - CAT_DETAIL_LIMIT}件を表示
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 金額だけクイックメモ */}
          <div>
            <span className="ribbon">クイックメモ</span>
            <div className="bg-white rounded-3xl p-4 shadow-sm mt-3">
              <form onSubmit={addMemo} className="flex gap-2">
                <input
                  type="number"
                  value={memoAmount}
                  onChange={(e) => setMemoAmount(e.target.value)}
                  placeholder="金額だけ先に入れる"
                  className={`${inputCls} flex-1`}
                />
                <input
                  value={memoText}
                  onChange={(e) => setMemoText(e.target.value)}
                  placeholder="メモ（任意）"
                  className={`${inputCls} flex-1`}
                />
                <button className="bg-sleep-greendeep text-white rounded-full px-4 font-bold shrink-0">追加</button>
              </form>
              <div className="divide-y mt-2">
                {visibleMemos.map((memo) => (
                  <div key={memo.id} className="py-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold">
                        {yen(memo.amount)}
                        <span className="text-sm text-gray-400 font-normal ml-2">{memo.memo || ''}</span>
                      </span>
                      <span className="shrink-0">
                        <button onClick={() => startConvert(memo)} className="text-xs font-bold text-sleep-blue mr-3">明細にする</button>
                        <button onClick={() => deleteMemo(memo.id)} className="text-xs text-red-500">削除</button>
                      </span>
                    </div>
                    {convertingId === memo.id && convertForm && (
                      <div className="mt-2 bg-sky-50 rounded-2xl p-3 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <input type="date" value={convertForm.date} onChange={(e) => setConvertForm({ ...convertForm, date: e.target.value })} className={`${inputCls} w-full`} />
                          <select value={convertForm.category} onChange={(e) => setConvertForm({ ...convertForm, category: e.target.value })} className={`${inputCls} w-full`}>
                            {categoryList.map((c) => (
                              <option key={c.id} value={c.name}>{c.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <input value={convertForm.store_memo} onChange={(e) => setConvertForm({ ...convertForm, store_memo: e.target.value })} placeholder="店名・メモ" className={`${inputCls} w-full`} />
                          <select value={convertForm.payment_method} onChange={(e) => setConvertForm({ ...convertForm, payment_method: e.target.value })} className={`${inputCls} w-full`}>
                            <option value="card">家族カード</option>
                            <option value="cash">現金</option>
                          </select>
                        </div>
                        {convertForm.payment_method === 'cash' && (
                          <select value={convertForm.payer} onChange={(e) => setConvertForm({ ...convertForm, payer: e.target.value })} className={`${inputCls} w-full`}>
                            <option value="">支払者を選択</option>
                            {members.map((m) => (
                              <option key={m.id} value={m.name}>{m.name}</option>
                            ))}
                          </select>
                        )}
                        <button onClick={() => doConvert(memo)} className="w-full bg-gradient-to-r from-sleep-blue to-sleep-sky text-white rounded-full py-2 font-extrabold">
                          この内容で明細にする
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {memos.length === 0 && <p className="text-sm text-gray-400 pt-2">金額だけ放り込める受け箱です。分類は後回しでOK。</p>}
              </div>
              {!showAllMemos && memos.length > MEMO_LIMIT && (
                <button onClick={() => setShowAllMemos(true)} className="w-full mt-2 border rounded-full py-2 text-sm font-bold text-sleep-blue">
                  あと{memos.length - MEMO_LIMIT}件を表示
                </button>
              )}
            </div>
          </div>

          {/* 月末の突合チェック */}
          {reconciliation && reconciliation.notifiedCount > 0 && (
            <div>
              <span className="ribbon">突合チェック</span>
              <div className="bg-white rounded-3xl p-4 shadow-sm mt-3 text-sm">
                <div className="space-y-1">
                  <div className="flex justify-between"><span>カード利用通知の合計（{reconciliation.notifiedCount}件）</span><span className="font-bold">{yen(reconciliation.notifiedTotal)}</span></div>
                  <div className="flex justify-between"><span>記入済みの家族カード明細（{reconciliation.recordedCardCount}件）</span><span className="font-bold">{yen(reconciliation.recordedCardTotal)}</span></div>
                  <div className="flex justify-between"><span>差額</span><span className="font-bold">{reconciliation.difference > 0 ? '+' : ''}{yen(reconciliation.difference)}</span></div>
                  <div className="flex justify-between"><span>未記入分</span><span className="font-bold text-orange-500">{reconciliation.pendingCount}件 / {yen(reconciliation.pendingTotal)}</span></div>
                </div>
                <p className={`mt-2 font-bold ${reconciliation.explained && reconciliation.pendingCount === 0 ? 'text-green-600' : 'text-gray-500'}`}>
                  {reconciliation.pendingCount > 0
                    ? '未記入分を確定すると、差額が説明できるようになります。'
                    : reconciliation.explained
                      ? '差額は候補で説明できています。漏れはなさそうです。'
                      : '通知にない記入（手入力分など）があるため差額が残っています。'}
                </p>
              </div>
            </div>
          )}

          {/* 各種メニュー風リンク */}
          <div>
            <span className="ribbon">各種メニュー</span>
            <div className="grid grid-cols-2 gap-3 mt-3">
              {[
                { href: '/transactions', label: '明細を追加', color: '#ff6b57' },
                { href: '/candidates', label: '未記入候補を見る', color: '#f06292' },
                { href: '/cash', label: '現金を見る', color: '#12b76a' },
                { href: '/reimbursements', label: '建て替え精算', color: '#ffa726' },
                { href: '/prices', label: '価格の推移', color: '#26c6da' },
                { href: '/insights', label: '気づく・月次レポート', color: '#ffca28' },
              ].map((m) => (
                <Link
                  key={m.href}
                  href={m.href}
                  className="bg-white rounded-3xl border-2 p-4 font-extrabold text-center shadow-sm"
                  style={{ borderColor: m.color, color: m.color }}
                >
                  {m.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
