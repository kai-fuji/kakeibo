// pages/cash.js - 現金（支払者別の台帳形式・精算対象）
import { useEffect, useState } from 'react'
import Layout, { api, yen, currentMonth, shiftMonth, categoryColor } from '../components/Layout'
import EmptyState from '../components/EmptyState'

const SECTION_LIMIT = 30
const WD = ['日', '月', '火', '水', '木', '金', '土']

export default function CashPage() {
  const [month, setMonth] = useState(currentMonth())
  const [data, setData] = useState(null)
  const [allData, setAllData] = useState(null)
  const [openId, setOpenId] = useState(null)
  const [showAllFor, setShowAllFor] = useState({})

  useEffect(() => {
    api(`/api/cash?month=${month}`).then(setData).catch(() => setData(null))
    setOpenId(null)
    setShowAllFor({})
  }, [month])

  useEffect(() => {
    api('/api/cash?scope=all').then(setAllData).catch(() => setAllData(null))
  }, [])

  // 支払者ごとのセクション（合計の大きい順）
  const sections = (() => {
    if (!data) return []
    const byPayer = {}
    for (const r of data.transactions) {
      const payer = r.payer || '（支払者なし）'
      if (!byPayer[payer]) byPayer[payer] = { payer, rows: [], total: 0 }
      byPayer[payer].rows.push(r)
      byPayer[payer].total += r.amount
    }
    return Object.values(byPayer).sort((a, b) => b.total - a.total)
  })()

  return (
    <Layout title="現金">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setMonth(shiftMonth(month, -1))} className="px-3 py-2 bg-white rounded-xl border">← 前月</button>
        <span className="font-bold">{month.replace('-', '年')}月</span>
        <button onClick={() => setMonth(shiftMonth(month, 1))} className="px-3 py-2 bg-white rounded-xl border">翌月 →</button>
      </div>

      {allData && (
        <div className="bg-gradient-to-r from-sleep-blue to-sleep-sky text-white rounded-2xl p-5 shadow-sm mb-4">
          <div className="text-sm font-bold text-white/85">現金の総合計（全期間・精算用）</div>
          <div className="text-3xl font-extrabold mt-0.5">{yen(allData.total)}</div>
          <div className="text-xs text-white/80 mt-0.5">{allData.count}件</div>
          <div className="mt-3 space-y-1">
            {Object.entries(allData.byPayer).sort((a, b) => b[1] - a[1]).map(([payer, amount]) => (
              <div key={payer} className="flex justify-between text-sm font-bold">
                <span>{payer}</span>
                <span>{yen(amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data && (
        <>
          <div className="bg-white rounded-2xl px-4 py-3 shadow-sm mb-3 flex items-baseline justify-between">
            <span className="text-sm text-gray-500">この月の現金支出（月次集計にも含まれています）</span>
            <span className="text-xl font-extrabold">{yen(data.total)}</span>
          </div>

          {sections.length === 0 && (
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <EmptyState text="この月の現金支出はありません" />
            </div>
          )}

          {sections.map((sec) => {
            const visible = showAllFor[sec.payer] ? sec.rows : sec.rows.slice(0, SECTION_LIMIT)
            return (
              <div key={sec.payer} className="bg-white rounded-2xl px-4 py-3 shadow-sm mb-3">
                <div className="flex items-baseline justify-between gap-2 border-b-2 border-sky-100 pb-1.5">
                  <span className="font-extrabold">{sec.payer}</span>
                  <span className="text-sm font-bold">
                    {yen(sec.total)}
                    <span className="block text-[11px] font-medium text-gray-400 text-right">{sec.rows.length}件</span>
                  </span>
                </div>
                <div className="divide-y divide-gray-100">
                  {visible.map((r) => {
                    const open = openId === r.id
                    return (
                      <div key={r.id}>
                        <button
                          onClick={() => setOpenId(open ? null : r.id)}
                          aria-expanded={open}
                          className="w-full flex items-center gap-2 py-1 text-sm text-left"
                        >
                          <span className="text-gray-500 shrink-0 w-[4.2rem]">{r.date.slice(5).replace('-', '/')}</span>
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
                            <p className="text-[11px] text-gray-400 pt-1">内容の修正は「明細」タブからできます</p>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                {!showAllFor[sec.payer] && sec.rows.length > SECTION_LIMIT && (
                  <button
                    onClick={() => setShowAllFor({ ...showAllFor, [sec.payer]: true })}
                    className="w-full pt-2 text-sm font-bold text-sleep-blue"
                  >
                    あと{sec.rows.length - SECTION_LIMIT}件を表示
                  </button>
                )}
              </div>
            )
          })}
        </>
      )}
    </Layout>
  )
}
