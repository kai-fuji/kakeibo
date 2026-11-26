// pages/api/icon/[name].js - アプリアイコン配信（lib/icon-data.js のBase64をPNGで返す）
// 例: /api/icon/192.png /api/icon/512.png /api/icon/180.png /api/icon/maskable-512.png
import { ICON_PNG } from '../../../lib/icon-data'

export default function handler(req, res) {
  const name = String(req.query.name || '').replace(/\.png$/, '')
  const b64 = ICON_PNG[name]
  if (!b64) return res.status(404).send('not found')
  const buf = Buffer.from(b64, 'base64')
  res.setHeader('Content-Type', 'image/png')
  res.setHeader('Cache-Control', 'public, max-age=86400')
  return res.status(200).send(buf)
}
