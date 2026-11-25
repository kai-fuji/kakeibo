import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'

const NAV = [
  { href: '/', label: '集計', color: '#1c9dff' },
  { href: '/transactions', label: '明細', color: '#ff6b57' },
  { href: '/candidates', label: '候補', color: '#f06292' },
  { href: '/cash', label: '現金', color: '#12b76a' },
  { href: '/reimbursements', label: '建て替え', color: '#ffa726' },
  { href: '/prices', label: '価格', color: '#26c6da' },
  { href: '/insights', label: '気づく', color: '#ffca28' },
  { href: '/settings', label: '設定', color: '#ab7be8' },
]

// カテゴリーごとの色（ポケモンスリープのメニューカード風にカラフルに）
const CATEGORY_COLORS = {
  食費: '#12b76a',
  外食費: '#ff6b57',
  日用品費: '#26c6da',
  医療費: '#f06292',
  美容費: '#ab7be8',
  交通費: '#1c9dff',
  ガソリン代: '#ffa726',
  ゴルフ費: '#1ed760',
  お買い物: '#ffca28',
  車関係: '#78909c',
  旅行: '#4fc3f7',
}

export function categoryColor(name) {
  return CATEGORY_COLORS[name] || '#90a4ae'
}

export function yen(n) {
  return `¥${Number(n || 0).toLocaleString()}`
}

export function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function shiftMonth(month, diff) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + diff, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export async function api(path, options) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (res.status === 401) {
    window.location.href = '/login'
    throw new Error('認証が必要です')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `エラー (${res.status})`)
  }
  return res.json()
}

export default function Layout({ children, title }) {
  const router = useRouter()
  const [pendingCount, setPendingCount] = useState(0)

  // 候補タブの未記入件数バッジ
  useEffect(() => {
    fetch('/api/candidates?status=pending')
      .then((res) => (res.ok ? res.json() : []))
      .then((rows) => setPendingCount(Array.isArray(rows) ? rows.length : 0))
      .catch(() => {})
  }, [router.pathname])

  return (
    <div className="min-h-screen pb-24">
      <header className="sticky top-0 z-10 bg-gradient-to-r from-sleep-deep via-sleep-blue to-sleep-sky text-white shadow">
        <div className="max-w-3xl mx-auto px-4 py-2.5 flex items-center justify-between">
          <h1 className="font-extrabold text-lg tracking-wide flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mickey-accountant.png" alt="ミッキー" className="w-10 h-10 rounded-full border-2 border-white object-cover bg-white" />
            家計簿
          </h1>
          {title && <span className="text-sm text-white/85 font-bold">{title}</span>}
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-4">{children}</main>
      <nav className="fixed bottom-0 inset-x-0 bg-white border-t-2 border-sleep-cyan/50 z-10">
        <div className="max-w-3xl mx-auto grid grid-cols-8">
          {NAV.map((item) => {
            const active = router.pathname === item.href
            const showBadge = item.href === '/candidates' && pendingCount > 0
            return (
              <Link
                key={item.href}
                href={item.href}
                className="relative text-center py-3 text-[11px] font-bold"
                style={{ color: active ? item.color : '#9db2c8' }}
              >
                <span
                  className="inline-block w-2 h-2 rounded-full mr-0.5 align-middle"
                  style={{ background: active ? item.color : 'transparent' }}
                />
                {item.label}
                {showBadge && (
                  <span className="absolute top-1 right-1/2 translate-x-5 bg-red-500 text-white text-[9px] font-extrabold rounded-full min-w-[16px] h-4 px-0.5 leading-4">
                    {pendingCount}
                  </span>
                )}
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
