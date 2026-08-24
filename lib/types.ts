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
  new: 'bg-amber-50 text-amber-800 border-amber-200',
  preparing: 'bg-orange-50 text-orange-800 border-orange-200',
  ready: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  served: 'bg-stone-100 text-stone-600 border-stone-200',
  cancelled: 'bg-rose-50 text-rose-800 border-rose-200',
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
