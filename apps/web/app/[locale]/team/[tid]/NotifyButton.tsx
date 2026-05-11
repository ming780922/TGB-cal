'use client';

import { useState, useEffect } from 'react';

interface NotifyButtonProps {
  tid: number;
  label: string;
  activeLabel: string;
}

const storageKey = (tid: number) => `push_sub_${tid}`;

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const arr = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
  return arr;
}

export default function NotifyButton({ tid, label, activeLabel }: NotifyButtonProps) {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if ('PushManager' in window && 'serviceWorker' in navigator) {
      setSupported(true);
      setSubscribed(localStorage.getItem(storageKey(tid)) === 'true');
    }
  }, [tid]);

  if (!supported) return null;

  const handleSubscribe = async () => {
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
    const pushSub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });
    const subJson = pushSub.toJSON();
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: crypto.randomUUID(),
        tid,
        endpoint: subJson.endpoint,
        p256dh: subJson.keys!.p256dh,
        auth: subJson.keys!.auth,
      }),
    });
    localStorage.setItem(storageKey(tid), 'true');
    setSubscribed(true);
  };

  const handleUnsubscribe = async () => {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    if (reg) {
      const pushSub = await reg.pushManager.getSubscription();
      if (pushSub) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tid, endpoint: pushSub.endpoint }),
        });
        await pushSub.unsubscribe();
      }
    }
    localStorage.removeItem(storageKey(tid));
    setSubscribed(false);
  };

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      if (subscribed) {
        await handleUnsubscribe();
      } else {
        await handleSubscribe();
      }
    } catch (err) {
      console.error('Push subscription error:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button onClick={handleClick} disabled={loading} type="button">
        {loading ? '...' : subscribed ? activeLabel : label}
      </button>
      {error && <p style={{ color: 'red', fontSize: '0.8em' }}>{error}</p>}
    </div>
  );
}
