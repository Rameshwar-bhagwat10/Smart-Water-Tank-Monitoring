'use client';

// Web Audio Square-Wave Synthesizer for resilient local audio alerts
let audioCtx: AudioContext | null = null;

export function playWebBuzzer(
  freq = 2500,
  durationMs = 200,
  type: OscillatorType = 'square'
): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    if (!audioCtx) audioCtx = new AudioContextClass();

    const play = () => {
      try {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const dur = (durationMs || 200) / 1000;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq || 2500, now);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.linearRampToValueAtTime(0.01, now + dur);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + dur);
      } catch {
        // Audio synthesis exception ignored
      }
    };

    if (audioCtx.state === 'suspended') {
      audioCtx.resume().then(play).catch(() => {});
    } else {
      play();
    }
  } catch {
    // Web audio unvailable
  }
}
