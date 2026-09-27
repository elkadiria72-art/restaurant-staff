'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { BellRing, BellOff, Check, UtensilsCrossed } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Order } from '@/lib/types';

const orderSoundPath = '/sound-ousis/Sonner.mp3';
const callSoundPath = '/sound-ousis/Sonner2.mp3';
const audioStorageKey = 'staff-audio-enabled';

type NotificationSound = 'order' | 'call';
type AudioContextConstructor = typeof AudioContext;

export type NewOrderEvent = { id: string; table_number: number | string };

type StaffAlertsContextValue = {
  audioEnabled: boolean;
  /** Auto-unlocks on the next user gesture; used to re-arm after permission loss. */
  requestAudioEnable: () => void;
  enableAudio: () => void;
};

const StaffAlertsContext = createContext<StaffAlertsContextValue>({
  audioEnabled: false,
  requestAudioEnable: () => {},
  enableAudio: () => {},
});

export function useStaffAlerts() {
  return useContext(StaffAlertsContext);
}

function callText(row: Record<string, unknown>) {
  return typeof row.message === 'string' && row.message.trim()
    ? row.message
    : row.request_type === 'request_bill'
      ? 'طلب الحساب'
      : 'استدعاء النادل';
}

/**
 * Global alert layer mounted once in the staff layout: realtime reception and
 * its notification (sound + toast + call modal) work on BOTH tabs regardless of
 * which page is open. Order data/list state stays with the boards; this layer
 * only observes the same channels for alerts.
 */
export function StaffAlertsProvider({ children }: { children: React.ReactNode }) {
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [pendingOrder, setPendingOrder] = useState<NewOrderEvent | null>(null);
  const [callAlert, setCallAlert] = useState<{ id: string; table: string; message: string } | null>(null);
  const [gestureRequested, setGestureRequested] = useState(false);

  const audioUnlocked = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const soundBuffersRef = useRef<Partial<Record<NotificationSound, AudioBuffer>>>({});
  const playedOrderIds = useRef(new Set<string>());
  const playedCallIds = useRef(new Set<string>());
  const toastTimer = useRef<number | null>(null);

  const play = useCallback((sound: NotificationSound) => {
    const context = audioContextRef.current;
    const buffer = soundBuffersRef.current[sound];
    if (!audioUnlocked.current || !context || context.state !== 'running' || !buffer) return;

    // A new source is required for every alert; AudioBufferSourceNode objects cannot be reused.
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    gain.gain.value = 0.8;
    source.connect(gain);
    gain.connect(context.destination);
    source.start();
  }, []);

  const unlockAudio = useCallback(async () => {
    const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;
    if (!AudioContextCtor) return false;

    const context = audioContextRef.current ?? new AudioContextCtor();
    audioContextRef.current = context;

    try {
      if (context.state === 'suspended') await context.resume();
      if (context.state !== 'running') return false;
      const sounds: [NotificationSound, string][] = [['order', orderSoundPath], ['call', callSoundPath]];
      await Promise.all(sounds.map(async ([kind, path]) => {
        if (soundBuffersRef.current[kind]) return;
        const response = await fetch(path);
        if (!response.ok) throw new Error(`Unable to load ${path}`);
        soundBuffersRef.current[kind] = await context.decodeAudioData(await response.arrayBuffer());
      }));
      audioUnlocked.current = true;
      setAudioEnabled(true);
      try { localStorage.setItem(audioStorageKey, '1'); } catch {}
      return true;
    } catch {
      audioUnlocked.current = false;
      setAudioEnabled(false);
      return false;
    }
  }, []);

  // Restore a previous session's enabled state. AudioContext may resume without
  // a gesture on some browsers; otherwise the one-time gesture listener below
  // finishes the unlock, so the staff never re-presses the button per order.
  useEffect(() => {
    let saved = false;
    try { saved = localStorage.getItem(audioStorageKey) === '1'; } catch {}
    if (saved) void unlockAudio();
    return () => { void audioContextRef.current?.close(); };
  }, [unlockAudio]);

  // One-time global gesture unlock: any tap/keypress anywhere in the dashboard
  // enables sounds, so alerts never depend on finding the enable button.
  useEffect(() => {
    if (audioEnabled || !gestureRequested) return;
    const onGesture = () => { void unlockAudio(); };
    window.addEventListener('pointerdown', onGesture, { once: true });
    window.addEventListener('keydown', onGesture, { once: true });
    return () => {
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
    };
  }, [audioEnabled, gestureRequested, unlockAudio]);

  // Realtime alert channels: orders INSERT -> sound + toast; waiter_calls INSERT
  // -> sound + modal. Independent of the data subscriptions the boards hold.
  useEffect(() => {
    const rememberPlayed = (seen: Set<string>, id: string) => {
      if (seen.has(id)) return false;
      seen.add(id);
      // Retain enough event IDs for a long shift while keeping memory bounded.
      if (seen.size > 1000) seen.delete(seen.values().next().value as string);
      return true;
    };

    const idOf = (value: unknown) => (typeof value === 'string' || typeof value === 'number' ? String(value) : '');

    const ordersChannel = supabase.channel('staff-order-alerts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
        const id = idOf(payload.new?.id);
        if (!id || !rememberPlayed(playedOrderIds.current, id)) return;
        play('order');
        setPendingOrder({ id, table_number: payload.new.table_number ?? '—' });
        if (toastTimer.current) window.clearTimeout(toastTimer.current);
        toastTimer.current = window.setTimeout(() => setPendingOrder(null), 5000);
        // Boards listen for this to flash the new card in the list.
        window.dispatchEvent(new CustomEvent<NewOrderEvent>('staff:new-order', { detail: { id, table_number: payload.new.table_number ?? '—' } }));
      })
      .subscribe();
    const callsChannel = supabase.channel('staff-call-alerts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'waiter_calls' }, (payload) => {
        const row = payload.new as Record<string, unknown>;
        if (String(row.status ?? 'pending').toLowerCase() !== 'pending') return;
        const id = idOf(row.id);
        if (!id || !rememberPlayed(playedCallIds.current, id)) return;
        play('call');
        setCallAlert({ id, table: String(row.table_number ?? '—'), message: callText(row) });
      })
      .subscribe();
    return () => { void supabase.removeChannel(ordersChannel); void supabase.removeChannel(callsChannel); };
  }, [play]);

  const completeCall = async () => {
    if (!callAlert) return;
    const { error } = await supabase.from('waiter_calls').update({ status: 'completed' }).eq('id', callAlert.id);
    if (error) return; // The calls page keeps its own detailed error reporting.
    setCallAlert(null);
  };

  const requestAudioEnable = useCallback(() => setGestureRequested(true), []);
  const enableAudio = useCallback(() => { void unlockAudio(); }, []);

  return (
    <StaffAlertsContext.Provider value={{ audioEnabled, requestAudioEnable, enableAudio }}>
      {children}

      {/* New order toast — independent of which tab is open */}
      {pendingOrder && (
        <div dir="rtl" className="fixed inset-x-0 top-4 z-[60] flex justify-center px-4">
          <div className="animate-rise-in flex items-center gap-3 rounded-2xl border border-gold-200 bg-white px-4 py-3 shadow-card">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-100 text-gold-700">
              <UtensilsCrossed size={18} />
            </span>
            <div>
              <p className="text-sm font-bold text-stone-900">طلب جديد — طاولة {pendingOrder.table_number}</p>
              <p className="text-xs text-stone-500">طلب #{pendingOrder.id.slice(0, 5)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Waiter call modal — the calls tab renders its own detailed view */}
      {callAlert && (
        <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-stone-950/40 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-md animate-pop-in rounded-3xl border border-stone-200 bg-white p-6 text-center shadow-xl shadow-stone-900/10 sm:p-8">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 ring-1 ring-rose-100">
              <BellRing size={26} />
            </div>
            <p className="mt-4 text-sm font-semibold text-rose-500">نداء من طاولة</p>
            <h3 className="mt-1 text-4xl font-bold tabular-nums text-stone-900">{callAlert.table}</h3>
            <p className="mt-2 text-stone-600">{callAlert.message}</p>
            <div className="mt-6 flex justify-center gap-3">
              <button onClick={() => void completeCall()} className="rounded-xl bg-emerald-600 px-5 py-2.5 font-semibold text-white shadow-soft transition hover:bg-emerald-700 active:scale-[0.98]">
                <span className="inline-flex items-center gap-2"><Check size={16} /> تمت المساعدة</span>
              </button>
              <button onClick={() => setCallAlert(null)} className="rounded-xl border border-stone-200 bg-white px-5 py-2.5 font-medium text-stone-600 transition hover:bg-ivory-100 active:scale-[0.98]">إغلاق</button>
            </div>
          </div>
        </div>
      )}
    </StaffAlertsContext.Provider>
  );
}

/** Audio enable control: hidden once sounds work; reappears only when muted. */
export function AudioEnableButton() {
  const { audioEnabled, requestAudioEnable, enableAudio } = useStaffAlerts();

  if (audioEnabled) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-gold-200 bg-gold-50 px-3.5 py-2 text-sm font-medium text-gold-700" title="التنبيهات مفعلة">
        <BellRing size={15} /> التنبيهات مفعلة
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => { requestAudioEnable(); enableAudio(); }}
      className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3.5 py-2 text-sm font-medium text-stone-700 shadow-soft transition hover:border-gold-300 hover:text-gold-700"
    >
      <BellOff size={15} /> تفعيل أصوات التنبيهات
    </button>
  );
}
