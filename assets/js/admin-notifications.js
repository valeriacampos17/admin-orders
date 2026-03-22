// Sistema de notificaciones para administrador
class AdminNotificationSystem {
    constructor() {
        this.permissionGranted = false;
        this.newOrdersCount = 0;
        this.soundEnabled = true;
        this.toastContainer = null;
        this.init();
    }

    async init() {
        await this.requestNotificationPermission();
        this.createToastContainer();
        this.setupEventListeners();
        this.loadSettings();
    }

    // Solicitar permiso para notificaciones
    async requestNotificationPermission() {
        if (!('Notification' in window)) {
            console.log('Este navegador no soporta notificaciones');
            return false;
        }

        if (Notification.permission === 'granted') {
            this.permissionGranted = true;
            return true;
        }

        if (Notification.permission !== 'denied') {
            const permission = await Notification.requestPermission();
            this.permissionGranted = permission === 'granted';
            return this.permissionGranted;
        }

        return false;
    }

    // Crear contenedor para toasts
    createToastContainer() {
        this.toastContainer = document.createElement('div');
        this.toastContainer.id = 'toast-container';
        this.toastContainer.style.position = 'fixed';
        this.toastContainer.style.bottom = '20px';
        this.toastContainer.style.right = '20px';
        this.toastContainer.style.zIndex = '1000';
        document.body.appendChild(this.toastContainer);
    }

    // Configurar event listeners
    setupEventListeners() {
        const testBtn = document.getElementById('test-notification-btn');
        if (testBtn) {
            testBtn.addEventListener('click', () => {
                this.showTestNotification();
            });
        }
    }

    // Cargar configuración guardada
    loadSettings() {
        const savedSoundSetting = localStorage.getItem('admin_notification_sound');
        if (savedSoundSetting !== null) {
            this.soundEnabled = savedSoundSetting === 'true';
        }
    }

    // Mostrar notificación de nuevo pedido
    showNewOrderNotification(order) {
        // Notificación del sistema
        if (this.permissionGranted) {
            const notification = new Notification('📦 Nuevo Pedido Recibido', {
                body: `Pedido #${order.id || 'Nuevo'} - ${order.customerName || 'Cliente'}\nTotal: $${order.total || 0}\n${order.items?.length || 0} producto(s)`,
                icon: '/assets/icons/icon-192x192.png',
                badge: '/assets/icons/icon-192x192.png',
                vibrate: [200, 100, 200],
                tag: `order-${order.id}`,
                requireInteraction: true,
                data: {
                    orderId: order.id,
                    url: '/admin-orders.html'
                }
            });

            notification.onclick = (event) => {
                event.preventDefault();
                window.focus();
                notification.close();
                // Abrir modal con detalles del pedido
                if (window.orderManager) {
                    window.orderManager.viewOrderDetails(order.id);
                }
            };
        }

        // Toast notification
        this.showToast({
            title: 'Nuevo Pedido',
            message: `Pedido #${order.id || 'Nuevo'} de ${order.customerName || 'Cliente'} por $${order.total || 0}`,
            type: 'success',
            icon: 'fas fa-box-open'
        });

        // Reproducir sonido
        this.playNewOrderSound();

        // Actualizar contador
        this.newOrdersCount++;
        this.updateBadgeCount();
    }

    // Mostrar notificación de actualización de pedido
    showOrderUpdateNotification(order, oldStatus, newStatus) {
        if (this.permissionGranted) {
            const notification = new Notification('🔄 Pedido Actualizado', {
                body: `Pedido #${order.id} cambiado de ${oldStatus} a ${newStatus}`,
                icon: '/assets/icons/icon-192x192.png',
                tag: `order-update-${order.id}`
            });

            setTimeout(() => notification.close(), 5000);
        }

        this.showToast({
            title: 'Pedido Actualizado',
            message: `Pedido #${order.id} - Estado: ${newStatus}`,
            type: 'info',
            icon: 'fas fa-sync-alt'
        });
    }

    // Mostrar toast
    showToast({ title, message, type = 'info', icon = 'fas fa-info-circle', duration = 5000 }) {
        const toast = document.createElement('div');
        toast.className = 'toast-notification';

        const colors = {
            success: '#27ae60',
            error: '#e74c3c',
            warning: '#f39c12',
            info: '#3498db'
        };

        toast.style.borderLeftColor = colors[type] || colors.info;

        toast.innerHTML = `
            <i class="${icon}" style="color: ${colors[type] || colors.info}"></i>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                <div class="toast-message">${message}</div>
            </div>
            <button class="toast-close"><i class="fas fa-times"></i></button>
        `;

        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => {
            toast.remove();
        });

        this.toastContainer.appendChild(toast);

        setTimeout(() => {
            if (toast.parentNode) {
                toast.style.animation = 'slideOutRight 0.3s';
                setTimeout(() => toast.remove(), 300);
            }
        }, duration);
    }

    // Reproducir sonido para nuevo pedido
    playNewOrderSound() {
        if (!this.soundEnabled) return;

        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.frequency.value = 880;
            gainNode.gain.value = 0.3;

            oscillator.start();
            gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.5);
            oscillator.stop(audioContext.currentTime + 0.5);
        } catch (error) {
            // Fallback: usar Audio simple
            const audio = new Audio();
            // Audio simple con datos base64 (beep)
            audio.src = 'data:audio/wav;base64,U3RlcmVvIFdhdmUgRm9ybWF0IEluY2x1ZGVk';
            audio.volume = 0.3;
            audio.play().catch(e => console.log('Error playing sound:', e));
        }
    }

    // Mostrar notificación de prueba
    showTestNotification() {
        if (this.permissionGranted) {
            new Notification('🔔 Notificación de Prueba', {
                body: 'Las notificaciones funcionan correctamente',
                icon: '/assets/icons/icon-192x192.png'
            });
        }

        this.showToast({
            title: 'Notificación de Prueba',
            message: 'El sistema de notificaciones está funcionando',
            type: 'success',
            icon: 'fas fa-check-circle'
        });
    }

    // Actualizar badge de notificaciones (si está disponible)
    updateBadgeCount() {
        if (navigator.setAppBadge) {
            navigator.setAppBadge(this.newOrdersCount);
        }
    }

    // Resetear contador de nuevos pedidos
    resetNewOrdersCount() {
        this.newOrdersCount = 0;
        if (navigator.clearAppBadge) {
            navigator.clearAppBadge();
        }
    }
}

// Inicializar sistema de notificaciones cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    window.adminNotifications = new AdminNotificationSystem();
});