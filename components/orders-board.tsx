'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BellRing, CheckCircle2, Clock3, UtensilsCrossed } from 'lucide-react';
import { OrderCard } from '@/components/order-card';
import { supabase } from '@/lib/supabase';
import { normalizeOrder, statusLabels, statusOrder, type Order, type OrderStatus } from '@/lib/types';

const orderSoundPath = '/sound-ousis/Sonner.mp3';
const callSoundPath = '/sound-ousis/Sonner2.mp3';

type NotificationSound = 'order' | 'call';
type AudioContextConstructor = typeof AudioContext;

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
      const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
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

  return <div className="space-y-4" dir="rtl">
    {callAlert && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"><div className="w-full max-w-md rounded-3xl border-2 border-red-300 bg-slate-950 p-6 text-center shadow-2xl"><BellRing className="mx-auto text-red-300" size={38} /><p className="mt-3 text-xl font-bold text-white">نداء من طاولة {callAlert.table}</p><p className="mt-2 text-slate-300">{callAlert.message}</p><div className="mt-6 flex justify-center gap-3"><button onClick={() => void completeCall()} className="rounded-full bg-emerald-500 px-4 py-2 font-semibold text-slate-950">تمت المساعدة</button><button onClick={() => setCallAlert(null)} className="rounded-full border border-white/20 px-4 py-2 text-white">إغلاق</button></div></div></div>}
    <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-3 py-1.5 text-sm ${connected ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300' : 'border-amber-400/30 bg-amber-500/10 text-amber-200'}`}>{connected ? 'متصل مباشرة' : 'جاري الاتصال'}</span><button type="button" onClick={() => void unlockAudio()} className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-sm text-white"><BellRing className="inline" size={15} /> {audioEnabled ? 'أصوات التنبيهات مفعلة' : 'تفعيل أصوات التنبيهات'}</button></div>
    {error && <p className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-rose-100">{error}</p>}
    <div className="grid gap-3 sm:grid-cols-4">{statusOrder.map((status) => <div key={status} className="rounded-2xl border border-white/10 bg-slate-900/70 p-4"><p className="text-sm text-slate-300">{statusLabels[status]}</p><p className="mt-2 text-3xl font-semibold text-white">{grouped[status].length}</p></div>)}</div>
    <section className="grid gap-4 xl:grid-cols-4">{statusOrder.map((status) => <div key={status} className="min-h-80 rounded-3xl border border-white/10 bg-slate-950/70 p-3"><div className="mb-3 flex items-center gap-2 text-white">{status === 'new' ? <Clock3 size={16} /> : status === 'served' ? <CheckCircle2 size={16} /> : <UtensilsCrossed size={16} />}<h2>{statusLabels[status]}</h2></div>{loading ? <p className="text-sm text-slate-400">جاري تحميل الطلبات...</p> : grouped[status].length ? <div className="space-y-3">{grouped[status].map((order) => <OrderCard key={order.id} order={order} updating={updatingId === order.id} highlighted={highlightedId === order.id} onStatusChange={changeStatus} />)}</div> : <p className="text-sm text-slate-400">لا توجد طلبات حالياً.</p>}</div>)}</section>
  </div>;
}
