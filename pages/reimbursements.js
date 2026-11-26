// pages/reimbursements.js - 建て替え台帳（人ごとの台帳形式）と年次精算
import { useEffect, useState } from 'react'
import Layout, { api, yen } from '../components/Layout'
import EmptyState from '../components/EmptyState'

const emptyForm = {
  date: new Date().toISOString().slice(0, 10),
  member: '',
  direction: 'member_to_family',
  amount: '',
  detail: '',
}

// 基本は「個人の買い物を家族カードで支払った」ケース（プラス＝本人が家族口座へ振り込む）
const DIRECTION_LABEL = {
  member_to_family: '本人→家族へ返す（家族カードで個人の支出）',
  family_to_member: '家族→本人へ返す（本人が立て替えた）',
}
const DIRECTION_EXPLAIN = {
  member_to_family: '家族カードで個人の支出 → 本人が家族口座へ振り込む',
  family_to_member: '立て替え・戻し入れ → 家族から本人へ返す',
}

const SECTION_LIMIT = 20
const WD = ['日', '月', '火', '水', '木', '金', '土']

export default function ReimbursementsPage() {
  const thisYear = new Date().getFullYear()
  const [year, setYear] = useState(thisYear)
  const [rows, setRows] = useState([])
  const [settlement, setSettlement] = useState(null)
  const [members, setMembers] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [copyMessage, setCopyMessage] = useState('')
  const [openId, setOpenId] = useState(null)
  const [showAllFor, setShowAllFor] = useState({})
  const [showStatement, setShowStatement] = useState(false)
  const [editingId, setEditingId] = useState(null)

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
      if (editingId) {
        await api('/api/reimbursements', {
          method: 'PUT',
          body: JSON.stringify({ id: editingId, ...form, amount: Number(form.amount) }),
        })
        setEditingId(null)
      } else {
        await api('/api/reimbursements', {
          method: 'POST',
          body: JSON.stringify({ ...form, amount: Number(form.amount) }),
        })
      }
      setForm({ ...emptyForm, member: form.member })
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  const startEdit = (r) => {
    setEditingId(r.id)
    setForm({ date: r.date, member: r.member, direction: r.direction, amount: String(r.amount), detail: r.detail || '' })
    document.getElementById('reimb-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setForm(emptyForm)
  }

  const remove = async (id) => {
    if (!confirm('この建て替え記録を削除しますか？')) return
    await api(`/api/reimbursements?id=${id}`, { method: 'DELETE' })
    load()
  }

  const settleOne = async (id) => {
    await api('/api/reimbursements', { method: 'PUT', body: JSON.stringify({ id, settled: true }) })
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
      setCopyMessage('コピーできませんでした。精算書を表示して長押しで選択してください')
      setShowStatement(true)
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

  // 人ごとのセクション（未精算の差額は未精算分だけで計算。未精算がある人を上に）
  const sections = (() => {
    const byMember = {}
    for (const r of rows) {
      if (!byMember[r.member]) byMember[r.member] = { member: r.member, rows: [], unsettledNet: 0, unsettledCount: 0 }
      byMember[r.member].rows.push(r)
      if (!r.settled) {
        byMember[r.member].unsettledCount += 1
        byMember[r.member].unsettledNet += r.direction === 'member_to_family' ? r.amount : -r.amount
      }
    }
    return Object.values(byMember).sort((a, b) => {
      if ((a.unsettledCount > 0) !== (b.unsettledCount > 0)) return a.unsettledCount > 0 ? -1 : 1
      return b.unsettledNet - a.unsettledNet
    })
  })()

  const inputCls = 'w-full min-w-0 border rounded-xl px-3 py-2 bg-white'

  return (
    <Layout title="建て替え">
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setYear(year - 1)} className="px-3 py-2 bg-white rounded-xl border">← {year - 1}年</button>
        <span className="font-bold">{year}年</span>
        <button onClick={() => setYear(year + 1)} className="px-3 py-2 bg-white rounded-xl border">{year + 1}年 →</button>
      </div>

      {rows.length === 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
          <EmptyState text="この年の建て替え記録はありません" />
        </div>
      )}

      {/* 人ごとの台帳 */}
      {sections.map((sec) => {
        const visible = showAllFor[sec.member] ? sec.rows : sec.rows.slice(0, SECTION_LIMIT)
        return (
          <div key={sec.member} className="bg-white rounded-2xl px-4 py-3 shadow-sm mb-3">
            <div className="flex items-baseline justify-between gap-2 border-b-2 border-sky-100 pb-1.5">
              <span className="font-extrabold">{sec.member}</span>
              <span className="text-sm font-bold text-right">
                {sec.unsettledCount === 0 && <span className="text-green-600">精算済み</span>}
                {sec.unsettledCount > 0 && sec.unsettledNet > 0 && <>→ 家族口座へ {yen(sec.unsettledNet)}</>}
                {sec.unsettledCount > 0 && sec.unsettledNet < 0 && <>家族 → 本人へ {yen(-sec.unsettledNet)}</>}
                {sec.unsettledCount > 0 && sec.unsettledNet === 0 && <>差額なし</>}
                {sec.unsettledCount > 0 && <span className="block text-[11px] font-medium text-gray-400">未精算 {sec.unsettledCount}件</span>}
              </span>
            </div>
            <div className="divide-y divide-gray-100">
              {visible.map((r) => {
                const open = openId === r.id
                const isOffset = r.direction === 'family_to_member'
                return (
                  <div key={r.id} className={r.settled ? 'opacity-50' : ''}>
                    <button
                      onClick={() => setOpenId(open ? null : r.id)}
                      aria-expanded={open}
                      className="w-full flex items-center gap-2 py-1 text-sm text-left"
                    >
                      <span className="text-gray-500 shrink-0 w-[4.2rem]">{r.date.slice(5).replace('-', '/')}</span>
                      <span className="flex-1 min-w-0 truncate">{r.detail || '（内容なし）'}</span>
                      <span className={`text-[10px] rounded px-1.5 py-0.5 shrink-0 ${isOffset ? 'bg-gray-100 text-gray-500' : 'bg-purple-50 text-purple-700'}`}>
                        {isOffset ? '相殺' : '家族カード'}
                      </span>
                      <span className={`font-medium shrink-0 ${isOffset ? 'text-gray-400' : ''}`}>{yen(r.amount)}</span>
                      <span className="text-gray-300 shrink-0 w-3 text-center">{open ? '⌄' : '›'}</span>
                    </button>
                    {r.settled ? <div className="text-[10px] text-green-600 pl-[4.2rem] -mt-0.5">精算済み</div> : null}
                    {open && (
                      <div className="bg-sky-50 rounded-xl px-3 py-2.5 mb-1.5 text-sm space-y-1">
                        <div>
                          <span className="text-gray-400 mr-2">日付</span>
                          {r.date}（{WD[new Date(`${r.date}T00:00:00`).getDay()]}）
                        </div>
                        <div>
                          <span className="text-gray-400 mr-2">内容</span>
                          {r.detail || '（内容なし）'}
                        </div>
                        <div>
                          <span className="text-gray-400 mr-2">金額</span>
                          <span className="font-bold">{yen(r.amount)}</span>
                        </div>
                        <div>
                          <span className="text-gray-400 mr-2">方向</span>
                          {DIRECTION_EXPLAIN[r.direction]}
                        </div>
                        <div>
                          <span className="text-gray-400 mr-2">状態</span>
                          {r.settled
                            ? `精算済み${r.settled_at ? `（${String(r.settled_at).slice(0, 10)}）` : ''}`
                            : '未精算'}
                        </div>
                        <div className="flex gap-2 pt-1.5">
                          {!r.settled && (
                            <button onClick={() => settleOne(r.id)} className="flex-1 bg-gradient-to-r from-sleep-green to-sleep-greendeep text-white rounded-full py-1.5 text-xs font-extrabold">
                              精算済みにする
                            </button>
                          )}
                          <button onClick={() => startEdit(r)} className="flex-1 border rounded-full py-1.5 text-xs font-bold bg-white">
                            編集
                          </button>
                          <button onClick={() => remove(r.id)} className="flex-1 border border-red-200 text-red-500 rounded-full py-1.5 text-xs font-bold bg-white">
                            削除
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {!showAllFor[sec.member] && sec.rows.length > SECTION_LIMIT && (
              <button
                onClick={() => setShowAllFor({ ...showAllFor, [sec.member]: true })}
                className="w-full pt-2 text-sm font-bold text-sleep-blue"
              >
                あと{sec.rows.length - SECTION_LIMIT}件を表示
              </button>
            )}
          </div>
        )
      })}

      {/* 精算まわりの操作（控えめに） */}
      {settlement && settlement.members.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
          <div className="flex gap-2">
            <button onClick={settleAll} className="flex-1 bg-gradient-to-r from-sleep-green to-sleep-greendeep text-white rounded-full py-2 text-sm font-extrabold shadow">
              全て精算済みにする
            </button>
            <button onClick={() => setShowStatement(!showStatement)} className="flex-1 border rounded-full py-2 text-sm font-bold">
              精算書{showStatement ? 'を隠す' : 'を表示'}
            </button>
          </div>
          {showStatement && (
            <>
              <pre className="text-xs bg-sky-50 rounded-xl p-3 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto mt-3">{buildStatement()}</pre>
              <div className="flex gap-2 mt-3">
                <button onClick={copyStatement} className="flex-1 border-2 border-sleep-orange text-sleep-orange rounded-full py-2 font-extrabold bg-white">
                  コピーする
                </button>
                <button onClick={saveStatement} className="flex-1 bg-gradient-to-r from-sleep-orange to-sleep-yellow text-white rounded-full py-2 font-extrabold shadow">
                  ファイルに保存
                </button>
              </div>
            </>
          )}
          {copyMessage && <p className="text-sm font-bold text-green-600 mt-2">{copyMessage}</p>}
        </div>
      )}

      <form id="reimb-form" onSubmit={submit} className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
        <h2 className="font-bold">{editingId ? '建て替えを編集' : '建て替えを追加'}</h2>
        <div className="flex gap-2">
          {Object.entries(DIRECTION_LABEL).map(([value, label]) => (
            <button
              type="button"
              key={value}
              onClick={() => setForm({ ...form, direction: value })}
              className={`flex-1 rounded-full py-2 px-2 text-xs font-extrabold border-2 ${
                form.direction === value
                  ? 'bg-sleep-blue text-white border-sleep-blue'
                  : 'bg-white text-gray-500 border-gray-200'
              }`}
            >
              {value === 'member_to_family' ? '家族カードで個人の買い物' : '立て替え・戻し入れ'}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inputCls} required />
          <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="金額（円）" className={inputCls} required />
        </div>
        <select value={form.member} onChange={(e) => setForm({ ...form, member: e.target.value })} className={inputCls} required>
          <option value="">メンバーを選択</option>
          {members.map((m) => (
            <option key={m.id} value={m.name}>{m.name}</option>
          ))}
        </select>
        <input value={form.detail} onChange={(e) => setForm({ ...form, detail: e.target.value })} placeholder="内容・メモ（例: 出張 飛行機代）" className={inputCls} />
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <div className="flex gap-2">
          <button className="flex-1 bg-gradient-to-r from-sleep-orange to-sleep-yellow text-white rounded-full py-2.5 font-extrabold shadow">
            {editingId ? '更新する' : '＋ 追加する'}
          </button>
          {editingId && (
            <button type="button" onClick={cancelEdit} className="px-4 border rounded-full py-2.5 font-bold">
              キャンセル
            </button>
          )}
        </div>
      </form>
    </Layout>
  )
}
