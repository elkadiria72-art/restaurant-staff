'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Clock3, UtensilsCrossed } from 'lucide-react';
import { OrderCard } from '@/components/order-card';
import { supabase } from '@/lib/supabase';
import { statusOrder, type Order, type OrderStatus } from '@/lib/types';

const STATUS_LABELS: Record<OrderStatus, string> = {
  Pending: 'طلبات جديدة',
  'In Progress': 'قيد التحضير',
  Served: 'تم التقديم',
};

const STATUS_COLUMNS: OrderStatus[] = ['Pending', 'In Progress', 'Served'];

type OrderActionStatus = OrderStatus | 'preparing' | 'served';

// Audio context for notifications
const ORDER_SOUND = typeof window === 'undefined' ? null : (() => {
  try {
    const audio = new Audio('/sound-ousis/Sonner.mp3');
    audio.preload = 'auto';
    audio.volume = 0.7;
    return audio;
  } catch {
    return null;
  }
})();

function normalizeOrder(value: unknown): Order | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const rawId = record.id;
  const id =
    typeof rawId === 'string' && rawId.trim()
      ? rawId
      : typeof rawId === 'number' || typeof rawId === 'bigint'
        ? String(rawId)
        : '';

  if (!id) {
    return null;
  }

  const parseItems = (input: unknown): Array<{ name: string; quantity: number }> => {
    if (Array.isArray(input)) {
      return input
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
        .map((item) => ({
          name: typeof item.name === 'string' && item.name.trim() ? item.name : 'Unnamed item',
          quantity: typeof item.quantity === 'number' && Number.isFinite(item.quantity) ? item.quantity : Number(item.quantity) || 0,
        }));
    }

    if (typeof input === 'string' && input.trim()) {
      try {
        return parseItems(JSON.parse(input));
      } catch {
        return [];
      }
    }

    return [];
  };

  return {
    id,
    table_number:
      typeof record.table_number === 'number' && Number.isFinite(record.table_number)
        ? record.table_number
        : Number(record.table_number) || 0,
    items: parseItems(record.items),
    total_price:
      typeof record.total_price === 'number' && Number.isFinite(record.total_price)
        ? record.total_price
        : Number(record.total_price) || 0,
    status: typeof record.status === 'string' ? normalizeOrderStatus(record.status) : 'Pending',
    created_at: typeof record.created_at === 'string' ? record.created_at : new Date().toISOString(),
  };
}

function normalizeOrderStatus(value: unknown): OrderStatus {
  if (typeof value !== 'string') {
    return 'Pending';
  }

  const lower = value.trim().toLowerCase();

  if (lower === 'in progress' || lower === 'in-progress' || lower === 'preparing') {
    return 'In Progress';
  }

  if (lower === 'served') {
    return 'Served';
  }

  return 'Pending';
}

function getOrderId(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }

  return null;
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [liveNotice, setLiveNotice] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const userInteractedRef = useRef(false);

  const unlockAudio = useCallback(async () => {
    if (typeof window === 'undefined') {
      return;
    }

    userInteractedRef.current = true;

    if (!audioContextRef.current) {
      const AudioCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) {
        return;
      }
      audioContextRef.current = new AudioCtor();
    }

    if (audioContextRef.current.state === 'suspended') {
      try {
        await audioContextRef.current.resume();
      } catch {
        // Ignore
      }
    }

    setAudioEnabled(true);
  }, []);

  const playOrderSound = useCallback(async () => {
    if (!userInteractedRef.current || !audioEnabled) {
      return;
    }

    try {
      if (ORDER_SOUND) {
        ORDER_SOUND.currentTime = 0;
        await ORDER_SOUND.play();
        return;
      }
    } catch {
      // Ignore
    }

    try {
      const context = audioContextRef.current;
      if (!context) {
        return;
      }

      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(880, context.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(1320, context.currentTime + 0.16);

      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.3);

      oscillator.connect(gain);
      gain.connect(context.destination);

      oscillator.start();
      oscillator.stop(context.currentTime + 0.32);
    } catch {
      // Ignore
    }
  }, [audioEnabled]);

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const { data, error } = await supabase
          .from('orders')
          .select('*')
          .in('status', ['Pending', 'In Progress', 'Served', 'pending', 'in-progress', 'served'])
          .order('created_at', { ascending: false });

        if (error) {
          throw error;
        }

        const normalizedOrders = (data ?? [])
          .map((item) => normalizeOrder(item))
          .filter((item): item is Order => item !== null);

        setOrders(normalizedOrders);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'تعذر تحميل الطلبات.');
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();

    const channel = supabase
      .channel('staff-orders', {
        config: {
          presence: { key: 'staff-orders' },
        },
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
        if (!payload.new) {
          return;
        }

        const nextOrder = normalizeOrder(payload.new);

        if (!nextOrder) {
          return;
        }

        const incomingId = getOrderId(nextOrder.id);

        setOrders((current) => [nextOrder, ...current.filter((order) => getOrderId(order.id) !== incomingId)]);
        setHighlightedId(incomingId);
        setLiveNotice('طلب جديد');
        window.setTimeout(() => {
          setHighlightedId((current) => (current === incomingId ? null : current));
        }, 2200);
        window.setTimeout(() => {
          setLiveNotice((current) => (current === 'طلب جديد' ? null : current));
        }, 3200);
        void playOrderSound();
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnected(true);
          setError(null);
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setConnected(false);
          setError('فشل الاتصال مع Supabase. يرجى التحقق من الإعدادات.');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [playOrderSound]);

  const handleStatusChange = async (id: string | null | undefined, nextStatus: OrderActionStatus) => {
    const resolvedId = getOrderId(id) ?? (typeof id === 'string' && id.trim() ? id : null);

    if (!resolvedId) {
      return;
    }

    const normalizedStatus = normalizeOrderStatus(nextStatus);

    setUpdatingId(resolvedId);

    try {
      const { error } = await supabase.from('orders').update({ status: normalizedStatus }).eq('id', resolvedId);

      if (error) {
        throw error;
      }

      setOrders((current) => current.map((order) => (getOrderId(order.id) === resolvedId ? { ...order, status: normalizedStatus } : order)));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحديث حالة الطلب.');
    } finally {
      setUpdatingId((current) => (current === resolvedId ? null : current));
    }
  };

  const handleDeleteOrder = async (id: string | null | undefined) => {
    const resolvedId = getOrderId(id) ?? (typeof id === 'string' && id.trim() ? id : null);

    if (!resolvedId) {
      return;
    }

    setOrders((current) => current.filter((order) => getOrderId(order.id) !== resolvedId));
    setHighlightedId((current) => (current === resolvedId ? null : current));

    try {
      const { error } = await supabase.from('orders').delete().eq('id', resolvedId);

      if (error) {
        throw error;
      }

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إنهاء الطلب.');
    }
  };

  const filteredOrdersByStatus = useMemo(() => {
    return STATUS_COLUMNS.reduce(
      (groups, status) => {
        if (status === 'Pending') {
          groups[status] = orders.filter((order) => order.status?.toLowerCase() === 'pending');
        } else if (status === 'In Progress') {
          groups[status] = orders.filter((order) => order.status?.toLowerCase() === 'in progress' || order.status?.toLowerCase() === 'in-progress');
        } else {
          groups[status] = orders.filter((order) => order.status?.toLowerCase() === 'served');
        }

        return groups;
      },
      {} as Record<OrderStatus, Order[]>
    );
  }, [orders]);

  return (
    <div className="space-y-4">
      {/* Status Header */}
      <div className="grid gap-3 sm:grid-cols-3">
        {STATUS_COLUMNS.map((status) => {
          const count = filteredOrdersByStatus[status].length;
          return (
            <div key={status} className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/70 p-4 shadow-inner shadow-black/20">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-300">{STATUS_LABELS[status]}</p>
                {count > 0 && (
                  <span className="relative flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white shadow-lg shadow-red-500/50">
                    {count}
                  </span>
                )}
              </div>
              <p className="mt-3 text-3xl font-semibold text-white">{count}</p>
            </div>
          );
        })}
      </div>

      {/* Connection Status & Audio Toggle */}
      <div className="flex flex-wrap items-center gap-2">
        <div className={`rounded-full border px-3 py-1.5 text-sm font-medium ${connected ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300' : 'border-amber-400/30 bg-amber-500/10 text-amber-200'}`}>
          {connected ? 'متصل مباشرة' : 'جاري الاتصال'}
        </div>
        <button
          type="button"
          onClick={() => void unlockAudio()}
          className="flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-sm font-medium text-slate-100 transition hover:bg-white/20"
        >
          🔔 {audioEnabled ? 'التنبيهات مفعلة' : 'تفعيل التنبيهات'}
        </button>
      </div>

      {/* Live Notice */}
      {liveNotice && (
        <div className="animate-pulse rounded-[24px] border border-amber-400/40 bg-amber-500/15 px-4 py-3 text-lg font-semibold text-amber-100 shadow-[0_10px_32px_rgba(245,158,11,0.14)]">
          {liveNotice}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      {/* Orders Grid */}
      <section className="grid gap-4 xl:grid-cols-3">
        {STATUS_COLUMNS.map((status) => (
          <div key={status} className="flex min-h-[320px] flex-col rounded-[24px] border border-white/10 bg-slate-950/70 p-3 shadow-[0_12px_40px_rgba(0,0,0,0.2)]">
            <div className="mb-3 flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
              <div className="flex items-center gap-2">
                {status === 'Pending' ? <Clock3 size={16} className="text-amber-300" /> : status === 'In Progress' ? <UtensilsCrossed size={16} className="text-sky-300" /> : <CheckCircle2 size={16} className="text-emerald-300" />}
                <h2 className="text-base font-semibold text-white">{STATUS_LABELS[status]}</h2>
              </div>
              {filteredOrdersByStatus[status].length > 0 && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white">
                  {filteredOrdersByStatus[status].length}
                </span>
              )}
            </div>

            <div className="flex-1 space-y-3">
              {loading ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-slate-900/70 p-4 text-center text-sm text-slate-400">
                  جاري تحميل الطلبات...
                </div>
              ) : filteredOrdersByStatus[status].length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-slate-900/70 p-4 text-center text-sm text-slate-400">
                  لا توجد طلبات في هذه الحالة حالياً.
                </div>
              ) : (
                filteredOrdersByStatus[status].map((order) => (
                  <OrderCard
                    key={getOrderId(order.id) ?? `${order.table_number}-${order.created_at}`}
                    order={order}
                    updating={updatingId === getOrderId(order.id)}
                    highlighted={highlightedId === getOrderId(order.id)}
                    onStatusChange={handleStatusChange}
                    onDelete={handleDeleteOrder}
                  />
                ))
              )}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
