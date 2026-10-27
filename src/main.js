import Matter from 'matter-js';
import { sfx, music } from './audio.js';
import { isVip, tryCoupon } from './coupon.js';

const { Engine, Bodies, Body, Composite, Events } = Matter;
const W = 600, H = 900, R = 9, SUB = 4;
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const $ = id => document.getElementById(id);

// ---------- Fizik dünyası ----------
const engine = Engine.create({ positionIterations: 10, velocityIterations: 8 });
engine.gravity.y = 1; engine.gravity.scale = 0.0006;
const world = engine.world;
const walls = [];
function seg(x1, y1, x2, y2, th = 14, opts = {}) {
  const len = Math.hypot(x2 - x1, y2 - y1), a = Math.atan2(y2 - y1, x2 - x1);
  const b = Bodies.rectangle((x1 + x2) / 2, (y1 + y2) / 2, len + 2, th, Object.assign({ isStatic: true, angle: a, restitution: .3, friction: 0, label: 'wall' }, opts));
  Composite.add(world, b); walls.push({ x1, y1, x2, y2, th }); return b;
}
// Üst kemer
const ARC = [];
for (let i = 0; i <= 36; i++) { const a = Math.PI + (i / 36) * Math.PI; ARC.push([300 + 290 * Math.cos(a), 300 + 290 * Math.sin(a)]); }
for (let i = 0; i < 36; i++) seg(ARC[i][0], ARC[i][1], ARC[i + 1][0], ARC[i + 1][1], 16);
seg(3, 300, 3, 800, 14); seg(597, 300, 597, 900, 14);
seg(548, 340, 548, 880, 10);                 // fırlatma kanalı ayırıcı
seg(548, 340, 526, 372, 10);                 // ayırıcı üst eğim
seg(8, 722, 187, 818, 14); seg(540, 722, 369, 818, 14); // alt kılavuzlar
seg(560, 190, 590, 232, 10);                 // kanaldan çıkış yönlendirici
// Üst kemerde kanal çıkışı: top sola dönsün
// Bumperlar
const bumpers = [[205, 190], [385, 190], [295, 262]].map(([x, y]) => {
  const b = Bodies.circle(x, y, 28, { isStatic: true, label: 'bumper', restitution: 1 }); Composite.add(world, b); b.lit = 0; return b;
});
// Sapanlar
const slings = [[[78, 600], [140, 698], 1], [[470, 600], [408, 698], -1]].map(([p, q, s]) => {
  const b = seg(p[0], p[1], q[0], q[1], 10, { label: 'sling' });
  const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy);
  b.n = { x: Math.abs(dy) / l * s, y: -Math.abs(dx) / l * .6 }; b.lit = 0; b.p = p; b.q = q; return b;
});
// Paletler
const FL = 82, FT = 15, REST = .5, UP = -.45;
function mkFlip(px, py, s) {
  const body = Bodies.rectangle(px, py, FL, FT, { isStatic: true, label: 'flip', chamfer: { radius: 7 }, restitution: .2, friction: 0 });
  Composite.add(world, body);
  return { body, px, py, s, th: REST, held: false, prev: REST, cd: 0 };
}
const flips = [mkFlip(190, 818, 1), mkFlip(369, 818, -1)];
function placeFlip(f, th) {
  const phi = f.s > 0 ? th : Math.PI - th;
  const cx = f.px + Math.cos(phi) * FL / 2, cy = f.py + Math.sin(phi) * FL / 2;
  const old = f.body.angle;
  Body.setPosition(f.body, { x: cx, y: cy }); Body.setAngle(f.body, phi);
  f.body.anglePrev = old; f.phi = phi;
}
flips.forEach(f => placeFlip(f, REST));

// ---------- Oyun durumu ----------
const ROOMS = ['Kütüphane', 'Mahzen', 'Balo Salonu', 'Çatı Katı', 'Mutfak', 'Limonluk', 'Kiler', 'Kule', 'Galeri', 'Şapel', 'Çalışma Odası', 'Sera'];
const roomRects = ROOMS.map((n, i) => ({ n, x: 130 + (i % 4) * 78, y: 345 + Math.floor(i / 4) * 52, w: 74, h: 48, lit: false, flash: 0 }));
let st = { mode: 'menu', score: 0, balls: 3, vip: isVip(), mult: 1, multT: 0, multiball: false, ballSave: 0 };
let balls = [], pull = 0, charging = false, laneBall = null;
let thing = { t: -1, ball: null, cool: 0 }, magnet = { on: false, t: 6, x: 300, y: 130, dir: 0, spin: 1 };
let toastT = 0, particles = [];

function toast(msg, ms = 2200) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms); }
function addScore(n) { st.score += n * st.mult; }

function newBall(x, y, vx = 0, vy = 0) {
  const b = Bodies.circle(x, y, R, { restitution: .45, friction: 0, frictionAir: 0, frictionStatic: 0, density: .002, label: 'ball', slop: .02 });
  Body.setVelocity(b, { x: vx, y: vy }); Composite.add(world, b); b.cd = [0, 0]; b.still = 0; balls.push(b); return b;
}
function serve() { laneBall = newBall(569, 835); }
function resetGame() {
  balls.forEach(b => Composite.remove(world, b)); balls = []; laneBall = null;
  st = { mode: 'play', score: 0, balls: 3, vip: isVip(), mult: 1, multT: 0, multiball: false, ballSave: 0 };
  roomRects.forEach(r => r.lit = false); thing = { t: -1, ball: null, cool: 0 }; magnet.on = false; magnet.t = 6;
  serve();
}

// ---------- Çarpışma olayları ----------
Events.on(engine, 'collisionStart', ev => ev.pairs.forEach(p => {
  const [a, b] = p.bodyA.label === 'ball' ? [p.bodyA, p.bodyB] : [p.bodyB, p.bodyA];
  if (a.label !== 'ball') return;
  if (b.label === 'bumper') {
    const dx = a.position.x - b.position.x, dy = a.position.y - b.position.y, l = Math.hypot(dx, dy) || 1;
    Body.setVelocity(a, { x: dx / l * 12, y: dy / l * 12 }); b.lit = 1; addScore(100); sfx.bumper();
  } else if (b.label === 'sling') {
    Body.setVelocity(a, { x: b.n.x * 14 + a.velocity.x * .3, y: b.n.y * 14 + a.velocity.y * .3 }); b.lit = 1; addScore(50); sfx.sling();
  }
}));

// ---------- Mekanikler ----------
function lightRoom(r) {
  if (r.lit) return; r.lit = true; r.flash = 1; addScore(500); sfx.room();
  const n = roomRects.filter(x => x.lit).length;
  if (n === 4) { st.mult = 2; st.multT = 25; toast('SALON AÇILDI\n2x PUAN (25 sn)'); }
  else if (n === 8) { st.ballSave = 15; toast('GİZLİ ODA\nTOP KORUMA (15 sn)'); sfx.lock(); }
  else if (n === 12) startMultiball();
}
function startMultiball() {
  if (st.multiball) return; st.multiball = true; sfx.multiball(); sfx.lock();
  toast('MULTIBALL!\n3 TOP BİRDEN', 3000); addScore(5000);
  const need = 3 - balls.length;
  for (let i = 0; i < need; i++) newBall(240 + i * 50, 130, (i ? 3 : -3), 2);
  roomRects.forEach(r => r.lit = false);
}
function startThing(ball) {
  thing = { t: 0, ball, cool: 0 }; Body.setStatic(ball, true); ball.captured = true; sfx.thing(); toast('THING YAKALADI!', 1500);
}
function updateThing(dt) {
  if (thing.t < 0) { thing.cool -= dt; if (thing.cool > 0) return;
    for (const b of balls) if (!b.captured && Math.hypot(b.position.x - 40, b.position.y - 232) < 24) { startThing(b); break; }
    return; }
  thing.t += dt;
  if (thing.t > 1.5) { const b = thing.ball; Body.setStatic(b, false); Body.setPosition(b, { x: 470, y: 90 });
    Body.setVelocity(b, { x: -4, y: 5 }); b.captured = false; addScore(3000); sfx.launch(); toast('GİZLİ GEÇİTTEN ÇIKTI +3000', 1500);
    thing = { t: -1, ball: null, cool: 2.5 }; }
}
function updateMagnet(dt) {
  magnet.t -= dt;
  if (magnet.t <= 0) {
    magnet.on = !magnet.on; magnet.t = magnet.on ? 5 : 9 + Math.random() * 4;
    if (magnet.on) { magnet.x = 140 + Math.random() * 300; magnet.y = 90 + Math.random() * 230; magnet.dir = Math.random() * 6.28; magnet.spin = Math.random() < .5 ? -1 : 1; sfx.magnet(); toast('MIKNATIS ALANI!', 1400); }
  }
  if (!magnet.on) return;
  magnet.dir += magnet.spin * dt * 2.2;
  if (Math.random() < dt * .6) magnet.spin *= -1; // rastgele yön değişimi
  for (const b of balls) if (!b.captured && Math.hypot(b.position.x - magnet.x, b.position.y - magnet.y) < 90) {
    Body.applyForce(b, b.position, { x: Math.cos(magnet.dir) * .0007, y: Math.sin(magnet.dir) * .0007 });
  }
}
function updateFlippers(dt) {
  flips.forEach((f, i) => {
    const target = f.held ? UP : REST, sp = f.held ? 20 : 11, old = f.th;
    f.th += Math.sign(target - f.th) * Math.min(Math.abs(target - f.th), sp * dt);
    if (f.th !== old) placeFlip(f, f.th); else f.body.anglePrev = f.body.angle;
    f.swing = f.held && f.th > UP + .001;
    f.cd -= dt;
    if (f.swing) for (const b of balls) {
      if (b.captured || b.cd[i] > 0) continue;
      const ex = f.px + Math.cos(f.phi) * FL, ey = f.py + Math.sin(f.phi) * FL;
      const dx = ex - f.px, dy = ey - f.py, l2 = dx * dx + dy * dy;
      let t = ((b.position.x - f.px) * dx + (b.position.y - f.py) * dy) / l2; t = Math.max(0, Math.min(1, t));
      const cx = f.px + dx * t, cy = f.py + dy * t, d = Math.hypot(b.position.x - cx, b.position.y - cy);
      if (d < R + FT / 2 + 3) {
        let nx = -dy, ny = dx; if (ny > 0) { nx = -nx; ny = -ny; } const nl = Math.hypot(nx, ny); nx /= nl; ny /= nl;
        const sp2 = 15 + 11 * t;
        Body.setVelocity(b, { x: nx * sp2 * .8 + (f.s > 0 ? .25 : -.25) * sp2 * .3 * (1 - t) + (f.s > 0 ? 1 : -1) * 1.5 * t * 0, y: ny * sp2 });
        b.cd[i] = .15; addScore(10);
      }
    }
    for (const b of balls) if (b.cd[i] > 0) b.cd[i] -= dt;
  });
}
function launch() {
  if (!laneBall || !balls.includes(laneBall)) return;
  if (laneBall.position.x > 550 && laneBall.position.y > 600) {
    const p = Math.max(.35, pull); Body.setVelocity(laneBall, { x: 0, y: -(17 + p * 10) }); sfx.launch(); laneBall = null;
  }
  pull = 0; charging = false;
}
function drainCheck() {
  for (const b of balls.slice()) {
    const p = b.position;
    const sp = Math.hypot(b.velocity.x, b.velocity.y);
    if (sp > 26) Body.setVelocity(b, { x: b.velocity.x * 26 / sp, y: b.velocity.y * 26 / sp });
    if (b.captured) continue;
    if (p.y > 920) { Composite.remove(world, b); balls.splice(balls.indexOf(b), 1); if (b === laneBall) laneBall = null; continue; }
    if (p.x < -10 || p.x > W + 10 || p.y < -10) { Body.setPosition(b, { x: 300, y: 160 }); Body.setVelocity(b, { x: 0, y: 2 }); }
    // takılma önleyici
    const inLane = p.x > 550 && p.y > 700;
    if (sp < .25 && !inLane) { b.still += 1 / 60; if (b.still > 1.2) { Body.setVelocity(b, { x: (Math.random() - .5) * 8, y: -6 }); b.still = 0; } } else b.still = 0;
  }
  if (balls.length === 0 && st.mode === 'play') {
    sfx.drain();
    if (st.ballSave > 0 && !st.vip) { st.ballSave = 0; toast('TOP KORUMA!\nTekrar fırlat'); serve(); return; }
    st.multiball = false;
    if (!st.vip) st.balls--;
    if (st.balls <= 0 && !st.vip) { st.mode = 'over'; sfx.over(); $('finalScore').textContent = 'Skor: ' + Math.floor(st.score); $('over').classList.remove('hide'); }
    else { toast(st.vip ? 'TOP DÜŞTÜ (∞)' : 'Kalan top: ' + st.balls); serve(); }
  } else if (balls.length === 1 && st.multiball) st.multiball = false;
}

// ---------- Döngü ----------
let last = performance.now(), acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(.05, (now - last) / 1000); last = now; tick(dt); draw(now / 1000);
}
function tick(dt) {
  if (st.mode === 'play' && !paused) {
    if (charging) pull = Math.min(1, pull + dt * 1.2);
    for (let i = 0; i < SUB; i++) { const h = dt / SUB;
      updateFlippers(h); Engine.update(engine, h * 1000);
    }
    updateThing(dt); updateMagnet(dt);
    if (st.multT > 0) { st.multT -= dt; if (st.multT <= 0) st.mult = 1; }
    if (st.ballSave > 0) st.ballSave -= dt;
    for (const r of roomRects) { r.flash = Math.max(0, r.flash - dt * 2);
      for (const b of balls) if (b.position.x > r.x && b.position.x < r.x + r.w && b.position.y > r.y && b.position.y < r.y + r.h) lightRoom(r); }
    bumpers.forEach(b => b.lit = Math.max(0, b.lit - dt * 4)); slings.forEach(s => s.lit = Math.max(0, s.lit - dt * 4));
    drainCheck();
  }
}
let paused = false;

// ---------- Çizim ----------
function draw(t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1a0f24'); g.addColorStop(1, '#0a0710');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // konak silueti
  ctx.fillStyle = '#120a1a'; ctx.beginPath(); ctx.moveTo(110, 330); ctx.lineTo(110, 280); ctx.lineTo(150, 250); ctx.lineTo(150, 200); ctx.lineTo(175, 160); ctx.lineTo(200, 200);
  ctx.lineTo(200, 260); ctx.lineTo(300, 220); ctx.lineTo(400, 260); ctx.lineTo(400, 200); ctx.lineTo(425, 160); ctx.lineTo(450, 200); ctx.lineTo(450, 250); ctx.lineTo(490, 280); ctx.lineTo(490, 330); ctx.fill();
  // ay
  ctx.fillStyle = 'rgba(230,220,180,.15)'; ctx.beginPath(); ctx.arc(300, 90, 36, 0, 7); ctx.fill();
  ctx.fillStyle = '#1a0f24'; ctx.beginPath(); ctx.arc(314, 84, 32, 0, 7); ctx.fill();
  // duvarlar
  ctx.lineCap = 'round'; ctx.strokeStyle = '#8c6d2f'; ctx.lineWidth = 8;
  walls.forEach(w => { ctx.beginPath(); ctx.moveTo(w.x1, w.y1); ctx.lineTo(w.x2, w.y2); ctx.stroke(); });
  ctx.strokeStyle = '#3a2a14'; ctx.lineWidth = 3; walls.forEach(w => { ctx.beginPath(); ctx.moveTo(w.x1, w.y1); ctx.lineTo(w.x2, w.y2); ctx.stroke(); });
  slings.forEach(s => { ctx.strokeStyle = s.lit > 0 ? '#ffd86b' : '#9b2c4a'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(s.p[0], s.p[1]); ctx.lineTo(s.q[0], s.q[1]); ctx.stroke(); });
  // odalar
  ctx.font = '10px Georgia'; ctx.textAlign = 'center';
  roomRects.forEach(r => {
    ctx.fillStyle = r.lit ? `rgba(255,${180 + r.flash * 70},90,.85)` : 'rgba(60,35,80,.7)'; ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = '#8c6d2f'; ctx.lineWidth = 2; ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = r.lit ? '#2a1005' : '#b9a6c9'; ctx.fillText(r.n, r.x + r.w / 2, r.y + r.h / 2 + 3);
    ctx.fillStyle = r.lit ? '#fff3b0' : '#222'; ctx.fillRect(r.x + r.w / 2 - 6, r.y + 6, 12, 10); // pencere
  });
  // bumperlar
  bumpers.forEach(b => { const x = b.position.x, y = b.position.y;
    ctx.fillStyle = b.lit > 0 ? '#ffd86b' : '#5b1a3a'; ctx.beginPath(); ctx.arc(x, y, 28, 0, 7); ctx.fill();
    ctx.strokeStyle = '#d4af4a'; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = '#d4af4a'; ctx.font = 'bold 20px Georgia'; ctx.fillText('☠', x, y + 7); });
  // Thing eli
  const hx = 40, hy = 232; const ext = thing.t < 0 ? 0 : Math.sin(Math.min(1, thing.t / 1.5) * Math.PI);
  ctx.fillStyle = '#0a0710'; ctx.beginPath(); ctx.arc(hx, hy, 22, 0, 7); ctx.fill(); ctx.strokeStyle = '#8c6d2f'; ctx.lineWidth = 3; ctx.stroke();
  if (ext > 0 || Math.sin(t * 2) > .95) { const e = Math.max(ext, .15);
    ctx.fillStyle = '#c9a98a'; ctx.beginPath(); ctx.ellipse(hx + 6, hy, 6 + 14 * e, 7, 0, 0, 7); ctx.fill();
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(hx + 12 + 14 * e, hy + i * 3); ctx.lineTo(hx + 20 + 14 * e + e * 6, hy + i * 4.5); ctx.strokeStyle = '#c9a98a'; ctx.lineWidth = 2.5; ctx.stroke(); } }
  // gizli geçit çıkışı
  ctx.fillStyle = '#0a0710'; ctx.beginPath(); ctx.arc(480, 80, 12, 0, 7); ctx.fill(); ctx.strokeStyle = '#8c6d2f'; ctx.lineWidth = 2; ctx.stroke();
  // mıknatıs
  if (magnet.on) { ctx.strokeStyle = `rgba(120,200,255,${.5 + .4 * Math.sin(t * 30)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(magnet.x, magnet.y, 90, 0, 7); ctx.stroke();
    ctx.fillStyle = 'rgba(80,160,255,.12)'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(magnet.x, magnet.y); ctx.lineTo(magnet.x + Math.cos(magnet.dir) * 70, magnet.y + Math.sin(magnet.dir) * 70); ctx.strokeStyle = '#9fd8ff'; ctx.stroke();
    ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.random() * 6.28, r = Math.random() * 90; ctx.lineTo(magnet.x + Math.cos(a) * r, magnet.y + Math.sin(a) * r); } ctx.stroke(); }
  // paletler
  flips.forEach(f => { ctx.save(); ctx.translate(f.px, f.py); ctx.rotate(f.phi); ctx.fillStyle = '#d4af4a'; ctx.strokeStyle = '#6b4f12'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(-FT / 2, -FT / 2, FL + FT / 2, FT, 7); ctx.fill(); ctx.stroke(); ctx.restore(); });
  // plunger
  const py = 860 + pull * 30; ctx.fillStyle = '#9b2c4a'; ctx.fillRect(560, py, 18, 12); ctx.fillRect(566, py + 12, 6, 40);
  // toplar
  balls.forEach(b => { const gr = ctx.createRadialGradient(b.position.x - 3, b.position.y - 3, 1, b.position.x, b.position.y, R);
    gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#8a8a99'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(b.position.x, b.position.y, R, 0, 7); ctx.fill(); });
  // HUD
  ctx.textAlign = 'left'; ctx.fillStyle = '#e8d9b0'; ctx.font = 'bold 20px Georgia'; ctx.fillText(String(Math.floor(st.score)).padStart(7, '0'), 20, 34);
  ctx.font = '14px Georgia'; ctx.fillText('TOP: ' + (st.vip ? '∞' : st.balls) + (st.mult > 1 ? '   ' + st.mult + 'x' : ''), 20, 54);
  if (st.vip) { ctx.fillStyle = '#ffd86b'; ctx.fillText('VIP', 20, 72); }
}

// ---------- Kontroller ----------
function fitCanvas() {
  const s = Math.min(innerWidth / W, innerHeight / H); cv.style.width = W * s + 'px'; cv.style.height = H * s + 'px';
}
addEventListener('resize', fitCanvas); fitCanvas();
const touches = new Map();
function setHeld() {
  let l = kb.l, r = kb.r; touches.forEach(v => { if (v === 'l') l = true; if (v === 'r') r = true; });
  if (l && !flips[0].held) sfx.flipper(); if (r && !flips[1].held) sfx.flipper();
  flips[0].held = l; flips[1].held = r;
}
const kb = { l: false, r: false };
let dragStart = null, dragId = null;
function logical(e) { const rc = cv.getBoundingClientRect(); return { x: (e.clientX - rc.left) / rc.width * W, y: (e.clientY - rc.top) / rc.height * H, sx: e.clientX, sy: e.clientY }; }
document.addEventListener('pointerdown', e => {
  if (st.mode !== 'play' || paused || e.target.closest('button,input,.ov')) return;
  sfx.unlock(); const p = logical(e);
  if (p.x > 540 && p.y > 600 && laneBall) { dragStart = p.sy; dragId = e.pointerId; charging = false; return; }
  touches.set(e.pointerId, p.sx < innerWidth / 2 ? 'l' : 'r'); setHeld();
});
document.addEventListener('pointermove', e => { if (dragId === e.pointerId) pull = Math.max(0, Math.min(1, (e.clientY - dragStart) / 120)); });
const up = e => { if (dragId === e.pointerId) { dragId = null; launch(); } touches.delete(e.pointerId); setHeld(); };
document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
const fb = $('fireBtn');
fb.addEventListener('pointerdown', e => { e.stopPropagation(); sfx.unlock(); charging = true; });
fb.addEventListener('pointerup', e => { e.stopPropagation(); launch(); });
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'ArrowLeft' || e.code === 'KeyZ') kb.l = true; if (e.code === 'ArrowRight' || e.code === 'KeyM' || e.code === 'Slash') kb.r = true;
  if (e.code === 'Space') { e.preventDefault(); if (st.mode === 'play' && !paused) charging = true; }
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause(); setHeld();
});
addEventListener('keyup', e => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyZ') kb.l = false; if (e.code === 'ArrowRight' || e.code === 'KeyM' || e.code === 'Slash') kb.r = false;
  if (e.code === 'Space') launch(); setHeld();
});
function togglePause() {
  if (st.mode !== 'play') return; paused = !paused; $('pause').classList.toggle('hide', !paused);
}
// ---------- Menü / Kupon ----------
function applyCoupon(inp, msg) {
  sfx.unlock();
  if (tryCoupon(inp.value)) { st.vip = true; sfx.vip(); msg.textContent = 'VIP / UNLIMITED BALLS MODE ACTIVATED'; toast('VIP / UNLIMITED BALLS\nMODE ACTIVATED', 3200); inp.value = ''; }
  else { sfx.wrong(); msg.textContent = 'Geçersiz kupon kodu.'; }
}
$('cpnGo').onclick = () => applyCoupon($('cpnIn'), $('cpnMsg'));
$('cpnGo2').onclick = () => applyCoupon($('cpnIn2'), $('cpnMsg2'));
[['cpnIn', 'cpnGo'], ['cpnIn2', 'cpnGo2']].forEach(([i, b]) => $(i).addEventListener('keydown', e => { if (e.key === 'Enter') $(b).click(); }));
function begin() { sfx.unlock(); music(true); ['menu', 'over', 'pause'].forEach(i => $(i).classList.add('hide')); paused = false; resetGame(); }
$('playBtn').onclick = begin; $('againBtn').onclick = begin;
$('pauseBtn').onclick = togglePause; $('resumeBtn').onclick = togglePause;
$('quitBtn').onclick = () => { paused = false; st.mode = 'menu'; $('pause').classList.add('hide'); $('menu').classList.remove('hide'); st.vip = isVip(); };
document.addEventListener('visibilitychange', () => { if (document.hidden && st.mode === 'play' && !paused) togglePause(); });
if (st.vip) $('cpnMsg').textContent = 'VIP modu aktif (kayıtlı)';
// Test/hata ayıklama kancası
window.__pb = { tick, draw, st: () => st, balls: () => balls, flips, begin, launch, setHeld: (l, r) => { kb.l = l; kb.r = r; setHeld(); }, charge: v => { pull = v; }, bumpers };
requestAnimationFrame(frame);
