'use client';

import { Clock3, Sofa } from 'lucide-react';
import { statusLabels, statusStyles, type Order, type OrderStatus } from '@/lib/types';

type Props = { order: Order; updating: boolean; highlighted?: boolean; onStatusChange: (id: string, status: OrderStatus) => void };
const nextStatus: Partial<Record<OrderStatus, { status: OrderStatus; label: string }>> = { new: { status: 'preparing', label: 'بدء التحضير' }, preparing: { status: 'ready', label: 'جاهز للتقديم' }, ready: { status: 'served', label: 'تم التقديم' } };
function time(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? 'الآن' : date.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }); }

export function OrderCard({ order, updating, highlighted, onStatusChange }: Props) {
  const action = nextStatus[order.status];
  return <article className={`rounded-2xl border bg-white p-4 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover ${highlighted ? 'border-gold-300 animate-glow-soft' : 'border-stone-200/80'}`}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-ivory-200/80 px-2.5 py-1 text-xs font-medium text-stone-600">
          <Sofa size={13} className="text-gold-600" /> طاولة {order.table_number}
        </span>
        <h3 className="mt-2 text-xl font-bold text-stone-900">الطلب <span className="tabular-nums">#{order.id.slice(0, 5)}</span></h3>
      </div>
      <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyles[order.status]}`}>{statusLabels[order.status]}</span>
    </div>
    <div className="mt-3 flex items-center gap-1.5 text-xs text-stone-400">
      <Clock3 size={13} /> {time(order.created_at)}
    </div>
    <div className="mt-3 border-t border-stone-100 pt-3">
      {order.items.length ? <ul className="space-y-1.5">{order.items.map((item, index) => <li key={`${item.name}-${index}`} className="flex items-center justify-between gap-3 rounded-xl bg-ivory-100/80 px-3 py-2 text-sm">
        <span className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 rounded-md bg-gold-100 px-1.5 py-0.5 text-xs font-bold tabular-nums text-gold-700">{item.quantity}×</span>
          <span className="truncate text-stone-800">{item.name}</span>
        </span>
        {item.price !== undefined && <span className="shrink-0 text-xs tabular-nums text-stone-400">{(item.price * item.quantity).toFixed(2)}</span>}
      </li>)}</ul> : <p className="text-sm text-stone-400">لا توجد عناصر مسجلة</p>}
      {order.notes && <p className="mt-3 rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-2 text-sm text-amber-900"><span className="font-semibold">ملاحظات: </span>{order.notes}</p>}
    </div>
    <div className="mt-4 flex items-center justify-between border-t border-stone-100 pt-3">
      <div>
        <p className="text-xs text-stone-400">الإجمالي</p>
        <p className="text-lg font-bold tabular-nums text-stone-900">{order.total_amount.toFixed(2)}</p>
      </div>
      {action && <button type="button" disabled={updating} onClick={() => onStatusChange(order.id, action.status)} className="rounded-xl bg-gold-500 px-4 py-2.5 text-sm font-semibold text-stone-950 shadow-soft transition hover:bg-gold-600 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50">{updating ? 'جارٍ التحديث...' : action.label}</button>}
    </div>
  </article>;
}
