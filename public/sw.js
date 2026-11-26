// 家計簿アプリ Service Worker
// 方針: アプリのシェル（HTML/静的アセット）だけを軽くキャッシュする。
// 家計データは API + Turso が正なので、/api/ のレスポンスは絶対にキャッシュしない。
const CACHE_NAME = 'kakeibo-shell-v2'
// manifest とアイコンは先読みキャッシュしない（古いアイコンが残り続けるのを防ぐ）
const PRECACHE_URLS = []

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // API は常にネットワーク（古い家計データを掴ませない）
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return
  // 他オリジン（Google Fonts 等）はブラウザ標準に任せる
  if (url.origin !== self.location.origin) return
  // Service Worker 自身はキャッシュしない
  if (url.pathname === '/sw.js') return
  // manifest は常にネットワーク（アイコン変更を即反映するため）
  if (url.pathname === '/manifest.json') return

  // ページ遷移: ネットワーク優先、失敗時だけキャッシュ（オフライン時の保険）
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
          return response
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match('/')))
    )
    return
  }

  // 静的アセット（_next/static, アイコン, 画像）: キャッシュ優先 + 裏で更新
  event.respondWith(
    caches.match(request).then((hit) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
          }
          return response
        })
        .catch(() => hit)
      return hit || network
    })
  )
})
