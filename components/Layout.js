import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { useCharacter } from '../lib/characters'

const NAV = [
  { href: '/', label: '集計', icon: 'chart' },
  { href: '/transactions', label: '明細', icon: 'list' },
  { href: '/candidates', label: '候補', icon: 'inbox' },
  { href: '/cash', label: '現金', icon: 'wallet' },
  { href: '/more', label: 'その他', icon: 'more' },
]

// 「その他」にまとめたページ（その他タブのハイライト判定にも使う）
export const MORE_PATHS = ['/more', '/reimbursements', '/prices', '/insights', '/settings']

// ボトムタブバー用の線画アイコン（stroke=currentColor）
export function NavIcon({ name }) {
  const common = {
    width: 24,
    height: 24,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  }
  switch (name) {
    case 'chart':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )
    case 'list':
      return (
        <svg {...common}>
          <path d="M8.5 6h11M8.5 12h11M8.5 18h11" />
          <circle cx="4.8" cy="6" r="0.6" fill="currentColor" />
          <circle cx="4.8" cy="12" r="0.6" fill="currentColor" />
          <circle cx="4.8" cy="18" r="0.6" fill="currentColor" />
        </svg>
      )
    case 'inbox':
      return (
        <svg {...common}>
          <path d="M3.5 13.5 5.8 5.5h12.4l2.3 8" />
          <path d="M3.5 13.5h5l1.7 2.7h3.6l1.7-2.7h5v5h-17z" />
        </svg>
      )
    case 'wallet':
      return (
        <svg {...common}>
          <rect x="3" y="6" width="18" height="13" rx="2.5" />
          <path d="M3 9.5h18" />
          <circle cx="17" cy="14.5" r="1.1" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'swap':
      return (
        <svg {...common}>
          <path d="M4 8.5h13M13.5 4.5 17.5 8.5l-4 4" />
          <path d="M20 15.5H7M10.5 11.5 6.5 15.5l4 4" />
        </svg>
      )
    case 'tag':
      return (
        <svg {...common}>
          <path d="M3.5 3.5h7.6l9.4 9.4-7.6 7.6-9.4-9.4z" />
          <circle cx="8" cy="8" r="1.4" />
        </svg>
      )
    case 'bulb':
      return (
        <svg {...common}>
          <path d="M9.5 18.5h5M10.3 21h3.4" />
          <path d="M12 3.5a5.8 5.8 0 0 1 3.4 10.5c-.7.5-1 1-1.1 2h-4.6c-.1-1-.4-1.5-1.1-2A5.8 5.8 0 0 1 12 3.5z" />
        </svg>
      )
    case 'more':
      return (
        <svg {...common}>
          <rect x="4" y="4" width="7" height="7" rx="2" />
          <rect x="13.5" y="4" width="7" height="7" rx="2" />
          <rect x="4" y="13.5" width="7" height="7" rx="2" />
          <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
        </svg>
      )
    case 'gear':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3.2" />
          <path d="M12 3.5v2.6M12 17.9v2.6M3.5 12h2.6M17.9 12h2.6M6 6l1.8 1.8M16.2 16.2 18 18M18 6l-1.8 1.8M7.8 16.2 6 18" />
        </svg>
      )
    default:
      return null
  }
}

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
  const char = useCharacter()
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
    <div className="min-h-screen pb-28">
      <header className="sticky top-0 z-10 bg-gradient-to-r from-sleep-deep via-sleep-blue to-sleep-sky text-white shadow">
        <div className="max-w-3xl mx-auto px-4 py-2.5 flex items-center justify-between">
          <h1 className="font-extrabold text-lg tracking-wide flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={char.src} alt={char.name} className="w-10 h-10 rounded-full border-2 border-white object-cover bg-white" />
            家計簿
          </h1>
          {title && <span className="text-sm text-white/85 font-bold">{title}</span>}
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-4">{children}</main>
      <nav
        className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur border-t border-gray-200 z-10"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="max-w-3xl mx-auto grid grid-cols-5">
          {NAV.map((item) => {
            const active = item.href === '/more' ? MORE_PATHS.includes(router.pathname) : router.pathname === item.href
            const showBadge = item.href === '/candidates' && pendingCount > 0
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex flex-col items-center gap-0.5 pt-1.5 pb-1 text-[10px] font-bold"
                style={{ color: active ? '#007aff' : '#8e8e93' }}
              >
                <span className="relative">
                  <NavIcon name={item.icon} />
                  {showBadge && (
                    <span className="absolute -top-1 -right-2.5 bg-red-500 text-white text-[9px] font-extrabold rounded-full min-w-[16px] h-4 px-0.5 leading-4 text-center">
                      {pendingCount}
                    </span>
                  )}
                </span>
                {item.label}
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
