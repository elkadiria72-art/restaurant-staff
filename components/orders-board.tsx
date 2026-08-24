'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BellRing, CheckCircle2, Clock3, Coffee, UtensilsCrossed, type LucideIcon } from 'lucide-react';
import { OrderCard } from '@/components/order-card';
import { supabase } from '@/lib/supabase';
import { normalizeOrder, statusLabels, statusOrder, type Order, type OrderStatus } from '@/lib/types';

const orderSoundPath = '/sound-ousis/Sonner.mp3';
const callSoundPath = '/sound-ousis/Sonner2.mp3';

type NotificationSound = 'order' | 'call';
type AudioContextConstructor = typeof AudioContext;

const columnVisuals: Record<OrderStatus, { dot: string; icon: LucideIcon; chip: string }> = {
  new: { dot: 'bg-amber-400', icon: Clock3, chip: 'bg-amber-50 text-amber-600' },
  preparing: { dot: 'bg-orange-400', icon: UtensilsCrossed, chip: 'bg-orange-50 text-orange-600' },
  ready: { dot: 'bg-emerald-500', icon: CheckCircle2, chip: 'bg-emerald-50 text-emerald-600' },
  served: { dot: 'bg-stone-300', icon: Coffee, chip: 'bg-stone-100 text-stone-500' },
  cancelled: { dot: 'bg-rose-400', icon: BellRing, chip: 'bg-rose-50 text-rose-600' },
};

function idOf(value: unknown) { return typeof value === 'string' || typeof value === 'number' ? String(value) : ''; }
function callText(row: Record<string, unknown>) { return typeof row.message === 'string' && row.message.trim() ? row.message : row.request_type === 'request_bill' ? 'طلب الحساب' : 'استدعاء النادل'; }

export function OrdersBoard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [callAlert, setCallAlert] = useState<{ id: string; table: string; message: string } | null>(null);
  const audioUnlocked = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const soundBuffersRef = useRef<Partial<Record<NotificationSound, AudioBuffer>>>({});
  const playedOrderIds = useRef(new Set<string>());
  const playedCallIds = useRef(new Set<string>());

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
    if (!AudioContextCtor) return;

    const context = audioContextRef.current ?? new AudioContextCtor();
    audioContextRef.current = context;

    try {
      if (context.state === 'suspended') await context.resume();
      const sounds: [NotificationSound, string][] = [['order', orderSoundPath], ['call', callSoundPath]];
      await Promise.all(sounds.map(async ([kind, path]) => {
        if (soundBuffersRef.current[kind]) return;
        const response = await fetch(path);
        if (!response.ok) throw new Error(`Unable to load ${path}`);
        soundBuffersRef.current[kind] = await context.decodeAudioData(await response.arrayBuffer());
      }));
      audioUnlocked.current = context.state === 'running';
      setAudioEnabled(audioUnlocked.current);
    } catch {
      audioUnlocked.current = false;
      setAudioEnabled(false);
    }
  }, []);

  const rememberPlayed = (seen: Set<string>, id: string) => {
    if (seen.has(id)) return false;
    seen.add(id);
    // Retain enough event IDs for a long shift while keeping memory bounded.
    if (seen.size > 1000) seen.delete(seen.values().next().value as string);
    return true;
  };

  useEffect(() => {
    const load = async () => {
      // Live-board retention: show only the current service day. Older served
      // orders stay in the database for Admin analytics but must not pile up
      // indefinitely on the staff board (same day boundary as Admin views).
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const { data, error } = await supabase.from('orders').select('*').gte('created_at', startOfToday.toISOString()).order('created_at', { ascending: false });
      if (error) setError(error.message); else setOrders((data ?? []).map(normalizeOrder).filter((item): item is Order => item !== null));
      setLoading(false);
    };
    void load();
    // Separate channels per logical feature: a subscription the database cannot
    // serve (e.g. a table missing from the realtime publication) must not stop
    // delivery on the other channel.
    const ordersChannel = supabase.channel('staff-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        const order = normalizeOrder(payload.new);
        if (payload.eventType === 'DELETE') { const id = idOf(payload.old.id); setOrders((current) => current.filter((item) => item.id !== id)); return; }
        if (!order) return;
        setOrders((current) => [order, ...current.filter((item) => item.id !== order.id)]);
        if (payload.eventType === 'INSERT' && rememberPlayed(playedOrderIds.current, order.id)) { setHighlightedId(order.id); play('order'); window.setTimeout(() => setHighlightedId(null), 2500); }
      })
      .subscribe((status) => { setConnected(status === 'SUBSCRIBED'); if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setError('فشل الاتصال المباشر مع Supabase.'); });
    const callsChannel = supabase.channel('staff-calls-alerts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'waiter_calls' }, (payload) => {
        const row = payload.new as Record<string, unknown>; if (String(row.status ?? 'pending').toLowerCase() !== 'pending') return;
        const id = idOf(row.id); if (!id || !rememberPlayed(playedCallIds.current, id)) return; setCallAlert({ id, table: String(row.table_number ?? '—'), message: callText(row) }); play('call');
      })
      .subscribe();
    return () => { void supabase.removeChannel(ordersChannel); void supabase.removeChannel(callsChannel); };
  }, [play]);

  useEffect(() => () => { void audioContextRef.current?.close(); }, []);

  const changeStatus = async (id: string, status: OrderStatus) => {
    setUpdatingId(id); const { error } = await supabase.from('orders').update({ status }).eq('id', id);
    if (error) setError(error.message); else setOrders((current) => current.map((order) => order.id === id ? { ...order, status } : order)); setUpdatingId(null);
  };
  const completeCall = async () => {
    if (!callAlert) return; const { error } = await supabase.from('waiter_calls').update({ status: 'completed' }).eq('id', callAlert.id);
    if (error) setError(error.message); else setCallAlert(null);
  };
  const grouped = useMemo(() => Object.fromEntries(statusOrder.map((status) => [status, orders.filter((order) => order.status === status)])) as Record<OrderStatus, Order[]>, [orders]);

  return <div className="space-y-5" dir="rtl">
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
            <button onClick={() => void completeCall()} className="rounded-xl bg-emerald-600 px-5 py-2.5 font-semibold text-white shadow-soft transition hover:bg-emerald-700 active:scale-[0.98]">تمت المساعدة</button>
            <button onClick={() => setCallAlert(null)} className="rounded-xl border border-stone-200 bg-white px-5 py-2.5 font-medium text-stone-600 transition hover:bg-ivory-100 active:scale-[0.98]">إغلاق</button>
          </div>
        </div>
      </div>
    )}
    <div className="flex flex-wrap items-center gap-2">
      <span className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium ${connected ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
        <span className="relative flex h-2 w-2">
          {connected && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
          <span className={`relative inline-flex h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
        </span>
        {connected ? 'متصل مباشرة' : 'جاري الاتصال'}
      </span>
      <button type="button" onClick={() => void unlockAudio()} className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium shadow-soft transition ${audioEnabled ? 'border-gold-200 bg-gold-50 text-gold-700' : 'border-stone-200 bg-white text-stone-700 hover:border-gold-300 hover:text-gold-700'}`}>
        <BellRing size={15} /> {audioEnabled ? 'أصوات التنبيهات مفعلة' : 'تفعيل أصوات التنبيهات'}
      </button>
    </div>
    {error && <p className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {statusOrder.map((status) => {
        const visual = columnVisuals[status];
        const Icon = visual.icon;
        return <div key={status} className="flex items-center justify-between rounded-2xl border border-stone-200/80 bg-white p-4 shadow-soft">
          <div>
            <p className="text-sm text-stone-500">{statusLabels[status]}</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-stone-900">{grouped[status].length}</p>
          </div>
          <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${visual.chip}`}><Icon size={20} /></span>
        </div>;
      })}
    </div>
    <section className="grid gap-4 xl:grid-cols-4">
      {statusOrder.map((status) => {
        const visual = columnVisuals[status];
        return <div key={status} className="min-h-80 rounded-3xl border border-stone-200/70 bg-ivory-200/50 p-3">
          <div className="mb-3 flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${visual.dot}`} />
              <h2 className="text-sm font-semibold text-stone-700">{statusLabels[status]}</h2>
            </div>
            <span className="rounded-full border border-stone-200 bg-white px-2 py-0.5 text-xs font-medium tabular-nums text-stone-500">{grouped[status].length}</span>
          </div>
          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((index) => <div key={index} className="h-44 animate-pulse rounded-2xl border border-stone-200/50 bg-white/70" />)}
            </div>
          ) : grouped[status].length ? (
            <div className="space-y-3">{grouped[status].map((order) => <OrderCard key={order.id} order={order} updating={updatingId === order.id} highlighted={highlightedId === order.id} onStatusChange={changeStatus} />)}</div>
          ) : (
            <p className="rounded-2xl border border-dashed border-stone-300/80 px-4 py-10 text-center text-sm text-stone-400">لا توجد طلبات حالياً.</p>
          )}
        </div>;
      })}
    </section>
  </div>;
}
