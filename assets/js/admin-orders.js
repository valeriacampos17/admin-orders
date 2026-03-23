import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { getFirestore, collection, query, orderBy, onSnapshot, doc, updateDoc, where, getDocs, addDoc } from "firebase/firestore";

// Firebase configuration (misma que en tu firebase.js)
const firebaseConfig = {
    apiKey: "AIzaSyBooZYVeqEWugoLudlTLwytNaYGWxD83Wc",
    authDomain: "vale-shop.firebaseapp.com",
    databaseURL: "https://vale-shop-default-rtdb.firebaseio.com",
    projectId: "vale-shop",
    storageBucket: "vale-shop.appspot.com",
    messagingSenderId: "280352853383",
    appId: "1:280352853383:web:2d48393a1426bd8ff2d722",
    measurementId: "G-Q51W1J1918"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Messaging opcional
let messaging = null;
try {
    if (window.isSecureContext && 'Notification' in window) {
        const { getMessaging } = await import("firebase/messaging");
        messaging = getMessaging(app);
        console.log('✅ Firebase Messaging inicializado');
    }
} catch (error) {
    console.log('⚠️ Firebase Messaging no disponible:', error.message);
}

// Variables globales
let currentUser = null;
let orders = [];
let currentFilter = 'all';
let searchTerm = '';
let unsubscribeOrders = null;
let notificationPermission = false;

// ==================== NOTIFICACIONES ====================

async function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
            if (reg.active && reg.active.scriptURL.includes('service-worker.js')) {
                console.log('✅ SW ya registrado');
                return reg;
            }
        }
        const registration = await navigator.serviceWorker.register('./service-worker.js', { scope: './' });
        console.log('✅ SW registrado:', registration.scope);
        return registration;
    } catch (error) {
        console.error('❌ Error SW:', error);
        return null;
    }
}

async function requestNotificationPermission() {
    if (!('Notification' in window)) {
        console.log('❌ Notificaciones no soportadas');
        return false;
    }

    if (Notification.permission === 'granted') {
        notificationPermission = true;
        console.log('✅ Notificaciones ya permitidas');
        return true;
    }

    if (Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        notificationPermission = permission === 'granted';

        if (notificationPermission && currentUser && messaging) {
            const registration = await registerSW();
            try {
                const { getToken } = await import("firebase/messaging");
                const token = await getToken(messaging, {
                    vapidKey: 'BO905tgtG6e5FIrh-d9bIXVZuL6cv024kw1ygHLDwrrMk55S06h7elY0YuKKpNR4egBoSabvG-OS6kbGTrfF9A0',
                    serviceWorkerRegistration: registration
                });
                console.log('✅ Token FCM:', token);

                const tokensRef = collection(db, "tokens");
                await addDoc(tokensRef, {
                    token: token,
                    userId: currentUser.uid,
                    userEmail: currentUser.email,
                    isAdmin: true,
                    createdAt: new Date().toISOString()
                });
            } catch (fcmError) {
                console.log('⚠️ FCM no disponible:', fcmError.message);
            }
        }
        return notificationPermission;
    }

    console.log('❌ Permiso de notificaciones denegado');
    return false;
}

function showToast({ title, message, type = 'success' }) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:1000';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    const colors = { success: '#27ae60', error: '#e74c3c', warning: '#f39c12', info: '#3498db' };
    const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };

    toast.style.borderLeftColor = colors[type];
    toast.innerHTML = `
        <i class="fas ${icons[type]}" style="color: ${colors[type]}"></i>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close" style="background:none;border:none;cursor:pointer;font-size:18px;">&times;</button>
    `;
    toast.querySelector('.toast-close').onclick = () => toast.remove();
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
}

function showNewOrderNotification(order) {
    if (notificationPermission) {
        try {
            new Notification('📦 Nuevo Pedido', {
                body: `Pedido #${order.id?.slice(-6)} - ${order.userName || 'Cliente'} - $${(order.total || 0).toFixed(2)}`,
                icon: './assets/icons/icon-192x192.png'
            });
        } catch (e) {
            console.log('Error mostrando notificación:', e);
        }
    }
    showToast({
        title: '📦 Nuevo Pedido',
        message: `Pedido #${order.id?.slice(-6)} de ${order.userName || 'Cliente'}`,
        type: 'success'
    });

    try {
        const audio = new Audio();
        audio.src = 'data:audio/wav;base64,U3RlcmVvIFdhdmUgRm9ybWF0IEluY2x1ZGVk';
        audio.volume = 0.3;
        audio.play();
    } catch (e) { }
}

function testNotification() {
    if (notificationPermission) {
        try {
            new Notification('🔔 Prueba', {
                body: 'Notificación funcionando',
                icon: './assets/icons/icon-192x192.png'
            });
        } catch (e) {
            console.log('Error:', e);
        }
    }
    showToast({
        title: 'Prueba',
        message: notificationPermission ? '✅ Notificaciones OK' : '⚠️ Permiso no concedido',
        type: notificationPermission ? 'success' : 'warning'
    });
}

// ==================== PEDIDOS ====================

// Función para obtener TODOS los pedidos (para admin)
async function getAllOrders() {
    try {
        const ordersRef = collection(db, "orders");
        const q = query(ordersRef, orderBy("date", "desc"));
        const querySnapshot = await getDocs(q);

        const orders = [];
        querySnapshot.forEach((doc) => {
            orders.push({
                id: doc.id,
                ...doc.data()
            });
        });

        return orders;
    } catch (e) {
        console.error("Error obteniendo todos los pedidos: ", e);
        return [];
    }
}

// Escuchar cambios en tiempo real en TODOS los pedidos
function loadOrders() {
    const container = document.getElementById('orders-content');
    if (container) {
        container.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i><p>Cargando pedidos...</p></div>';
    }

    if (unsubscribeOrders) unsubscribeOrders();

    const ordersRef = collection(db, "orders");
    // Ordenar por fecha (campo 'date' como en tu firebase.js)
    const q = query(ordersRef, orderBy("date", "desc"));

    unsubscribeOrders = onSnapshot(q, (snapshot) => {
        const newOrders = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            // Normalizar los datos del pedido (misma estructura que en settings.js)
            const order = {
                id: doc.id,
                userId: data.userId || '',
                userName: data.userName || data.customerName || 'Cliente',
                userEmail: data.userEmail || '',
                total: data.total || 0,
                subtotal: data.subtotal || 0,
                iva: data.iva || 0,
                envio: data.envio || 0,
                status: data.status || 'pendiente',
                date: data.date ? new Date(data.date) : new Date(),
                items: data.items || [],
                address: data.address || {},
                payment: data.payment || '',
                shippingAddress: data.address?.address || data.shippingAddress || ''
            };
            newOrders.push(order);
        });

        console.log('📦 Pedidos cargados:', newOrders.length);

        // Detectar nuevos pedidos
        if (orders.length && newOrders.length > orders.length) {
            const newOrder = newOrders.find(o => !orders.some(e => e.id === o.id));
            if (newOrder && (newOrder.status === 'pendiente' || newOrder.status === 'pending')) {
                showNewOrderNotification(newOrder);
            }
        }

        orders = newOrders;
        updateStats();
        renderOrders();
    }, (error) => {
        console.error('Error cargando pedidos:', error);
        if (container) {
            container.innerHTML = '<div class="loading"><i class="fas fa-exclamation-triangle"></i><p>Error cargando pedidos</p></div>';
        }
    });
}

function updateStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const total = orders.length;
    const pending = orders.filter(o => o.status === 'pendiente' || o.status === 'pending').length;
    const processing = orders.filter(o => o.status === 'procesando' || o.status === 'processing').length;
    const completedToday = orders.filter(o => {
        const orderDate = new Date(o.date);
        return (o.status === 'completado' || o.status === 'completed') && orderDate >= today;
    }).length;
    const revenueToday = orders
        .filter(o => {
            const orderDate = new Date(o.date);
            return (o.status === 'completado' || o.status === 'completed') && orderDate >= today;
        })
        .reduce((sum, o) => sum + (o.total || 0), 0);

    const elements = {
        'total-orders': total,
        'pending-orders': pending,
        'processing-orders': processing,
        'completed-today': completedToday,
        'revenue-today': `$${revenueToday.toFixed(2)}`
    };

    for (const [id, value] of Object.entries(elements)) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }
}

function renderOrders() {
    let filteredOrders = [...orders];

    if (currentFilter !== 'all') {
        const statusMap = {
            'pending': ['pendiente', 'pending'],
            'processing': ['procesando', 'processing'],
            'completed': ['completado', 'completed'],
            'cancelled': ['cancelado', 'cancelled']
        };
        const statusValues = statusMap[currentFilter] || [currentFilter];
        filteredOrders = filteredOrders.filter(o => statusValues.includes(o.status));
    }

    if (searchTerm) {
        filteredOrders = filteredOrders.filter(o =>
            o.id.toLowerCase().includes(searchTerm) ||
            (o.userName && o.userName.toLowerCase().includes(searchTerm)) ||
            (o.userEmail && o.userEmail.toLowerCase().includes(searchTerm))
        );
    }

    const container = document.getElementById('orders-content');
    if (!container) return;

    if (filteredOrders.length === 0) {
        container.innerHTML = `
            <div class="loading">
                <i class="fas fa-inbox"></i>
                <p>No hay pedidos para mostrar</p>
            </div>
        `;
        return;
    }

    const table = `
        <table class="orders-table">
            <thead>
                <tr>
                    <th>ID Pedido</th>
                    <th>Cliente</th>
                    <th>Fecha</th>
                    <th>Total</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                </thead>
                <tbody>
                    ${filteredOrders.map(order => renderOrderRow(order)).join('')}
                </tbody>
            </table>
        `;

    container.innerHTML = table;
}

function renderOrderRow(order) {
    const statusText = {
        'pendiente': 'Pendiente',
        'pending': 'Pendiente',
        'procesando': 'Procesando',
        'processing': 'Procesando',
        'completado': 'Completado',
        'completed': 'Completado',
        'cancelado': 'Cancelado',
        'cancelled': 'Cancelado'
    };

    const statusClass = {
        'pendiente': 'pending',
        'pending': 'pending',
        'procesando': 'processing',
        'processing': 'processing',
        'completado': 'completed',
        'completed': 'completed',
        'cancelado': 'cancelled',
        'cancelled': 'cancelled'
    };

    const date = order.date instanceof Date ?
        order.date.toLocaleDateString('es-ES') :
        new Date(order.date).toLocaleDateString('es-ES');

    const displayStatus = statusText[order.status] || order.status;
    const statusClassValue = statusClass[order.status] || order.status;

    return `
        <tr data-order-id="${order.id}">
            <td><strong>${order.id.slice(-8)}</strong></td>
            <td>${order.userName || order.userEmail || 'Cliente'}</td>
            <td>${date}</td>
            <td>$${(order.total || 0).toFixed(2)}</td>
            <td>
                <span class="status-badge status-${statusClassValue}">
                    ${displayStatus}
                </span>
            </td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn view" onclick="window.orderManager.viewOrderDetails('${order.id}')">
                        <i class="fas fa-eye"></i> Ver
                    </button>
                    ${getStatusButtons(order)}
                </div>
            </td>
        </tr>
    `;
}

function getStatusButtons(order) {
    const buttons = [];
    const status = order.status;

    if (status === 'pendiente' || status === 'pending') {
        buttons.push(`
            <button class="action-btn update" onclick="window.orderManager.updateOrderStatus('${order.id}', 'procesando')">
                <i class="fas fa-cog"></i> Procesar
            </button>
            <button class="action-btn cancel" onclick="window.orderManager.updateOrderStatus('${order.id}', 'cancelado')">
                <i class="fas fa-times"></i> Cancelar
            </button>
        `);
    } else if (status === 'procesando' || status === 'processing') {
        buttons.push(`
            <button class="action-btn complete" onclick="window.orderManager.updateOrderStatus('${order.id}', 'completado')">
                <i class="fas fa-check"></i> Completar
            </button>
            <button class="action-btn cancel" onclick="window.orderManager.updateOrderStatus('${order.id}', 'cancelado')">
                <i class="fas fa-times"></i> Cancelar
            </button>
        `);
    }

    return buttons.join('');
}

async function updateOrderStatus(orderId, newStatus) {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    const confirmMessages = {
        'procesando': '¿Marcar este pedido como en proceso?',
        'completado': '¿Marcar este pedido como completado?',
        'cancelado': '¿Cancelar este pedido?'
    };

    if (!confirm(confirmMessages[newStatus] || '¿Actualizar estado del pedido?')) {
        return;
    }

    try {
        await updateDoc(doc(db, "orders", orderId), {
            status: newStatus,
            updatedAt: new Date().toISOString(),
            updatedBy: currentUser?.uid
        });

        showToast({
            title: 'Actualizado',
            message: `Pedido #${orderId.slice(-6)} actualizado a ${newStatus}`,
            type: 'success'
        });

    } catch (error) {
        console.error('Error actualizando pedido:', error);
        showToast({
            title: 'Error',
            message: 'No se pudo actualizar el pedido',
            type: 'error'
        });
    }
}

function viewOrderDetails(orderId) {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    const modal = document.getElementById('order-modal');
    const modalBody = document.getElementById('modal-body');
    if (!modal || !modalBody) return;

    const date = order.date instanceof Date ?
        order.date.toLocaleString('es-ES') :
        new Date(order.date).toLocaleString('es-ES');

    const statusText = {
        'pendiente': 'Pendiente',
        'pending': 'Pendiente',
        'procesando': 'Procesando',
        'processing': 'Procesando',
        'completado': 'Completado',
        'completed': 'Completado',
        'cancelado': 'Cancelado',
        'cancelled': 'Cancelado'
    };

    const statusClass = {
        'pendiente': 'pending',
        'pending': 'pending',
        'procesando': 'processing',
        'processing': 'processing',
        'completado': 'completed',
        'completed': 'completed',
        'cancelado': 'cancelled',
        'cancelled': 'cancelled'
    };

    modalBody.innerHTML = `
        <div class="order-detail-item">
            <div class="order-detail-label">ID del Pedido</div>
            <div class="order-detail-value"><strong>${order.id}</strong></div>
        </div>
        
        <div class="order-detail-item">
            <div class="order-detail-label">Cliente</div>
            <div class="order-detail-value">${order.userName || order.userEmail || 'No especificado'}</div>
        </div>
        
        <div class="order-detail-item">
            <div class="order-detail-label">Fecha de Pedido</div>
            <div class="order-detail-value">${date}</div>
        </div>
        
        <div class="order-detail-item">
            <div class="order-detail-label">Dirección de Envío</div>
            <div class="order-detail-value">${order.shippingAddress || (order.address?.address) || 'No especificada'}</div>
        </div>
        
        <div class="order-detail-item">
            <div class="order-detail-label">Método de Pago</div>
            <div class="order-detail-value">${order.payment || 'No especificado'}</div>
        </div>
        
        <div class="order-detail-item">
            <div class="order-detail-label">Productos</div>
            ${order.items && order.items.length > 0 ? order.items.map(item => `
                <div class="product-item">
                    <span>${item.name} x ${item.quantity}</span>
                    <span>$${(item.price * item.quantity).toFixed(2)}</span>
                </div>
            `).join('') : '<p>No hay productos</p>'}
            <div class="product-item" style="background: #f0f0f0;">
                <span>Subtotal</span>
                <span>$${(order.subtotal || 0).toFixed(2)}</span>
            </div>
            <div class="product-item" style="background: #f0f0f0;">
                <span>IVA (16%)</span>
                <span>$${(order.iva || 0).toFixed(2)}</span>
            </div>
            <div class="product-item" style="background: #f0f0f0;">
                <span>Envío</span>
                <span>$${(order.envio || 0).toFixed(2)}</span>
            </div>
            <div class="product-item" style="background: #e0e0e0; font-weight: bold;">
                <span>Total</span>
                <span>$${(order.total || 0).toFixed(2)}</span>
            </div>
        </div>
        
        <div class="order-detail-item">
            <div class="order-detail-label">Estado Actual</div>
            <div class="order-detail-value">
                <span class="status-badge status-${statusClass[order.status] || order.status}">
                    ${statusText[order.status] || order.status}
                </span>
            </div>
        </div>
    `;

    modal.style.display = 'block';
}

// ==================== AUTENTICACIÓN ====================

async function checkIfAdmin(user) {
    try {
        const usersRef = collection(db, "users");
        const q = query(usersRef, where("uid", "==", user.uid));
        const snap = await getDocs(q);

        let isAdmin = false;
        snap.forEach(doc => {
            const data = doc.data();
            if (data.role === 'admin' || data.isAdmin === true) {
                isAdmin = true;
            }
        });

        if (isAdmin) {
            sessionStorage.setItem('user', JSON.stringify({
                uid: user.uid,
                email: user.email,
                isAdmin: true
            }));
        }

        return isAdmin;
    } catch (error) {
        console.error('Error verificando admin:', error);
        return false;
    }
}

function showLoginRequired(message) {
    const container = document.getElementById('orders-content');
    if (container) {
        container.innerHTML = `
            <div class="loading" style="text-align: center; padding: 60px 20px;">
                <i class="fas fa-lock" style="font-size: 48px; color: #e74c3c; margin-bottom: 20px;"></i>
                <p style="margin-bottom: 20px; color: #666;">${message}</p>
                <a href="./signin.html" class="btn-notification" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; border-radius: 25px; text-decoration: none;">
                    <i class="fas fa-sign-in-alt"></i> Iniciar Sesión
                </a>
            </div>
        `;
    }
}

// ==================== INICIALIZACIÓN ====================

function setupEventListeners() {
    // Filtros
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.status;
            renderOrders();
        });
    });

    // Búsqueda
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchTerm = e.target.value.toLowerCase();
            renderOrders();
        });
    }

    // Refrescar
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            if (unsubscribeOrders) {
                unsubscribeOrders();
                loadOrders();
            }
        });
    }

    // Probar notificación
    const testBtn = document.getElementById('test-notification-btn');
    if (testBtn) {
        testBtn.addEventListener('click', testNotification);
    }

    // Modal
    const modal = document.getElementById('order-modal');
    const closeModal = document.querySelector('.close-modal');
    if (closeModal) {
        closeModal.addEventListener('click', () => {
            if (modal) modal.style.display = 'none';
        });
    }

    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });
}

// Escuchar mensajes del service worker
if (navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'OPEN_ORDER') {
            viewOrderDetails(event.data.orderId);
        }
    });
}

// Exponer funciones globales
window.orderManager = {
    updateOrderStatus,
    viewOrderDetails
};

// Iniciar autenticación
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        const isAdmin = await checkIfAdmin(user);

        if (isAdmin) {
            console.log('✅ Admin autenticado:', user.email);
            await registerSW();
            await requestNotificationPermission();
            loadOrders();
        } else {
            showLoginRequired('No eres administrador. Inicia sesión con cuenta de admin.');
        }
    } else {
        const savedSession = sessionStorage.getItem('user');
        if (savedSession) {
            const userData = JSON.parse(savedSession);
            if (userData.isAdmin) {
                console.log('✅ Sesión admin encontrada:', userData.email);
                currentUser = userData;
                registerSW();
                requestNotificationPermission();
                loadOrders();
                return;
            }
        }
        showLoginRequired('Por favor inicia sesión para acceder al panel de administración.');
    }
});

// Inicializar eventos
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupEventListeners);
} else {
    setupEventListeners();
}

console.log('🚀 Panel Administrativo cargado');