self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(clients.claim()))

self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  var url = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (windowClients) {
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i]
        try {
          if (new URL(client.url).origin === self.location.origin) {
            return client.focus().then(function (c) { return c.navigate(url) })
          }
        } catch (e) {}
      }
      return clients.openWindow(url)
    })
  )
})
