# 家計簿アプリ

家族の家計簿アプリ。月次集計・現金・建て替え精算に対応。
技術構成: Next.js 14 + React 18 + Tailwind CSS 3 + Turso (@libsql/client) + Vercel

要件の詳細は `requirements.md` を参照。

## 機能（Phase 1）

- **月次集計**: 月の支出合計、固定／変動／特別の区分別合計、カテゴリー別内訳（構成比・バー）、先月比
- **明細（毎日家計簿）**: 日付×カテゴリーの記録。追加・編集・削除。支払い方法（家族カード／現金）と、現金の場合の支払者を記録
- **現金**: 現金支出の一覧と支払者別合計（現金分も月次集計に含まれる）
- **建て替え**: 台帳（両方向）と年次精算。メンバーごとに相殺した差額（振込額）を自動計算し、精算済みで年度を締められる
- **価格推移**: 明細に品目明細（商品名・単価・個数）を入れると、商品ごとの価格履歴が溜まっていく
- **設定**: カテゴリー・メンバーの管理、JSON / CSV エクスポート
- **認証**: 全APIに認証必須。画面用パスワードログイン + 外部AI用APIトークン

## セットアップ

```bash
npm install
cp .env.example .env.local  # 値を設定
npm run dev
```

### 環境変数

| 変数 | 説明 |
| --- | --- |
| `TURSO_DATABASE_URL` | TursoのDB URL。未設定ならローカルファイル `kakeibo.db` |
| `TURSO_AUTH_TOKEN` | Tursoの認証トークン |
| `APP_PASSWORD` | 画面ログイン用パスワード（公開時は必須） |
| `API_TOKEN` | 外部AIがAPIを呼ぶためのトークン（必須・秘密） |

Vercelにデプロイする場合は、プロジェクトの Environment Variables に同じ変数を設定する。
認証情報を両方とも未設定の場合のみ、ローカル開発用に認証なしで動作する。

### 最初の使い方

1. 設定画面で家族メンバーを登録する（現金の支払者・建て替えで使う）
2. 明細画面から支出を記録する

## iPhoneでアプリとして使う（PWA）

PWA対応済み（`public/manifest.json` + 軽量Service Worker `public/sw.js`）。ネイティブアプリ化は不要。

1. VercelにデプロイしたURLを iPhone の Safari で開く
2. 共有ボタン → 「ホーム画面に追加」
3. ホーム画面の「家計簿」アイコンから起動すると、フルスクリーン（standalone）でアプリらしく開く

- Service Worker はアプリのシェル（HTML・静的アセット）だけをキャッシュし、`/api/` のレスポンスはキャッシュしない（家計データは常に最新を取得）
- アイコンは会計士ミッキー（`public/icon-*.png`、maskable 含む）

## 外部AI（Muse）からの記入（Phase 2 の使い方）

レシート写真をClaudeが読み取り、このAPIで登録する想定。

```bash
curl -X POST https://<your-app>/api/transactions \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2026-09-04",
    "category": "食費",
    "amount": 2480,
    "store_memo": "KOHYO",
    "payment_method": "card",
    "items": [
      {"item_name": "牛乳", "unit_price": 248, "quantity": 2},
      {"item_name": "卵", "unit_price": 298, "quantity": 1}
    ]
  }'
```

- `payment_method` は `card`（家族カード）か `cash`（現金）。現金の場合は `payer`（支払者のメンバー名）が必須
- 個人の支出を家族カードで払った場合は、支出として登録せず `/api/reimbursements` に `direction: "member_to_family"` で登録する
- 家族の支出を個人が立て替えた場合は、支出として登録し、さらに `/api/reimbursements` に `direction: "family_to_member"` で登録する

## 主なAPI

| API | 内容 |
| --- | --- |
| `GET /api/summary?month=YYYY-MM` | 月次集計（先月分つき） |
| `GET/POST/PUT/DELETE /api/transactions` | 支出明細（品目明細つき） |
| `GET /api/cash?month=YYYY-MM` | 現金一覧と支払者別合計 |
| `GET/POST/PUT/DELETE /api/reimbursements` | 建て替え台帳 |
| `GET /api/reimbursements?mode=settlement&year=YYYY` | 年次精算の差額 |
| `GET /api/items` / `GET /api/items?item_id=N` | 商品一覧 / 価格履歴 |
| `GET /api/categories`, `GET /api/members` | カテゴリー・メンバー |
| `GET /api/export` (`?format=csv` 可) | 全データ出力 |
