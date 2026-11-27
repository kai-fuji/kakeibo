// pages/more.js - 「その他」：たまに開くページへの入口一覧
import Link from 'next/link'
import Layout, { NavIcon } from '../components/Layout'

const ITEMS = [
  { href: '/reimbursements', label: '建て替え', icon: 'swap', desc: '家族カードの個人利用と立て替えの台帳・年次精算' },
  { href: '/prices', label: '価格', icon: 'tag', desc: '品目ごとの値段の推移' },
  { href: '/insights', label: '気づく', icon: 'bulb', desc: '支出の傾向と気づき' },
  { href: '/settings', label: '設定', icon: 'gear', desc: 'キャラクター・メンバー・カテゴリーの管理' },
]

export default function MorePage() {
  return (
    <Layout title="その他">
      <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-100">
        {ITEMS.map((item) => (
          <Link key={item.href} href={item.href} className="flex items-center gap-3 px-4 py-3.5">
            <span className="text-sleep-blue shrink-0">
              <NavIcon name={item.icon} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block font-bold">{item.label}</span>
              <span className="block text-sm text-gray-400 truncate">{item.desc}</span>
            </span>
            <span className="text-gray-300 shrink-0">›</span>
          </Link>
        ))}
      </div>
    </Layout>
  )
}
