// lib/characters.js - アプリ内キャラクター（アバター）の選択
// 一覧（おすすめ順）と選択状態の管理。画像データ本体は lib/characters-full.js（設定画面だけが読み込む）。
// 選択中の画像は localStorage にキャッシュされ、全ページのヘッダー等で使われる。
import { useEffect, useState } from 'react'

export const CHARACTERS = [
  {
    "id": "accountant",
    "name": "ミッキー（会計士）"
  },
  {
    "id": "mickey",
    "name": "ミッキーマウス"
  },
  {
    "id": "mickey25",
    "name": "25周年ミッキーマウス"
  },
  {
    "id": "morty",
    "name": "モーティー・フェルディー"
  },
  {
    "id": "oswald",
    "name": "オズワルド"
  },
  {
    "id": "pluto",
    "name": "プルート"
  },
  {
    "id": "goofy",
    "name": "グーフィー"
  },
  {
    "id": "max",
    "name": "マックス"
  },
  {
    "id": "donald",
    "name": "ドナルドダック"
  },
  {
    "id": "daisy",
    "name": "デイジーダック"
  },
  {
    "id": "huey",
    "name": "ヒューイ、デューイ、ルーイ"
  },
  {
    "id": "chip",
    "name": "チップ"
  },
  {
    "id": "dale",
    "name": "デール"
  },
  {
    "id": "clarice",
    "name": "クラリス"
  },
  {
    "id": "gadget",
    "name": "ガジェット"
  },
  {
    "id": "minnie",
    "name": "ミニーマウス"
  },
  {
    "id": "minnie25",
    "name": "25周年ミニーマウス"
  },
  {
    "id": "figaro",
    "name": "フィガロ"
  },
  {
    "id": "duffy",
    "name": "ダッフィー"
  },
  {
    "id": "shelliemay",
    "name": "シェリーメイ"
  },
  {
    "id": "gelatoni",
    "name": "ジェラトーニ"
  },
  {
    "id": "stellalou",
    "name": "ステラ・ルー"
  },
  {
    "id": "cookieann",
    "name": "クッキー・アン"
  },
  {
    "id": "olumel",
    "name": "オル・メル"
  },
  {
    "id": "linabell",
    "name": "リーナ・ベル"
  },
  {
    "id": "woody",
    "name": "ウッディ"
  },
  {
    "id": "buzz",
    "name": "バズ・ライトイヤー"
  },
  {
    "id": "hamm",
    "name": "ハム"
  },
  {
    "id": "littlegreenmen",
    "name": "リトルグリーンメン"
  },
  {
    "id": "lotso",
    "name": "ロッツォ"
  },
  {
    "id": "stitch",
    "name": "スティッチ"
  },
  {
    "id": "pooh",
    "name": "プー"
  },
  {
    "id": "tigger",
    "name": "ティガー"
  },
  {
    "id": "elsa",
    "name": "エルサ"
  },
  {
    "id": "anna",
    "name": "アナ"
  },
  {
    "id": "olaf",
    "name": "オラフ"
  },
  {
    "id": "baymax",
    "name": "ベイマックス"
  },
  {
    "id": "ariel",
    "name": "アリエル"
  },
  {
    "id": "belle",
    "name": "ベル"
  },
  {
    "id": "cinderella",
    "name": "シンデレラ"
  },
  {
    "id": "snowwhite",
    "name": "スノーホワイト"
  },
  {
    "id": "aurora",
    "name": "オーロラ"
  },
  {
    "id": "rapunzel",
    "name": "ラプンツェル"
  },
  {
    "id": "jasmine",
    "name": "ジャスミン"
  },
  {
    "id": "alice",
    "name": "アリス"
  },
  {
    "id": "cheshire",
    "name": "チェシャ猫"
  },
  {
    "id": "simba",
    "name": "シンバ"
  },
  {
    "id": "nemo",
    "name": "ニモ"
  },
  {
    "id": "dumbo",
    "name": "ダンボ"
  },
  {
    "id": "bambi",
    "name": "バンビ"
  },
  {
    "id": "pinocchio",
    "name": "ピノキオ"
  },
  {
    "id": "peterpan",
    "name": "ピーターパン"
  },
  {
    "id": "tinkerbell",
    "name": "ティンカーベル"
  },
  {
    "id": "judy",
    "name": "ジュディ・ホップス"
  },
  {
    "id": "nick",
    "name": "ニック・ワイルド"
  },
  {
    "id": "mike",
    "name": "マイク"
  },
  {
    "id": "sulley",
    "name": "サリー（モンスターズ・インク）"
  },
  {
    "id": "boo",
    "name": "ブー"
  },
  {
    "id": "genie",
    "name": "ジーニー"
  },
  {
    "id": "flounder",
    "name": "フランダー"
  },
  {
    "id": "crush",
    "name": "クラッシュ"
  },
  {
    "id": "jose",
    "name": "ホセ・キャリオカ"
  },
  {
    "id": "panchito",
    "name": "パンチート"
  },
  {
    "id": "pablo",
    "name": "パブロ"
  },
  {
    "id": "meeko",
    "name": "ミーコ"
  },
  {
    "id": "henry",
    "name": "ヘンリー"
  },
  {
    "id": "cleo",
    "name": "クレオ"
  },
  {
    "id": "pascal",
    "name": "パスカル"
  },
  {
    "id": "tramp",
    "name": "トランプ"
  },
  {
    "id": "lady",
    "name": "レディ"
  },
  {
    "id": "lucky",
    "name": "ラッキー"
  },
  {
    "id": "dopey",
    "name": "おとぼけ"
  },
  {
    "id": "marie",
    "name": "マリー"
  },
  {
    "id": "sofia",
    "name": "ソフィア"
  },
  {
    "id": "jack",
    "name": "ジャック・スケリントン"
  },
  {
    "id": "sally",
    "name": "サリー（ナイトメア）"
  },
  {
    "id": "zero",
    "name": "ゼロ"
  },
  {
    "id": "incredible",
    "name": "Mr.インクレディブル"
  },
  {
    "id": "walle",
    "name": "ウォーリー"
  },
  {
    "id": "mcqueen",
    "name": "ライトニング・マックィーン"
  },
  {
    "id": "ralph",
    "name": "ラルフ"
  },
  {
    "id": "vanellope",
    "name": "ヴァネロペ"
  },
  {
    "id": "timothy",
    "name": "ティモシー"
  },
  {
    "id": "oyster",
    "name": "オイスター"
  },
  {
    "id": "chandu",
    "name": "チャンドゥ"
  },
  {
    "id": "vader",
    "name": "ダース・ベイダー"
  },
  {
    "id": "r2d2",
    "name": "R2-D2"
  },
  {
    "id": "c3po",
    "name": "C-3PO"
  },
  {
    "id": "stormtrooper",
    "name": "ストームトルーパー"
  },
  {
    "id": "yoda",
    "name": "ヨーダ"
  },
  {
    "id": "flower",
    "name": "フラワー"
  }
]

export const CHARACTERS_BY_NAME = [...CHARACTERS].sort((a, b) => a.name.localeCompare(b.name, 'ja'))

export const DEFAULT_CHARACTER = { id: 'accountant', name: 'ミッキー（会計士）', src: '/mickey-accountant.png' }

const KEY = 'kakeibo-character'
const listeners = new Set()

export function setCharacter(id, src) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ id, src }))
  } catch { /* ignore */ }
  listeners.forEach((fn) => fn())
}

function readSelection() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_CHARACTER
    const { id, src } = JSON.parse(raw)
    const meta = CHARACTERS.find((c) => c.id === id)
    if (!meta) return DEFAULT_CHARACTER
    return { id, name: meta.name, src: id === 'accountant' ? DEFAULT_CHARACTER.src : src || DEFAULT_CHARACTER.src }
  } catch {
    return DEFAULT_CHARACTER
  }
}

export function useCharacter() {
  const [char, setChar] = useState(DEFAULT_CHARACTER)
  useEffect(() => {
    const update = () => setChar(readSelection())
    update()
    listeners.add(update)
    return () => listeners.delete(update)
  }, [])
  return char
}
