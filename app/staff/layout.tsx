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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950">
      {/* Header with Logo */}
      <header className="border-b border-white/10 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-amber-500/20 p-2 ring-2 ring-amber-400/40">
              <Bell size={24} className="text-amber-300" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Elkahmed</h1>
              <p className="text-xs text-slate-400">قـا أحمد - لوحة الخدمة</p>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="border-t border-white/10 bg-slate-950/50">
          <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 sm:px-6 lg:px-8">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => router.push(tab.href)}
                  className={`flex items-center gap-2 border-b-2 px-4 py-4 font-semibold transition-colors ${
                    tab.active
                      ? 'border-amber-400 text-amber-300'
                      : 'border-transparent text-slate-400 hover:text-white'
                  }`}
                >
                  <Icon size={18} />
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.label_en}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
