// pages/prices.js - 商品の価格推移（価格アラート・店別比較つき）
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Layout, { api, yen, currentMonth } from '../components/Layout'
import EmptyState from '../components/EmptyState'

const ITEM_LIMIT = 15
const HISTORY_LIMIT = 10

export default function PricesPage() {
  const router = useRouter()
  const [items, setItems] = useState([])
  const [selected, setSelected] = useState(null)
  const [history, setHistory] = useState([])
  const [insights, setInsights] = useState(null)
  const [showAllItems, setShowAllItems] = useState(false)
  const [showAllHistory, setShowAllHistory] = useState(false)

  useEffect(() => {
    api('/api/items').then(setItems).catch(() => {})
    const month = currentMonth()
    api(`/api/insights?month=${month}&year=${month.slice(0, 4)}`).then(setInsights).catch(() => {})
  }, [])

  const select = (item) => {
    setSelected(item)
    setShowAllHistory(false)
    api(`/api/items?item_id=${item.id}`).then((d) => setHistory(d.history || [])).catch(() => setHistory([]))
  }

  // 明細の品目タップから来た場合（/prices?item_id=○○）
  useEffect(() => {
    if (!router.isReady || items.length === 0) return
    const itemId = Number(router.query.item_id)
    if (itemId && (!selected || selected.id !== itemId)) {
      const item = items.find((i) => i.id === itemId)
      if (item) select(item)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.item_id, items])

  const prices = history.filter((h) => h.unit_price !== null && h.unit_price !== undefined)
  const min = prices.length ? Math.min(...prices.map((h) => h.unit_price)) : 0
  const max = prices.length ? Math.max(...prices.map((h) => h.unit_price)) : 0

  const alertByItem = {}
  ;(insights?.priceAlerts || []).forEach((a) => { alertByItem[a.itemId] = a })
  const lowAlerts = (insights?.priceAlerts || []).filter((a) => a.isLowestNow || a.isNearLowest)
  const comparison = selected
    ? (insights?.storeComparisons || []).find((c) => c.itemId === selected.id)
    : null

  const visibleItems = showAllItems ? items : items.slice(0, ITEM_LIMIT)
  const visiblePrices = showAllHistory ? prices : prices.slice(-HISTORY_LIMIT)

  return (
    <Layout title="価格推移">
      <div className="space-y-4">
        {/* 価格アラート（過去最安値圏） */}
        {lowAlerts.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border-2 border-sleep-greendeep">
            <h2 className="font-bold mb-2 text-sleep-greendeep">価格アラート：今が買い時かも</h2>
            <div className="space-y-1.5">
              {lowAlerts.map((a) => (
                <button
                  key={a.itemId}
                  onClick={() => {
                    const item = items.find((i) => i.id === a.itemId)
                    if (item) select(item)
                  }}
                  className="w-full text-left flex justify-between text-sm"
                >
                  <span>
                    <span className="font-bold">{a.itemName}</span>
                    <span className="text-xs text-gray-400 ml-2">
                      {a.isLowestNow ? '過去最安値' : '最安値圏'} / 最安 {yen(a.minPrice)}（{a.minStore}）
                    </span>
                  </span>
                  <span className="font-extrabold text-sleep-greendeep shrink-0 ml-2">最新 {yen(a.latestPrice)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="font-bold mb-2">商品一覧</h2>
          {items.length === 0 && (
            <EmptyState text="まだ品目が登録されていません。明細の追加時に「品目明細」を入れると、ここに溜まっていきます。" />
          )}
          <div className="divide-y">
            {visibleItems.map((item) => {
              const alert = alertByItem[item.id]
              return (
                <button
                  key={item.id}
                  onClick={() => select(item)}
                  className={`w-full text-left py-2 flex justify-between ${selected?.id === item.id ? 'text-blue-600 font-bold' : ''}`}
                >
                  <span>
                    {item.name}
                    {alert && alert.isLowestNow && (
                      <span className="text-[10px] font-extrabold bg-sleep-greendeep text-white rounded-full px-2 py-0.5 ml-2">最安値</span>
                    )}
                    {alert && !alert.isLowestNow && alert.isNearLowest && (
                      <span className="text-[10px] font-extrabold bg-sleep-green text-white rounded-full px-2 py-0.5 ml-2">最安値圏</span>
                    )}
                  </span>
                  <span className="text-sm text-gray-500">
                    {item.record_count}回 / 最新 {item.latest_price ? yen(item.latest_price) : '-'}（{item.latest_date || ''}）
                  </span>
                </button>
              )
            })}
          </div>
          {!showAllItems && items.length > ITEM_LIMIT && (
            <button onClick={() => setShowAllItems(true)} className="w-full mt-2 border rounded-full py-2 text-sm font-bold text-sleep-blue">
              あと{items.length - ITEM_LIMIT}品目を表示
            </button>
          )}
        </div>

        {selected && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <h2 className="font-bold mb-1">{selected.name} の価格推移</h2>
            <p className="text-xs text-gray-400 mb-3">最安 {yen(min)} 〜 最高 {yen(max)}</p>
            <div className="space-y-2">
              {visiblePrices.map((h) => (
                <div key={h.id} className="flex items-center gap-2 text-sm">
                  <span className="w-24 text-gray-500">{h.date}</span>
                  <div className="flex-1 h-3 bg-gray-100 rounded">
                    <div
                      className="h-3 bg-green-500 rounded"
                      style={{ width: `${max ? (h.unit_price / max) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="w-20 text-right font-medium">{yen(h.unit_price)}</span>
                  <span className="w-24 text-gray-400 truncate">{h.store || ''}</span>
                </div>
              ))}
              {prices.length === 0 && <EmptyState text="単価の記録がありません" />}
            </div>
            {!showAllHistory && prices.length > HISTORY_LIMIT && (
              <button onClick={() => setShowAllHistory(true)} className="w-full mt-2 border rounded-full py-2 text-sm font-bold text-sleep-blue">
                あと{prices.length - HISTORY_LIMIT}件の記録を表示
              </button>
            )}

            {/* 店別比較 */}
            {comparison && (
              <div className="mt-4 border-t pt-3">
                <h3 className="font-bold text-sm mb-2">お店ごとの比較（平均単価）</h3>
                <div className="space-y-1.5">
                  {comparison.stores.map((s) => (
                    <div key={s.store} className="flex justify-between text-sm">
                      <span>
                        {s.store}
                        {s.store === comparison.cheapestStore && (
                          <span className="text-[10px] font-extrabold bg-sleep-greendeep text-white rounded-full px-2 py-0.5 ml-2">一番安い</span>
                        )}
                        <span className="text-xs text-gray-400 ml-2">{s.count}回 / 最安 {yen(s.minPrice)}</span>
                      </span>
                      <span className="font-bold">平均 {yen(s.avgPrice)}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  {comparison.cheapestStore} の方が平均で {yen(comparison.diffAvg)} 安いです。
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  )
}
