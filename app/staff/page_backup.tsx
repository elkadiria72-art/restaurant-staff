'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function StaffPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/staff/orders');
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <p className="text-slate-400">جاري تحويل الصفحة...</p>
      </div>
    </div>
  );
}
