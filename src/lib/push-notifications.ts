import { appwrite } from "@/integrations/appwrite/client";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function checkNotificationSubscription(): Promise<boolean> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return false;
  }
  try {
    // Usar Promise.race com um timeout para evitar bloqueio indefinido se o sw estiver iniciando
    const readyPromise = navigator.serviceWorker.ready;
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000));
    const registration = await Promise.race([readyPromise, timeoutPromise]);

    if (!registration) {
      // Fallback para getRegistration se o ready deu timeout
      const fallbackReg = await navigator.serviceWorker.getRegistration();
      if (!fallbackReg) return false;
      const subscription = await fallbackReg.pushManager.getSubscription();
      return subscription !== null;
    }

    const subscription = await registration.pushManager.getSubscription();
    return subscription !== null;
  } catch (err) {
    console.error("Erro ao verificar inscrição de notificações:", err);
    return false;
  }
}

export async function registerPushNotifications(userId: string): Promise<boolean> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    console.warn("Notificações Push não são suportadas neste navegador/dispositivo.");
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.warn("Permissão de notificação negada.");
      return false;
    }

    const registration = await navigator.serviceWorker.ready;
    const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;

    if (!vapidPublicKey) {
      console.error(
        "Chave pública VAPID (VITE_VAPID_PUBLIC_KEY) não encontrada nas variáveis de ambiente.",
      );
      return false;
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });

    const subscriptionJSON = subscription.toJSON();
    const endpoint = subscriptionJSON.endpoint;
    const p256dh = subscriptionJSON.keys?.p256dh;
    const auth = subscriptionJSON.keys?.auth;

    if (!endpoint || !p256dh || !auth) {
      throw new Error("Assinatura inválida retornada pelo navegador.");
    }

    // Cast para any para evitar erros de compilação do TypeScript antes da regeneração dos types do Appwrite
    const appwriteAny = appwrite as any;

    // Verificar se já existe a inscrição ativa
    const { data: existing } = await appwriteAny
      .from("push_subscriptions")
      .select("id")
      .eq("endpoint", endpoint)
      .maybeSingle();

    if (!existing) {
      // Salvar nova inscrição no banco do Appwrite
      const { error } = await appwriteAny.from("push_subscriptions").insert({
        user_id: userId,
        endpoint,
        p256dh,
        auth,
      });

      if (error) throw error;
    }

    return true;
  } catch (err) {
    console.error("Erro ao registrar notificações push:", err);
    return false;
  }
}

export async function unsubscribePushNotifications(): Promise<boolean> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();

      const appwriteAny = appwrite as any;
      // Remover do banco de dados do Appwrite
      await appwriteAny.from("push_subscriptions").delete().eq("endpoint", endpoint);

      return true;
    }
    return false;
  } catch (err) {
    console.error("Erro ao cancelar inscrição de notificações push:", err);
    return false;
  }
}
