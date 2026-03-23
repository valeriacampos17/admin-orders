const CACHE_NAME = 'vale-shop-admin-v3';

// Rutas relativas para la carpeta admin-orders
const urlsToCache = [
    './',
    './admin-orders.html',
    './signin.html',
    './manifest.json',
    './assets/css/admin.css',
    './assets/js/admin-orders.js',
    './assets/icons/icon-120x120.png',
    './assets/icons/icon-167x167.png',
    './assets/icons/icon-180x180.png',
    './assets/icons/icon-192x192.png',
    './assets/icons/icon-512x512.png'
];

// Instalación
self.addEventListener('install', event => {
    console.log('[SW Admin] Instalando versión:', CACHE_NAME);
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('[SW Admin] Cacheando recursos');
            return cache.addAll(urlsToCache);
        }).catch(error => {
            console.error('[SW Admin] Error en instalación:', error);
        })
    );
    self.skipWaiting();
});

// Activación - Limpiar cachés antiguas
self.addEventListener('activate', event => {
    console.log('[SW Admin] Activando versión:', CACHE_NAME);
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[SW Admin] Eliminando caché:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('[SW Admin] Activación completada');
            return self.clients.claim();
        })
    );
});

// Escuchar mensajes desde la página
self.addEventListener('message', (event) => {
    console.log('[SW Admin] Mensaje recibido:', event.data);
    if (event.data?.type === 'SHOW_ORDER_NOTIFICATION') {
        const order = event.data.order;
        showOrderNotification(order);
    }
});

// Mostrar notificación de nuevo pedido
function showOrderNotification(order) {
    if (!self.registration?.showNotification) return;

    const notificationTitle = `📦 Nuevo Pedido #${order.id?.slice(-6) || 'Nuevo'}`;
    const notificationOptions = {
        body: `${order.customerName || order.userName || 'Cliente'} - $${(order.total || 0).toFixed(2)}`,
        icon: './assets/icons/icon-192x192.png',
        badge: './assets/icons/icon-192x192.png',
        vibrate: [200, 100, 200],
        data: {
            url: './admin-orders.html',
            orderId: order.id
        },
        actions: [
            { action: 'view', title: 'Ver Pedido' },
            { action: 'view-all', title: 'Ver Todos' }
        ],
        tag: `order-${order.id}`,
        requireInteraction: true
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
}

// Manejar notificaciones push (desde Firebase)
self.addEventListener('push', (event) => {
    console.log('[SW Admin] Push recibido:', event);

    if (!self.registration?.showNotification) return;

    let data = {};
    try {
        if (event.data) {
            data = event.data.json();
            console.log('[SW Admin] Datos del push:', data);
        }
    } catch (e) {
        console.error('[SW Admin] Error parseando push data:', e);
    }

    const notification = data.notification || data;
    const notificationTitle = notification.title || '📦 Nuevo Pedido';
    const notificationOptions = {
        body: notification.body || 'Hay un nuevo pedido pendiente de revisión',
        icon: notification.icon || './assets/icons/icon-192x192.png',
        badge: './assets/icons/icon-192x192.png',
        vibrate: [100, 50, 100],
        data: {
            url: notification.click_action || './admin-orders.html',
            orderId: data.orderId || notification.orderId
        },
        actions: [
            { action: 'open', title: 'Ver Pedidos' }
        ]
    };

    event.waitUntil(
        self.registration.showNotification(notificationTitle, notificationOptions)
    );
});

// Manejar clic en notificaciones
self.addEventListener('notificationclick', (event) => {
    console.log('[SW Admin] Notificación clickeada:', event);
    event.notification.close();

    const action = event.action;
    const notificationData = event.notification.data;
    let url = notificationData?.url || './admin-orders.html';
    const orderId = notificationData?.orderId;

    // Determinar URL según la acción
    if (action === 'view' && orderId) {
        url = `./admin-orders.html?order=${orderId}`;
    } else if (action === 'view-all') {
        url = './admin-orders.html';
    }

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(windowClients => {
                // Buscar ventana existente
                for (let client of windowClients) {
                    if (client.url.includes('admin-orders') && 'focus' in client) {
                        client.focus();
                        // Enviar mensaje para abrir el pedido específico
                        if (orderId && client.postMessage) {
                            client.postMessage({
                                type: 'OPEN_ORDER',
                                orderId: orderId
                            });
                        }
                        return;
                    }
                }
                // Si no hay ventana, abrir una nueva
                if (clients.openWindow) {
                    return clients.openWindow(url);
                }
            })
    );
});

// Estrategia de carga
self.addEventListener('fetch', event => {
    const url = event.request.url;

    // Ignorar peticiones a Firebase y externos
    if (url.includes('firebase') ||
        url.includes('googleapis') ||
        url.includes('cloudflare') ||
        url.includes('firebaseio.com')) {
        return;
    }

    // Para admin-orders.html, usar Network First
    if (url.includes('admin-orders.html')) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseClone);
                    });
                    return response;
                })
                .catch(() => {
                    return caches.match(event.request);
                })
        );
        return;
    }

    // Para assets estáticos, usar Cache First
    if (url.includes('/assets/')) {
        event.respondWith(
            caches.match(event.request).then(response => {
                return response || fetch(event.request);
            })
        );
        return;
    }

    // Para el resto, Cache First con fallback
    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request).catch(() => {
                if (event.request.mode === 'navigate') {
                    return caches.match('./admin-orders.html');
                }
            });
        })
    );
});