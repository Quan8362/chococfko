self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(clients.claim()))

// Web Push: ALWAYS show the OS notification. Deciding whether to suppress based on
// tab focus inside the service worker proved unreliable (WindowClient.focused is
// flaky across browsers) and skipping while a hidden tab is open triggers Chrome's
// "silent push" penalty (which disabled the subscription). Instead, when a page is
// focused it closes this notification itself (by tag) and shows an in-app toast.
self.addEventListener('push', function (event) {
  var data = {}
  try { data = event.data ? event.data.json() : {} } catch (e) {}

  var title = data.title || 'Chợ Cóc FKO'
  var options = {
    body: data.body || '',
    icon: data.icon || '/logo-nav.png',
    badge: '/logo-nav.png',
    tag: data.tag || undefined,
    data: { url: data.url || '/' },
    requireInteraction: false,
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  var url = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (windowClients) {
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i]
        try {
          if (new URL(client.url).origin === self.location.origin) {
            // Ask the page to navigate itself (client.navigate() fails for windows
            // not controlled by this SW). The page listens for this message.
            client.postMessage({ type: 'notification-navigate', url: url })
            return client.focus()
          }
        } catch (e) {}
      }
      // No open tab → open a fresh one at the target URL
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})
