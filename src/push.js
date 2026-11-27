// Push notifications: is phone ko server ke saath jodna
import { useCallback, useEffect, useState } from 'react';
import { api } from './lib';

const b64ToBytes = (b64) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

export function usePush({ token, me }) {
  const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);

  // Pehle se on ho to server ko dobara bata do (account badla ho to bhi theek)
  useEffect(() => {
    if (!supported || !token || !me) return;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub && Notification.permission === 'granted') {
          await api('/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON() } });
          setOn(true);
        } else setOn(false);
      } catch { /* offline: baad mein */ }
    })();
  }, [supported, token, me]);

  const enable = useCallback(async () => {
    if (!supported) {
      if (isIOS() && !isStandalone()) return 'iPhone par notifications ke liye pehle app ko Home Screen par lagao, phir wahan se khol kar on karo.';
      return 'Is browser mein notifications nahi chal saktin.';
    }
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return 'Notifications ki ijazat nahi mili. Phone ki settings se is app ke liye on karo.';
      const { publicKey } = await api('/push/key');
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
      await api('/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON() } });
      setOn(true);
      return 'Notifications on ho gayi';
    } catch (e) {
      return e.status ? e.message : 'Notifications on nahi ho sakin. Net check karo aur dobara koshish karo.';
    } finally { setBusy(false); }
  }, [supported]);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api('/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }).catch(() => {});
        await sub.unsubscribe();
      }
      setOn(false);
      return 'Notifications band ho gayi';
    } finally { setBusy(false); }
  }, []);

  const test = useCallback(async () => {
    try { return (await api('/push/test', { method: 'POST' })).sent; } catch { return 0; }
  }, []);

  return { supported, on, busy, enable, disable, test };
}
