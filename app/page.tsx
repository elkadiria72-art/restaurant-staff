'use client';

import { useEffect, useMemo, useState } from 'react';
import { OrderCard } from '@/components/order-card';
import { supabase } from '@/lib/supabase';
import { normalizeOrderStatus, statusOrder, type Order, type OrderActionStatus, type OrderStatus } from '@/lib/types';

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

export default function HomePage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const { data, error } = await supabase
          .from('orders')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) {
          throw error;
        }

        const parsedOrders = (data ?? [])
          .map((item) => normalizeOrder(item))
          .filter((item): item is Order => item !== null);

        setOrders(parsedOrders);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load orders.');
      } finally {
        setLoading(false);
      }
    };

    void fetchOrders();

    const channel = supabase
      .channel('staff-dashboard-orders', {
        config: {
          presence: { key: 'staff-dashboard' },
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

        setOrders((current) => [nextOrder, ...current.filter((order) => order.id !== nextOrder.id)]);
        setError(null);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
        if (!payload.new) {
          return;
        }

        const updatedOrder = normalizeOrder(payload.new);

        if (!updatedOrder) {
          return;
        }

        setOrders((current) => current.map((order) => (order.id === updatedOrder.id ? updatedOrder : order)));
        setError(null);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'orders' }, (payload) => {
        const deletedId = typeof payload.old === 'object' && payload.old && 'id' in payload.old
          ? String((payload.old as Record<string, unknown>).id ?? '')
          : '';

        if (!deletedId) {
          return;
        }

        setOrders((current) => current.filter((order) => order.id !== deletedId));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleStatusChange = async (id: string, nextStatus: OrderActionStatus) => {
    if (!id.trim()) {
      return;
    }

    const normalizedStatus = normalizeOrderStatus(nextStatus);

    setUpdatingId(id);

    try {
      const { error } = await supabase.from('orders').update({ status: normalizedStatus }).eq('id', id);

      if (error) {
        throw error;
      }

      setOrders((current) => current.map((order) => (order.id === id ? { ...order, status: normalizedStatus } : order)));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update order status.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDeleteOrder = async (id: string) => {
    if (!id.trim()) {
      return;
    }

    try {
      const { error } = await supabase.from('orders').delete().eq('id', id);

      if (error) {
        throw error;
      }

      setOrders((current) => current.filter((order) => order.id !== id));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete order.');
    }
  };

  const sortedOrders = useMemo(() => {
    return [...orders].sort((a, b) => {
      const statusRank = (status: OrderStatus) => statusOrder.indexOf(status);
      return statusRank(a.status) - statusRank(b.status);
    });
  }, [orders]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(30,41,59,0.95),_rgba(2,6,23,1))] px-3 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <header className="rounded-3xl border border-white/10 bg-slate-900/80 p-4 shadow-2xl shadow-black/20 backdrop-blur">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-sky-300">Kitchen operations</p>
              <h1 className="text-2xl font-semibold text-white sm:text-3xl">Staff Dashboard</h1>
            </div>
            <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-sm text-emerald-300">
              Live updates enabled
            </div>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-3">
          {(['Pending', 'In Progress', 'Served'] as OrderStatus[]).map((status) => {
            const count = sortedOrders.filter((order) => order.status === status).length;
            return (
              <div key={status} className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 shadow-lg shadow-black/10">
                <p className="text-sm text-slate-400">{status}</p>
                <p className="mt-2 text-3xl font-semibold text-white">{count}</p>
              </div>
            );
          })}
        </section>

        {error ? (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
            {error}
          </div>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-2">
          {loading ? (
            <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-8 text-center text-slate-300 lg:col-span-2">
              Loading orders...
            </div>
          ) : sortedOrders.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/15 bg-slate-900/60 p-8 text-center text-slate-400 lg:col-span-2">
              No orders yet. New incoming orders will appear here instantly.
            </div>
          ) : (
            sortedOrders.map((order) => {
              console.log('Rendering order in map:', order);
              return (
                <OrderCard
                  key={order.id}
                  order={order}
                  updating={updatingId === order.id}
                  onStatusChange={(id, nextStatus) => {
                    if (id) {
                      void handleStatusChange(id, nextStatus);
                    }
                  }}
                  onDelete={(id) => {
                    if (id) {
                      void handleDeleteOrder(id);
                    }
                  }}
                />
              );
            })
          )}
        </section>
      </div>
    </main>
  );
}
