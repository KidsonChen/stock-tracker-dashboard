/**
 * Service Worker for Stock Tracker Dashboard
 * 提供離線支援和資源快取
 */

const CACHE_NAME = 'stock-tracker-v2';
const RUNTIME_CACHE = 'stock-tracker-runtime-v2';

// 需要快取的資源
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// 安裝 Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // 某些資源可能無法快取，但不影響 Service Worker 的安裝
      });
    })
  );
  self.skipWaiting();
});

// 激活 Service Worker
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE)
          .map((cacheName) => caches.delete(cacheName))
      );
    })
  );
  self.clients.claim();
});

// 攔截網路請求
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 只快取 GET 請求
  if (request.method !== 'GET') {
    return;
  }

  // API 請求使用 Network First 策略
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // 先 clone 再檢查和使用
          const clonedResponse = response.clone();
          if (response.ok) {
            caches.open(RUNTIME_CACHE).then((cache) => {
              cache.put(request, clonedResponse);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(request);
        })
    );
    return;
  }

  // HTML / 導覽請求使用 Network First：避免部署新版後使用者一直拿到舊 bundle
  if (request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clonedResponse = response.clone();
          if (response.ok) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, clonedResponse);
            });
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // 靜態資源使用 Cache First 策略
  event.respondWith(
    caches.match(request).then((response) => {
      if (response) {
        return response;
      }

      return fetch(request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type === 'error') {
            return response;
          }

          // 先 clone 再快取
          const clonedResponse = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(request, clonedResponse);
          });

          return response;
        })
        .catch(() => {
          // 離線時返回快取的資源
          return caches.match(request);
        });
    })
  );
});

// 處理推播通知
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  const title = data.title || '股市追蹤';
  const options = {
    body: data.body || '您有新的股市通知',
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect fill="%230F0F0F" width="192" height="192"/><text x="50%" y="50%" font-size="80" font-weight="bold" fill="%2300FF88" text-anchor="middle" dominant-baseline="middle" font-family="monospace">$</text></svg>',
    badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect fill="%230F0F0F" width="192" height="192"/><text x="50%" y="50%" font-size="80" font-weight="bold" fill="%2300FF88" text-anchor="middle" dominant-baseline="middle" font-family="monospace">$</text></svg>',
    tag: 'stock-notification',
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// 處理通知點擊
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      // 如果已有視窗開啟，就聚焦到該視窗
      for (let i = 0; i < clientList.length; i++) {
        if (clientList[i].url === '/' && 'focus' in clientList[i]) {
          return clientList[i].focus();
        }
      }
      // 否則開啟新視窗
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
