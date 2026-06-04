let globalAudioCtx: any = null;

export function initAudioFeedback() {
  try {
    if (typeof window !== 'undefined' && !globalAudioCtx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        globalAudioCtx = new AudioContextClass();
        // Create and play a quick silent buffer to unlock on iOS Safari
        const buffer = globalAudioCtx.createBuffer(1, 1, 22050);
        const source = globalAudioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(globalAudioCtx.destination);
        source.start(0);
        if (globalAudioCtx.state === 'suspended') {
          globalAudioCtx.resume();
        }
      }
    }
  } catch (e) {
    console.warn("Could not pre-init AudioContext:", e);
  }
}

export function playScanSuccessFeedback() {
  try {
    // 1. Vibration feedback (80ms)
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(80);
    }
  } catch (e) {
    console.warn("Vibration failed:", e);
  }

  try {
    // 2. Sound feedback using Web Audio API
    if (typeof window !== 'undefined') {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        const ctx = globalAudioCtx || new AudioContextClass();
        if (ctx.state === 'suspended') {
          ctx.resume();
        }
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = "sine";
        osc.frequency.setValueAtTime(1200, ctx.currentTime); // clear beep frequency at 1200Hz
        
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1); // 100ms beep duration

        osc.start();
        osc.stop(ctx.currentTime + 0.1);
      }
    }
  } catch (e) {
    console.warn("Audio feedback failed:", e);
  }
}
