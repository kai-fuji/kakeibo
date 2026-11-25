// pages/reimbursements.js - 建て替え台帳と年次精算
import { useEffect, useState } from 'react'
import Layout, { api, yen } from '../components/Layout'
import EmptyState from '../components/EmptyState'

const emptyForm = {
  date: new Date().toISOString().slice(0, 10),
  member: '',
  direction: 'family_to_member',
  amount: '',
  detail: '',
}

const DIRECTION_LABEL = {
  family_to_member: '家族→本人へ返す（本人が立て替えた）',
  member_to_family: '本人→家族へ返す（家族カードで個人の支出）',
}

const LIST_LIMIT = 20

export default function ReimbursementsPage() {
  const thisYear = new Date().getFullYear()
  const [year, setYear] = useState(thisYear)
  const [rows, setRows] = useState([])
  const [settlement, setSettlement] = useState(null)
  const [members, setMembers] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [copyMessage, setCopyMessage] = useState('')

  const load = () => {
    api(`/api/reimbursements?year=${year}`).then(setRows).catch((e) => setError(e.message))
    api(`/api/reimbursements?mode=settlement&year=${year}`).then(setSettlement).catch(() => {})
  }

  useEffect(load, [year])
  useEffect(() => {
    api('/api/members').then(setMembers).catch(() => {})
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await api('/api/reimbursements', {
        method: 'POST',
        body: JSON.stringify({ ...form, amount: Number(form.amount) }),
      })
      setForm({ ...emptyForm, member: form.member })
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  const remove = async (id) => {
    if (!confirm('この建て替え記録を削除しますか？')) return
    await api(`/api/reimbursements?id=${id}`, { method: 'DELETE' })
    load()
  }

  const settleAll = async () => {
    if (!confirm(`${year}年の未精算をすべて精算済みにしますか？（振込が完了してから押してください）`)) return
    for (const r of rows.filter((x) => !x.settled)) {
      await api('/api/reimbursements', {
        method: 'PUT',
        body: JSON.stringify({ id: r.id, settled: true }),
      })
    }
    load()
  }

  // 精算書テキスト（誰が誰へいくら振り込むか＋明細つき）
  const buildStatement = () => {
    if (!settlement) return ''
    const lines = [`家計簿 建て替え精算書（${year}年）`, '']
    for (const m of settlement.members) {
      lines.push(`■ ${m.member}`)
      const memberRows = rows.filter((r) => r.member === m.member)
      for (const r of memberRows) {
        const dir = r.direction === 'family_to_member' ? '家族→本人へ返す' : '本人→家族へ返す'
        lines.push(`  ${r.date} ${dir} ${yen(r.amount)} ${r.detail || ''}${r.settled ? '（精算済み）' : ''}`)
      }
      lines.push(`  立て替え分 合計 ${yen(m.familyOwes)} / 家族カード個人利用分 合計 ${yen(m.memberOwes)}`)
      if (m.net > 0) lines.push(`  ⇒ 家族 → ${m.member} へ ${yen(m.net)} を振り込む`)
      else if (m.net < 0) lines.push(`  ⇒ ${m.member} → 家族 へ ${yen(-m.net)} を振り込む`)
      else lines.push('  ⇒ 差額なし（振込不要）')
      lines.push('')
    }
    return lines.join('\n')
  }

  const copyStatement = async () => {
    try {
      await navigator.clipboard.writeText(buildStatement())
      setCopyMessage('精算書をコピーしました')
    } catch {
      setCopyMessage('コピーできませんでした。下のテキストを長押しで選択してください')
    }
    setTimeout(() => setCopyMessage(''), 3000)
  }

  const saveStatement = () => {
    const blob = new Blob([buildStatement()], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `精算書_${year}年.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const inputCls = 'w-full border rounded-xl px-3 py-2 bg-white'

  return (
    <Layout title="建て替え">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setYear(year - 1)} className="px-3 py-2 bg-white rounded-xl border">← {year - 1}年</button>
        <span className="font-bold">{year}年</span>
        <button onClick={() => setYear(year + 1)} className="px-3 py-2 bg-white rounded-xl border">{year + 1}年 →</button>
      </div>

      {settlement && settlement.members.length > 0 && (
        <div className="bg-white rounded-2xl p-5 shadow-sm mb-4">
          <h2 className="font-bold mb-2">年次精算（差額）</h2>
          <div className="space-y-2">
            {settlement.members.map((m) => (
              <div key={m.member} className="text-sm border-b pb-2">
                <div className="flex justify-between">
                  <span className="font-medium">{m.member}</span>
                  <span className="font-bold">
                    {m.net > 0 && `家族 → ${m.member} へ ${yen(m.net)}`}
                    {m.net < 0 && `${m.member} → 家族 へ ${yen(-m.net)}`}
                    {m.net === 0 && '差額なし'}
                  </span>
                </div>
                <div className="text-gray-400 text-xs">
                  立て替え分 {yen(m.familyOwes)} / 家族カード個人利用分 {yen(m.memberOwes)}
                  {m.unsettledCount > 0 ? ` / 未精算 ${m.unsettledCount}件` : ' / 精算済み'}
                </div>
              </div>
            ))}
          </div>
          <button onClick={settleAll} className="mt-3 w-full bg-gradient-to-r from-sleep-green to-sleep-greendeep text-white rounded-full py-2.5 font-extrabold shadow">
            全て精算済みにする
          </button>
        </div>
      )}

      {settlement && settlement.members.length > 0 && (
        <div className="bg-white rounded-2xl p-5 shadow-sm mb-4">
          <h2 className="font-bold mb-2">精算書（{year}年）</h2>
          <pre className="text-xs bg-sky-50 rounded-xl p-3 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">{buildStatement()}</pre>
          {copyMessage && <p className="text-sm font-bold text-green-600 mt-2">{copyMessage}</p>}
          <div className="flex gap-2 mt-3">
            <button onClick={copyStatement} className="flex-1 border-2 border-sleep-orange text-sleep-orange rounded-full py-2 font-extrabold bg-white">
              コピーする
            </button>
            <button onClick={saveStatement} className="flex-1 bg-gradient-to-r from-sleep-orange to-sleep-yellow text-white rounded-full py-2 font-extrabold shadow">
              ファイルに保存
            </button>
          </div>
        </div>
      )}

      <form onSubmit={submit} className="bg-white rounded-2xl p-4 shadow-sm space-y-3 mb-4">
        <h2 className="font-bold">建て替えを追加</h2>
        <div className="grid grid-cols-2 gap-3">
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inputCls} required />
          <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="金額（円）" className={inputCls} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <select value={form.member} onChange={(e) => setForm({ ...form, member: e.target.value })} className={inputCls} required>
            <option value="">メンバーを選択</option>
            {members.map((m) => (
              <option key={m.id} value={m.name}>{m.name}</option>
            ))}
          </select>
          <select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })} className={inputCls}>
            {Object.entries(DIRECTION_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <input value={form.detail} onChange={(e) => setForm({ ...form, detail: e.target.value })} placeholder="内容・メモ（例: 出張 飛行機代）" className={inputCls} />
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button className="w-full bg-gradient-to-r from-sleep-orange to-sleep-yellow text-white rounded-full py-2.5 font-extrabold shadow">＋ 追加する</button>
      </form>

      <div className="bg-white rounded-2xl p-4 shadow-sm divide-y">
        {rows.length === 0 && <EmptyState text="この年の建て替え記録はありません" />}
        {(showAll ? rows : rows.slice(0, LIST_LIMIT)).map((r) => (
          <div key={r.id} className="py-2 flex items-start justify-between gap-2">
            <div>
              <span className="text-sm text-gray-500 mr-2">{r.date}</span>
              <span className="font-medium">{r.member}</span>
              <span className={`text-xs ml-2 rounded px-2 py-0.5 ${r.direction === 'family_to_member' ? 'bg-orange-50 text-orange-700' : 'bg-purple-50 text-purple-700'}`}>
                {r.direction === 'family_to_member' ? '家族→本人' : '本人→家族'}
              </span>
              {r.settled ? <span className="text-xs text-green-600 ml-2">精算済み</span> : null}
              <div className="text-sm text-gray-600">{r.detail}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="font-medium">{yen(r.amount)}</div>
              <button onClick={() => remove(r.id)} className="text-xs text-red-500">削除</button>
            </div>
          </div>
        ))}
        {!showAll && rows.length > LIST_LIMIT && (
          <button onClick={() => setShowAll(true)} className="w-full pt-3 text-sm font-bold text-sleep-blue">
            あと{rows.length - LIST_LIMIT}件を表示
          </button>
        )}
      </div>
    </Layout>
  )
}
