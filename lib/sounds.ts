/**
 * Sound utility for notifications
 * Provides base64-encoded audio fallback for notification sounds
 */

// Base64 encoded notification sounds (generated from Web Audio API)
// These are simple beep sounds in data URL format

export const NOTIFICATION_SOUNDS = {
  // Order notification: single beep
  order: 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAAA=',

  // Waiter call notification: double beep
  call: 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAAA=',
};

/**
 * Synthesize a notification sound using Web Audio API
 * @param kind - Type of notification ('order' or 'call')
 * @param audioContext - AudioContext instance
 */
export function synthesizeSound(kind: 'order' | 'call', audioContext: AudioContext): void {
  if (audioContext.state === 'suspended') {
    // Cannot play if context is suspended - user interaction required
    return;
  }

  const currentTime = audioContext.currentTime;

  if (kind === 'call') {
    // Waiter call: Two beeps (urgent pattern)
    synthesizeBeep(audioContext, currentTime, 1000, 0.15, 0.2);
    synthesizeBeep(audioContext, currentTime + 0.25, 800, 0.15, 0.2);
  } else {
    // Order notification: Single beep
    synthesizeBeep(audioContext, currentTime, 880, 0.08, 0.3);
  }
}

/**
 * Synthesize a single beep
 * @param audioContext - AudioContext instance
 * @param startTime - When to start the beep
 * @param frequency - Frequency in Hz
 * @param volume - Volume level (0-1)
 * @param duration - Duration in seconds
 */
function synthesizeBeep(
  audioContext: AudioContext,
  startTime: number,
  frequency: number,
  volume: number,
  duration: number
): void {
  try {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, startTime);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.1, startTime + duration * 0.5);

    // Envelope: fade in, hold, fade out
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.01);
    gain.gain.linearRampToValueAtTime(volume * 0.8, startTime + duration * 0.7);
    gain.gain.linearRampToValueAtTime(0, startTime + duration);

    oscillator.connect(gain);
    gain.connect(audioContext.destination);

    oscillator.start(startTime);
    oscillator.stop(startTime + duration);
  } catch (err) {
    // Silently fail - sound is not critical
  }
}

/**
 * Play a notification sound
 * @param kind - Type of notification
 * @param audioContext - Optional AudioContext for Web Audio synthesis
 */
export async function playSound(kind: 'order' | 'call', audioContext?: AudioContext): Promise<void> {
  // Try Web Audio API first if context is provided
  if (audioContext) {
    try {
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      if (audioContext.state === 'running') {
        synthesizeSound(kind, audioContext);
        return;
      }
    } catch (err) {
      // Fall through to try file-based approach
    }
  }

  // Try to play using Audio element
  if (typeof window !== 'undefined') {
    try {
      const soundPath = kind === 'order' ? '/sound-ousis/order-sound.mp3' : '/sound-ousis/call-sound.mp3';
      const audio = new Audio(soundPath);
      audio.volume = 0.7;
      await audio.play();
      return;
    } catch (err) {
      // Silently fail
    }
  }

  // Final fallback: use data URL if available (not recommended for production)
  // Comment out for security/privacy reasons - only use local files
  // try {
  //   const audio = new Audio(NOTIFICATION_SOUNDS[kind]);
  //   audio.volume = 0.7;
  //   await audio.play();
  // } catch (err) {
  //   // Silently fail
  // }
}
