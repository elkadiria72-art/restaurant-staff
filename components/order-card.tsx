'use client';

import { Clock3, Sofa } from 'lucide-react';
import { statusStyles, type Order, type OrderStatus } from '@/lib/types';

type OrderCardStatus = OrderStatus | 'preparing' | 'served';

type OrderCardProps = {
  order: Order;
  updating: boolean;
  highlighted?: boolean;
  onStatusChange: (id: string, nextStatus: OrderCardStatus) => void;
  onDelete?: (id: string) => void;
};

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

  return parsed.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
}

function parseItems(value: unknown): Array<{ name: string; quantity: number }> {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => ({
        name: typeof item.name === 'string' && item.name.trim() ? item.name : 'عنصر غير مسمى',
        quantity: typeof item.quantity === 'number' && Number.isFinite(item.quantity) ? item.quantity : Number(item.quantity) || 0,
      }));
  }

  if (typeof value === 'string' && value.trim()) {
    try {
      return parseItems(JSON.parse(value));
    } catch {
      return [];
    }
  }

  return [];
}

export function OrderCard({ order, updating, highlighted = false, onStatusChange, onDelete }: OrderCardProps) {
  const safeOrderId = getOrderId(order?.id);
  const shortOrderId = String(order?.id ?? '').slice(0, 5);
  const safeStatus = (typeof order?.status === 'string' ? order.status : 'Pending') as OrderStatus;
  const statusClass = statusStyles[safeStatus] ?? statusStyles.Pending;

  const tableNumber = typeof order?.table_number === 'number' && Number.isFinite(order.table_number)
    ? order.table_number
    : Number(order?.table_number) || '—';
  const displayItems = parseItems(order?.items);
  const totalPrice = Number.isFinite(Number(order?.total_price)) ? Number(order.total_price) : 0;
  const orderTime = formatOrderTime(order?.created_at);

  const handleStatusChange = (nextStatus: OrderCardStatus) => {
    if (!safeOrderId) {
      return;
    }

    onStatusChange(safeOrderId, nextStatus);
  };

  return (
    <article className={`rounded-[22px] border p-3 shadow-lg shadow-black/20 transition-all duration-300 ${highlighted ? 'border-amber-300/70 bg-amber-500/10 ring-2 ring-amber-400/40' : 'border-white/10 bg-slate-900/85'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Sofa size={14} />
            <span>طاولة {tableNumber}</span>
          </div>
          <h3 className="mt-1 text-lg font-semibold text-white">
            الطلب #{shortOrderId || 'غير متاح'}
          </h3>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass}`}>
          {safeStatus}
        </span>
      </div>

      <div className="mt-3 rounded-2xl border border-white/10 bg-slate-800/70 p-3">
        <div className="mb-2 flex items-center gap-2 text-xs text-slate-400">
          <Clock3 size={14} />
          <span>الوقت: {orderTime}</span>
        </div>

        {displayItems.length > 0 ? (
          <div className="space-y-2">
            {displayItems.map((item, index) => {
              const quantity = Number.isFinite(Number(item?.quantity)) ? Number(item.quantity) : 0;
              const name = typeof item?.name === 'string' && item.name.trim() ? item.name : 'عنصر غير مسمى';
              return (
                <div key={`${name}-${index}`} className="flex items-center justify-between rounded-xl bg-slate-700/70 px-2.5 py-2 text-sm text-slate-100">
                  <span>{quantity}× {name}</span>
                  <span className="text-slate-400">${(quantity * 10).toFixed(2)}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl bg-slate-700/70 px-2.5 py-2 text-sm text-slate-400">لا توجد عناصر مسجلة</div>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between rounded-2xl border border-white/10 bg-slate-800/60 px-3 py-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">الإجمالي</p>
          <p className="text-lg font-semibold text-white">${totalPrice.toFixed(2)}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {safeStatus !== 'In Progress' ? (
            <button
              type="button"
              onClick={() => handleStatusChange('preparing')}
              disabled={updating || !safeOrderId}
              className="rounded-full bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {updating ? 'جارٍ...' : 'قبول'}
            </button>
          ) : null}
          {safeStatus !== 'Served' ? (
            <button
              type="button"
              onClick={() => handleStatusChange('served')}
              disabled={updating || !safeOrderId}
              className="rounded-full bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {updating ? 'جارٍ...' : 'تم التقديم'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onDelete?.(safeOrderId)}
            disabled={updating || !safeOrderId}
            className="rounded-full bg-rose-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            إنهاء
          </button>
        </div>
      </div>
    </article>
  );
}
