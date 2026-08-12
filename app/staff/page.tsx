'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BellRing, CheckCircle2, Clock3, Sparkles, UtensilsCrossed } from 'lucide-react';
import { OrderCard } from '@/components/order-card';
import { supabase } from '@/lib/supabase';
import { statusOrder, type Order, type OrderStatus } from '@/lib/types';

const STATUS_LABELS: Record<OrderStatus, string> = {
  Pending: 'طلبات جديدة',
  'In Progress': 'قيد التحضير',
  Served: 'تم التقديم',
};

const STATUS_COLUMNS: OrderStatus[] = ['Pending', 'In Progress', 'Served'];

type WaiterCallAlert = {
  id: string;
  tableNumber: number | string;
  message: string;
  tableId?: string;
  timestamp?: string;
  requestType?: string;
};

type OrderActionStatus = OrderStatus | 'preparing' | 'served';

// Initialize audio elements safely with available sound files
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

const CALL_SOUND = typeof window === 'undefined' ? null : (() => {
  try {
    const audio = new Audio('/sound-ousis/Sonner2.mp3');
    audio.preload = 'auto';
    audio.volume = 0.8;
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

function getOrderId(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }

  return null;
}

function formatOrderTime(value: string | undefined): string {
  if (!value) {
    return 'الآن';
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return 'الآن';
  }

  return parsed.toLocaleTimeString('ar-SA', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getRecordString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    if (typeof value === 'number' || typeof value === 'bigint') {
      return String(value);
    }
  }

  return '';
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

export default function StaffPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [activeCallAlert, setActiveCallAlert] = useState<WaiterCallAlert | null>(null);
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
        // Ignore resume errors and keep the UI resilient.
      }
    }

    setAudioEnabled(true);
  }, []);

  const playNotificationSound = useCallback(async (kind: 'order' | 'call') => {
    if (!userInteractedRef.current || !audioEnabled) {
      return;
    }

    // Ensure audio context is initialized
    if (!audioContextRef.current) {
      const AudioCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) {
        return;
      }
      audioContextRef.current = new AudioCtor();
    }

    // Try to play the actual sound file first
    try {
      const sound = kind === 'order' ? ORDER_SOUND : CALL_SOUND;
      if (sound) {
        sound.currentTime = 0;
        const playPromise = sound.play();
        if (playPromise !== undefined) {
          await playPromise;
          return;
        }
      }
    } catch (err) {
      // Ignore file play errors and fall back to web audio
    }

    // Fallback to Web Audio API synthesized sound
    try {
      const context = audioContextRef.current;
      if (!context) {
        return;
      }

      // Ensure context is running
      if (context.state === 'suspended') {
        try {
          await context.resume();
        } catch {
          // Ignore resume errors
        }
      }

      if (context.state !== 'running') {
        return;
      }

      // Create a more attention-grabbing sound for waiter calls
      if (kind === 'call') {
        // Double beep for urgent waiter call
        const playBeep = (startTime: number, freq: number, duration: number) => {
          const osc = context.createOscillator();
          const gain = context.createGain();

          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, context.currentTime + startTime);
          osc.frequency.exponentialRampToValueAtTime(freq * 1.2, context.currentTime + startTime + duration * 0.5);

          gain.gain.setValueAtTime(0, context.currentTime + startTime);
          gain.gain.exponentialRampToValueAtTime(0.25, context.currentTime + startTime + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.1, context.currentTime + startTime + duration * 0.8);
          gain.gain.exponentialRampToValueAtTime(0, context.currentTime + startTime + duration);

          osc.connect(gain);
          gain.connect(context.destination);

          osc.start(context.currentTime + startTime);
          osc.stop(context.currentTime + startTime + duration);
        };

        // Play two beeps: high then low
        playBeep(0, 1000, 0.2);
        playBeep(0.25, 700, 0.2);
      } else {
        // Single beep for new orders
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
      }
    } catch (err) {
      // Silently fail - audio is not critical to functionality
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
      .channel('staff-kds-orders', {
        config: {
          presence: { key: 'staff-kds' },
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
        void playNotificationSound('order');
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'waiter_calls' }, (payload) => {
        if (!payload.new) {
          return;
        }

        const record = payload.new as Record<string, unknown>;
        const callId = getRecordString(record, ['id']);
        const tableNumber = getRecordString(record, ['table_number', 'table', 'tableNumber']);
        const tableId = getRecordString(record, ['table_id', 'tableId']);
        const message = getRecordString(record, ['message', 'details', 'request', 'reason', 'note', 'description', 'request_type']);
        const requestType = getRecordString(record, ['request_type', 'type']);
        const timestamp = typeof record.created_at === 'string' ? record.created_at : new Date().toISOString();

        if (!callId) {
          return;
        }

        // Determine the message based on request type
        let displayMessage = message || 'المساعدة';
        if (requestType.includes('bill') || displayMessage.includes('حساب')) {
          displayMessage = 'طلب الحساب 💰';
        } else if (requestType.includes('waiter') || displayMessage.includes('النادل')) {
          displayMessage = 'استدعاء النادل 🔔';
        }

        setActiveCallAlert({
          id: callId,
          tableNumber: tableNumber || '—',
          message: displayMessage,
          tableId: tableId || '',
          timestamp: timestamp,
          requestType: requestType,
        });
        void playNotificationSound('call');
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
  }, [playNotificationSound]);

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

  const handleHelped = async () => {
    if (!activeCallAlert?.id) {
      return;
    }

    try {
      const { error } = await supabase.from('waiter_calls').update({ status: 'completed' }).eq('id', activeCallAlert.id);

      if (error) {
        throw error;
      }

      setActiveCallAlert(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إغلاق تنبيه الطاولة.');
    }
  };

  const sortedOrders = useMemo(() => {
    return [...orders].sort((left, right) => {
      const rank = (status: OrderStatus) => statusOrder.indexOf(status);
      const statusDelta = rank(left.status) - rank(right.status);
      if (statusDelta !== 0) {
        return statusDelta;
      }

      return new Date(right.created_at ?? 0).getTime() - new Date(left.created_at ?? 0).getTime();
    });
  }, [orders]);

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
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(176,95,44,0.18),_rgba(10,10,12,1)_60%)] px-3 py-4 text-slate-100 sm:px-5 lg:px-8 lg:py-6" dir="rtl">
      {activeCallAlert ? (
        <div className="fixed inset-0 z-50 flex animate-pulse items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl animate-bounce rounded-[40px] border-4 border-orange-300 bg-gradient-to-br from-orange-600 via-red-500 to-rose-600 p-2 shadow-[0_0_60px_rgba(255,100,0,0.8)]">
            <div className="rounded-[36px] bg-slate-950/98 p-8 text-center sm:p-12">
              <div className="mb-4 text-5xl">🚨</div>
              <p className="text-lg font-black uppercase tracking-[0.2em] text-orange-300">تنبيه فوري</p>
              <h2 className="mt-4 text-4xl font-black text-white sm:text-5xl">
                ⚠️ طاولة رقم <span className="text-orange-300">{activeCallAlert.tableNumber}</span>
              </h2>
              <p className="mt-3 text-2xl font-bold text-orange-200">{activeCallAlert.message}</p>
              {activeCallAlert.timestamp && (
                <p className="mt-2 text-sm text-slate-400">
                  الوقت: {new Date(activeCallAlert.timestamp).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </p>
              )}
              <p className="mt-6 text-base text-slate-300">يحتاج هذا التنبيه إلى متابعة فورية من فريق الخدمة.</p>
              <div className="mt-10 flex flex-wrap justify-center gap-4">
                <button
                  type="button"
                  onClick={() => void handleHelped()}
                  className="animate-pulse rounded-full bg-emerald-500 px-8 py-4 text-xl font-bold text-slate-950 shadow-lg shadow-emerald-500/50 transition hover:scale-105 hover:bg-emerald-400 hover:shadow-emerald-500/70"
                >
                  ✓ تمت المساعدة
                </button>
                <button
                  type="button"
                  onClick={() => setActiveCallAlert(null)}
                  className="rounded-full border-2 border-white/30 bg-white/10 px-8 py-4 text-xl font-bold text-white transition hover:bg-white/20"
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <header className="overflow-hidden rounded-[28px] border border-amber-400/20 bg-slate-950/80 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur">
          <div className="flex flex-col gap-4 border-b border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-4 sm:p-6 lg:flex-row lg:items-end lg:justify-between lg:p-7">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.35em] text-amber-300">
                <Sparkles size={16} />
                <span>لوحة مطبخ فاخرة</span>
              </div>
              <h1 className="text-2xl font-semibold text-white sm:text-3xl">Staff Dashboard</h1>
              <p className="max-w-2xl text-sm text-slate-300 sm:text-base">
                نظام عرض طلبات حاسوبي حديث مع تحديثات مباشرة وتنسيق مخصص لطاقم المطبخ.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className={`rounded-full border px-3 py-1.5 text-sm font-medium ${connected ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300' : 'border-amber-400/30 bg-amber-500/10 text-amber-200'}`}>
                {connected ? 'متصل مباشرة' : 'جاري الاتصال'}
              </div>
              <button
                type="button"
                onClick={() => void unlockAudio()}
                className="flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-sm font-medium text-slate-100 transition hover:bg-white/20"
              >
                <BellRing size={16} />
                {audioEnabled ? 'التنبيهات مفعلة' : 'تفعيل التنبيهات'}
              </button>
            </div>
          </div>

          <div className="grid gap-3 p-4 sm:grid-cols-3 sm:p-6">
            {STATUS_COLUMNS.map((status) => {
              const count = filteredOrdersByStatus[status].length;
              return (
                <div key={status} className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 shadow-inner shadow-black/20">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-slate-300">{STATUS_LABELS[status]}</p>
                    <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-slate-200">{count}</span>
                  </div>
                  <p className="mt-3 text-3xl font-semibold text-white">{count}</p>
                </div>
              );
            })}
          </div>
        </header>

        {error ? (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        ) : null}

        {liveNotice ? (
          <div className="rounded-[24px] border border-amber-400/40 bg-amber-500/15 px-4 py-3 text-lg font-semibold text-amber-100 shadow-[0_10px_32px_rgba(245,158,11,0.14)]">
            {liveNotice}
          </div>
        ) : null}

        {activeCallAlert ? (
          <div className="animate-pulse rounded-[24px] border-2 border-orange-400 bg-gradient-to-r from-orange-600/40 via-red-500/40 to-rose-500/40 p-5 shadow-[0_0_40px_rgba(255,100,0,0.4)]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-lg font-black uppercase tracking-[0.3em] text-orange-200">🚨 تنبيه خدمة عاجل</p>
                <h3 className="mt-2 text-2xl font-bold text-white sm:text-3xl">⚠️ طاولة رقم {activeCallAlert.tableNumber} - {activeCallAlert.message}</h3>
                {activeCallAlert.timestamp && (
                  <p className="mt-1 text-xs text-slate-300">
                    {new Date(activeCallAlert.timestamp).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => void handleHelped()}
                className="rounded-full bg-emerald-500 px-6 py-3 font-bold text-slate-950 shadow-lg shadow-emerald-500/40 transition hover:scale-105 hover:bg-emerald-400"
              >
                ✓ تم الانتهاء
              </button>
            </div>
          </div>
        ) : null}

        <section className="grid gap-4 xl:grid-cols-3">
          {STATUS_COLUMNS.map((status) => (
            <div key={status} className="flex min-h-[320px] flex-col rounded-[24px] border border-white/10 bg-slate-950/70 p-3 shadow-[0_12px_40px_rgba(0,0,0,0.2)]">
              <div className="mb-3 flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                <div className="flex items-center gap-2">
                  {status === 'Pending' ? <Clock3 size={16} className="text-amber-300" /> : status === 'In Progress' ? <UtensilsCrossed size={16} className="text-sky-300" /> : <CheckCircle2 size={16} className="text-emerald-300" />}
                  <h2 className="text-base font-semibold text-white">{STATUS_LABELS[status]}</h2>
                </div>
                <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-slate-300">{filteredOrdersByStatus[status].length}</span>
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
    </main>
  );
}
