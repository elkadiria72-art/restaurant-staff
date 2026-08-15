export type OrderStatus = 'new' | 'preparing' | 'ready' | 'served' | 'cancelled';

export type OrderItem = { name: string; quantity: number; price?: number };

export type Order = {
  id: string;
  table_id?: string;
  table_number: number | string;
  items: OrderItem[];
  total_amount: number;
  status: OrderStatus;
  created_at: string;
  notes?: string;
};

export const statusOrder: OrderStatus[] = ['new', 'preparing', 'ready', 'served'];
export const statusLabels: Record<OrderStatus, string> = { new: 'طلبات جديدة', preparing: 'قيد التحضير', ready: 'جاهز للتقديم', served: 'تم التقديم', cancelled: 'ملغي' };
export const statusStyles: Record<OrderStatus, string> = {
  new: 'bg-rose-500/15 text-rose-300 border-rose-500/40', preparing: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  ready: 'bg-sky-500/15 text-sky-300 border-sky-500/40', served: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40', cancelled: 'bg-slate-500/15 text-slate-300 border-slate-500/40',
};

export function normalizeOrderStatus(value: unknown): OrderStatus {
  const status = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return status === 'new' || status === 'preparing' || status === 'ready' || status === 'served' || status === 'cancelled' ? status : 'new';
}

export function normalizeOrder(value: unknown): Order | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const id = typeof row.id === 'string' || typeof row.id === 'number' ? String(row.id) : '';
  if (!id) return null;
  const rawItems = typeof row.items === 'string' ? safelyParseJson(row.items) : row.items;
  const items = Array.isArray(rawItems) ? rawItems.filter(isRecord).map((item) => ({ name: typeof item.name === 'string' && item.name.trim() ? item.name : 'عنصر غير مسمى', quantity: toNumber(item.quantity, 1), ...(Number.isFinite(Number(item.price)) ? { price: Number(item.price) } : {}) })) : [];
  const notes = typeof row.notes === 'string' && row.notes.trim() ? row.notes.trim() : undefined;
  return { id, ...(typeof row.table_id === 'string' ? { table_id: row.table_id } : {}), table_number: typeof row.table_number === 'number' || typeof row.table_number === 'string' ? row.table_number : '—', items, total_amount: toNumber(row.total_amount), status: normalizeOrderStatus(row.status), created_at: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(), ...(notes ? { notes } : {}) };
}

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object'; }
function safelyParseJson(value: string): unknown { try { return JSON.parse(value); } catch { return []; } }
function toNumber(value: unknown, fallback = 0): number { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
