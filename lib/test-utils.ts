/**
 * Testing utilities for the waiter call system
 * Use this to manually test audio and notifications
 */

import { supabase } from './supabase';

/**
 * Simulate a waiter call alert
 * @param tableNumber - The table number
 * @param requestType - Type of request ('call_waiter' or 'request_bill')
 */
export async function testWaiterCall(tableNumber: number, requestType: 'call_waiter' | 'request_bill' = 'call_waiter'): Promise<void> {
  try {
    const message = requestType === 'request_bill' ? 'طلب الحساب' : 'استدعاء النادل';

    const { data, error } = await supabase
      .from('waiter_calls')
      .insert([
        {
          table_number: tableNumber,
          table_id: `test-${Date.now()}`,
          message: message,
          request_type: requestType,
          status: 'pending',
          created_at: new Date().toISOString(),
        },
      ])
      .select();

    if (error) {
      console.error('Test call failed:', error);
      throw error;
    }

    console.log('Test waiter call sent:', data);
  } catch (err) {
    console.error('Failed to send test waiter call:', err);
    throw err;
  }
}

/**
 * Simulate a new order
 * @param tableNumber - The table number
 */
export async function testNewOrder(tableNumber: number): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('orders')
      .insert([
        {
          table_number: tableNumber,
          table_id: `test-${Date.now()}`,
          items: [
            { name: 'تست برجر', quantity: 2 },
            { name: 'تست مشروب', quantity: 1 },
          ],
          total_amount: 25.99,
          status: 'new',
          created_at: new Date().toISOString(),
        },
      ])
      .select();

    if (error) {
      console.error('Test order failed:', error);
      throw error;
    }

    console.log('Test order sent:', data);
  } catch (err) {
    console.error('Failed to send test order:', err);
    throw err;
  }
}

/**
 * Test audio context and playback
 */
export async function testAudioContext(): Promise<{ success: boolean; message: string }> {
  if (typeof window === 'undefined') {
    return { success: false, message: 'Not in browser environment' };
  }

  try {
    const AudioCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioCtor) {
      return { success: false, message: 'Web Audio API not supported' };
    }

    const context = new AudioCtor();

    if (context.state === 'suspended') {
      try {
        await context.resume();
      } catch (err) {
        return { success: false, message: 'Cannot resume audio context - user interaction may be required' };
      }
    }

    if (context.state !== 'running') {
      return { success: false, message: `Audio context state is ${context.state}` };
    }

    // Play a test beep
    const osc = context.createOscillator();
    const gain = context.createGain();

    osc.frequency.setValueAtTime(440, context.currentTime);
    gain.gain.setValueAtTime(0.1, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.2);

    osc.connect(gain);
    gain.connect(context.destination);

    osc.start();
    osc.stop(context.currentTime + 0.2);

    return { success: true, message: 'Audio test successful - you should hear a beep' };
  } catch (err) {
    return { success: false, message: `Audio test failed: ${err instanceof Error ? err.message : 'Unknown error'}` };
  }
}

/**
 * Get system diagnostics
 */
export async function getSystemDiagnostics(): Promise<Record<string, any>> {
  const diagnostics: Record<string, any> = {
    timestamp: new Date().toISOString(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A',
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseKeyExists: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };

  if (typeof window !== 'undefined') {
    const AudioCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    diagnostics.webAudioSupported = !!AudioCtor;

    if (AudioCtor) {
      const context = new AudioCtor();
      diagnostics.audioContextState = context.state;
      diagnostics.audioContextSampleRate = context.sampleRate;
    }
  }

  return diagnostics;
}
