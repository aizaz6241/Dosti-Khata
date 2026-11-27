// Push notifications (Web Push). VAPID keys env se, warna pehli dafa bana kar database mein rakh lete hain.
import * as webpush from 'web-push';

export async function setupPush(store) {
  let pub = process.env.VAPID_PUBLIC_KEY;
  let priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) {
    const saved = await store.meta.get('vapid');
    if (saved?.value?.publicKey) ({ publicKey: pub, privateKey: priv } = saved.value);
    else {
      const k = webpush.generateVAPIDKeys();
      pub = k.publicKey; priv = k.privateKey;
      await store.meta.create({ _id: 'vapid', value: k });
    }
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:aizazkhan6241@gmail.com', pub, priv);

  async function notify(userId, payload) {
    const subs = await store.subs.all({ user: userId });
    let sent = 0;
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(payload), { TTL: 60 * 60 * 24, urgency: 'high' });
        sent++;
      } catch (e) {
        // Purani/band subscription hata do
        if (e.statusCode === 404 || e.statusCode === 410) await store.subs.remove(s._id);
        else console.error('Push nahi gaya:', e.statusCode, e.body || e.message);
      }
    }));
    return sent;
  }

  async function subscribe(userId, sub, ua) {
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) throw Object.assign(new Error('Subscription sahi nahi.'), { status: 400 });
    const old = await store.subs.find({ endpoint: sub.endpoint });
    if (old) await store.subs.update(old._id, { user: userId, keys: sub.keys, ua });
    else await store.subs.create({ user: userId, endpoint: sub.endpoint, keys: sub.keys, ua });
  }

  async function unsubscribe(endpoint) {
    const old = await store.subs.find({ endpoint });
    if (old) await store.subs.remove(old._id);
  }

  return { publicKey: pub, notify, subscribe, unsubscribe };
}
