// pages/insights.js - 気づく（横断検索・異常検知・サブスク・医療費・月次レポート）
// すべて既存の明細・候補・品目データからの自動計算で、手入力は増えない
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Layout, { api, yen, currentMonth, shiftMonth, categoryColor } from '../components/Layout'
import EmptyState from '../components/EmptyState'
import { useCharacter } from '../lib/characters'

function monthlyComment(report) {
  if (!report || report.txCount === 0) return '今月はまだ記録がありません。候補タブの未記入もチェックしてみてください。'
  const parts = []
  if (report.diff > 0) parts.push(`先月より ${yen(report.diff)} 増えています`)
  else if (report.diff < 0) parts.push(`先月より ${yen(-report.diff)} 減らせました`)
  else parts.push('先月とほぼ同じペースです')
  if (report.topCategoryName) parts.push(`一番大きいのは${report.topCategoryName}（${yen(report.topCategoryAmount)}）`)
  if (report.pendingCount > 0) parts.push(`未記入の候補が${report.pendingCount}件（${yen(report.pendingTotal)}）残っています`)
  return parts.join('。') + '。'
}

export default function InsightsPage() {
  const char = useCharacter()
  const [month, setMonth] = useState(currentMonth())
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [searchResult, setSearchResult] = useState(null)
  const [searching, setSearching] = useState(false)

  const year = Number(month.slice(0, 4))

  useEffect(() => {
    api(`/api/insights?month=${month}&year=${year}`).then(setData).catch((e) => setError(e.message))
  }, [month, year])

  const doSearch = async (e) => {
    e.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    try {
      setSearchResult(await api(`/api/search?q=${encodeURIComponent(query.trim())}`))
    } catch (err) {
      setError(err.message)
    }
    setSearching(false)
  }

  const report = data?.monthlyReport
  const medical = data?.medical

  return (
    <Layout title="気づく">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setMonth(shiftMonth(month, -1))} className="px-3 py-2 bg-white rounded-xl border">← 前月</button>
        <span className="font-bold">{month.replace('-', '年')}月</span>
        <button onClick={() => setMonth(shiftMonth(month, 1))} className="px-3 py-2 bg-white rounded-xl border">翌月 →</button>
      </div>

      {error && <p className="text-red-500 mb-3">{error}</p>}

      <div className="space-y-5">
        {/* 横断検索 */}
        <div>
          <span className="ribbon">横断検索</span>
          <div className="bg-white rounded-3xl p-4 shadow-sm mt-3">
            <form onSubmit={doSearch} className="flex gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="店名・品目・メモで探す（例: タイヤ）"
                className="flex-1 min-w-0 border rounded-xl px-3 py-2 bg-white"
              />
              <button className="bg-sleep-blue text-white rounded-full px-5 font-bold" disabled={searching}>
                検索
              </button>
            </form>
            {searchResult && (
              <div className="mt-3 space-y-3">
                <div>
                  <div className="text-xs font-bold text-gray-400 mb-1">明細 {searchResult.transactions.length}件</div>
                  {searchResult.transactions.length === 0 && <p className="text-sm text-gray-400">見つかりませんでした</p>}
                  <div className="divide-y">
                    {searchResult.transactions.map((t) => (
                      <div key={t.id} className="py-1.5 flex justify-between text-sm">
                        <span className="min-w-0">
                          <span className="text-gray-500 mr-2">{t.date}</span>
                          <span
                            className="inline-block text-xs rounded-full px-2 py-0.5 mr-2 font-bold text-white"
                            style={{ background: categoryColor(t.category) }}
                          >{t.category}</span>
                          {t.store_memo || ''}
                          {t.items?.length > 0 && (
                            <span className="text-xs text-gray-400 ml-1">
                              {t.items.map((i) => i.item_name).join(' / ')}
                            </span>
                          )}
                        </span>
                        <span className="font-medium shrink-0 ml-2">{yen(t.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {searchResult.candidates.length > 0 && (
                  <div>
                    <div className="text-xs font-bold text-gray-400 mb-1">候補 {searchResult.candidates.length}件</div>
                    <div className="divide-y">
                      {searchResult.candidates.map((c) => (
                        <div key={c.id} className="py-1.5 flex justify-between text-sm">
                          <span className="min-w-0">
                            <span className="text-gray-500 mr-2">{c.date}</span>
                            {c.store || c.note || ''}
                            <span className="text-xs text-gray-400 ml-1">
                              {c.status === 'pending' ? '未記入' : c.status === 'confirmed' ? '確定済み' : '却下'}
                            </span>
                          </span>
                          <span className="font-medium shrink-0 ml-2">{yen(c.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {searchResult.reimbursements.length > 0 && (
                  <div>
                    <div className="text-xs font-bold text-gray-400 mb-1">建て替え {searchResult.reimbursements.length}件</div>
                    <div className="divide-y">
                      {searchResult.reimbursements.map((r) => (
                        <div key={r.id} className="py-1.5 flex justify-between text-sm">
                          <span className="min-w-0">
                            <span className="text-gray-500 mr-2">{r.date}</span>
                            {r.member} {r.detail || ''}
                          </span>
                          <span className="font-medium shrink-0 ml-2">{yen(r.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 異常検知 */}
        <div>
          <span className="ribbon">異常検知</span>
          <div className="bg-white rounded-3xl p-4 shadow-sm mt-3">
            {!data && <p className="text-gray-400 text-sm">読み込み中…</p>}
            {data && data.anomalies.length === 0 && <EmptyState text="気になる支出は見つかりませんでした" />}
            <div className="space-y-3">
              {data?.anomalies.map((a) => (
                <div
                  key={a.id}
                  className={`rounded-2xl p-3 border-2 ${a.severity === 'high' ? 'border-red-300 bg-red-50' : 'border-orange-200 bg-orange-50'}`}
                >
                  <div className="font-bold text-sm">
                    {a.title}
                    <span className="ml-2 font-extrabold">{yen(a.amount)}</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">{a.detail}</p>
                  <Link href="/candidates" className="text-xs font-bold text-sleep-blue">
                    候補タブで確認する →
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* サブスク・固定の自動リスト */}
        <div>
          <span className="ribbon">くり返しの支出</span>
          <div className="bg-white rounded-3xl p-4 shadow-sm mt-3">
            <p className="text-xs text-gray-400 mb-2">同じお店で2か月以上くり返している支出を自動で拾っています。サブスクや固定費の棚卸しに。</p>
            {data && data.subscriptions.length === 0 && <EmptyState text="くり返しの支出はまだ検出されていません" />}
            <div className="divide-y">
              {data?.subscriptions.map((s) => (
                <div key={s.storeKey} className="py-2 flex justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <span className="font-bold">{s.store}</span>
                    <span
                      className="inline-block text-xs rounded-full px-2 py-0.5 ml-2 font-bold text-white"
                      style={{ background: categoryColor(s.category) }}
                    >{s.category}</span>
                    {s.isFixedCategory && <span className="text-xs text-gray-400 ml-1">固定</span>}
                    <div className="text-xs text-gray-400">
                      {s.monthsCount}か月・{s.count}回 / 最終 {s.lastDate}
                      {s.priceChanged && (
                        <span className={s.priceDiff > 0 ? 'text-red-500 font-bold' : 'text-green-600 font-bold'}>
                          {' '}金額が変化 {s.priceDiff > 0 ? '+' : ''}{yen(s.priceDiff)}（{yen(s.firstAmount)}→{yen(s.latestAmount)}）
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs text-gray-400">平均</div>
                    <div className="font-extrabold">{yen(s.avgAmount)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 医療費の年間集計 */}
        <div>
          <span className="ribbon">医療費（{year}年）</span>
          <div className="bg-white rounded-3xl p-4 shadow-sm mt-3">
            {medical && (
              <div>
                <div className="flex justify-between items-end">
                  <div>
                    <div className="text-sm text-gray-500">年間の医療費合計（{medical.count}件）</div>
                    <div className="text-2xl font-extrabold">{yen(medical.total)}</div>
                  </div>
                  <div className="text-right text-sm">
                    <div className="text-gray-400">医療費控除の目安 {yen(medical.threshold)} まで</div>
                    <div className="font-bold">あと {yen(medical.remaining)}</div>
                  </div>
                </div>
                <div className="h-3 bg-sky-50 rounded-full mt-3">
                  <div
                    className="h-3 rounded-full"
                    style={{ width: `${medical.progressPercent}%`, background: '#f06292' }}
                  />
                </div>
                <div className="text-xs text-gray-400 mt-1">{medical.progressPercent}%（目安は一般的な10万円です。実際の控除には条件があります）</div>
                {medical.recent.length > 0 && (
                  <div className="mt-3 divide-y">
                    {medical.recent.map((r) => (
                      <div key={r.id} className="py-1.5 flex justify-between text-sm">
                        <span className="min-w-0"><span className="text-gray-500 mr-2">{r.date}</span>{r.memo || ''}</span>
                        <span className="font-medium">{yen(r.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 月次レポート */}
        <div>
          <span className="ribbon">月次レポート</span>
          <div className="bg-white rounded-3xl p-4 shadow-sm mt-3">
            {report && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={char.src} alt={char.name} className="w-12 h-12 rounded-full border-[3px] border-yellow-200 object-cover bg-white shadow-sm" />
                  <p className="text-sm font-bold flex-1 min-w-0">{monthlyComment(report)}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="bg-sky-50 rounded-2xl p-3 min-w-0">
                    <div className="text-xs text-gray-400">今月の合計</div>
                    <div className="font-extrabold text-lg">{yen(report.total)}</div>
                    <div className="text-xs">
                      先月 {yen(report.prevTotal)}（{report.diff > 0 ? '+' : ''}{yen(report.diff)} / {report.diffPercent}%）
                    </div>
                  </div>
                  <div className="bg-sky-50 rounded-2xl p-3 min-w-0">
                    <div className="text-xs text-gray-400">内訳</div>
                    <div className="font-bold">カード {yen(report.cardTotal)}</div>
                    <div className="font-bold">現金 {yen(report.cashTotal)}</div>
                    <div className="text-xs">{report.txCount}件 / 記録日 {report.activeDays}日 / 1日平均 {yen(report.avgPerDay)}</div>
                  </div>
                  <div className="bg-sky-50 rounded-2xl p-3 min-w-0">
                    <div className="text-xs text-gray-400">一番大きかった支出</div>
                    <div className="font-extrabold">{report.largestTxAmount ? yen(report.largestTxAmount) : '-'}</div>
                    <div className="text-xs">{report.largestTxDate || ''} {report.largestTxCategory || ''} {report.largestTxMemo || ''}</div>
                  </div>
                  <div className="bg-sky-50 rounded-2xl p-3 min-w-0">
                    <div className="text-xs text-gray-400">先月から一番変わったカテゴリー</div>
                    <div className="text-sm font-bold">
                      増: {report.biggestIncreaseName || '-'}（{report.biggestIncreaseDiff > 0 ? '+' : ''}{yen(report.biggestIncreaseDiff)}）
                    </div>
                    <div className="text-sm font-bold">
                      減: {report.biggestDecreaseName || '-'}（{report.biggestDecreaseDiff > 0 ? '+' : ''}{yen(report.biggestDecreaseDiff)}）
                    </div>
                    {report.pendingCount > 0 && (
                      <div className="text-xs text-orange-500 font-bold mt-1">
                        未記入の候補 {report.pendingCount}件 / {yen(report.pendingTotal)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
