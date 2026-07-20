/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching'

declare const self: ServiceWorkerGlobalScope & typeof globalThis

precacheAndRoute(self.__WB_MANIFEST)

self.addEventListener('push', (event) => {
  const { title, body, url } = event.data?.json() ?? {}
  if (!title) return
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data: { url },
      icon: '/icon-192.png',
      badge: '/icon-192.png',
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url: string = event.notification.data?.url ?? '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      const client = clients[0]
      if (client) {
        await client.focus()
        await client.navigate(url)
      } else {
        await self.clients.openWindow(url)
      }
    }),
  )
})
