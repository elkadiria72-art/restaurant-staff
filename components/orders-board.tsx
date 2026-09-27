'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Clock3, Coffee, UtensilsCrossed, type LucideIcon } from 'lucide-react';
import { OrderCard } from '@/components/order-card';
import { supabase } from '@/lib/supabase';
import { normalizeOrder, statusLabels, statusOrder, type Order, type OrderStatus } from '@/lib/types';

const columnVisuals: Record<OrderStatus, { dot: string; icon: LucideIcon; chip: string }> = {
  new: { dot: 'bg-amber-400', icon: Clock3, chip: 'bg-amber-50 text-amber-600' },
  preparing: { dot: 'bg-orange-400', icon: UtensilsCrossed, chip: 'bg-orange-50 text-orange-600' },
  ready: { dot: 'bg-emerald-500', icon: CheckCircle2, chip: 'bg-emerald-50 text-emerald-600' },
  served: { dot: 'bg-stone-300', icon: Coffee, chip: 'bg-stone-100 text-stone-500' },
  cancelled: { dot: 'bg-rose-400', icon: Coffee, chip: 'bg-rose-50 text-rose-600' },
};

function idOf(value: unknown) { return typeof value === 'string' || typeof value === 'number' ? String(value) : ''; }

/** Board ordering rule (oldest -> newest) — realtime events must never shuffle it. */
const byCreatedAsc = (a: Order, b: Order) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
const sortAsc = (list: Order[]) => [...list].sort(byCreatedAsc);

export function OrdersBoard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const highlightTimer = useRef<number | null>(null);

  useEffect(() => {
    const load = async () => {
      // Live-board retention: show only the current service day. Older served
      // orders stay in the database for Admin analytics but must not pile up
      // indefinitely on the staff board (same day boundary as Admin views).
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const { data, error } = await supabase.from('orders').select('*').gte('created_at', startOfToday.toISOString()).order('created_at', { ascending: true });
      if (error) setError(error.message); else setOrders((data ?? []).map(normalizeOrder).filter((item): item is Order => item !== null));
      setLoading(false);
    };
    void load();
    // Separate channels per logical feature: a subscription the database cannot
    // serve (e.g. a table missing from the realtime publication) must not stop
    // delivery on the other channel.
    const ordersChannel = supabase.channel('staff-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        if (payload.eventType === 'DELETE') { const id = idOf(payload.old.id); setOrders((current) => current.filter((item) => item.id !== id)); return; }
        const order = normalizeOrder(payload.new);
        if (!order) return;
        // Upsert then keep the canonical oldest->newest order; realtime arrival
        // must not reorder the list, only fill it in.
        setOrders((current) => sortAsc([...current.filter((item) => item.id !== order.id), order]));
      })
      .subscribe((status) => { setConnected(status === 'SUBSCRIBED'); if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setError('فشل الاتصال المباشر مع Supabase.'); });
    return () => { void supabase.removeChannel(ordersChannel); };
  }, []);

  // Sound/toast for new orders live in StaffAlertsProvider; the board only
  // flashes the card so the new order is easy to find in the ordered list.
  useEffect(() => {
    const onNewOrder = (event: Event) => {
      const detail = (event as CustomEvent<{ id: string }>).detail;
      if (!detail?.id) return;
      setHighlightedId(detail.id);
      if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
      highlightTimer.current = window.setTimeout(() => setHighlightedId(null), 6000);
    };
    window.addEventListener('staff:new-order', onNewOrder);
    return () => {
      window.removeEventListener('staff:new-order', onNewOrder);
      if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
    };
  }, []);

  const changeStatus = useCallback(async (id: string, status: OrderStatus) => {
    setUpdatingId(id); const { error } = await supabase.from('orders').update({ status }).eq('id', id);
    if (error) setError(error.message); else setOrders((current) => current.map((order) => order.id === id ? { ...order, status } : order)); setUpdatingId(null);
  }, []);

  const grouped = useMemo(() => Object.fromEntries(statusOrder.map((status) => [status, orders.filter((order) => order.status === status)])) as Record<OrderStatus, Order[]>, [orders]);

  return <div className="space-y-5" dir="rtl">
    <div className="flex flex-wrap items-center gap-2">
      <span className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium ${connected ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
        <span className="relative flex h-2 w-2">
          {connected && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
          <span className={`relative inline-flex h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
        </span>
        {connected ? 'متصل مباشرة' : 'جاري الاتصال'}
      </span>
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
