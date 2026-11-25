// pages/settings.js - カテゴリー・メンバー管理とエクスポート
import { useEffect, useState } from 'react'
import Layout, { api } from '../components/Layout'

const GROUP_LABEL = { variable: '変動支出', special: '特別支出', fixed: '固定支出' }

const RULE_LIMIT = 15

export default function SettingsPage() {
  const [categories, setCategories] = useState([])
  const [members, setMembers] = useState([])
  const [newCategory, setNewCategory] = useState('')
  const [newGroup, setNewGroup] = useState('variable')
  const [newMember, setNewMember] = useState('')
  const [rules, setRules] = useState([])
  const [ruleSearch, setRuleSearch] = useState('')
  const [showAllRules, setShowAllRules] = useState(false)

  const load = () => {
    api('/api/categories').then(setCategories).catch(() => {})
    api('/api/members').then(setMembers).catch(() => {})
    api('/api/store-rules').then(setRules).catch(() => {})
  }
  useEffect(load, [])

  const changeRuleCategory = async (rule, category) => {
    await api('/api/store-rules', {
      method: 'PUT',
      body: JSON.stringify({ id: rule.id, category }),
    })
    load()
  }

  const deleteRule = async (rule) => {
    if (!confirm(`「${rule.store}」の学習ルールを削除しますか？（次回その店で登録すると再学習されます）`)) return
    await api(`/api/store-rules?id=${rule.id}`, { method: 'DELETE' })
    load()
  }

  const filteredRules = ruleSearch
    ? rules.filter((r) => r.store.includes(ruleSearch) || r.category.includes(ruleSearch))
    : rules
  const visibleRules = showAllRules || ruleSearch ? filteredRules : filteredRules.slice(0, RULE_LIMIT)

  const addCategory = async (e) => {
    e.preventDefault()
    if (!newCategory.trim()) return
    await api('/api/categories', {
      method: 'POST',
      body: JSON.stringify({ name: newCategory.trim(), grp: newGroup }),
    })
    setNewCategory('')
    load()
  }

  const addMember = async (e) => {
    e.preventDefault()
    if (!newMember.trim()) return
    await api('/api/members', {
      method: 'POST',
      body: JSON.stringify({ name: newMember.trim() }),
    })
    setNewMember('')
    load()
  }

  const logout = async () => {
    await fetch('/api/login', { method: 'DELETE' })
    window.location.href = '/login'
  }

  const inputCls = 'border rounded-xl px-3 py-2 bg-white'

  return (
    <Layout title="設定">
      <div className="space-y-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mickey-office.png" alt="ミッキー" className="w-14 h-14 rounded-full object-cover border-[3px] border-yellow-200 bg-white shadow-sm" />
          <div>
            <div className="font-extrabold">ミッキー</div>
            <div className="text-sm text-gray-400">設定や集計をお手伝いします</div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="font-bold mb-3">メンバー（支払者・建て替え対象者）</h2>
          <div className="flex flex-wrap gap-2 mb-3">
            {members.map((m) => (
              <span key={m.id} className="bg-gray-100 rounded-full px-3 py-1 text-sm">{m.name}</span>
            ))}
            {members.length === 0 && <span className="text-gray-400 text-sm">未登録です。まずメンバーを追加してください</span>}
          </div>
          <form onSubmit={addMember} className="flex gap-2">
            <input value={newMember} onChange={(e) => setNewMember(e.target.value)} placeholder="名前" className={`${inputCls} flex-1`} />
            <button className="bg-sleep-blue text-white rounded-full px-5 font-bold">追加</button>
          </form>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="font-bold mb-3">カテゴリー</h2>
          {Object.keys(GROUP_LABEL).map((grp) => (
            <div key={grp} className="mb-3">
              <div className="text-xs text-gray-400 mb-1">{GROUP_LABEL[grp]}</div>
              <div className="flex flex-wrap gap-2">
                {categories.filter((c) => c.grp === grp).map((c) => (
                  <span key={c.id} className="bg-gray-100 rounded-full px-3 py-1 text-sm">{c.name}</span>
                ))}
              </div>
            </div>
          ))}
          <form onSubmit={addCategory} className="flex gap-2 mt-2">
            <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="新しいカテゴリー" className={`${inputCls} flex-1`} />
            <select value={newGroup} onChange={(e) => setNewGroup(e.target.value)} className={inputCls}>
              {Object.entries(GROUP_LABEL).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <button className="bg-sleep-blue text-white rounded-full px-5 font-bold">追加</button>
          </form>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="font-bold mb-1">店名→カテゴリーの学習ルール</h2>
          <p className="text-xs text-gray-400 mb-3">
            明細や候補を登録・確定するたびに自動で覚えます。店名を入れるとカテゴリーが自動で入るようになります。
          </p>
          <input
            value={ruleSearch}
            onChange={(e) => setRuleSearch(e.target.value)}
            placeholder="ルールを検索（店名・カテゴリー）"
            className={`${inputCls} w-full mb-2`}
          />
          <div className="divide-y">
            {visibleRules.map((r) => (
              <div key={r.id} className="py-2 flex items-center gap-2">
                <span className="flex-1 font-bold text-sm truncate">
                  {r.store}
                  <span className="text-xs text-gray-400 font-normal ml-2">{r.use_count}回</span>
                </span>
                <select
                  value={r.category}
                  onChange={(e) => changeRuleCategory(r, e.target.value)}
                  className="border rounded-xl px-2 py-1.5 bg-white text-sm"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
                <button onClick={() => deleteRule(r)} className="text-xs text-red-500 shrink-0">削除</button>
              </div>
            ))}
            {filteredRules.length === 0 && (
              <p className="text-sm text-gray-400 py-2">ルールはまだありません。明細を登録すると自動で増えていきます。</p>
            )}
          </div>
          {!showAllRules && !ruleSearch && filteredRules.length > RULE_LIMIT && (
            <button onClick={() => setShowAllRules(true)} className="w-full mt-2 border rounded-full py-2 text-sm font-bold text-sleep-blue">
              あと{filteredRules.length - RULE_LIMIT}件を表示
            </button>
          )}
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-2">
          <h2 className="font-bold">データのエクスポート</h2>
          <a href="/api/export" className="block border rounded-xl py-2 text-center">JSONでダウンロード</a>
          <a href="/api/export?format=csv" className="block border rounded-xl py-2 text-center">支出明細をCSVでダウンロード</a>
        </div>

        <button onClick={logout} className="w-full border border-red-300 text-red-500 rounded-xl py-2">
          ログアウト
        </button>
      </div>
    </Layout>
  )
}
