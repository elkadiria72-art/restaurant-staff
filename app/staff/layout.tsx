'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Bell, ClipboardList, Phone } from 'lucide-react';

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const isOrdersTab = pathname === '/staff/orders' || pathname === '/staff';
  const isCallsTab = pathname === '/staff/calls';

  const tabs = [
    {
      id: 'orders',
      label: 'الطلبات',
      label_en: 'Orders',
      href: '/staff/orders',
      icon: ClipboardList,
      active: isOrdersTab,
    },
    {
      id: 'calls',
      label: 'النداءات والمساعدة',
      label_en: 'Waiter Calls',
      href: '/staff/calls',
      icon: Phone,
      active: isCallsTab,
    },
  ];

  return (
    <div dir="rtl" className="min-h-screen bg-ivory-100">
      <header className="sticky top-0 z-40 border-b border-stone-200/80 bg-white/90 shadow-soft backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gold-100 text-gold-700 ring-1 ring-gold-200">
                <Bell size={22} />
              </div>
              <div>
                <h1 className="text-xl font-bold leading-tight text-stone-900">Elkahmed</h1>
                <p className="text-xs text-stone-500">قـا أحمد - لوحة الخدمة</p>
              </div>
            </div>
          </div>

          {/* Tab Navigation */}
          <nav className="flex items-center gap-1.5 pb-3">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => router.push(tab.href)}
                  className={`flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition-all active:scale-[0.98] ${
                    tab.active
                      ? 'bg-stone-900 text-white shadow-soft'
                      : 'text-stone-500 hover:bg-ivory-200/70 hover:text-stone-800'
                  }`}
                >
                  <Icon size={17} />
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.label_en}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
