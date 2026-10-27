// Kuponlar düz metin değil, SHA-256 özeti olarak saklanır.
const HASHES = [
  '5d7c27d8dd322d31c54f444d06f2fdb3d0923794e609349ff2aef0b3774cdfad',
  'cbbb9429e652661049216f6db807fb340e103ad301d621347ac058c649b1bfbc',
  'b7dacf6e8d7080a8d73d9bba8a2235eaaf7bd15ea0ba4a7656718d98e1de1fb1'
];
const KEY = 'gkp_vip_h';
function sha256(s) {
  const K = [], H = [];
  const rr = (v, a) => (v >>> a) | (v << (32 - a));
  let p = 0, c = {};
  for (let n = 2; p < 64; n++) if (!c[n]) { for (let i = 0; i < 313; i += n) c[i] = n;
    H[p] = (Math.pow(n, .5) * 4294967296) | 0; K[p++] = (Math.pow(n, 1 / 3) * 4294967296) | 0; }
  H.length = 8;
  const b = unescape(encodeURIComponent(s)) + '\x80'; const w = [];
  for (let i = 0; i < b.length; i++) w[i >> 2] |= b.charCodeAt(i) << (24 - (i % 4) * 8);
  const len = (((b.length + 8) >> 6) + 1) << 4;
  for (let i = w.length; i < len; i++) w[i] = 0;
  w[len - 1] = (b.length - 1) * 8;
  let h = H.slice(0, 8);
  for (let j = 0; j < len; j += 16) {
    const x = w.slice(j, j + 16), o = h.slice();
    for (let i = 0; i < 64; i++) {
      if (i >= 16) { const a = x[i - 15], d = x[i - 2];
        x[i] = (x[i - 16] + (rr(a, 7) ^ rr(a, 18) ^ (a >>> 3)) + x[i - 7] + (rr(d, 17) ^ rr(d, 19) ^ (d >>> 10))) | 0; }
      const [a, b2, c2, d2, e, f, g, hh] = o;
      const t1 = (hh + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + x[i]) | 0;
      const t2 = ((rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & b2) ^ (a & c2) ^ (b2 & c2))) | 0;
      o.pop(); o.unshift((t1 + t2) | 0); o[4] = (o[4] + t1) | 0;
    }
    for (let i = 0; i < 8; i++) h[i] = (h[i] + o[i]) | 0;
  }
  return h.map(v => (v >>> 0).toString(16).padStart(8, '0')).join('');
}
export const hashOf = c => sha256(c.trim().toUpperCase());
export function isVip() {
  try { return HASHES.includes(localStorage.getItem(KEY)); } catch (e) { return false; }
}
export function tryCoupon(code) {
  const h = hashOf(code || '');
  if (!code || !HASHES.includes(h)) return false;
  try { localStorage.setItem(KEY, h); } catch (e) {}
  return true;
}
