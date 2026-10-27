// Tüm sesler WebAudio ile üretilir (telifsiz, özgün).
let ac = null, master, musicOn = true, timer = null, step = 0;
function init() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  ac = new AC(); master = ac.createGain(); master.gain.value = .5; master.connect(ac.destination);
}
function tone(f, d, type = 'square', vol = .2, slide = 0, when = 0) {
  if (!ac) return; const t = ac.currentTime + when;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + d);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + d + .02);
}
function noise(d, vol = .2) {
  if (!ac) return; const n = ac.sampleRate * d, buf = ac.createBuffer(1, n, ac.sampleRate), a = buf.getChannelData(0);
  for (let i = 0; i < n; i++) a[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = ac.createBufferSource(), g = ac.createGain(); s.buffer = buf; g.gain.value = vol; s.connect(g); g.connect(master); s.start();
}
export const sfx = {
  unlock: init,
  flipper() { tone(140, .07, 'square', .18, -60); },
  bumper() { tone(520, .12, 'square', .2, 380); tone(780, .1, 'triangle', .12); },
  sling() { tone(300, .08, 'sawtooth', .15, 200); },
  room() { tone(660, .08, 'triangle', .2); tone(990, .12, 'triangle', .2, 0, .08); },
  lock() { tone(200, .25, 'sawtooth', .22, -120); noise(.15, .15); },
  thing() { tone(90, .5, 'sawtooth', .25, 200); noise(.3, .1); },
  magnet() { tone(110, .4, 'sawtooth', .1, 300); },
  multiball() { [392, 494, 587, 784, 988].forEach((f, i) => tone(f, .15, 'square', .2, 0, i * .09)); },
  launch() { tone(100, .35, 'sawtooth', .22, 500); },
  drain() { tone(300, .6, 'sawtooth', .22, -250); },
  vip() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, .2, 'triangle', .22, 0, i * .08)); },
  over() { [330, 277, 247, 165].forEach((f, i) => tone(f, .4, 'sawtooth', .2, 0, i * .3)); },
  wrong() { tone(150, .25, 'square', .15); }
};
// Gotik, minör arpej arka plan müziği
const SEQ = [220, 262, 330, 262, 208, 247, 311, 247, 196, 233, 294, 233, 208, 247, 311, 392];
export function music(on) {
  musicOn = on; clearInterval(timer); timer = null;
  if (!on) return; init();
  timer = setInterval(() => {
    if (!ac || ac.state !== 'running') return;
    const f = SEQ[step % 16]; tone(f, .28, 'triangle', .09);
    if (step % 4 === 0) tone(f / 4, .9, 'sine', .14);
    if (step % 16 === 8) tone(f * 2, .5, 'sine', .04);
    step++;
  }, 260);
}
