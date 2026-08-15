'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Bell, Clock, DollarSign, Home, LogOut, Menu, Phone, ReceiptText, Search, ShoppingCart, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type MenuItem = {
  id: string;
  name: string;
  description?: string;
  price: number;
  category?: string;
  image?: string;
};

type CartItem = MenuItem & { quantity: number };

const SAMPLE_MENU: MenuItem[] = [
  { id: '1', name: 'برجر الجبن', description: 'برجر لذيذ مع الجبن الطازج', price: 8.99, category: 'Burgers' },
  { id: '2', name: 'البيتزا الهواية', description: 'بيتزا محلية الصنع', price: 12.99, category: 'Pizzas' },
  { id: '3', name: 'سلطة القيصر', description: 'سلطة صحية مع الدجاج', price: 9.99, category: 'Salads' },
  { id: '4', name: 'المعكرونة الإيطالية', description: 'معكرونة شهية', price: 11.99, category: 'Pasta' },
  { id: '5', name: 'الكبسة', description: 'أرز مع الدجاج اللذيذ', price: 13.99, category: 'Main Dishes' },
  { id: '6', name: 'فلافل', description: 'فلافل مقلية طازة', price: 5.99, category: 'Appetizers' },
];

export default function MenuPage() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [tableNumber, setTableNumber] = useState<number | string>('');
  const [tableId, setTableId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submittingCall, setSubmittingCall] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showTableInput, setShowTableInput] = useState(!tableNumber);

  // Extract table info from URL query parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const table = params.get('table') || params.get('table_number') || localStorage.getItem('table_number');
    const tblId = params.get('table_id') || localStorage.getItem('table_id');

    if (table) {
      setTableNumber(table);
      localStorage.setItem('table_number', String(table));
    }

    if (tblId) {
      setTableId(tblId);
      localStorage.setItem('table_id', tblId);
    }
  }, []);

  const handleSetTable = useCallback(() => {
    if (!tableNumber) {
      setError('يرجى إدخال رقم الطاولة');
      return;
    }

    const genId = `table-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setTableId(genId);
    localStorage.setItem('table_number', String(tableNumber));
    localStorage.setItem('table_id', genId);
    setShowTableInput(false);
    setError(null);
  }, [tableNumber]);

  const categories = Array.from(new Set(SAMPLE_MENU.map(item => item.category || 'Other')));

  const filteredMenu = SAMPLE_MENU.filter(item => {
    const matchesCategory = !selectedCategory || item.category === selectedCategory;
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         (item.description?.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const addToCart = useCallback((item: MenuItem) => {
    setCart(current => {
      const existing = current.find(i => i.id === item.id);
      if (existing) {
        return current.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...current, { ...item, quantity: 1 }];
    });
  }, []);

  const removeFromCart = useCallback((itemId: string) => {
    setCart(current => current.filter(i => i.id !== itemId));
  }, []);

  const updateQuantity = useCallback((itemId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(itemId);
    } else {
      setCart(current => current.map(i => i.id === itemId ? { ...i, quantity } : i));
    }
  }, [removeFromCart]);

  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const handleSubmitOrder = async () => {
    if (!tableNumber || !tableId) {
      setError('يرجى تحديد الطاولة أولاً');
      return;
    }

    if (cart.length === 0) {
      setError('السلة فارغة. يرجى إضافة عناصر أولاً');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: insertError } = await supabase
        .from('orders')
        .insert([
          {
            table_number: Number(tableNumber),
            table_id: tableId,
            items: cart.map(item => ({ name: item.name, quantity: item.quantity })),
            total_amount: cartTotal,
            status: 'new',
            created_at: new Date().toISOString(),
          },
        ])
        .select();

      if (insertError) throw insertError;

      setSuccessMessage('تم إرسال الطلب بنجاح! سيتم تحضيره قريباً.');
      setCart([]);
      setShowCart(false);

      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل إرسال الطلب');
    } finally {
      setLoading(false);
    }
  };

  const handleCallWaiter = async () => {
    if (!tableNumber || !tableId) {
      setError('يرجى تحديد الطاولة أولاً');
      return;
    }

    setSubmittingCall(true);
    setError(null);

    try {
      const { data, error: insertError } = await supabase
        .from('waiter_calls')
        .insert([
          {
            table_number: Number(tableNumber),
            table_id: tableId,
            message: 'استدعاء النادل',
            request_type: 'call_waiter',
            status: 'pending',
            created_at: new Date().toISOString(),
          },
        ])
        .select();

      if (insertError) throw insertError;

      setSuccessMessage('تم استدعاء النادل! سيصل إليك قريباً.');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل استدعاء النادل');
    } finally {
      setSubmittingCall(false);
    }
  };

  const handleRequestBill = async () => {
    if (!tableNumber || !tableId) {
      setError('يرجى تحديد الطاولة أولاً');
      return;
    }

    setSubmittingCall(true);
    setError(null);

    try {
      const { data, error: insertError } = await supabase
        .from('waiter_calls')
        .insert([
          {
            table_number: Number(tableNumber),
            table_id: tableId,
            message: 'طلب الحساب',
            request_type: 'request_bill',
            status: 'pending',
            created_at: new Date().toISOString(),
          },
        ])
        .select();

      if (insertError) throw insertError;

      setSuccessMessage('تم طلب الحساب! سيأتيك قريباً.');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل طلب الحساب');
    } finally {
      setSubmittingCall(false);
    }
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(176,95,44,0.18),_rgba(10,10,12,1)_60%)] text-slate-100" dir="rtl">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-orange-500/20 p-2 ring-2 ring-orange-400/40">
              <Menu size={20} className="text-orange-300" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-white">Elkahmed</h1>
              <p className="text-xs text-slate-400">قـا أحمد - نظام الطلب</p>
            </div>
          </div>

          {!showTableInput && tableNumber && (
            <div className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm">
              <Home size={14} className="text-amber-300" />
              <span>الطاولة {tableNumber}</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowCart(!showCart)}
            className="relative rounded-full bg-white/10 p-3 transition hover:bg-white/20"
          >
            <ShoppingCart size={20} />
            {cartCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-xs font-semibold">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Table Selection Modal */}
      {showTableInput && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-[24px] border border-amber-400/40 bg-slate-950 p-8">
            <h2 className="text-2xl font-semibold text-white">تحديد الطاولة</h2>
            <p className="mt-2 text-sm text-slate-300">يرجى إدخال رقم طاولتك لمتابعة الطلب</p>

            <div className="mt-6">
              <input
                type="number"
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value)}
                placeholder="رقم الطاولة"
                className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-white placeholder-slate-400 transition focus:border-amber-400/60 focus:outline-none"
                onKeyDown={(e) => e.key === 'Enter' && handleSetTable()}
              />
            </div>

            <button
              type="button"
              onClick={handleSetTable}
              className="mt-6 w-full rounded-full bg-amber-500 py-3 font-semibold text-slate-950 transition hover:bg-amber-400"
            >
              تأكيد
            </button>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Success Message */}
        {successMessage && (
          <div className="mb-6 rounded-[16px] border border-emerald-400/40 bg-emerald-500/20 p-4 text-emerald-200">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-emerald-500/30 p-2">
                <AlertCircle size={18} />
              </div>
              <span className="font-medium">{successMessage}</span>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-6 rounded-[16px] border border-rose-400/40 bg-rose-500/20 p-4 text-rose-200">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-rose-500/30 p-2">
                <AlertCircle size={18} />
              </div>
              <span className="font-medium">{error}</span>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        {!showCart && (
          <div className="mb-6 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={handleCallWaiter}
              disabled={submittingCall}
              className="flex items-center justify-center gap-2 rounded-[16px] border border-blue-400/40 bg-blue-500/20 py-4 font-semibold text-blue-200 transition hover:bg-blue-500/30 disabled:opacity-50"
            >
              <Phone size={20} />
              {submittingCall ? 'جاري الاستدعاء...' : 'استدعاء النادل'}
            </button>

            <button
              type="button"
              onClick={handleRequestBill}
              disabled={submittingCall}
              className="flex items-center justify-center gap-2 rounded-[16px] border border-purple-400/40 bg-purple-500/20 py-4 font-semibold text-purple-200 transition hover:bg-purple-500/30 disabled:opacity-50"
            >
              <ReceiptText size={20} />
              {submittingCall ? 'جاري الطلب...' : 'طلب الحساب'}
            </button>
          </div>
        )}

        {/* Cart View */}
        {showCart ? (
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-white">السلة</h2>

            {cart.length === 0 ? (
              <div className="rounded-[16px] border border-dashed border-white/20 bg-slate-900/50 py-12 text-center text-slate-400">
                السلة فارغة
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {cart.map(item => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-3 rounded-[16px] border border-white/10 bg-slate-900/70 p-4"
                    >
                      <div>
                        <h3 className="font-semibold text-white">{item.name}</h3>
                        <p className="text-sm text-slate-400">${item.price.toFixed(2)} للوحدة</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          className="rounded-lg bg-slate-800 px-2 py-1 text-sm text-white transition hover:bg-slate-700"
                        >
                          −
                        </button>
                        <span className="w-8 text-center font-semibold text-white">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          className="rounded-lg bg-slate-800 px-2 py-1 text-sm text-white transition hover:bg-slate-700"
                        >
                          +
                        </button>
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.id)}
                          className="ml-2 rounded-lg bg-rose-500/20 px-3 py-1 text-sm text-rose-200 transition hover:bg-rose-500/30"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 space-y-3 rounded-[16px] border border-white/10 bg-slate-900/70 p-4">
                  <div className="flex items-center justify-between text-lg font-semibold text-white">
                    <span>الإجمالي:</span>
                    <span className="flex items-center gap-1">
                      <span>${cartTotal.toFixed(2)}</span>
                      <DollarSign size={18} />
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleSubmitOrder}
                    disabled={loading || cart.length === 0}
                    className="w-full rounded-full bg-emerald-500 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
                  >
                    {loading ? 'جاري الإرسال...' : 'إرسال الطلب'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowCart(false)}
                    className="w-full rounded-full border border-white/20 bg-white/10 py-3 font-semibold text-white transition hover:bg-white/20"
                  >
                    متابعة التصفح
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Search Bar */}
            <div className="mb-6">
              <div className="relative">
                <Search size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="البحث عن الأطباق..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-[12px] border border-white/20 bg-white/10 py-3 pr-12 pl-4 text-white placeholder-slate-400 transition focus:border-amber-400/60 focus:outline-none"
                />
              </div>
            </div>

            {/* Category Filter */}
            <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
              <button
                type="button"
                onClick={() => setSelectedCategory(null)}
                className={`rounded-full px-4 py-2 font-medium transition ${
                  selectedCategory === null
                    ? 'border border-amber-400/60 bg-amber-500/20 text-amber-200'
                    : 'border border-white/20 bg-white/10 text-slate-300 hover:bg-white/20'
                }`}
              >
                الكل
              </button>
              {categories.map(category => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setSelectedCategory(category)}
                  className={`whitespace-nowrap rounded-full px-4 py-2 font-medium transition ${
                    selectedCategory === category
                      ? 'border border-amber-400/60 bg-amber-500/20 text-amber-200'
                      : 'border border-white/20 bg-white/10 text-slate-300 hover:bg-white/20'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>

            {/* Menu Grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredMenu.length === 0 ? (
                <div className="col-span-full rounded-[16px] border border-dashed border-white/20 bg-slate-900/50 py-12 text-center text-slate-400">
                  لا توجد أطباق تطابق البحث
                </div>
              ) : (
                filteredMenu.map(item => (
                  <div
                    key={item.id}
                    className="group rounded-[16px] border border-white/10 bg-slate-900/70 p-4 transition hover:border-white/20 hover:bg-slate-900/90"
                  >
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-semibold text-white">{item.name}</h3>
                        {item.category && <p className="text-xs text-slate-400">{item.category}</p>}
                      </div>
                      <span className="flex items-center gap-1 whitespace-nowrap rounded-lg bg-white/10 px-3 py-1 font-semibold text-amber-300">
                        <DollarSign size={14} />
                        {item.price.toFixed(2)}
                      </span>
                    </div>

                    {item.description && (
                      <p className="mb-4 text-sm text-slate-300">{item.description}</p>
                    )}

                    <button
                      type="button"
                      onClick={() => addToCart(item)}
                      className="w-full rounded-full border border-amber-400/40 bg-amber-500/15 py-2 font-semibold text-amber-200 transition hover:bg-amber-500/25"
                    >
                      إضافة إلى السلة
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
