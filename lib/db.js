// lib/db.js - Turso / ローカルSQLite データベース層 (@libsql/client)
import { createClient } from '@libsql/client'
import path from 'path'

let db = null

export async function getDb() {
  if (db) return db

  const tursoUrl = process.env.TURSO_DATABASE_URL
  const tursoToken = process.env.TURSO_AUTH_TOKEN

  if (tursoUrl && tursoToken) {
    db = createClient({ url: tursoUrl, authToken: tursoToken })
  } else {
    const dbPath = path.join(process.cwd(), 'kakeibo.db')
    db = createClient({ url: `file:${dbPath}` })
  }

  await initializeTables()
  return db
}

const DEFAULT_CATEGORIES = [
  // 変動支出
  ['食費', 'variable', 1],
  ['外食費', 'variable', 2],
  ['日用品費', 'variable', 3],
  ['医療費', 'variable', 4],
  ['美容費', 'variable', 5],
  ['交通費', 'variable', 6],
  ['ガソリン代', 'variable', 7],
  ['ゴルフ費', 'variable', 8],
  ['お買い物', 'variable', 9],
  // 特別支出
  ['車関係', 'special', 21],
  ['旅行', 'special', 22],
  // 固定支出（項目名管理のみ。仕組みは作らない）
  ['水道代', 'fixed', 31],
  ['電気代', 'fixed', 32],
  ['ガス代', 'fixed', 33],
  ['ガス警報器代', 'fixed', 34],
  ['インターネット', 'fixed', 35],
  ['Amazon', 'fixed', 36],
  ['コンタクト', 'fixed', 37],
]

async function initializeTables() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      category TEXT NOT NULL,
      amount INTEGER NOT NULL,
      store_memo TEXT DEFAULT '',
      payment_method TEXT NOT NULL DEFAULT 'card',
      payer TEXT DEFAULT '',
      settled INTEGER NOT NULL DEFAULT 0,
      settled_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `)
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date)
  `)
  // 既存DBへの移行: 現金の年次精算用に settled / settled_at 列を追加（現金も建て替え同様、年1回精算して空にする）
  try {
    const cols = await db.execute('PRAGMA table_info(transactions)')
    const names = cols.rows.map((r) => r.name)
    if (!names.includes('settled')) {
      await db.execute('ALTER TABLE transactions ADD COLUMN settled INTEGER NOT NULL DEFAULT 0')
    }
    if (!names.includes('settled_at')) {
      await db.execute('ALTER TABLE transactions ADD COLUMN settled_at TEXT')
    }
  } catch { /* 列追加に失敗しても通常機能は継続 */ }

  // 品目明細（主に食費・日用品費。価格推移用）
  await db.execute(`
    CREATE TABLE IF NOT EXISTS transaction_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL,
      item_name TEXT NOT NULL,
      normalized_item_id INTEGER,
      quantity REAL DEFAULT 1,
      unit_price INTEGER,
      amount INTEGER,
      store TEXT DEFAULT '',
      FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
    )
  `)

  // 商品マスター（価格推移はこの単位で集計）
  await db.execute(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      category TEXT DEFAULT '',
      default_store TEXT DEFAULT ''
    )
  `)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      grp TEXT NOT NULL DEFAULT 'variable',
      sort_order INTEGER DEFAULT 0
    )
  `)

  // 建て替え台帳
  // direction: 'family_to_member' = 家族がメンバーへ返す（メンバーが立て替えた）
  //            'member_to_family' = メンバーが家族へ返す（家族カードで個人の支出）
  await db.execute(`
    CREATE TABLE IF NOT EXISTS reimbursements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      member TEXT NOT NULL,
      direction TEXT NOT NULL,
      amount INTEGER NOT NULL,
      detail TEXT DEFAULT '',
      fiscal_year INTEGER NOT NULL,
      settled INTEGER NOT NULL DEFAULT 0,
      settled_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_reimbursements_year ON reimbursements(fiscal_year)
  `)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    )
  `)

  // レシート写真（Phase 2。確認用に1ヶ月保持し自動削除する想定）
  await db.execute(`
    CREATE TABLE IF NOT EXISTS receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      image_url TEXT DEFAULT '',
      uploaded_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT,
      status TEXT DEFAULT 'pending'
    )
  `)

  // 未記入候補（カード利用通知メール等から拾った「まだ明細化していない支出」）
  // status: 'pending'（未記入） | 'confirmed'（明細化 or 照合済み） | 'dismissed'（却下）
  // 確定するまでは集計に含めない。external_id は元メールID等で、二重登録防止に使う
  await db.execute(`
    CREATE TABLE IF NOT EXISTS candidates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      amount INTEGER NOT NULL,
      store TEXT DEFAULT '',
      category TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
      note TEXT DEFAULT '',
      external_id TEXT,
      payment_method TEXT NOT NULL DEFAULT 'card',
      payer TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      linked_transaction_id INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `)
  await db.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_candidates_external_id
    ON candidates(external_id) WHERE external_id IS NOT NULL AND external_id <> ''
  `)
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_candidates_status ON candidates(status, date)
  `)

  // 候補に付く品目（レシート読み取り分。確定時に transaction_items へ移す）
  await db.execute(`
    CREATE TABLE IF NOT EXISTS candidate_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      candidate_id INTEGER NOT NULL,
      item_name TEXT NOT NULL,
      quantity REAL DEFAULT 1,
      unit_price INTEGER,
      amount INTEGER,
      store TEXT DEFAULT '',
      FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
    )
  `)

  // 店名→カテゴリーの学習ルール
  await db.execute(`
    CREATE TABLE IF NOT EXISTS store_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_key TEXT NOT NULL UNIQUE,
      store TEXT NOT NULL,
      category TEXT NOT NULL,
      use_count INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `)

  // 金額だけクイックメモ（分類は後回しにする受け箱）
  await db.execute(`
    CREATE TABLE IF NOT EXISTS quick_memos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount INTEGER NOT NULL,
      memo TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

  // カテゴリーの初期データ
  const count = await db.execute('SELECT COUNT(*) AS c FROM categories')
  if (count.rows[0].c === 0) {
    for (const [name, grp, order] of DEFAULT_CATEGORIES) {
      await db.execute({
        sql: 'INSERT OR IGNORE INTO categories (name, grp, sort_order) VALUES (?, ?, ?)',
        args: [name, grp, order],
      })
    }
  }
}

// ---------- transactions ----------
export async function listTransactions({ month, category, paymentMethod } = {}) {
  const db = await getDb()
  let sql = 'SELECT * FROM transactions WHERE 1=1'
  const args = []
  if (month) {
    sql += " AND substr(date, 1, 7) = ?"
    args.push(month)
  }
  if (category) {
    sql += ' AND category = ?'
    args.push(category)
  }
  if (paymentMethod) {
    sql += ' AND payment_method = ?'
    args.push(paymentMethod)
  }
  sql += ' ORDER BY date DESC, id DESC'
  const result = await db.execute({ sql, args })
  return result.rows
}

export async function getTransactionItems(transactionId) {
  const db = await getDb()
  const result = await db.execute({
    sql: 'SELECT * FROM transaction_items WHERE transaction_id = ? ORDER BY id',
    args: [transactionId],
  })
  return result.rows
}

// 商品名を正規化して商品マスターに紐づける（無ければ作る）
async function resolveItemId(db, itemName, category, store) {
  const name = String(itemName || '').trim()
  if (!name) return null
  const existing = await db.execute({
    sql: 'SELECT id FROM items WHERE name = ?',
    args: [name],
  })
  if (existing.rows.length > 0) return existing.rows[0].id
  const inserted = await db.execute({
    sql: 'INSERT INTO items (name, category, default_store) VALUES (?, ?, ?)',
    args: [name, category || '', store || ''],
  })
  return Number(inserted.lastInsertRowid)
}

// ---------- 店名→カテゴリー学習 ----------
// 店名の正規化キー（空白除去・小文字化・末尾の括弧書き除去）
export function storeKeyOf(store) {
  return String(store || '')
    .replace(/[（(][^）)]*[）)]\s*$/, '')
    .replace(/\s+/g, '')
    .toLowerCase()
    .trim()
}

export async function learnStoreRule(store, category) {
  const key = storeKeyOf(store)
  if (!key || !category) return
  const db = await getDb()
  const existing = await db.execute({ sql: 'SELECT id FROM store_rules WHERE store_key = ?', args: [key] })
  if (existing.rows.length > 0) {
    await db.execute({
      sql: `UPDATE store_rules SET category = ?, store = ?, use_count = use_count + 1, updated_at = datetime('now') WHERE store_key = ?`,
      args: [category, String(store).trim(), key],
    })
  } else {
    await db.execute({
      sql: 'INSERT INTO store_rules (store_key, store, category) VALUES (?, ?, ?)',
      args: [key, String(store).trim(), category],
    })
  }
}

// 過去の明細から学習ルールを初期生成する（ルールが無い店だけ）
export async function seedStoreRulesFromHistory() {
  const db = await getDb()
  const rows = await db.execute(
    `SELECT store_memo, category, COUNT(*) AS c FROM transactions
     WHERE store_memo IS NOT NULL AND store_memo <> ''
     GROUP BY store_memo, category ORDER BY c DESC`
  )
  const seen = new Set()
  for (const r of rows.rows) {
    const key = storeKeyOf(r.store_memo)
    if (!key || seen.has(key)) continue
    seen.add(key)
    await db.execute({
      sql: 'INSERT OR IGNORE INTO store_rules (store_key, store, category, use_count) VALUES (?, ?, ?, ?)',
      args: [key, r.store_memo, r.category, r.c],
    })
  }
}

export async function listStoreRules() {
  const db = await getDb()
  const result = await db.execute('SELECT * FROM store_rules ORDER BY use_count DESC, updated_at DESC')
  return result.rows
}

export async function updateStoreRule(id, category) {
  const db = await getDb()
  await db.execute({
    sql: `UPDATE store_rules SET category = ?, updated_at = datetime('now') WHERE id = ?`,
    args: [category, Number(id)],
  })
}

export async function deleteStoreRule(id) {
  const db = await getDb()
  await db.execute({ sql: 'DELETE FROM store_rules WHERE id = ?', args: [Number(id)] })
}

export async function categoryForStore(store) {
  const key = storeKeyOf(store)
  if (!key) return null
  const db = await getDb()
  const result = await db.execute({ sql: 'SELECT category FROM store_rules WHERE store_key = ?', args: [key] })
  return result.rows.length > 0 ? result.rows[0].category : null
}

export async function createTransaction(data) {
  const db = await getDb()
  const { date, category, amount, store_memo = '', payment_method = 'card', payer = '', items = [] } = data
  const inserted = await db.execute({
    sql: `INSERT INTO transactions (date, category, amount, store_memo, payment_method, payer)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [date, category, amount, store_memo, payment_method, payer],
  })
  const transactionId = Number(inserted.lastInsertRowid)
  for (const item of items) {
    const itemId = await resolveItemId(db, item.item_name, category, item.store || store_memo)
    await db.execute({
      sql: `INSERT INTO transaction_items (transaction_id, item_name, normalized_item_id, quantity, unit_price, amount, store)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        transactionId,
        item.item_name,
        itemId,
        item.quantity ?? 1,
        item.unit_price ?? null,
        item.amount ?? (item.unit_price && item.quantity ? Math.round(item.unit_price * item.quantity) : null),
        item.store || store_memo || '',
      ],
    })
  }
  // 登録のたびに店名→カテゴリーを学習する
  await learnStoreRule(store_memo, category)
  return transactionId
}

export async function updateTransaction(id, data) {
  const db = await getDb()
  const { date, category, amount, store_memo = '', payment_method = 'card', payer = '', items } = data
  await db.execute({
    sql: `UPDATE transactions
          SET date = ?, category = ?, amount = ?, store_memo = ?, payment_method = ?, payer = ?, updated_at = datetime('now')
          WHERE id = ?`,
    args: [date, category, amount, store_memo, payment_method, payer, id],
  })
  if (Array.isArray(items)) {
    await db.execute({ sql: 'DELETE FROM transaction_items WHERE transaction_id = ?', args: [id] })
    for (const item of items) {
      const itemId = await resolveItemId(db, item.item_name, category, item.store || store_memo)
      await db.execute({
        sql: `INSERT INTO transaction_items (transaction_id, item_name, normalized_item_id, quantity, unit_price, amount, store)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          id,
          item.item_name,
          itemId,
          item.quantity ?? 1,
          item.unit_price ?? null,
          item.amount ?? (item.unit_price && item.quantity ? Math.round(item.unit_price * item.quantity) : null),
          item.store || store_memo || '',
        ],
      })
    }
  }
  await learnStoreRule(store_memo, category)
}

// 現金の年次精算: 精算済みフラグの切り替え（明細自体は月次集計に残る）
export async function setTransactionSettled(id, settled) {
  const db = await getDb()
  await db.execute({
    sql: `UPDATE transactions
          SET settled = ?, settled_at = ${settled ? "datetime('now')" : 'NULL'}, updated_at = datetime('now')
          WHERE id = ?`,
    args: [settled ? 1 : 0, Number(id)],
  })
}

export async function deleteTransaction(id) {
  const db = await getDb()
  await db.execute({ sql: 'DELETE FROM transaction_items WHERE transaction_id = ?', args: [id] })
  await db.execute({ sql: 'DELETE FROM transactions WHERE id = ?', args: [id] })
}

// ---------- summary ----------
export async function getMonthlySummary(month) {
  const rows = await listTransactions({ month })
  const total = rows.reduce((s, r) => s + r.amount, 0)

  const db = await getDb()
  const catResult = await db.execute('SELECT name, grp FROM categories')
  const groupOf = {}
  catResult.rows.forEach((c) => { groupOf[c.name] = c.grp })

  const byCategory = {}
  const byGroup = { variable: 0, special: 0, fixed: 0 }
  const byDate = {}
  for (const r of rows) {
    byCategory[r.category] = (byCategory[r.category] || 0) + r.amount
    const g = groupOf[r.category] || 'variable'
    byGroup[g] = (byGroup[g] || 0) + r.amount
    byDate[r.date] = (byDate[r.date] || 0) + r.amount
  }
  return { month, total, byCategory, byGroup, byDate, count: rows.length }
}

// ---------- reimbursements ----------
export async function listReimbursements({ year, member } = {}) {
  const db = await getDb()
  let sql = 'SELECT * FROM reimbursements WHERE 1=1'
  const args = []
  if (year) {
    sql += ' AND fiscal_year = ?'
    args.push(Number(year))
  }
  if (member) {
    sql += ' AND member = ?'
    args.push(member)
  }
  sql += ' ORDER BY date DESC, id DESC'
  const result = await db.execute({ sql, args })
  return result.rows
}

// 年次精算: メンバーごとに両方向を相殺した差額を出す
// net > 0 … 家族がそのメンバーへ振り込む額 / net < 0 … メンバーが家族へ振り込む額（絶対値）
export async function getSettlement(year) {
  const rows = await listReimbursements({ year })
  const perMember = {}
  for (const r of rows) {
    if (!perMember[r.member]) perMember[r.member] = { member: r.member, familyOwes: 0, memberOwes: 0, net: 0, unsettledCount: 0 }
    if (r.direction === 'family_to_member') perMember[r.member].familyOwes += r.amount
    else perMember[r.member].memberOwes += r.amount
    if (!r.settled) perMember[r.member].unsettledCount += 1
  }
  Object.values(perMember).forEach((m) => { m.net = m.familyOwes - m.memberOwes })
  return { year: Number(year), members: Object.values(perMember) }
}

// ---------- 未記入候補 ----------
export async function getCandidateItems(candidateId) {
  const db = await getDb()
  const result = await db.execute({
    sql: 'SELECT * FROM candidate_items WHERE candidate_id = ? ORDER BY id',
    args: [candidateId],
  })
  return result.rows.map((r) => ({
    id: r.id,
    item_name: r.item_name,
    quantity: r.quantity,
    unit_price: r.unit_price,
    amount: r.amount,
    store: r.store,
  }))
}

async function candidateWithItems(row) {
  return {
    id: row.id,
    date: row.date,
    amount: row.amount,
    store: row.store,
    category: row.category,
    source: row.source,
    note: row.note,
    externalId: row.external_id,
    paymentMethod: row.payment_method,
    payer: row.payer,
    status: row.status,
    linkedTransactionId: row.linked_transaction_id,
    createdAt: row.created_at,
    items: await getCandidateItems(row.id),
  }
}

export async function listCandidates({ status } = {}) {
  const db = await getDb()
  let sql = 'SELECT * FROM candidates'
  const args = []
  if (status) {
    sql += ' WHERE status = ?'
    args.push(status)
  }
  sql += ' ORDER BY date DESC, id DESC'
  const result = await db.execute({ sql, args })
  const out = []
  for (const row of result.rows) out.push(await candidateWithItems(row))
  return out
}

export async function getCandidate(id) {
  const db = await getDb()
  const result = await db.execute({ sql: 'SELECT * FROM candidates WHERE id = ?', args: [Number(id)] })
  if (result.rows.length === 0) return null
  return candidateWithItems(result.rows[0])
}

// external_id があれば二重登録を防ぐ（{ id, duplicated } を返す）
export async function createCandidate(data) {
  const db = await getDb()
  const {
    date, amount, store = '', category = null, source = 'manual', note = '',
    externalId = null, payment_method = 'card', payer = '', items = [],
  } = data
  const ext = externalId ? String(externalId) : null
  if (ext) {
    const existing = await db.execute({ sql: 'SELECT id FROM candidates WHERE external_id = ?', args: [ext] })
    if (existing.rows.length > 0) return { id: existing.rows[0].id, duplicated: true }
  }
  // カテゴリー未指定なら学習ルールで補う
  let cat = category
  if (!cat && store) cat = await categoryForStore(store)
  const inserted = await db.execute({
    sql: `INSERT INTO candidates (date, amount, store, category, source, note, external_id, payment_method, payer)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [date, Math.round(Number(amount)), store, cat, source, note, ext, payment_method, payer],
  })
  const candidateId = Number(inserted.lastInsertRowid)
  for (const item of items) {
    await db.execute({
      sql: `INSERT INTO candidate_items (candidate_id, item_name, quantity, unit_price, amount, store)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        candidateId,
        item.item_name || item.itemName,
        item.quantity ?? 1,
        item.unit_price ?? item.unitPrice ?? null,
        item.amount ?? ((item.unit_price ?? item.unitPrice) && item.quantity ? Math.round((item.unit_price ?? item.unitPrice) * item.quantity) : (item.unit_price ?? item.unitPrice ?? null)),
        item.store || store || '',
      ],
    })
  }
  return { id: candidateId, duplicated: false }
}

export async function updateCandidate(id, data) {
  const db = await getDb()
  const current = await getCandidate(id)
  if (!current) return false
  const next = {
    date: data.date ?? current.date,
    amount: data.amount !== undefined ? Math.round(Number(data.amount)) : current.amount,
    store: data.store ?? current.store,
    category: data.category !== undefined ? data.category : current.category,
    note: data.note ?? current.note,
    payment_method: data.payment_method ?? current.paymentMethod,
    payer: data.payer ?? current.payer,
  }
  await db.execute({
    sql: `UPDATE candidates SET date = ?, amount = ?, store = ?, category = ?, note = ?, payment_method = ?, payer = ?, updated_at = datetime('now') WHERE id = ?`,
    args: [next.date, next.amount, next.store, next.category, next.note, next.payment_method, next.payer, Number(id)],
  })
  if (Array.isArray(data.items)) {
    await db.execute({ sql: 'DELETE FROM candidate_items WHERE candidate_id = ?', args: [Number(id)] })
    for (const item of data.items) {
      await db.execute({
        sql: `INSERT INTO candidate_items (candidate_id, item_name, quantity, unit_price, amount, store)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          Number(id),
          item.item_name || item.itemName,
          item.quantity ?? 1,
          item.unit_price ?? item.unitPrice ?? null,
          item.amount ?? ((item.unit_price ?? item.unitPrice) && item.quantity ? Math.round((item.unit_price ?? item.unitPrice) * item.quantity) : (item.unit_price ?? item.unitPrice ?? null)),
          item.store || next.store || '',
        ],
      })
    }
  }
  return true
}

export async function deleteCandidate(id) {
  const db = await getDb()
  await db.execute({ sql: 'DELETE FROM candidate_items WHERE candidate_id = ?', args: [Number(id)] })
  await db.execute({ sql: 'DELETE FROM candidates WHERE id = ?', args: [Number(id)] })
}

async function setCandidateStatus(id, status, linkedTransactionId) {
  const db = await getDb()
  if (linkedTransactionId !== undefined) {
    await db.execute({
      sql: `UPDATE candidates SET status = ?, linked_transaction_id = ?, updated_at = datetime('now') WHERE id = ?`,
      args: [status, linkedTransactionId, Number(id)],
    })
  } else {
    await db.execute({
      sql: `UPDATE candidates SET status = ?, updated_at = datetime('now') WHERE id = ?`,
      args: [status, Number(id)],
    })
  }
}

export async function dismissCandidate(id) {
  await setCandidateStatus(id, 'dismissed')
}

export async function reopenCandidate(id) {
  await setCandidateStatus(id, 'pending', null)
}

// 候補を既存の明細と照合済みにする（新しい明細は作らない）
export async function linkCandidateToTransaction(id, transactionId) {
  await setCandidateStatus(id, 'confirmed', Number(transactionId))
}

// 候補を正式な明細として確定する。品目も明細へ移す
export async function confirmCandidate(id, overrides = {}) {
  const candidate = await getCandidate(id)
  if (!candidate) return { error: '候補が見つかりません' }
  if (candidate.status === 'confirmed') return { error: 'すでに確定済みです' }
  const category = overrides.category ?? candidate.category
  if (!category) return { error: 'カテゴリーが未定のため確定できません' }
  const transactionId = await createTransaction({
    date: overrides.date ?? candidate.date,
    category,
    amount: overrides.amount !== undefined ? Math.round(Number(overrides.amount)) : candidate.amount,
    store_memo: overrides.memo ?? (candidate.store || candidate.note || ''),
    payment_method: overrides.payment_method ?? candidate.paymentMethod ?? 'card',
    payer: overrides.payer ?? candidate.payer ?? '',
    items: (overrides.items ?? candidate.items).map((i) => ({
      item_name: i.item_name || i.itemName,
      quantity: i.quantity ?? 1,
      unit_price: i.unit_price ?? i.unitPrice ?? null,
      amount: i.amount ?? null,
      store: i.store || candidate.store || '',
    })),
  })
  await setCandidateStatus(id, 'confirmed', transactionId)
  return { transactionId }
}

// 一括確定：カテゴリーが決まらない候補はスキップする
export async function bulkConfirmCandidates(entries) {
  const confirmed = []
  const skipped = []
  for (const entry of entries) {
    const candidate = await getCandidate(entry.id)
    if (!candidate || candidate.status !== 'pending') {
      skipped.push({ id: entry.id, reason: '未記入ではありません' })
      continue
    }
    const category = entry.category ?? candidate.category ?? (candidate.store ? await categoryForStore(candidate.store) : null)
    if (!category) {
      skipped.push({ id: entry.id, reason: 'カテゴリー未定' })
      continue
    }
    const result = await confirmCandidate(entry.id, { category })
    if (result.error) skipped.push({ id: entry.id, reason: result.error })
    else confirmed.push({ id: entry.id, transactionId: result.transactionId })
  }
  return { confirmed, skipped }
}

// ---------- 照合（候補 × 明細） ----------
function dateDiffDays(a, b) {
  const da = new Date(`${a}T00:00:00`)
  const db = new Date(`${b}T00:00:00`)
  return Math.round(Math.abs(da - db) / 86400000)
}

function storeSimilarity(a, b) {
  const ka = storeKeyOf(a)
  const kb = storeKeyOf(b)
  if (!ka || !kb) return 0
  if (ka === kb) return 1
  if (ka.includes(kb) || kb.includes(ka)) return 0.7
  return 0
}

// 照合スコアと合致理由を作る。金額一致が必須条件
function scoreMatch({ amountA, amountB, dateA, dateB, storeA, storeB }) {
  if (Number(amountA) !== Number(amountB)) return null
  const dd = dateDiffDays(dateA, dateB)
  if (dd > 3) return null
  const sim = storeSimilarity(storeA, storeB)
  let score = 4
  const reasons = ['金額一致']
  if (dd === 0) {
    score += 2
    reasons.push('同日')
  } else {
    score += 1
    reasons.push(`日付の差 ${dd}日`)
  }
  if (sim >= 1) {
    score += 2
    reasons.push('店名も一致')
  } else if (sim > 0) {
    score += 1
    reasons.push('店名が近い')
  }
  return { score, reasons, storeMatch: sim >= 1, dateDiff: dd }
}

// 候補と照合できそうな既存の明細を探す
export async function findCandidateMatches(candidateId) {
  const candidate = await getCandidate(candidateId)
  if (!candidate) return []
  const db = await getDb()
  const rows = await db.execute({
    sql: 'SELECT * FROM transactions WHERE amount = ? ORDER BY date DESC',
    args: [candidate.amount],
  })
  const matches = []
  for (const t of rows.rows) {
    const s = scoreMatch({
      amountA: candidate.amount, amountB: t.amount,
      dateA: candidate.date, dateB: t.date,
      storeA: candidate.store, storeB: t.store_memo,
    })
    if (s) matches.push({ transaction: t, ...s })
  }
  return matches.sort((a, b) => b.score - a.score)
}

// 明細を登録する際、入力内容と合致する未記入候補を探す（レシート書き込み時の消込用）
export async function findEntryCandidateMatches({ date, amount, store }) {
  const pending = await listCandidates({ status: 'pending' })
  const matches = []
  for (const c of pending) {
    const s = scoreMatch({
      amountA: amount, amountB: c.amount,
      dateA: date, dateB: c.date,
      storeA: store, storeB: c.store,
    })
    if (s) matches.push({ candidate: c, ...s })
  }
  return matches.sort((a, b) => b.score - a.score)
}

// ---------- チャット一言入力のパース ----------
// 例: 「昨日、コンビニで現金1,200円、支払者はかい」
export function parseCandidateText(text, memberNames = []) {
  const raw = String(text || '')
  if (!raw) return { error: 'テキストが空です' }

  // 金額
  const amountMatch = raw.match(/([\d,]+)\s*円/)
  if (!amountMatch) return { error: '金額（〜円）が読み取れませんでした' }
  const amount = Number(amountMatch[1].replace(/,/g, ''))
  if (!amount) return { error: '金額が読み取れませんでした' }

  // 日付
  const today = new Date()
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  let date = fmt(today)
  const fullDate = raw.match(/(\d{4})-(\d{2})-(\d{2})/)
  const jpDate = raw.match(/(\d{1,2})月(\d{1,2})日/)
  const slashDate = raw.match(/(\d{1,2})\/(\d{1,2})/)
  if (fullDate) date = fullDate[0]
  else if (jpDate) date = `${today.getFullYear()}-${String(Number(jpDate[1])).padStart(2, '0')}-${String(Number(jpDate[2])).padStart(2, '0')}`
  else if (slashDate) date = `${today.getFullYear()}-${String(Number(slashDate[1])).padStart(2, '0')}-${String(Number(slashDate[2])).padStart(2, '0')}`
  else if (raw.includes('一昨日') || raw.includes('おととい')) {
    const d = new Date(today); d.setDate(d.getDate() - 2); date = fmt(d)
  } else if (raw.includes('昨日') || raw.includes('きのう')) {
    const d = new Date(today); d.setDate(d.getDate() - 1); date = fmt(d)
  }

  // 支払い方法と支払者
  const payment_method = raw.includes('現金') ? 'cash' : 'card'
  let payer = ''
  const payerMatch = raw.match(/支払者(?:は|：|:)?\s*([^\s、。,]+)/)
  if (payerMatch) payer = payerMatch[1]
  if (!payer && payment_method === 'cash') {
    for (const name of memberNames) {
      if (name && raw.includes(name)) { payer = name; break }
    }
  }

  // 店名: 「◯◯で」の形を優先。日付・金額・支払者などの語は除く
  let store = ''
  const cleaned = raw
    .replace(/支払者(?:は|：|:)?\s*[^\s、。,]+/g, '')
    .replace(/[\d,]+\s*円/g, '')
    .replace(/現金|カード|家族カード/g, '')
  const deMatch = cleaned.match(/([^\s、。]+?)で/)
  if (deMatch) {
    const candidate = deMatch[1].replace(/^(昨日|一昨日|おととい|きのう|今日|、)+/, '')
    if (candidate && !/^\d/.test(candidate)) store = candidate
  }

  return { date, amount, store, payment_method, payer, source: 'chat' }
}

// ---------- クイックメモ ----------
export async function listQuickMemos() {
  const db = await getDb()
  const result = await db.execute('SELECT * FROM quick_memos ORDER BY id DESC')
  return result.rows
}

export async function createQuickMemo({ amount, memo = '' }) {
  const db = await getDb()
  const inserted = await db.execute({
    sql: 'INSERT INTO quick_memos (amount, memo) VALUES (?, ?)',
    args: [Math.round(Number(amount)), memo],
  })
  return Number(inserted.lastInsertRowid)
}

export async function deleteQuickMemo(id) {
  const db = await getDb()
  await db.execute({ sql: 'DELETE FROM quick_memos WHERE id = ?', args: [Number(id)] })
}

// クイックメモを明細化する（明細を作ってメモを消す）
export async function convertQuickMemo(id, txData) {
  const db = await getDb()
  const result = await db.execute({ sql: 'SELECT * FROM quick_memos WHERE id = ?', args: [Number(id)] })
  if (result.rows.length === 0) return { error: 'クイックメモが見つかりません' }
  const memo = result.rows[0]
  const transactionId = await createTransaction({
    date: txData.date,
    category: txData.category,
    amount: memo.amount,
    store_memo: txData.store_memo ?? memo.memo ?? '',
    payment_method: txData.payment_method ?? 'card',
    payer: txData.payer ?? '',
    items: txData.items || [],
  })
  await deleteQuickMemo(id)
  return { transactionId }
}

// ---------- 入力補助（サジェスト・ルール・テンプレート） ----------
export async function getInputHelpers() {
  await seedStoreRulesFromHistory()
  const db = await getDb()
  const rules = await listStoreRules()
  // 店名サジェスト: ルール＋過去の店名から、よく使う順
  const storeRows = await db.execute(
    `SELECT store_memo AS store, category, COUNT(*) AS c FROM transactions
     WHERE store_memo IS NOT NULL AND store_memo <> ''
     GROUP BY store_memo ORDER BY c DESC, MAX(date) DESC LIMIT 50`
  )
  const suggestionsMap = new Map()
  for (const r of rules) {
    if (!suggestionsMap.has(r.store)) suggestionsMap.set(r.store, { store: r.store, category: r.category })
  }
  for (const r of storeRows.rows) {
    if (!suggestionsMap.has(r.store_memo)) suggestionsMap.set(r.store_memo, { store: r.store_memo, category: r.category })
  }
  const suggestions = [...suggestionsMap.values()]
  // 「前回と同じ」テンプレート: 店＋カテゴリーで重複をまとめて最近順
  const recent = await db.execute('SELECT * FROM transactions ORDER BY date DESC, id DESC LIMIT 100')
  const templateMap = new Map()
  for (const t of recent.rows) {
    const key = `${storeKeyOf(t.store_memo)}|${t.category}`
    if (!templateMap.has(key)) templateMap.set(key, t)
  }
  const templates = []
  for (const t of [...templateMap.values()].slice(0, 20)) {
    templates.push({ ...t, items: await getTransactionItems(t.id) })
  }
  return { suggestions, rules, templates }
}

// ---------- 月末の突合チェック ----------
export async function getReconciliation(month) {
  const db = await getDb()
  const candRows = await db.execute({
    sql: "SELECT * FROM candidates WHERE substr(date, 1, 7) = ? ORDER BY date, id",
    args: [month],
  })
  const candidates = candRows.rows
  const sum = (rows) => rows.reduce((s, r) => s + r.amount, 0)
  const pending = candidates.filter((c) => c.status === 'pending')
  const confirmed = candidates.filter((c) => c.status === 'confirmed')
  const dismissed = candidates.filter((c) => c.status === 'dismissed')
  const notifiedTotal = sum(candidates)
  const pendingTotal = sum(pending)
  const dismissedTotal = sum(dismissed)

  const cardRows = await db.execute({
    sql: "SELECT * FROM transactions WHERE substr(date, 1, 7) = ? AND payment_method = 'card'",
    args: [month],
  })
  const recordedCardTotal = sum(cardRows.rows)
  const difference = recordedCardTotal - notifiedTotal
  // 差額が「未記入分＋却下分」で説明できるか（候補由来の明細は両方に含まれるため）
  const explained = recordedCardTotal - (notifiedTotal - pendingTotal - dismissedTotal) === 0

  return {
    month,
    notifiedTotal,
    notifiedCount: candidates.length,
    recordedCardTotal,
    recordedCardCount: cardRows.rows.length,
    difference,
    pendingTotal,
    pendingCount: pending.length,
    pending: pending.map((c) => ({ id: c.id, date: c.date, store: c.store, amount: c.amount })),
    confirmedCount: confirmed.length,
    confirmedTotal: sum(confirmed),
    dismissedCount: dismissed.length,
    dismissedTotal,
    explained,
  }
}

// ---------- 気づく系の分析 ----------
export async function getInsights(month, year) {
  const db = await getDb()
  const anomalies = []

  // 異常検知: 未記入候補 × 既存明細の重複（二重登録・二重請求っぽいもの）
  const pending = await listCandidates({ status: 'pending' })
  for (const c of pending) {
    const matches = await findCandidateMatches(c.id)
    if (matches.length > 0) {
      const t = matches[0].transaction
      anomalies.push({
        id: `dup-match-${c.id}`,
        kind: 'duplicate_tx',
        severity: 'medium',
        title: 'すでに明細にある支出かもしれません',
        detail: `${t.date} の明細「${t.store_memo || ''} ${Number(t.amount).toLocaleString()}円」と金額・店名・日付が一致しています。候補を開いて「照合済みにする」がおすすめです。`,
        candidateId: c.id,
        transactionId: t.id,
        amount: c.amount,
        date: c.date,
        store: c.store,
        category: c.category,
      })
    }
  }
  // 異常検知: 未記入候補同士の重複（同じ通知が二重に来た／二重請求）
  const seenCand = new Map()
  for (const c of pending) {
    const key = `${c.amount}|${storeKeyOf(c.store)}|${c.date}`
    if (seenCand.has(key)) {
      anomalies.push({
        id: `dup-cand-${c.id}`,
        kind: 'duplicate_candidate',
        severity: 'medium',
        title: '同じ内容の候補が重複しています',
        detail: `${c.date}「${c.store || ''} ${c.amount.toLocaleString()}円」の候補が2件あります。二重請求か、通知の二重取り込みかもしれません。`,
        candidateId: c.id,
        amount: c.amount,
        date: c.date,
        store: c.store,
        category: c.category,
      })
    } else {
      seenCand.set(key, c)
    }
  }
  // 異常検知: 高額な候補（5万円以上、またはその店の平均の3倍以上）
  const storeAvgRows = await db.execute(
    `SELECT store_memo, AVG(amount) AS avg_amount, COUNT(*) AS c FROM transactions
     WHERE store_memo IS NOT NULL AND store_memo <> '' GROUP BY store_memo HAVING c >= 3`
  )
  const storeAvg = {}
  storeAvgRows.rows.forEach((r) => { storeAvg[storeKeyOf(r.store_memo)] = r.avg_amount })
  for (const c of pending) {
    const avg = storeAvg[storeKeyOf(c.store)]
    const isHuge = c.amount >= 50000
    const isSpike = avg && c.amount >= avg * 3 && c.amount >= 10000
    if (isHuge || isSpike) {
      anomalies.push({
        id: `high-${c.id}`,
        kind: 'high_amount',
        severity: isHuge ? 'high' : 'medium',
        title: 'いつもより高額な支出かもしれません',
        detail: isSpike
          ? `${c.date}「${c.store || ''} ${c.amount.toLocaleString()}円」は、この店の平均（約${Math.round(avg).toLocaleString()}円）の3倍以上です。`
          : `${c.date}「${c.store || ''} ${c.amount.toLocaleString()}円」は5万円以上の大きな支出です。`,
        candidateId: c.id,
        amount: c.amount,
        date: c.date,
        store: c.store,
        category: c.category,
      })
    }
  }

  // サブスク・固定の自動検出: 店ごとに、2か月以上にわたって繰り返す支出
  const catRows = await db.execute('SELECT name, grp FROM categories')
  const groupOf = {}
  catRows.rows.forEach((c) => { groupOf[c.name] = c.grp })
  const txAll = await db.execute(
    `SELECT * FROM transactions WHERE store_memo IS NOT NULL AND store_memo <> '' ORDER BY date`
  )
  const byStore = new Map()
  for (const t of txAll.rows) {
    const key = storeKeyOf(t.store_memo)
    if (!key) continue
    if (!byStore.has(key)) byStore.set(key, [])
    byStore.get(key).push(t)
  }
  const subscriptions = []
  for (const [key, list] of byStore.entries()) {
    const months = new Set(list.map((t) => t.date.slice(0, 7)))
    if (list.length < 2 || months.size < 2) continue
    const amounts = list.map((t) => t.amount)
    const first = list[0]
    const latest = list[list.length - 1]
    subscriptions.push({
      storeKey: key,
      store: latest.store_memo,
      category: latest.category,
      isFixedCategory: groupOf[latest.category] === 'fixed',
      count: list.length,
      monthsCount: months.size,
      avgAmount: Math.round(amounts.reduce((s, a) => s + a, 0) / amounts.length),
      firstAmount: first.amount,
      firstDate: first.date,
      latestAmount: latest.amount,
      lastDate: latest.date,
      priceChanged: latest.amount !== first.amount,
      priceDiff: latest.amount - first.amount,
    })
  }
  subscriptions.sort((a, b) => b.avgAmount - a.avgAmount)

  // 価格アラートと店別比較
  const priceRows = await db.execute(`
    SELECT ti.normalized_item_id AS item_id, i.name AS item_name, ti.unit_price, ti.store, t.date
    FROM transaction_items ti
    JOIN items i ON i.id = ti.normalized_item_id
    JOIN transactions t ON t.id = ti.transaction_id
    WHERE ti.unit_price IS NOT NULL
    ORDER BY t.date ASC
  `)
  const byItem = new Map()
  for (const r of priceRows.rows) {
    if (!byItem.has(r.item_id)) byItem.set(r.item_id, { itemId: r.item_id, itemName: r.item_name, records: [] })
    byItem.get(r.item_id).records.push(r)
  }
  const priceAlerts = []
  const storeComparisons = []
  for (const item of byItem.values()) {
    const records = item.records
    if (records.length < 2) continue
    const prices = records.map((r) => r.unit_price)
    const minPrice = Math.min(...prices)
    const avgPrice = Math.round(prices.reduce((s, p) => s + p, 0) / prices.length)
    const latest = records[records.length - 1]
    const minRecord = records.find((r) => r.unit_price === minPrice)
    priceAlerts.push({
      itemId: item.itemId,
      itemName: item.itemName,
      recordCount: records.length,
      latestPrice: latest.unit_price,
      latestDate: latest.date,
      latestStore: latest.store,
      minPrice,
      minDate: minRecord.date,
      minStore: minRecord.store,
      avgPrice,
      isLowestNow: latest.unit_price === minPrice,
      isNearLowest: latest.unit_price <= Math.ceil(minPrice * 1.05),
      savingVsAvg: avgPrice - latest.unit_price,
    })
    // 店別比較（2店以上で買っている品目だけ）
    const perStore = new Map()
    for (const r of records) {
      const store = r.store || '（店名なし）'
      if (!perStore.has(store)) perStore.set(store, [])
      perStore.get(store).push(r)
    }
    if (perStore.size >= 2) {
      const stores = [...perStore.entries()].map(([store, rs]) => ({
        store,
        count: rs.length,
        avgPrice: Math.round(rs.reduce((s, r) => s + r.unit_price, 0) / rs.length),
        minPrice: Math.min(...rs.map((r) => r.unit_price)),
        latestPrice: rs[rs.length - 1].unit_price,
      })).sort((a, b) => a.avgPrice - b.avgPrice)
      storeComparisons.push({
        itemId: item.itemId,
        itemName: item.itemName,
        stores,
        cheapestStore: stores[0].store,
        cheapestAvg: stores[0].avgPrice,
        mostExpensiveStore: stores[stores.length - 1].store,
        mostExpensiveAvg: stores[stores.length - 1].avgPrice,
        diffAvg: stores[stores.length - 1].avgPrice - stores[0].avgPrice,
      })
    }
  }
  priceAlerts.sort((a, b) => b.recordCount - a.recordCount)

  // 医療費の年間集計（医療費控除の目安10万円）
  const medicalRows = await db.execute({
    sql: `SELECT * FROM transactions WHERE category = '医療費' AND substr(date, 1, 4) = ? ORDER BY date DESC`,
    args: [String(year)],
  })
  const medicalMonthly = []
  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, '0')}`
    const rows = medicalRows.rows.filter((r) => r.date.slice(0, 7) === key)
    medicalMonthly.push({ month: key, total: rows.reduce((s, r) => s + r.amount, 0), count: rows.length })
  }
  const medicalTotal = medicalRows.rows.reduce((s, r) => s + r.amount, 0)
  const medical = {
    year: Number(year),
    total: medicalTotal,
    count: medicalRows.rows.length,
    threshold: 100000,
    remaining: Math.max(0, 100000 - medicalTotal),
    progressPercent: Math.min(100, Math.round((medicalTotal / 100000) * 100)),
    monthly: medicalMonthly,
    recent: medicalRows.rows.slice(0, 5).map((r) => ({ id: r.id, date: r.date, amount: r.amount, memo: r.store_memo })),
  }

  // 月次レポート
  const current = await getMonthlySummary(month)
  const [py, pm] = month.split('-').map(Number)
  const prevDate = new Date(py, pm - 2, 1)
  const prevKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`
  const previous = await getMonthlySummary(prevKey)
  const monthTx = await listTransactions({ month })
  const cardTotal = monthTx.filter((t) => t.payment_method === 'card').reduce((s, t) => s + t.amount, 0)
  const cashTotal = monthTx.filter((t) => t.payment_method === 'cash').reduce((s, t) => s + t.amount, 0)
  const topCategoryEntry = Object.entries(current.byCategory).sort((a, b) => b[1] - a[1])[0] || [null, 0]
  const largestTx = monthTx.reduce((max, t) => (!max || t.amount > max.amount ? t : max), null)
  const catDiffs = {}
  for (const name of new Set([...Object.keys(current.byCategory), ...Object.keys(previous.byCategory)])) {
    catDiffs[name] = (current.byCategory[name] || 0) - (previous.byCategory[name] || 0)
  }
  const diffEntries = Object.entries(catDiffs).sort((a, b) => b[1] - a[1])
  const monthCandidates = pending.filter((c) => c.date.slice(0, 7) === month)
  const daysInMonth = new Date(py, pm, 0).getDate()
  const monthlyReport = {
    month,
    total: current.total,
    prevTotal: previous.total,
    diff: current.total - previous.total,
    diffPercent: previous.total ? Math.round(((current.total - previous.total) / previous.total) * 100) : 0,
    txCount: current.count,
    prevTxCount: previous.count,
    cardTotal,
    cashTotal,
    topCategoryName: topCategoryEntry[0],
    topCategoryAmount: topCategoryEntry[1],
    largestTxAmount: largestTx ? largestTx.amount : 0,
    largestTxCategory: largestTx ? largestTx.category : null,
    largestTxDate: largestTx ? largestTx.date : null,
    largestTxMemo: largestTx ? largestTx.store_memo : null,
    biggestIncreaseName: diffEntries.length ? diffEntries[0][0] : null,
    biggestIncreaseDiff: diffEntries.length ? diffEntries[0][1] : 0,
    biggestDecreaseName: diffEntries.length ? diffEntries[diffEntries.length - 1][0] : null,
    biggestDecreaseDiff: diffEntries.length ? diffEntries[diffEntries.length - 1][1] : 0,
    activeDays: Object.keys(current.byDate).length,
    avgPerDay: Math.round(current.total / daysInMonth),
    pendingCount: monthCandidates.length,
    pendingTotal: monthCandidates.reduce((s, c) => s + c.amount, 0),
  }

  // 精算書（メンバーごとの明細つき）
  const settlementBase = await getSettlement(year)
  const reimbRows = await listReimbursements({ year })
  const settlement = {
    year: Number(year),
    members: settlementBase.members.map((m) => {
      const lines = reimbRows.filter((r) => r.member === m.member)
      const unsettled = lines.filter((r) => !r.settled)
      const unsettledNet = unsettled.reduce(
        (s, r) => s + (r.direction === 'family_to_member' ? r.amount : -r.amount), 0
      )
      return {
        member: m.member,
        familyOwes: m.familyOwes,
        memberOwes: m.memberOwes,
        net: m.net,
        netDirection: m.net > 0 ? 'family_to_member' : m.net < 0 ? 'member_to_family' : 'none',
        unsettledCount: m.unsettledCount,
        unsettledNet,
        lines: lines.map((r) => ({
          id: r.id, date: r.date, direction: r.direction, amount: r.amount, detail: r.detail, settled: !!r.settled,
        })),
      }
    }),
    totalUnsettled: settlementBase.members.reduce(
      (s, m) => s + Math.abs(
        reimbRows.filter((r) => r.member === m.member && !r.settled)
          .reduce((a, r) => a + (r.direction === 'family_to_member' ? r.amount : -r.amount), 0)
      ), 0
    ),
  }

  return { anomalies, subscriptions, priceAlerts, storeComparisons, medical, monthlyReport, settlement }
}

// ---------- 横断検索 ----------
export async function searchAll(query) {
  const q = String(query || '').trim()
  if (!q) return { transactions: [], candidates: [], reimbursements: [] }
  const db = await getDb()
  const like = `%${q}%`
  const txRows = await db.execute({
    sql: `SELECT DISTINCT t.* FROM transactions t
          LEFT JOIN transaction_items ti ON ti.transaction_id = t.id
          WHERE t.store_memo LIKE ? OR t.category LIKE ? OR ti.item_name LIKE ?
          ORDER BY t.date DESC LIMIT 100`,
    args: [like, like, like],
  })
  const transactions = []
  for (const t of txRows.rows) {
    transactions.push({ ...t, items: await getTransactionItems(t.id) })
  }
  const candRows = await db.execute({
    sql: `SELECT DISTINCT c.* FROM candidates c
          LEFT JOIN candidate_items ci ON ci.candidate_id = c.id
          WHERE c.store LIKE ? OR c.note LIKE ? OR c.category LIKE ? OR ci.item_name LIKE ?
          ORDER BY c.date DESC LIMIT 100`,
    args: [like, like, like, like],
  })
  const candidates = []
  for (const c of candRows.rows) candidates.push(await candidateWithItems(c))
  const reimbRows = await db.execute({
    sql: `SELECT * FROM reimbursements WHERE detail LIKE ? OR member LIKE ? ORDER BY date DESC LIMIT 100`,
    args: [like, like],
  })
  return { transactions, candidates, reimbursements: reimbRows.rows }
}
