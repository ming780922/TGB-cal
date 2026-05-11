'use client';

import { useState, useEffect } from 'react';
import { Bell, BellOff } from 'lucide-react';

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
    const res = await fetch('/api/push/subscribe', {
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
    if (!res.ok) throw new Error(`Subscribe failed: ${res.status}`);
    localStorage.setItem(storageKey(tid), 'true');
    setSubscribed(true);
  };

  const handleUnsubscribe = async () => {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    if (reg) {
      const pushSub = await reg.pushManager.getSubscription();
      if (pushSub) {
        const res = await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tid, endpoint: pushSub.endpoint }),
        });
        if (!res.ok) throw new Error(`Unsubscribe failed: ${res.status}`);
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
      if (subscribed) await handleUnsubscribe();
      else await handleSubscribe();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={loading}
        type="button"
        className="w-full flex items-center justify-center gap-2 py-[11px] px-4 rounded-[12px] font-medium text-[13px] bg-[rgba(255,255,255,0.85)] border border-[rgba(13,20,38,0.08)] text-[#0d1426] disabled:opacity-60 transition-opacity"
      >
        {loading ? (
          <span className="font-mono text-[11px] text-[#9ba3b4]">···</span>
        ) : subscribed ? (
          <>
            <BellOff size={15} className="text-[#5b6478]" />
            {activeLabel}
          </>
        ) : (
          <>
            <Bell size={15} className="text-[#3b6dff]" />
            {label}
          </>
        )}
      </button>
      {error && (
        <p className="mt-1 font-mono text-[10px] text-[#f43f5e]">{error}</p>
      )}
    </div>
  );
}
