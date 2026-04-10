/**
 * generate-og-pms.mjs
 * Creates og-pms-screener.png (1200×630) using canvas + the real logo
 * Run with: node scripts/generate-og-pms.mjs
 */
import { createCanvas, loadImage } from 'canvas';
import { writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const W = 1200, H = 630;
const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');

// ── Palette ─────────────────────────────────────────────────────────────────
const C = {
  bg:       '#0c1e0d',
  bgDark:   '#081508',
  panel:    '#111f12',
  panelB:   '#162018',
  green1:   '#1b5e20',
  green2:   '#43a047',
  green3:   '#81c784',
  greenXL:  '#c8e6c9',
  accent:   '#69f0ae',
  white:    '#f0f4f0',
  muted:    '#5a8a5a',
  mutedL:   '#3d6e3d',
  badge:    '#1b4d1e',
  badgeB:   '#2e7d32',
  neg:      '#ef5350',
  strip:    '#060d06',
};

// ── Background ───────────────────────────────────────────────────────────────
const bgGrad = ctx.createLinearGradient(0, 0, W, H);
bgGrad.addColorStop(0, '#0d200e');
bgGrad.addColorStop(0.6, '#0a1a0b');
bgGrad.addColorStop(1, '#061006');
ctx.fillStyle = bgGrad;
ctx.fillRect(0, 0, W, H);

// Subtle grid lines
ctx.strokeStyle = 'rgba(30,70,30,0.35)';
ctx.lineWidth = 0.5;
for (let x = 0; x < W; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
for (let y = 0; y < H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

// Left accent bar
const accentGrad = ctx.createLinearGradient(0, 0, 0, H);
accentGrad.addColorStop(0, C.accent);
accentGrad.addColorStop(0.5, C.green2);
accentGrad.addColorStop(1, 'transparent');
ctx.fillStyle = accentGrad;
ctx.fillRect(0, 0, 4, H);

// ── Load real logo ──────────────────────────────────────────────────────────
let logo;
try {
  logo = await loadImage(path.join(ROOT, 'public', 'logo-512.png'));
} catch {
  logo = null;
}

// ── LEFT SECTION (0–460px) ──────────────────────────────────────────────────
const PAD = 42;

// Logo (real, high-res)
if (logo) {
  // Tint white by drawing on a temp canvas
  const tmpC = createCanvas(100, 100);
  const tmpX = tmpC.getContext('2d');
  tmpX.drawImage(logo, 0, 0, 100, 100);
  ctx.globalAlpha = 0.92;
  ctx.drawImage(logo, PAD, PAD, 88, 88);
  ctx.globalAlpha = 1.0;
} else {
  ctx.fillStyle = C.green2;
  ctx.beginPath(); ctx.arc(PAD + 40, PAD + 40, 36, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.white; ctx.font = 'bold 28px sans-serif'; ctx.fillText('A', PAD + 27, PAD + 54);
}

// Brand text right of logo
ctx.fillStyle = C.white;
ctx.font = 'bold 20px sans-serif';
ctx.fillText('Abundance', PAD + 100, PAD + 38);
ctx.fillStyle = C.muted;
ctx.font = '13px sans-serif';
ctx.fillText('Financial Services', PAD + 100, PAD + 58);

// Compliance line
ctx.fillStyle = C.mutedL;
ctx.font = '11px monospace';
ctx.fillText('ARN-251838  ·  APRN04279  ·  APMI Registered', PAD + 100, PAD + 80);

// Divider
ctx.strokeStyle = C.green1;
ctx.lineWidth = 1;
ctx.globalAlpha = 0.4;
ctx.beginPath(); ctx.moveTo(PAD, PAD + 106); ctx.lineTo(450, PAD + 106); ctx.stroke();
ctx.globalAlpha = 1;

// Eyebrow
ctx.fillStyle = C.green3;
ctx.font = '11px monospace';
ctx.fillText('[ LIVE APMI DATA  ·  APMI REGISTERED  ·  FEB 2026 ]', PAD, 172);

// Big headline
ctx.font = 'bold 96px sans-serif';
ctx.fillStyle = C.white;
ctx.fillText('PMS', PAD, 278);

ctx.font = 'bold 96px sans-serif';
ctx.fillStyle = C.green2;
ctx.fillText('Screener', PAD, 378);

// Subtitle
ctx.fillStyle = '#a5c8a5';
ctx.font = 'italic 16px sans-serif';
ctx.fillText("India's HNI Investment Intelligence Platform", PAD, 410);

// Pill tags
const tags = ['1M–Inception Returns', 'AUM Trends', 'Alpha vs Nifty', 'Wealth Simulation'];
let tx = PAD, ty = 440;
const pillH = 26, pillR = 13, pillPad = 12;
ctx.font = '11px sans-serif';
for (const tag of tags) {
  const tw = ctx.measureText(tag).width + pillPad * 2;
  if (tx + tw > 455) { tx = PAD; ty += 34; }
  ctx.strokeStyle = C.green2;
  ctx.lineWidth = 1;
  ctx.fillStyle = 'rgba(43,100,43,0.25)';
  ctx.beginPath();
  ctx.roundRect(tx, ty, tw, pillH, pillR);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.greenXL;
  ctx.fillText(tag, tx + pillPad, ty + 17);
  tx += tw + 8;
}

// ── CENTER PANEL (470–780px) ─────────────────────────────────────────────────
const CP = 472, CW = 310;
ctx.fillStyle = C.panelB;
ctx.beginPath(); ctx.roundRect(CP, 32, CW, H - 80, 10); ctx.fill();
ctx.strokeStyle = C.green1;
ctx.lineWidth = 1;
ctx.globalAlpha = 0.5;
ctx.beginPath(); ctx.roundRect(CP, 32, CW, H - 80, 10); ctx.stroke();
ctx.globalAlpha = 1;

// Panel header
ctx.fillStyle = C.green3;
ctx.font = 'bold 10px monospace';
ctx.fillText('▲ TOP PERFORMERS — 1Y RETURN', CP + 16, 60);

ctx.strokeStyle = C.green1; ctx.lineWidth = 0.5; ctx.globalAlpha = 0.4;
ctx.beginPath(); ctx.moveTo(CP + 12, 68); ctx.lineTo(CP + CW - 12, 68); ctx.stroke();
ctx.globalAlpha = 1;

const performers = [
  { name: 'Aequitas India Opps',    ret: '+61.8%', color: '#69f0ae' },
  { name: 'Dwaith – Concentrated',  ret: '+53.6%', color: '#a5d6a7' },
  { name: 'Alchemy High Growth',    ret: '+46.8%', color: '#c8e6c9' },
  { name: 'QODE All Weather',       ret: '+46.4%', color: '#c8e6c9' },
];

performers.forEach((p, i) => {
  const rowY = 86 + i * 116;
  const rank = ['🥇', '🥈', '🥉', '④'][i];

  // Rank chip
  ctx.fillStyle = C.badge;
  ctx.beginPath(); ctx.roundRect(CP + 12, rowY, 26, 18, 4); ctx.fill();
  ctx.fillStyle = C.green3; ctx.font = 'bold 9px monospace';
  ctx.fillText(`#${i + 1}`, CP + 18, rowY + 13);

  // Name
  ctx.fillStyle = C.white; ctx.font = 'bold 13px sans-serif';
  ctx.fillText(p.name, CP + 44, rowY + 13);

  // Return badge
  ctx.fillStyle = p.color;
  ctx.font = 'bold 15px monospace';
  const retW = ctx.measureText(p.ret).width;
  ctx.fillText(p.ret, CP + CW - retW - 14, rowY + 13);

  // Mini bar
  const barW = (parseFloat(p.ret) / 65) * (CW - 28);
  ctx.fillStyle = 'rgba(27,94,32,0.3)';
  ctx.beginPath(); ctx.roundRect(CP + 12, rowY + 22, CW - 28, 8, 4); ctx.fill();
  const bGrad = ctx.createLinearGradient(CP + 12, 0, CP + 12 + barW, 0);
  bGrad.addColorStop(0, C.green1); bGrad.addColorStop(1, p.color);
  ctx.fillStyle = bGrad;
  ctx.beginPath(); ctx.roundRect(CP + 12, rowY + 22, barW, 8, 4); ctx.fill();

  // AUM tag
  ctx.fillStyle = C.mutedL; ctx.font = '10px monospace';
  ctx.fillText(['₹4,457 Cr', '₹158 Cr', '₹755 Cr', '₹147 Cr'][i], CP + 12, rowY + 44);
});

// ── RIGHT PANEL (800–1158px) ─────────────────────────────────────────────────
const RP = 800, RW = 372;
ctx.fillStyle = C.bgDark;
ctx.beginPath(); ctx.roundRect(RP, 32, RW - 14, H - 80, 10); ctx.fill();

ctx.fillStyle = C.green3; ctx.font = 'bold 10px monospace';
ctx.fillText('━━━ LIVE MARKET STATS', RP + 16, 58);

const stats = [
  { num: '957',      label: 'Total Strategies', sub: 'Filtered: 957 visible', color: C.accent },
  { num: '13.7%',    label: 'Avg 1Y Return',    sub: 'Across Equity strategies', color: C.green3 },
  { num: '240',      label: 'Beat Nifty 50',    sub: 'vs 18.5% benchmark 1Y', color: C.green3 },
  { num: '₹403K Cr', label: 'Combined AUM',     sub: 'Under management', color: C.greenXL },
];

stats.forEach((s, i) => {
  const sy = 76 + i * 126;

  // Divider
  if (i > 0) {
    ctx.strokeStyle = C.green1; ctx.lineWidth = 0.5; ctx.globalAlpha = 0.3;
    ctx.beginPath(); ctx.moveTo(RP + 12, sy - 10); ctx.lineTo(RP + RW - 26, sy - 10); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = s.color;
  ctx.font = `bold ${i === 3 ? '28' : '34'}px monospace`;
  ctx.fillText(s.num, RP + 16, sy + 36);

  ctx.fillStyle = C.white; ctx.font = 'bold 13px sans-serif';
  ctx.fillText(s.label, RP + 16, sy + 56);

  ctx.fillStyle = C.mutedL; ctx.font = '10px sans-serif';
  ctx.fillText(s.sub, RP + 16, sy + 72);
});

// Circuit decoration bottom-right
ctx.strokeStyle = C.green1; ctx.lineWidth = 1; ctx.globalAlpha = 0.3;
const cx = RP + RW - 60, cy = H - 90;
// Draw simple circuit traces
[[0,0,60,0],[60,0,60,-30],[60,-30,100,-30],[100,-30,100,-60],[60,-30,60,-60],[0,0,0,-20]].forEach(([x1,y1,x2,y2]) => {
  ctx.beginPath(); ctx.moveTo(cx+x1, cy+y1); ctx.lineTo(cx+x2, cy+y2); ctx.stroke();
});
[[60,0],[100,-30],[0,0]].forEach(([dx,dy]) => {
  ctx.beginPath(); ctx.arc(cx+dx, cy+dy, 3, 0, Math.PI*2); ctx.fill();
});
ctx.globalAlpha = 1;

// ── BOTTOM STRIP ─────────────────────────────────────────────────────────────
ctx.fillStyle = C.strip;
ctx.fillRect(0, H - 46, W, 46);

ctx.strokeStyle = C.green2;
ctx.lineWidth = 1; ctx.globalAlpha = 0.5;
ctx.beginPath(); ctx.moveTo(0, H - 46); ctx.lineTo(W, H - 46); ctx.stroke();
ctx.globalAlpha = 1;

ctx.fillStyle = C.mutedL;
ctx.font = '11px monospace';
ctx.fillText('Abundance Financial Services  |  APMI Registered  |  APRN04279', PAD, H - 20);
ctx.font = '11px monospace';
const urlText = 'mfcalc.getabundance.in/pms-screener';
const urlW = ctx.measureText(urlText).width;
ctx.fillText(urlText, (W - urlW) / 2, H - 20);
ctx.fillText('Equity · Debt · Hybrid · Multi Asset', W - 240, H - 20);

// ── Output ───────────────────────────────────────────────────────────────────
const outPath = path.join(ROOT, 'public', 'og-pms-screener.png');
writeFileSync(outPath, canvas.toBuffer('image/png'));
console.log(`✅ Written ${W}×${H} OG image to: ${outPath}`);
