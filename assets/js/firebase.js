// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-app.js";
import {
    getFirestore,
    collection,
    addDoc,
    getDocs,
    doc,
    updateDoc,
    deleteDoc,
    query,
    where,
    getDoc,
    onSnapshot,
    orderBy,
    limit,
    Timestamp
} from 'https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js';
import {
    getMessaging,
    getToken,
    onMessage
} from 'https://www.gstatic.com/firebasejs/10.14.0/firebase-messaging.js';
import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.14.0/firebase-auth.js";

// Your web app's Firebase configuration
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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const messaging = getMessaging(app);

// VAPID Key para notificaciones
const VAPID_KEY = 'BO905tgtG6e5FIrh-d9bIXVZuL6cv024kw1ygHLDwrrMk55S06h7elY0YuKKpNR4egBoSabvG-OS6kbGTrfF9A0';

// ==================== FUNCIONES DE AUTENTICACIÓN ====================

export const signUp = async (email, password) => {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        return user;
    } catch (error) {
        console.error("Error en el registro de Firebase: ", error.message);
        throw error;
    }
};

// Función para obtener datos completos del usuario desde Firestore
export const getUserData = async (uid) => {
    try {
        const usersRef = collection(db, "users");
        const q = query(usersRef, where("uid", "==", uid));
        const querySnapshot = await getDocs(q);

        let userData = null;
        querySnapshot.forEach((doc) => {
            userData = { id: doc.id, ...doc.data() };
        });

        return userData;
    } catch (e) {
        console.error("Error obteniendo datos del usuario: ", e);
        return null;
    }
};

// Función para crear un perfil de usuario en Firestore si no existe
export const ensureUserProfile = async (user) => {
    try {
        const userData = await getUserData(user.uid);

        // Si no existe perfil, crear uno básico
        if (!userData) {
            const newUserProfile = {
                uid: user.uid,
                email: user.email,
                nombre: '',
                telefono: '',
                fechaRegistro: new Date().toISOString(),
                emailVerified: user.emailVerified,
                role: 'user', // Por defecto es usuario normal
                isAdmin: false
            };

            const docRef = await addDoc(collection(db, "users"), newUserProfile);
            console.log("Perfil de usuario creado automáticamente:", docRef.id);
            return newUserProfile;
        }

        return userData;
    } catch (e) {
        console.error("Error asegurando perfil de usuario:", e);
        return null;
    }
};

// Función signIn corregida
export const signIn = async (email, password) => {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Asegurar que existe el perfil en Firestore
        const userData = await ensureUserProfile(user);

        // Guardar SOLO la información necesaria en una sola clave
        const userSession = {
            uid: user.uid,
            email: user.email,
            emailVerified: user.emailVerified,
            nombre: userData?.nombre || '',
            telefono: userData?.telefono || '',
            role: userData?.role || 'user',
            isAdmin: userData?.isAdmin || false,
            fechaRegistro: userData?.fechaRegistro || new Date().toISOString(),
            lastLogin: new Date().toISOString()
        };

        sessionStorage.setItem('user', JSON.stringify(userSession));

        // Si es administrador, suscribir a notificaciones
        if (userSession.isAdmin || userSession.role === 'admin') {
            await subscribeToNotifications();
        }

        return true;
    } catch (error) {
        console.error("Error en el inicio de sesión: ", error.message);
        return false;
    }
};

// ==================== FUNCIONES DE NOTIFICACIONES ====================

// Solicitar permiso y obtener token de notificaciones
export const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
        console.log('Este navegador no soporta notificaciones');
        return null;
    }

    try {
        const permission = await Notification.requestPermission();

        if (permission !== 'granted') {
            console.log('Permiso de notificaciones denegado');
            return null;
        }

        console.log('Permiso de notificaciones concedido');

        // Registrar Service Worker si no está registrado
        let registration;
        if (navigator.serviceWorker) {
            registration = await navigator.serviceWorker.register('/service-worker.js');
            console.log('Service Worker registrado');
        }

        // Obtener token FCM
        const token = await getToken(messaging, {
            vapidKey: VAPID_KEY,
            serviceWorkerRegistration: registration
        });

        if (token) {
            console.log('Token FCM obtenido:', token);
            await saveTokenToFirestore(token);
            return token;
        } else {
            console.log('No se pudo obtener el token FCM');
            return null;
        }
    } catch (error) {
        console.error('Error solicitando permiso de notificaciones:', error);
        return null;
    }
};

// Guardar token en Firestore
export const saveTokenToFirestore = async (token) => {
    try {
        const currentUser = getCurrentUser();

        // Buscar si ya existe este token
        const tokensRef = collection(db, "tokens");
        const q = query(tokensRef, where("token", "==", token));
        const querySnapshot = await getDocs(q);

        const tokenData = {
            token: token,
            userAgent: navigator.userAgent,
            lastUsed: new Date().toISOString()
        };

        if (currentUser) {
            tokenData.userId = currentUser.uid;
            tokenData.userEmail = currentUser.email;
            tokenData.isAdmin = currentUser.isAdmin || currentUser.role === 'admin';
        }

        if (querySnapshot.empty) {
            // Guardar nuevo token
            tokenData.createdAt = new Date().toISOString();
            await addDoc(collection(db, "tokens"), tokenData);
            console.log('Token guardado en Firestore');
        } else {
            // Actualizar token existente
            const tokenDoc = querySnapshot.docs[0];
            await updateDoc(doc(db, "tokens", tokenDoc.id), tokenData);
            console.log('Token actualizado en Firestore');
        }
    } catch (error) {
        console.error('Error guardando token:', error);
    }
};

// Suscribir al usuario actual a notificaciones
export const subscribeToNotifications = async () => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
        console.log('Usuario no autenticado, no se pueden activar notificaciones');
        return null;
    }

    // Verificar si es administrador
    if (currentUser.isAdmin || currentUser.role === 'admin') {
        console.log('Administrador detectado, activando notificaciones');
        return await requestNotificationPermission();
    } else {
        console.log('Usuario no es administrador, no se activan notificaciones');
        return null;
    }
};

// Escuchar mensajes en primer plano
export const listenForMessages = () => {
    onMessage(messaging, (payload) => {
        console.log('Mensaje recibido en primer plano:', payload);

        // Mostrar notificación en primer plano
        if (Notification.permission === 'granted' && payload.notification) {
            new Notification(payload.notification.title || 'Nuevo Pedido', {
                body: payload.notification.body || 'Hay un nuevo pedido pendiente',
                icon: payload.notification.icon || '/assets/icons/icon-192x192.png'
            });
        }

        // Disparar evento personalizado
        window.dispatchEvent(new CustomEvent('notification-received', { detail: payload }));
    });
};

// ==================== FUNCIONES DE PRODUCTOS ====================

// Crear un nuevo producto
export const createProduct = async (product) => {
    try {
        const docRef = await addDoc(collection(db, "products"), product);
        console.log("Producto creado con ID:", docRef.id);
        return docRef.id;
    } catch (e) {
        console.error("Error añadiendo documento: ", e);
        throw e;
    }
};

// Leer todos los productos
export const getAllProducts = async () => {
    try {
        const querySnapshot = await getDocs(collection(db, "products"));
        const products = [];
        querySnapshot.forEach((doc) => {
            products.push({ id: doc.id, ...doc.data() });
        });
        return products;
    } catch (e) {
        console.error("Error obteniendo productos: ", e);
        return [];
    }
};

// Actualizar un producto
export const updateProduct = async (id, updatedData) => {
    const productRef = doc(db, "products", id);
    try {
        await updateDoc(productRef, updatedData);
        console.log("Producto actualizado con ID:", id);
        return true;
    } catch (e) {
        console.error("Error actualizando documento: ", e);
        return false;
    }
};

// Eliminar un producto
export const deleteProduct = async (id) => {
    const productRef = doc(db, "products", id);
    try {
        await deleteDoc(productRef);
        console.log("Producto eliminado con ID:", id);
        return true;
    } catch (e) {
        console.error("Error eliminando documento: ", e);
        return false;
    }
};

// ==================== FUNCIONES DE PEDIDOS ====================

// Crear una Orden
export const createOrder = async (orderData) => {
    try {
        const order = {
            ...orderData,
            status: 'pending',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        const docRef = await addDoc(collection(db, "orders"), order);
        console.log("Orden creada con ID:", docRef.id);

        // Notificar a los administradores sobre el nuevo pedido
        await notifyAdminsOfNewOrder(docRef.id, order);

        return docRef.id;
    } catch (e) {
        console.error("Error añadiendo documento: ", e);
        throw e;
    }
};

// Notificar a administradores sobre nuevo pedido
const notifyAdminsOfNewOrder = async (orderId, orderData) => {
    try {
        // Obtener tokens de administradores
        const tokensRef = collection(db, "tokens");
        const q = query(tokensRef, where("isAdmin", "==", true));
        const querySnapshot = await getDocs(q);

        const tokens = [];
        querySnapshot.forEach((doc) => {
            tokens.push(doc.data().token);
        });

        console.log(`Notificando a ${tokens.length} administradores sobre el nuevo pedido`);

        // Aquí puedes implementar el envío de notificaciones push
        // Por ahora solo mostramos en consola
        tokens.forEach(token => {
            console.log(`Enviar notificación a token: ${token}`);
            // En una implementación real, llamarías a una Cloud Function
            // o a tu backend para enviar la notificación push
        });

        // También mostrar notificación local si el admin está en la página
        if (window.adminNotifications) {
            window.adminNotifications.showNewOrderNotification({
                id: orderId,
                ...orderData
            });
        }

    } catch (e) {
        console.error("Error notificando administradores: ", e);
    }
};

// Obtener todos los pedidos (para admin)
export const getAllOrders = async () => {
    try {
        const ordersRef = collection(db, "orders");
        const q = query(ordersRef, orderBy("createdAt", "desc"));
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
};

// Obtener pedidos de un usuario específico
export const getUserOrders = async (userId) => {
    try {
        const ordersRef = collection(db, "orders");
        const q = query(ordersRef, where("userId", "==", userId), orderBy("createdAt", "desc"));
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
        console.error("Error obteniendo pedidos del usuario: ", e);
        return [];
    }
};

// Obtener un pedido específico por ID
export const getOrderById = async (orderId) => {
    try {
        const orderRef = doc(db, "orders", orderId);
        const orderSnap = await getDoc(orderRef);

        if (orderSnap.exists()) {
            return {
                id: orderSnap.id,
                ...orderSnap.data()
            };
        } else {
            console.log("No such order!");
            return null;
        }
    } catch (e) {
        console.error("Error obteniendo pedido: ", e);
        return null;
    }
};

// Actualizar estado de un pedido
export const updateOrderStatus = async (orderId, status, userId = null) => {
    try {
        const orderRef = doc(db, "orders", orderId);
        const updateData = {
            status: status,
            updatedAt: new Date().toISOString()
        };

        if (userId) {
            updateData.updatedBy = userId;
        }

        await updateDoc(orderRef, updateData);
        console.log("Estado de pedido actualizado:", orderId, "a", status);

        // Si el pedido se completa, notificar al cliente
        if (status === 'completed') {
            await notifyCustomerOfCompletion(orderId);
        }

        return true;
    } catch (e) {
        console.error("Error actualizando estado del pedido: ", e);
        return false;
    }
};

// Notificar al cliente que su pedido fue completado
const notifyCustomerOfCompletion = async (orderId) => {
    try {
        const order = await getOrderById(orderId);
        if (!order || !order.userId) return;

        // Buscar tokens del cliente
        const tokensRef = collection(db, "tokens");
        const q = query(tokensRef, where("userId", "==", order.userId));
        const querySnapshot = await getDocs(q);

        querySnapshot.forEach((doc) => {
            const token = doc.data().token;
            console.log(`Enviar notificación de completado a cliente: ${token}`);
            // Implementar envío de notificación
        });

    } catch (e) {
        console.error("Error notificando al cliente: ", e);
    }
};

// Escuchar nuevos pedidos en tiempo real
export const listenForNewOrders = (callback) => {
    const ordersRef = collection(db, "orders");
    const q = query(ordersRef, where("status", "==", "pending"), orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
                const newOrder = {
                    id: change.doc.id,
                    ...change.doc.data()
                };
                callback(newOrder);
            }
        });
    });

    return unsubscribe;
};

// Obtener estadísticas de pedidos
export const getOrdersStats = async () => {
    try {
        const orders = await getAllOrders();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const stats = {
            total: orders.length,
            pending: orders.filter(o => o.status === 'pending').length,
            processing: orders.filter(o => o.status === 'processing').length,
            completed: orders.filter(o => o.status === 'completed').length,
            cancelled: orders.filter(o => o.status === 'cancelled').length,
            todayCompleted: orders.filter(o => {
                const orderDate = new Date(o.createdAt);
                return o.status === 'completed' && orderDate >= today;
            }).length,
            todayRevenue: orders
                .filter(o => {
                    const orderDate = new Date(o.createdAt);
                    return o.status === 'completed' && orderDate >= today;
                })
                .reduce((sum, o) => sum + (o.total || 0), 0)
        };

        return stats;
    } catch (e) {
        console.error("Error obteniendo estadísticas: ", e);
        return null;
    }
};

// ==================== FUNCIONES DE USUARIO ====================

// Crear un Usuario (Registro)
export const createUser = async (userData) => {
    try {
        if (!userData.email) {
            return {
                success: false,
                error: 'EMAIL_REQUIRED',
                message: 'El correo electrónico es obligatorio para el registro'
            };
        }

        // 1. Crear usuario en Firebase Auth
        const firebaseUser = await signUp(userData.email, userData.password);

        // 2. Preparar datos para Firestore
        const firestoreUser = {
            uid: firebaseUser.uid,
            email: userData.email,
            nombre: userData.name || userData.nombre || '',
            telefono: userData.phone || userData.telefono || '',
            fechaRegistro: new Date().toISOString(),
            emailVerified: firebaseUser.emailVerified || false,
            role: 'user',
            isAdmin: false
        };

        // 3. Guardar en Firestore
        await addDoc(collection(db, "users"), firestoreUser);

        // 4. Guardar en sesión
        const userSession = {
            uid: firebaseUser.uid,
            email: userData.email,
            nombre: userData.name || userData.nombre || '',
            telefono: userData.phone || userData.telefono || '',
            role: 'user',
            isAdmin: false,
            fechaRegistro: new Date().toISOString()
        };
        sessionStorage.setItem('user', JSON.stringify(userSession));

        return { success: true, userId: firebaseUser.uid };

    } catch (e) {
        console.error("Error en createUser:", e);

        if (e.code === 'auth/email-already-in-use') {
            return { success: false, error: 'EMAIL_EXISTS', message: 'Este correo ya está registrado' };
        } else if (e.code === 'auth/invalid-email') {
            return { success: false, error: 'INVALID_EMAIL', message: 'Correo electrónico inválido' };
        } else if (e.code === 'auth/weak-password') {
            return { success: false, error: 'WEAK_PASSWORD', message: 'La contraseña debe tener al menos 6 caracteres' };
        }

        return { success: false, error: e.code || 'UNKNOWN_ERROR', message: e.message };
    }
};

// Obtener usuario actual de la sesión
export const getCurrentUser = () => {
    const userStr = sessionStorage.getItem('user');
    if (userStr) {
        return JSON.parse(userStr);
    }
    return null;
};

// Actualizar perfil de usuario
export const updateUserProfile = async (profileData) => {
    try {
        const currentUser = getCurrentUser();
        if (!currentUser) throw new Error('No hay usuario logueado');

        const usersRef = collection(db, "users");
        const q = query(usersRef, where("uid", "==", currentUser.uid));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            const docId = querySnapshot.docs[0].id;
            const userDoc = doc(db, "users", docId);
            await updateDoc(userDoc, profileData);

            const updatedUser = { ...currentUser, ...profileData };
            sessionStorage.setItem('user', JSON.stringify(updatedUser));

            return { success: true };
        } else {
            throw new Error('Usuario no encontrado en Firestore');
        }
    } catch (error) {
        console.error("Error actualizando perfil:", error);
        return { success: false, error: error.message };
    }
};

// Cerrar sesión
export const logout = async () => {
    try {
        await signOut(auth);
        sessionStorage.removeItem('user');
        window.location.href = "signin.html";
        return true;
    } catch (error) {
        console.error("Error cerrando sesión: ", error);
        return false;
    }
};

// ==================== FUNCIÓN DE INICIALIZACIÓN ====================

// Inicializar notificaciones automáticamente si el usuario es admin
export const initAdminNotifications = async () => {
    const user = getCurrentUser();
    if (user && (user.isAdmin || user.role === 'admin')) {
        console.log('Inicializando notificaciones para administrador');
        await subscribeToNotifications();
        listenForMessages();
        return true;
    }
    return false;
};

// Exportar todo
export {
    app,
    auth,
    db,
    messaging,
    onAuthStateChanged
};