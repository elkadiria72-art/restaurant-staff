'use client';

import { Clock3, Sofa } from 'lucide-react';
import { statusLabels, statusStyles, type Order, type OrderStatus } from '@/lib/types';

type Props = { order: Order; updating: boolean; highlighted?: boolean; onStatusChange: (id: string, status: OrderStatus) => void };
const nextStatus: Partial<Record<OrderStatus, { status: OrderStatus; label: string }>> = { new: { status: 'preparing', label: 'بدء التحضير' }, preparing: { status: 'ready', label: 'جاهز للتقديم' }, ready: { status: 'served', label: 'تم التقديم' } };
function time(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? 'الآن' : date.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }); }

export function OrderCard({ order, updating, highlighted, onStatusChange }: Props) {
  const action = nextStatus[order.status];
  return <article className={`rounded-[22px] border p-3 shadow-lg shadow-black/20 ${highlighted ? 'border-amber-300 bg-amber-500/10 ring-2 ring-amber-400/40' : 'border-white/10 bg-slate-900/85'}`}>
    <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-sm text-slate-400"><Sofa size={14} /> طاولة {order.table_number}</div><h3 className="mt-1 text-lg font-semibold text-white">الطلب #{order.id.slice(0, 5)}</h3></div><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyles[order.status]}`}>{statusLabels[order.status]}</span></div>
    <div className="mt-3 rounded-2xl border border-white/10 bg-slate-800/70 p-3"><div className="mb-2 flex items-center gap-2 text-xs text-slate-400"><Clock3 size={14} /> الوقت: {time(order.created_at)}</div>{order.items.length ? <div className="space-y-2">{order.items.map((item, index) => <div key={`${item.name}-${index}`} className="flex justify-between rounded-xl bg-slate-700/70 px-2.5 py-2 text-sm text-slate-100"><span>{item.quantity}× {item.name}</span>{item.price !== undefined && <span className="text-slate-400">{(item.price * item.quantity).toFixed(2)}</span>}</div>)}</div> : <p className="text-sm text-slate-400">لا توجد عناصر مسجلة</p>}{order.notes && <p className="mt-3 border-t border-white/10 pt-3 text-sm text-amber-100">ملاحظات: {order.notes}</p>}</div>
    <div className="mt-3 flex items-center justify-between rounded-2xl border border-white/10 bg-slate-800/60 px-3 py-3"><div><p className="text-[11px] tracking-[0.2em] text-slate-500">الإجمالي</p><p className="text-lg font-semibold text-white">{order.total_amount.toFixed(2)}</p></div>{action && <button type="button" disabled={updating} onClick={() => onStatusChange(order.id, action.status)} className="rounded-full bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">{updating ? 'جارٍ التحديث...' : action.label}</button>}</div>
  </article>;
}
