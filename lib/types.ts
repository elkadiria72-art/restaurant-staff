export type OrderStatus = 'Pending' | 'In Progress' | 'Served';
export type OrderActionStatus = OrderStatus | 'preparing' | 'served';

export type Order = {
  id: string;
  table_number: number;
  items: Array<{ name: string; quantity: number }>;
  total_price: number;
  status: OrderStatus;
  created_at: string;
};

export const statusStyles: Record<OrderStatus, string> = {
  Pending: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
  'In Progress': 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  Served: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
};

export const statusOrder: OrderStatus[] = ['Pending', 'In Progress', 'Served'];

export function normalizeOrderStatus(value: unknown): OrderStatus {
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
