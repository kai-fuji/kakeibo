// pages/cash.js - 現金（支払者別）
import { useEffect, useState } from 'react'
import Layout, { api, yen, currentMonth, shiftMonth, categoryColor } from '../components/Layout'
import EmptyState from '../components/EmptyState'

const CASH_LIMIT = 30

export default function CashPage() {
  const [month, setMonth] = useState(currentMonth())
  const [data, setData] = useState(null)
  const [allData, setAllData] = useState(null)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    api(`/api/cash?month=${month}`).then(setData).catch(() => setData(null))
    setShowAll(false)
  }, [month])

  useEffect(() => {
    api('/api/cash?scope=all').then(setAllData).catch(() => setAllData(null))
  }, [])

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
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <div className="text-sm text-gray-500">現金支出の合計（月次集計にも含まれています）</div>
            <div className="text-2xl font-bold">{yen(data.total)}</div>
            <div className="mt-3 space-y-1">
              {Object.entries(data.byPayer).map(([payer, amount]) => (
                <div key={payer} className="flex justify-between text-sm">
                  <span>{payer}</span>
                  <span className="font-medium">{yen(amount)}</span>
                </div>
              ))}
              {Object.keys(data.byPayer).length === 0 && (
                <EmptyState text="この月の現金支出はありません" />
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm divide-y">
            {(showAll ? data.transactions : data.transactions.slice(0, CASH_LIMIT)).map((r) => (
              <div key={r.id} className="py-2 flex justify-between">
                <div>
                  <span className="text-sm text-gray-500 mr-2">{r.date}</span>
                  <span
                    className="inline-block text-xs rounded-full px-2 py-0.5 mr-2 font-bold text-white"
                    style={{ background: categoryColor(r.category) }}
                  >{r.category}</span>
                  <span>{r.store_memo || ''}</span>
                  <span className="text-xs text-gray-400 ml-2">{r.payer || ''}</span>
                </div>
                <span className="font-medium">{yen(r.amount)}</span>
              </div>
            ))}
            {!showAll && data.transactions.length > CASH_LIMIT && (
              <button onClick={() => setShowAll(true)} className="w-full pt-3 text-sm font-bold text-sleep-blue">
                あと{data.transactions.length - CASH_LIMIT}件を表示
              </button>
            )}
          </div>
        </div>
      )}
    </Layout>
  )
}
