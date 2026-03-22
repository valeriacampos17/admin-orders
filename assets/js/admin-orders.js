// Sistema de gestión de pedidos para administrador
class OrderManager {
    constructor() {
        this.orders = [];
        this.currentFilter = 'all';
        this.searchTerm = '';
        this.db = null;
        this.init();
    }

    async init() {
        await this.initFirebase();
        this.setupEventListeners();
        this.loadOrders();
        this.listenForNewOrders();
    }

    async initFirebase() {
        if (typeof firebase !== 'undefined') {
            this.db = firebase.firestore();
        } else {
            // Usar datos simulados si no hay Firebase
            this.loadMockOrders();
        }
    }

    // Configurar event listeners
    setupEventListeners() {
        // Filtros
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentFilter = btn.dataset.status;
                this.renderOrders();
            });
        });

        // Búsqueda
        const searchInput = document.getElementById('search-input');
        const searchBtn = document.getElementById('search-btn');

        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchTerm = e.target.value.toLowerCase();
                this.renderOrders();
            });
        }

        if (searchBtn) {
            searchBtn.addEventListener('click', () => {
                this.searchTerm = searchInput.value.toLowerCase();
                this.renderOrders();
            });
        }

        // Botón refrescar
        const refreshBtn = document.getElementById('refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.loadOrders();
            });
        }

        // Modal
        const modal = document.getElementById('order-modal');
        const closeModal = document.querySelector('.close-modal');

        if (closeModal) {
            closeModal.addEventListener('click', () => {
                modal.style.display = 'none';
            });
        }

        window.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    }

    // Cargar pedidos desde Firebase
    async loadOrders() {
        const container = document.getElementById('orders-content');
        container.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i><p>Cargando pedidos...</p></div>';

        try {
            if (this.db) {
                const snapshot = await this.db.collection('orders')
                    .orderBy('createdAt', 'desc')
                    .get();

                this.orders = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                    createdAt: doc.data().createdAt?.toDate() || new Date()
                }));
            } else {
                await this.loadMockOrders();
            }

            this.updateStats();
            this.renderOrders();
        } catch (error) {
            console.error('Error cargando pedidos:', error);
            container.innerHTML = '<div class="loading"><i class="fas fa-exclamation-triangle"></i><p>Error cargando pedidos</p></div>';
        }
    }

    // Cargar datos simulados
    async loadMockOrders() {
        // Simular pedidos de ejemplo
        this.orders = [
            {
                id: 'ORD-001',
                customerName: 'María González',
                customerEmail: 'maria@email.com',
                total: 125.50,
                status: 'pending',
                items: [
                    { name: 'Vestido Floral', quantity: 1, price: 45.50 },
                    { name: 'Bolso de Mano', quantity: 1, price: 80.00 }
                ],
                createdAt: new Date(),
                shippingAddress: 'Calle Principal 123, Madrid'
            },
            {
                id: 'ORD-002',
                customerName: 'Carlos Ruiz',
                customerEmail: 'carlos@email.com',
                total: 89.99,
                status: 'processing',
                items: [
                    { name: 'Camisa Casual', quantity: 2, price: 29.99 },
                    { name: 'Corbata Elegante', quantity: 1, price: 30.01 }
                ],
                createdAt: new Date(Date.now() - 3600000),
                shippingAddress: 'Avenida Central 456, Barcelona'
            },
            {
                id: 'ORD-003',
                customerName: 'Ana Martínez',
                customerEmail: 'ana@email.com',
                total: 210.00,
                status: 'completed',
                items: [
                    { name: 'Chaqueta de Cuero', quantity: 1, price: 150.00 },
                    { name: 'Gafas de Sol', quantity: 1, price: 60.00 }
                ],
                createdAt: new Date(Date.now() - 86400000),
                shippingAddress: 'Plaza Mayor 789, Valencia'
            }
        ];
    }

    // Escuchar nuevos pedidos en tiempo real
    listenForNewOrders() {
        if (!this.db) return;

        this.db.collection('orders')
            .where('status', '==', 'pending')
            .onSnapshot((snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === 'added') {
                        const newOrder = {
                            id: change.doc.id,
                            ...change.doc.data(),
                            createdAt: change.doc.data().createdAt?.toDate() || new Date()
                        };

                        // Mostrar notificación
                        if (window.adminNotifications) {
                            window.adminNotifications.showNewOrderNotification(newOrder);
                        }

                        // Actualizar lista
                        this.orders.unshift(newOrder);
                        this.updateStats();
                        this.renderOrders();

                        // Resaltar nueva fila
                        setTimeout(() => {
                            const newRow = document.querySelector(`[data-order-id="${newOrder.id}"]`);
                            if (newRow) {
                                newRow.classList.add('new-order');
                                setTimeout(() => newRow.classList.remove('new-order'), 3000);
                            }
                        }, 100);
                    }
                });
            });
    }

    // Actualizar estadísticas
    updateStats() {
        const total = this.orders.length;
        const pending = this.orders.filter(o => o.status === 'pending').length;
        const processing = this.orders.filter(o => o.status === 'processing').length;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const completedToday = this.orders.filter(o => {
            return o.status === 'completed' && o.createdAt >= today;
        }).length;

        const revenueToday = this.orders
            .filter(o => o.status === 'completed' && o.createdAt >= today)
            .reduce((sum, o) => sum + o.total, 0);

        document.getElementById('total-orders').textContent = total;
        document.getElementById('pending-orders').textContent = pending;
        document.getElementById('processing-orders').textContent = processing;
        document.getElementById('completed-today').textContent = completedToday;
        document.getElementById('revenue-today').textContent = `$${revenueToday.toFixed(2)}`;
    }

    // Renderizar tabla de pedidos
    renderOrders() {
        let filteredOrders = this.orders;

        // Aplicar filtro
        if (this.currentFilter !== 'all') {
            filteredOrders = filteredOrders.filter(o => o.status === this.currentFilter);
        }

        // Aplicar búsqueda
        if (this.searchTerm) {
            filteredOrders = filteredOrders.filter(o =>
                o.id.toLowerCase().includes(this.searchTerm) ||
                o.customerName.toLowerCase().includes(this.searchTerm) ||
                o.customerEmail?.toLowerCase().includes(this.searchTerm)
            );
        }

        const container = document.getElementById('orders-content');

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
                    </tr>
                </thead>
                <tbody>
                    ${filteredOrders.map(order => this.renderOrderRow(order)).join('')}
                </tbody>
            </table>
        `;

        container.innerHTML = table;
    }

    // Renderizar fila de pedido
    renderOrderRow(order) {
        const statusText = {
            pending: 'Pendiente',
            processing: 'Procesando',
            completed: 'Completado',
            cancelled: 'Cancelado'
        };

        const date = order.createdAt instanceof Date ?
            order.createdAt.toLocaleDateString('es-ES') :
            new Date(order.createdAt).toLocaleDateString('es-ES');

        return `
            <tr data-order-id="${order.id}">
                <td><strong>${order.id}</strong></td>
                <td>${order.customerName}</td>
                <td>${date}</td>
                <td>$${order.total.toFixed(2)}</td>
                <td>
                    <span class="status-badge status-${order.status}">
                        ${statusText[order.status]}
                    </span>
                </td>
                <td>
                    <div class="action-buttons">
                        <button class="action-btn view" onclick="orderManager.viewOrderDetails('${order.id}')">
                            <i class="fas fa-eye"></i> Ver
                        </button>
                        ${this.getStatusButtons(order)}
                    </div>
                </td>
            </tr>
        `;
    }

    // Obtener botones según estado actual
    getStatusButtons(order) {
        const buttons = [];

        if (order.status === 'pending') {
            buttons.push(`
                <button class="action-btn update" onclick="orderManager.updateOrderStatus('${order.id}', 'processing')">
                    <i class="fas fa-cog"></i> Procesar
                </button>
            `);
            buttons.push(`
                <button class="action-btn cancel" onclick="orderManager.updateOrderStatus('${order.id}', 'cancelled')">
                    <i class="fas fa-times"></i> Cancelar
                </button>
            `);
        } else if (order.status === 'processing') {
            buttons.push(`
                <button class="action-btn complete" onclick="orderManager.updateOrderStatus('${order.id}', 'completed')">
                    <i class="fas fa-check"></i> Completar
                </button>
            `);
            buttons.push(`
                <button class="action-btn cancel" onclick="orderManager.updateOrderStatus('${order.id}', 'cancelled')">
                    <i class="fas fa-times"></i> Cancelar
                </button>
            `);
        }

        return buttons.join('');
    }

    // Actualizar estado del pedido
    async updateOrderStatus(orderId, newStatus) {
        const order = this.orders.find(o => o.id === orderId);
        if (!order) return;

        const confirmMessage = {
            processing: '¿Marcar este pedido como en proceso?',
            completed: '¿Marcar este pedido como completado?',
            cancelled: '¿Cancelar este pedido?'
        };

        if (!confirm(confirmMessage[newStatus] || '¿Actualizar estado del pedido?')) {
            return;
        }

        const oldStatus = order.status;

        try {
            if (this.db) {
                await this.db.collection('orders').doc(orderId).update({
                    status: newStatus,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }

            order.status = newStatus;

            // Mostrar notificación
            if (window.adminNotifications) {
                window.adminNotifications.showOrderUpdateNotification(order, oldStatus, newStatus);
            }

            this.updateStats();
            this.renderOrders();

        } catch (error) {
            console.error('Error actualizando pedido:', error);
            if (window.adminNotifications) {
                window.adminNotifications.showToast({
                    title: 'Error',
                    message: 'No se pudo actualizar el pedido',
                    type: 'error',
                    icon: 'fas fa-exclamation-triangle'
                });
            }
        }
    }

    // Ver detalles del pedido
    viewOrderDetails(orderId) {
        const order = this.orders.find(o => o.id === orderId);
        if (!order) return;

        const modal = document.getElementById('order-modal');
        const modalBody = document.getElementById('modal-body');

        const date = order.createdAt instanceof Date ?
            order.createdAt.toLocaleString('es-ES') :
            new Date(order.createdAt).toLocaleString('es-ES');

        modalBody.innerHTML = `
            <div class="order-detail-item">
                <div class="order-detail-label">ID del Pedido</div>
                <div class="order-detail-value"><strong>${order.id}</strong></div>
            </div>
            
            <div class="order-detail-item">
                <div class="order-detail-label">Cliente</div>
                <div class="order-detail-value">${order.customerName}</div>
                ${order.customerEmail ? `<div class="order-detail-value" style="color: #666;">${order.customerEmail}</div>` : ''}
            </div>
            
            <div class="order-detail-item">
                <div class="order-detail-label">Fecha de Pedido</div>
                <div class="order-detail-value">${date}</div>
            </div>
            
            <div class="order-detail-item">
                <div class="order-detail-label">Dirección de Envío</div>
                <div class="order-detail-value">${order.shippingAddress || 'No especificada'}</div>
            </div>
            
            <div class="order-detail-item">
                <div class="order-detail-label">Productos</div>
                ${order.items.map(item => `
                    <div class="product-item">
                        <span>${item.name} x ${item.quantity}</span>
                        <span>$${(item.price * item.quantity).toFixed(2)}</span>
                    </div>
                `).join('')}
                <div class="product-item" style="background: #f0f0f0; font-weight: bold;">
                    <span>Total</span>
                    <span>$${order.total.toFixed(2)}</span>
                </div>
            </div>
            
            <div class="order-detail-item">
                <div class="order-detail-label">Estado Actual</div>
                <div class="order-detail-value">
                    <span class="status-badge status-${order.status}">
                        ${order.status === 'pending' ? 'Pendiente' :
                order.status === 'processing' ? 'Procesando' :
                    order.status === 'completed' ? 'Completado' : 'Cancelado'}
                    </span>
                </div>
            </div>
        `;

        modal.style.display = 'block';
    }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    window.orderManager = new OrderManager();
});