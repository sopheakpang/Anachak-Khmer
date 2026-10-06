/** 1-second 440 Hz tone at a safe level, to check that LIVE Studio captures the game's sound. */
export function playTestTone(): void {
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = 440;
  gain.gain.value = 0.2;
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 1);
  osc.onended = () => void ctx.close();
}
