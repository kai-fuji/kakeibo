// 空の欄（記録がまだない等）の共通表示：選択中キャラクターの丸アバター＋下に通常の文字（吹き出しなし）
import { useCharacter } from '../lib/characters'

export default function EmptyState({ text }) {
  const char = useCharacter()
  return (
    <div className="text-center py-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={char.src} alt={char.name} className="w-16 h-16 rounded-full object-cover mx-auto border-[3px] border-yellow-200 bg-white shadow-sm" />
      <p className="text-gray-400 text-sm mt-2">{text}</p>
    </div>
  )
}
