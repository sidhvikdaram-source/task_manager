let completionAudioContext: AudioContext | null = null;

function getCompletionAudioContext() {
  const AudioContextClass =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextClass) return null;
  completionAudioContext ??= new AudioContextClass();
  return completionAudioContext;
}

export function primeCompletionSound() {
  const ctx = getCompletionAudioContext();
  if (ctx?.state === 'suspended') {
    void ctx.resume();
  }
}

export function playCompletionSound() {
  const ctx = getCompletionAudioContext();
  if (!ctx) return;

  if (ctx.state === 'suspended') {
    void ctx.resume();
  }

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.16, ctx.currentTime);
  master.connect(ctx.destination);

  [523.25, 659.25, 783.99].forEach((frequency, index) => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.value = frequency;
    oscillator.connect(gain);
    gain.connect(master);

    const start = ctx.currentTime + index * 0.08;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.18, start + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
    oscillator.start(start);
    oscillator.stop(start + 0.24);
  });

  if ('vibrate' in navigator) {
    navigator.vibrate(30);
  }
}
