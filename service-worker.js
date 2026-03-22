const CACHE_NAME = 'vale-shop-cache-v1';

// Usamos rutas relativas para que funcione en cualquier servidor
const urlsToCache = [
    './',
    './admin-orders.html',
];

// Instalación
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('Abriendo caché y añadiendo recursos');
            return cache.addAll(urlsToCache);
        })
    );
    self.skipWaiting();
});

// Activación
self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Escuchar mensajes desde la página
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SHOW_ORDER_NOTIFICATION') {
        const order = event.data.order;
        showOrderNotification(order);
    }
});

// Función para mostrar notificación de nuevo pedido
function showOrderNotification(order) {
    if (!(self.registration && self.registration.showNotification)) return;

    const notificationTitle = `📦 Nuevo Pedido #${order.id?.slice(-6) || 'Nuevo'}`;
    const notificationOptions = {
        body: `${order.userName || order.customerName || 'Cliente'} - Total: $${(order.total || 0).toFixed(2)}\n${order.items?.length || 0} producto(s)`,
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

// Manejar notificaciones push desde Firebase
self.addEventListener('push', (event) => {
    console.log('Push recibido:', event);

    if (!(self.registration && self.registration.showNotification)) return;

    let data = {};
    try {
        if (event.data) {
            data = event.data.json();
            console.log('Datos del push:', data);
        }
    } catch (e) {
        console.error('Error parseando push data:', e);
    }

    // Si es una notificación de Firebase Cloud Messaging
    const notification = data.notification || data;
    const notificationTitle = notification.title || '📦 Vale-Shop - Nuevo Pedido';
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
        ],
    };

    event.waitUntil(
        self.registration.showNotification(notificationTitle, notificationOptions)
    );
});

// Manejar clic en notificaciones
self.addEventListener('notificationclick', (event) => {
    console.log('Notificación clickeada:', event);
    event.notification.close();

    const action = event.action;
    const notificationData = event.notification.data;
    let url = notificationData?.url || './admin-orders.html';
    const orderId = notificationData?.orderId;

    // Si se hizo clic en "Ver Pedido" y hay ID
    if (action === 'view' && orderId) {
        url = `./admin-orders.html?order=${orderId}`;
    } else if (action === 'view-all') {
        url = './admin-orders.html';
    }

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(windowClients => {
                // Buscar si ya hay una ventana abierta con la URL
                for (let client of windowClients) {
                    if (client.url.includes(url.split('?')[0]) && 'focus' in client) {
                        // Si hay una ventana con la página, la enfocamos
                        client.focus();
                        // Si tiene orderId, enviamos un mensaje para abrir el modal
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

// Estrategia de carga: Cache First con fallback a red
self.addEventListener('fetch', event => {
    // Ignorar peticiones a firebase y otros dominios externos
    if (event.request.url.includes('firebase') ||
        event.request.url.includes('googleapis') ||
        event.request.url.includes('cloudflare') ||
        event.request.url.includes('firebaseio.com')) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request).catch(() => {
                // Fallback para cuando no hay conexión
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
            });
        })
    );
});