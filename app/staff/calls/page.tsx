'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, BellRing, Check, CheckCircle2, Clock, Phone, ReceiptText, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type WaiterCall = {
  id: string;
  table_number: number | string;
  table_id?: string;
  message: string;
  request_type: string;
  status: string;
  created_at: string;
};

// Distinct audio for waiter calls
const CALL_SOUND = typeof window === 'undefined' ? null : (() => {
  try {
    const audio = new Audio('/sound-ousis/Sonner2.mp3');
    audio.preload = 'auto';
    audio.volume = 0.8;
    return audio;
  } catch {
    return null;
  }
})();

function getRecordString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    if (typeof value === 'number' || typeof value === 'bigint') {
      return String(value);
    }
  }

  return '';
}

function formatCallTime(value: string | undefined): string {
  if (!value) {
    return 'الآن';
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return 'الآن';
  }

  return parsed.toLocaleTimeString('ar-SA', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function WaiterCallsPage() {
  const [calls, setCalls] = useState<WaiterCall[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [activeCall, setActiveCall] = useState<WaiterCall | null>(null);
  const [liveNotice, setLiveNotice] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const userInteractedRef = useRef(false);

  const unlockAudio = useCallback(async () => {
    if (typeof window === 'undefined') {
      return;
    }

    userInteractedRef.current = true;

    if (!audioContextRef.current) {
      const AudioCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) {
        return;
      }
      audioContextRef.current = new AudioCtor();
    }

    if (audioContextRef.current.state === 'suspended') {
      try {
        await audioContextRef.current.resume();
      } catch {
        // Ignore
      }
    }

    setAudioEnabled(true);
  }, []);

  const playCallSound = useCallback(async () => {
    if (!userInteractedRef.current || !audioEnabled) {
      return;
    }

    try {
      if (CALL_SOUND) {
        CALL_SOUND.currentTime = 0;
        await CALL_SOUND.play();
        return;
      }
    } catch {
      // Ignore
    }

    try {
      const context = audioContextRef.current;
      if (!context) {
        return;
      }

      // Double beep for urgent waiter call
      const playBeep = (startTime: number, freq: number, duration: number) => {
        const osc = context.createOscillator();
        const gain = context.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, context.currentTime + startTime);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.2, context.currentTime + startTime + duration * 0.5);

        gain.gain.setValueAtTime(0, context.currentTime + startTime);
        gain.gain.exponentialRampToValueAtTime(0.25, context.currentTime + startTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.1, context.currentTime + startTime + duration * 0.8);
        gain.gain.exponentialRampToValueAtTime(0, context.currentTime + startTime + duration);

        osc.connect(gain);
        gain.connect(context.destination);

        osc.start(context.currentTime + startTime);
        osc.stop(context.currentTime + startTime + duration);
      };

      playBeep(0, 1000, 0.2);
      playBeep(0.25, 700, 0.2);
    } catch {
      // Ignore
    }
  }, [audioEnabled]);

  useEffect(() => {
    const fetchCalls = async () => {
      try {
        const { data, error } = await supabase
          .from('waiter_calls')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) {
          throw error;
        }

        const callsList = (data ?? []).map((item) => ({
          id: String(item.id),
          table_number: item.table_number,
          table_id: item.table_id,
          message: item.message || 'طلب مساعدة',
          request_type: item.request_type || 'call',
          status: item.status || 'pending',
          created_at: item.created_at,
        }));

        setCalls(callsList);
        setPendingCount(callsList.filter((c) => c.status === 'pending').length);
        setCompletedCount(callsList.filter((c) => c.status === 'completed').length);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'تعذر تحميل النداءات.');
      } finally {
        setLoading(false);
      }
    };

    fetchCalls();

    const channel = supabase
      .channel('staff-calls', {
        config: {
          presence: { key: 'staff-calls' },
        },
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'waiter_calls' }, (payload) => {
        if (!payload.new) {
          return;
        }

        const record = payload.new as Record<string, unknown>;
        const callId = getRecordString(record, ['id']);
        const tableNumber = getRecordString(record, ['table_number', 'table']);
        const message = getRecordString(record, ['message']);
        const requestType = getRecordString(record, ['request_type']);
        const status = getRecordString(record, ['status']) || 'pending';
        const createdAt = typeof record.created_at === 'string' ? record.created_at : new Date().toISOString();

        if (!callId) {
          return;
        }

        const newCall: WaiterCall = {
          id: callId,
          table_number: tableNumber || '—',
          message: message || 'طلب مساعدة',
          request_type: requestType,
          status: status,
          created_at: createdAt,
        };

        setCalls((current) => [newCall, ...current]);
        setPendingCount((c) => c + 1);
        setActiveCall(newCall);
        setLiveNotice('نداء جديد');

        window.setTimeout(() => {
          setLiveNotice((current) => (current === 'نداء جديد' ? null : current));
        }, 3200);

        void playCallSound();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'waiter_calls' }, (payload) => {
        if (!payload.new) {
          return;
        }

        const record = payload.new as Record<string, unknown>;
        const callId = String(record.id);
        const status = getRecordString(record, ['status']) || 'pending';

        setCalls((current) =>
          current.map((call) => (call.id === callId ? { ...call, status } : call))
        );

        if (status === 'completed') {
          setPendingCount((c) => Math.max(0, c - 1));
          setCompletedCount((c) => c + 1);
          setActiveCall((current) => (current?.id === callId ? null : current));
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnected(true);
          setError(null);
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setConnected(false);
          setError('فشل الاتصال مع Supabase.');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [playCallSound]);

  const handleMarkCompleted = async (callId: string) => {
    try {
      const { data, error } = await supabase
        .from('waiter_calls')
        .update({ status: 'completed' })
        .eq('id', callId)
        .select('id');

      if (error) {
        throw error;
      }

      // RLS can filter an UPDATE down to zero rows while still reporting
      // success (no error). An empty result means nothing was persisted in
      // Supabase, so the call must keep its current state instead of
      // "resurrecting" as pending after the next page refresh.
      if (!data || data.length === 0) {
        throw new Error('لم يتم تحديث النداء في قاعدة البيانات (سياسة RLS تمنع التحديث) — أُبقي على حالته الحالية.');
      }

      setCalls((current) =>
        current.map((call) => (call.id === callId ? { ...call, status: 'completed' } : call))
      );
      setPendingCount((c) => Math.max(0, c - 1));
      setCompletedCount((c) => c + 1);

      if (activeCall?.id === callId) {
        setActiveCall(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحديث النداء.');
    }
  };

  const handleDelete = async (callId: string) => {
    try {
      const { data, error } = await supabase
        .from('waiter_calls')
        .delete()
        .eq('id', callId)
        .select('id');

      if (error) {
        throw error;
      }

      // Same silent-failure guard as above: with return=representation an
      // empty result means the DELETE affected zero rows (blocked by RLS),
      // so the row still exists in the database and must stay visible here.
      if (!data || data.length === 0) {
        throw new Error('لم يتم حذف النداء من قاعدة البيانات (سياسة RLS تمنع الحذف) — سيظهر مجدداً عند تحديث الصفحة.');
      }

      const call = calls.find((c) => c.id === callId);
      if (call?.status === 'pending') {
        setPendingCount((c) => Math.max(0, c - 1));
      } else if (call?.status === 'completed') {
        setCompletedCount((c) => Math.max(0, c - 1));
      }

      setCalls((current) => current.filter((c) => c.id !== callId));

      if (activeCall?.id === callId) {
        setActiveCall(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حذف النداء.');
    }
  };

  const pendingCalls = calls.filter((c) => c.status === 'pending');
  const completedCalls = calls.filter((c) => c.status === 'completed');

  return (
    <div className="space-y-5" dir="rtl">
      {/* Active Call Alert Modal */}
      {activeCall && activeCall.status === 'pending' && (
        <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-stone-950/40 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-lg animate-pop-in rounded-3xl border border-stone-200 bg-white p-6 text-center shadow-xl shadow-stone-900/10 sm:p-8">
            <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl ring-1 ${activeCall.request_type === 'request_bill' ? 'bg-gold-50 text-gold-700 ring-gold-200' : 'bg-rose-50 text-rose-600 ring-rose-100'}`}>
              {activeCall.request_type === 'request_bill' ? <ReceiptText size={28} /> : <BellRing size={28} />}
            </div>
            <p className="mt-4 text-sm font-semibold text-rose-500">نداء عاجل</p>
            <h2 className="mt-2 text-4xl font-bold text-stone-900 sm:text-5xl">
              طاولة رقم <span className="tabular-nums text-stone-900">{activeCall.table_number}</span>
            </h2>
            <p className="mt-3 text-lg font-semibold text-stone-700">
              {activeCall.request_type === 'request_bill' ? 'طلب الحساب' : activeCall.message}
            </p>
            <p className="mt-2 flex items-center justify-center gap-1.5 text-sm text-stone-400">
              <Clock size={14} />
              {formatCallTime(activeCall.created_at)}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => void handleMarkCompleted(activeCall.id)}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-base font-bold text-white shadow-soft transition hover:bg-emerald-700 active:scale-[0.98]"
              >
                <Check size={18} /> تمت المساعدة
              </button>
              <button
                type="button"
                onClick={() => setActiveCall(null)}
                className="rounded-xl border border-stone-200 bg-white px-6 py-3 text-base font-semibold text-stone-600 transition hover:bg-ivory-100 active:scale-[0.98]"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status Counter */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-center justify-between rounded-2xl border border-stone-200/80 bg-white p-4 shadow-soft">
          <div>
            <p className="text-sm text-stone-500">نداءات قيد الانتظار</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-stone-900">{pendingCount}</p>
          </div>
          <span className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
            {pendingCount > 0 && <span className="absolute -top-1 -left-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white">{pendingCount > 9 ? '9+' : pendingCount}</span>}
            <Phone size={20} />
          </span>
        </div>

        <div className="flex items-center justify-between rounded-2xl border border-stone-200/80 bg-white p-4 shadow-soft">
          <div>
            <p className="text-sm text-stone-500">نداءات مكتملة</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-stone-900">{completedCount}</p>
          </div>
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <CheckCircle2 size={20} />
          </span>
        </div>
      </div>

      {/* Connection Status & Audio */}
      <div className="flex flex-wrap items-center gap-2">
        <div className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium ${connected ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
          <span className="relative flex h-2 w-2">
            {connected && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
            <span className={`relative inline-flex h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          </span>
          {connected ? 'متصل مباشرة' : 'جاري الاتصال'}
        </div>
        <button
          type="button"
          onClick={() => void unlockAudio()}
          className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium shadow-soft transition ${audioEnabled ? 'border-gold-200 bg-gold-50 text-gold-700' : 'border-stone-200 bg-white text-stone-700 hover:border-gold-300 hover:text-gold-700'}`}
        >
          <BellRing size={15} /> {audioEnabled ? 'التنبيهات مفعلة' : 'تفعيل التنبيهات'}
        </button>
      </div>

      {/* Live Notice */}
      {liveNotice && (
        <div className="flex animate-rise-in items-center gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 shadow-soft">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
          </span>
          {liveNotice}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertCircle size={18} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Pending Calls Section */}
      <div className="space-y-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-stone-800">
          نداءات قيد الانتظار
          <span className="rounded-full border border-stone-200 bg-white px-2 py-0.5 text-xs font-medium tabular-nums text-stone-500">{pendingCalls.length}</span>
        </h2>
        {loading ? (
          <div className="space-y-3">
            {[0, 1].map((index) => <div key={index} className="h-36 animate-pulse rounded-2xl border border-stone-200/50 bg-white/70" />)}
          </div>
        ) : pendingCalls.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-stone-300/80 bg-white/50 px-4 py-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 size={22} />
            </span>
            <p className="text-sm text-stone-400">لا توجد نداءات قيد الانتظار حالياً ✓</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {pendingCalls.map((call) => (
              <div
                key={call.id}
                className="animate-rise-in rounded-2xl border border-rose-100 bg-white p-4 shadow-card transition hover:border-rose-200 hover:shadow-card-hover"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">
                        <Phone size={13} /> طاولة رقم {call.table_number}
                      </span>
                    </div>
                    <p className="mt-2.5 flex items-center gap-2 text-lg font-bold text-stone-900">
                      {call.request_type === 'request_bill'
                        ? <><ReceiptText size={18} className="text-gold-600" /> طلب الحساب</>
                        : <><BellRing size={18} className="text-rose-500" /> استدعاء النادل</>}
                    </p>
                    {call.message && <p className="mt-1 text-sm text-stone-600">{call.message}</p>}
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-stone-400">
                      <Clock size={12} />
                      {formatCallTime(call.created_at)}
                    </p>
                  </div>
                  <span className="relative mt-1 flex h-3 w-3 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-50" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-rose-500" />
                  </span>
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleMarkCompleted(call.id)}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-emerald-700 active:scale-[0.98]"
                  >
                    <Check size={16} /> تمت المساعدة
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(call.id)}
                    aria-label="حذف"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 active:scale-[0.98]"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Completed Calls Section */}
      {completedCalls.length > 0 && (
        <div className="space-y-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-stone-800">
            نداءات مكتملة
            <span className="rounded-full border border-stone-200 bg-white px-2 py-0.5 text-xs font-medium tabular-nums text-stone-500">{completedCalls.length}</span>
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {completedCalls.map((call) => (
              <div
                key={call.id}
                className="rounded-2xl border border-stone-200/70 bg-white/70 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                        <CheckCircle2 size={13} /> طاولة رقم {call.table_number}
                      </span>
                    </div>
                    <p className="mt-2.5 text-base font-semibold text-stone-600">
                      {call.request_type === 'request_bill' ? 'طلب الحساب' : 'استدعاء النادل'}
                    </p>
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-stone-400">
                      <Clock size={12} />
                      {formatCallTime(call.created_at)}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void handleDelete(call.id)}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white py-2.5 text-sm font-medium text-stone-500 transition hover:bg-ivory-100 hover:text-stone-700 active:scale-[0.98]"
                >
                  <Trash2 size={15} /> حذف
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
