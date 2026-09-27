'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// The dashboard lives at /staff (and /staff/orders) where the global
// alerts/audio provider is mounted; this root entry simply forwards to it.
export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/staff/orders');
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-stone-400">جاري التحويل...</p>
    </div>
  );
}
