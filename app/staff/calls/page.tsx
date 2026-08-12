'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, Phone, ReceiptText } from 'lucide-react';
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
      const { error } = await supabase.from('waiter_calls').update({ status: 'completed' }).eq('id', callId);

      if (error) {
        throw error;
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
      const { error } = await supabase.from('waiter_calls').delete().eq('id', callId);

      if (error) {
        throw error;
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
    <div className="space-y-4">
      {/* Active Call Alert Modal */}
      {activeCall && activeCall.status === 'pending' && (
        <div className="fixed inset-0 z-50 flex animate-pulse items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl animate-bounce rounded-[40px] border-4 border-red-300 bg-gradient-to-br from-red-600 via-rose-500 to-red-700 p-2 shadow-[0_0_60px_rgba(239,68,68,0.8)]">
            <div className="rounded-[36px] bg-slate-950/98 p-8 text-center sm:p-12">
              <div className="mb-4 text-5xl">🚨</div>
              <p className="text-lg font-black uppercase tracking-[0.2em] text-red-300">نداء عاجل</p>
              <h2 className="mt-4 text-4xl font-black text-white sm:text-5xl">
                طاولة رقم <span className="text-red-300">{activeCall.table_number}</span>
              </h2>
              <p className="mt-3 text-2xl font-bold text-red-200">
                {activeCall.request_type === 'request_bill' && '💰 '}
                {activeCall.message}
              </p>
              <p className="mt-2 text-sm text-slate-400">
                {formatCallTime(activeCall.created_at)}
              </p>
              <div className="mt-10 flex flex-wrap justify-center gap-4">
                <button
                  type="button"
                  onClick={() => void handleMarkCompleted(activeCall.id)}
                  className="animate-pulse rounded-full bg-emerald-500 px-8 py-4 text-xl font-bold text-slate-950 shadow-lg shadow-emerald-500/50 transition hover:scale-105 hover:bg-emerald-400 hover:shadow-emerald-500/70"
                >
                  ✓ تمت المساعدة
                </button>
                <button
                  type="button"
                  onClick={() => setActiveCall(null)}
                  className="rounded-full border-2 border-white/30 bg-white/10 px-8 py-4 text-xl font-bold text-white transition hover:bg-white/20"
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Status Counter */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/70 p-4 shadow-inner shadow-black/20">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-300">نداءات قيد الانتظار</p>
            {pendingCount > 0 && (
              <span className="relative flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white shadow-lg shadow-red-500/50">
                {pendingCount}
              </span>
            )}
          </div>
          <p className="mt-3 text-3xl font-semibold text-white">{pendingCount}</p>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/70 p-4 shadow-inner shadow-black/20">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-300">نداءات مكتملة</p>
            {completedCount > 0 && (
              <span className="relative flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white shadow-lg shadow-emerald-500/50">
                {completedCount}
              </span>
            )}
          </div>
          <p className="mt-3 text-3xl font-semibold text-white">{completedCount}</p>
        </div>
      </div>

      {/* Connection Status & Audio */}
      <div className="flex flex-wrap items-center gap-2">
        <div className={`rounded-full border px-3 py-1.5 text-sm font-medium ${connected ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300' : 'border-amber-400/30 bg-amber-500/10 text-amber-200'}`}>
          {connected ? 'متصل مباشرة' : 'جاري الاتصال'}
        </div>
        <button
          type="button"
          onClick={() => void unlockAudio()}
          className="flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-sm font-medium text-slate-100 transition hover:bg-white/20"
        >
          🔔 {audioEnabled ? 'التنبيهات مفعلة' : 'تفعيل التنبيهات'}
        </button>
      </div>

      {/* Live Notice */}
      {liveNotice && (
        <div className="animate-pulse rounded-[24px] border border-red-400/40 bg-red-500/15 px-4 py-3 text-lg font-semibold text-red-100 shadow-[0_10px_32px_rgba(239,68,68,0.14)]">
          {liveNotice}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 flex items-center gap-2">
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {/* Pending Calls Section */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-white">نداءات قيد الانتظار</h2>
        {loading ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-slate-900/70 p-6 text-center text-sm text-slate-400">
            جاري تحميل النداءات...
          </div>
        ) : pendingCalls.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-slate-900/70 p-6 text-center text-sm text-slate-400">
            لا توجد نداءات قيد الانتظار حالياً ✓
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {pendingCalls.map((call) => (
              <div
                key={call.id}
                className="transform rounded-[20px] border-2 border-red-400/60 bg-gradient-to-br from-red-600/20 via-slate-900/80 to-slate-900/80 p-4 shadow-lg shadow-red-500/20 transition hover:border-red-400 hover:shadow-red-500/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Phone size={16} className="text-red-400" />
                      <p className="text-sm text-red-300 font-semibold">طاولة رقم {call.table_number}</p>
                    </div>
                    <p className="mt-2 text-lg font-bold text-white">
                      {call.request_type === 'request_bill' ? '💰 طلب الحساب' : '🔔 استدعاء النادل'}
                    </p>
                    {call.message && <p className="mt-1 text-sm text-slate-300">{call.message}</p>}
                    <p className="mt-2 text-xs text-slate-500 flex items-center gap-1">
                      <Clock size={12} />
                      {formatCallTime(call.created_at)}
                    </p>
                  </div>
                  <span className="flex h-3 w-3 rounded-full bg-red-600 shadow-lg shadow-red-500/50" />
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleMarkCompleted(call.id)}
                    className="flex-1 rounded-full bg-emerald-500 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
                  >
                    ✓ تمت المساعدة
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(call.id)}
                    className="rounded-full border border-white/20 bg-white/10 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/20"
                  >
                    🗑
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
          <h2 className="text-lg font-semibold text-white">نداءات مكتملة</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {completedCalls.map((call) => (
              <div
                key={call.id}
                className="rounded-[20px] border border-emerald-400/40 bg-emerald-600/10 p-4 shadow-lg shadow-emerald-500/10"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={16} className="text-emerald-400" />
                      <p className="text-sm text-emerald-300 font-semibold">طاولة رقم {call.table_number}</p>
                    </div>
                    <p className="mt-2 text-lg font-bold text-slate-200">
                      {call.request_type === 'request_bill' ? 'طلب الحساب' : 'استدعاء النادل'}
                    </p>
                    <p className="mt-2 text-xs text-slate-400 flex items-center gap-1">
                      <Clock size={12} />
                      {formatCallTime(call.created_at)}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void handleDelete(call.id)}
                  className="mt-3 w-full rounded-full border border-white/20 bg-white/10 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/20"
                >
                  حذف
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
