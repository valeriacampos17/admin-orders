// Configuración de Firebase Cloud Messaging
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-messaging.js";
import { app } from './firebase.js';

// Inicializar messaging
const messaging = getMessaging(app);

// Configuración de FCM
const vapidKey = 'BO905tgtG6e5FIrh-d9bIXVZuL6cv024kw1ygHLDwrrMk55S06h7elY0YuKKpNR4egBoSabvG-OS6kbGTrfF9A0';

// Solicitar permiso y obtener token
export const requestNotificationPermission = async () => {
    try {
        // Solicitar permiso
        const permission = await Notification.requestPermission();

        if (permission !== 'granted') {
            console.log('Permiso de notificaciones denegado');
            return null;
        }

        console.log('Permiso de notificaciones concedido');

        // Registrar Service Worker
        const registration = await navigator.serviceWorker.register('/service-worker.js');
        console.log('Service Worker registrado para FCM');

        // Obtener token FCM
        const token = await getToken(messaging, {
            vapidKey: vapidKey,
            serviceWorkerRegistration: registration
        });

        if (token) {
            console.log('Token FCM obtenido:', token);
            // Guardar token en Firestore
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
const saveTokenToFirestore = async (token) => {
    try {
        const { getFirestore, collection, addDoc, query, where, getDocs, deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js");
        const { getAuth } = await import("https://www.gstatic.com/firebasejs/10.14.0/firebase-auth.js");

        const db = getFirestore();
        const auth = getAuth();
        const user = auth.currentUser;

        if (!user) {
            console.log('No hay usuario autenticado, guardando token sin usuario');
            // Guardar token anónimo para administradores que no han iniciado sesión
            await addDoc(collection(db, "tokens"), {
                token: token,
                userAgent: navigator.userAgent,
                createdAt: new Date().toISOString(),
                isAdmin: true // Para notificaciones de administrador
            });
            return;
        }

        // Buscar si ya existe token para este usuario
        const tokensRef = collection(db, "tokens");
        const q = query(tokensRef, where("token", "==", token));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            // Guardar nuevo token
            await addDoc(collection(db, "tokens"), {
                token: token,
                userId: user.uid,
                userEmail: user.email,
                userAgent: navigator.userAgent,
                createdAt: new Date().toISOString(),
                lastUsed: new Date().toISOString()
            });
            console.log('Token guardado en Firestore');
        } else {
            // Actualizar lastUsed
            const tokenDoc = querySnapshot.docs[0];
            const { updateDoc, doc } = await import("https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js");
            await updateDoc(doc(db, "tokens", tokenDoc.id), {
                lastUsed: new Date().toISOString()
            });
            console.log('Token actualizado en Firestore');
        }
    } catch (error) {
        console.error('Error guardando token:', error);
    }
};

// Escuchar mensajes cuando la app está en primer plano
export const listenForMessages = () => {
    onMessage(messaging, (payload) => {
        console.log('Mensaje recibido en primer plano:', payload);

        // Mostrar notificación en primer plano
        if (Notification.permission === 'granted') {
            const notification = payload.notification;
            if (notification) {
                new Notification(notification.title || 'Nuevo Pedido', {
                    body: notification.body || 'Hay un nuevo pedido pendiente',
                    icon: notification.icon || '/assets/icons/icon-192x192.png'
                });
            }
        }
    });
};

// Inicializar notificaciones
export const initNotifications = async () => {
    if (!('Notification' in window)) {
        console.log('Este navegador no soporta notificaciones');
        return false;
    }

    if (Notification.permission === 'granted') {
        const token = await requestNotificationPermission();
        listenForMessages();
        return true;
    }

    return false;
};

// Verificar si el usuario es administrador y suscribir a notificaciones
export const subscribeAdminToNotifications = async () => {
    try {
        const { getAuth } = await import("https://www.gstatic.com/firebasejs/10.14.0/firebase-auth.js");
        const { getFirestore, collection, query, where, getDocs } = await import("https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js");

        const auth = getAuth();
        const db = getFirestore();
        const user = auth.currentUser;

        if (!user) return false;

        // Verificar si es administrador
        const usersRef = collection(db, "users");
        const q = query(usersRef, where("uid", "==", user.uid));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            const userData = querySnapshot.docs[0].data();
            if (userData.role === 'admin' || userData.isAdmin === true) {
                // Es administrador, suscribir a notificaciones
                await requestNotificationPermission();
                return true;
            }
        }

        return false;
    } catch (error) {
        console.error('Error verificando admin:', error);
        return false;
    }
};