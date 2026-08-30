import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const sourceDir = resolve(root, 'assets/beads/source');
const outDir = resolve(root, 'assets/beads/formal');
mkdirSync(outDir, { recursive: true });

// Palette and matching logic are extracted from MeTool's MARD 221 implementation.
// We intentionally preserve its weighted RGB metric and top-N colour selection.
const metool = readFileSync('/tmp/metool-pindou.js', 'utf8');
const paletteMatch = metool.match(/const no=(\[\["A1".*?\]\]),Re=/s);
if (!paletteMatch) throw new Error('Unable to locate the MARD 221 palette in MeTool bundle');
const palette = JSON.parse(paletteMatch[1]).map(([code, hex]) => {
  const value = Number.parseInt(hex.slice(1), 16);
  return { code, hex, r: value >> 16 & 255, g: value >> 8 & 255, b: value & 255 };
});

const scenes = [
  {
    id: 'chaoran-redesign', title: '大明湖 · 超然楼', file: 'chaoran-pixel-master-v2.png', width: 58, height: 58, maxColors: 24,
    vf: 'crop=1254:1254:0:0,eq=contrast=1.06:saturation=1.06,unsharp=3:3:0.35',
    focus: '五层重檐、正面对称、金色塔身与湖面倒影'
  },
  {
    id: 'baotu', title: '趵突泉 · 三股泉涌', file: 'baotu.jpg', width: 58, height: 29, maxColors: 30,
    vf: 'crop=1160:580:80:120,eq=contrast=1.10:saturation=1.16:brightness=0.015,unsharp=5:5:0.55:3:3:0.2',
    focus: '泺源堂金顶、红柱、双石碑与三股白色泉涌'
  },
  {
    id: 'chaoran', title: '大明湖 · 超然楼', file: 'chaoran.jpg', width: 29, height: 58, maxColors: 30,
    vf: 'crop=540:720:70:0,eq=contrast=1.15:saturation=1.12:brightness=0.01,unsharp=5:5:0.65:3:3:0.2',
    focus: '五层重檐、金色轮廓、红旗与深蓝夜空'
  },
  {
    id: 'heihu', title: '黑虎泉 · 三虎吐水', file: 'heihu-front.jpg', width: 58, height: 29, maxColors: 30,
    vf: 'crop=800:400:0:75,eq=contrast=1.17:saturation=1.12:brightness=0.01,unsharp=5:5:0.7:3:3:0.2',
    focus: '三只石虎头、三道白色水流、石岸与墨绿泉池'
  }
];

function distance(r, g, b, c) {
  const mean = (r + c.r) / 2;
  const dr = r - c.r, dg = g - c.g, db = b - c.b;
  return Math.sqrt((2 + mean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - mean) / 256) * db * db);
}

function nearest(r, g, b, colors) {
  let best = colors[0], score = Infinity;
  for (const color of colors) {
    const d = distance(r, g, b, color);
    if (d < score) { score = d; best = color; }
  }
  return best;
}

function xml(s) {
  return String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function renderSvg(scene, grid, counts, labelled = false) {
  const cell = labelled ? 18 : 9;
  const margin = labelled ? 48 : 0;
  const legendWidth = labelled ? 380 : 0;
  const boardWidth = scene.width * cell;
  const boardHeight = scene.height * cell;
  const width = boardWidth + margin * 2 + legendWidth;
  const height = Math.max(boardHeight + margin * 2, labelled ? 180 + counts.length * 25 : boardHeight);
  const chunks = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`, '<rect width="100%" height="100%" fill="#fffdf5"/>'];
  chunks.push(`<g transform="translate(${margin} ${margin})">`);
  for (let y = 0; y < scene.height; y++) for (let x = 0; x < scene.width; x++) {
    const color = grid[y][x];
    chunks.push(`<rect x="${x * cell}" y="${y * cell}" width="${cell}" height="${cell}" fill="${color.hex}"/>`);
    if (labelled) {
      const luminance = .299 * color.r + .587 * color.g + .114 * color.b;
      chunks.push(`<text x="${x * cell + cell / 2}" y="${y * cell + cell * .68}" text-anchor="middle" font-family="Arial,sans-serif" font-size="6.3" font-weight="700" fill="${luminance > 135 ? '#111' : '#fff'}">${color.code}</text>`);
    }
  }
  const minor = labelled ? '#00000030' : '#17201930';
  const major = '#172019b5';
  for (let i = 0; i <= scene.width; i++) {
    const stroke = i % 29 === 0 ? major : minor;
    const sw = i % 29 === 0 ? (labelled ? 3 : 2) : (labelled ? .55 : .45);
    chunks.push(`<path d="M${i * cell} 0V${boardHeight}" stroke="${stroke}" stroke-width="${sw}" fill="none"/>`);
  }
  for (let i = 0; i <= scene.height; i++) {
    const stroke = i % 29 === 0 ? major : minor;
    const sw = i % 29 === 0 ? (labelled ? 3 : 2) : (labelled ? .55 : .45);
    chunks.push(`<path d="M0 ${i * cell}H${boardWidth}" stroke="${stroke}" stroke-width="${sw}" fill="none"/>`);
  }
  chunks.push('</g>');
  if (labelled) {
    const x = boardWidth + margin * 2 + 30;
    chunks.push(`<text x="${x}" y="58" font-family="Arial,sans-serif" font-size="28" font-weight="700" fill="#172019">${xml(scene.title)}</text>`);
    chunks.push(`<text x="${x}" y="91" font-family="Arial,sans-serif" font-size="16" fill="#4b554e">${scene.width}×${scene.height} · MARD ${scene.maxColors} 色以内 · 2 块 29 格底板</text>`);
    chunks.push(`<text x="${x}" y="122" font-family="Arial,sans-serif" font-size="15" fill="#4b554e">识别点：${xml(scene.focus)}</text>`);
    chunks.push(`<text x="${x}" y="157" font-family="Arial,sans-serif" font-size="18" font-weight="700" fill="#172019">用豆统计（共 ${scene.width * scene.height} 颗）</text>`);
    counts.forEach((c, i) => {
      const y = 188 + i * 25;
      chunks.push(`<rect x="${x}" y="${y - 15}" width="18" height="18" fill="${c.hex}" stroke="#172019" stroke-width=".6"/>`);
      chunks.push(`<text x="${x + 28}" y="${y}" font-family="Arial,sans-serif" font-size="14" fill="#172019">${c.code}  ${c.count} 颗</text>`);
    });
  }
  chunks.push('</svg>');
  return chunks.join('');
}

for (const scene of scenes) {
  const input = resolve(sourceDir, scene.file);
  const prepared = resolve(outDir, `${scene.id}-prepared.png`);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', input, '-vf', `${scene.vf},scale=${scene.width}:${scene.height}:flags=lanczos`, '-frames:v', '1', prepared]);
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', prepared, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']);
  const popularity = new Map();
  for (let i = 0; i < scene.width * scene.height; i++) {
    const c = nearest(raw[i * 3], raw[i * 3 + 1], raw[i * 3 + 2], palette);
    popularity.set(c.code, (popularity.get(c.code) ?? 0) + 1);
  }
  const allowedCodes = new Set([...popularity].sort((a, b) => b[1] - a[1]).slice(0, scene.maxColors).map(([code]) => code));
  const allowed = palette.filter(c => allowedCodes.has(c.code));
  const grid = [];
  const countsMap = new Map();
  for (let y = 0; y < scene.height; y++) {
    const row = [];
    for (let x = 0; x < scene.width; x++) {
      const i = y * scene.width + x;
      const c = nearest(raw[i * 3], raw[i * 3 + 1], raw[i * 3 + 2], allowed);
      row.push(c);
      countsMap.set(c.code, (countsMap.get(c.code) ?? 0) + 1);
    }
    grid.push(row);
  }
  const counts = [...countsMap].map(([code, count]) => ({ ...palette.find(c => c.code === code), count })).sort((a, b) => b.count - a.count);
  const previewSvg = resolve(outDir, `${scene.id}-preview.svg`);
  const blueprintSvg = resolve(outDir, `${scene.id}-blueprint.svg`);
  writeFileSync(previewSvg, renderSvg(scene, grid, counts, false));
  writeFileSync(blueprintSvg, renderSvg(scene, grid, counts, true));
  writeFileSync(resolve(outDir, `${scene.id}-counts.csv`), `MARD色号,HEX,数量\n${counts.map(c => `${c.code},${c.hex},${c.count}`).join('\n')}\n`);
  writeFileSync(resolve(outDir, `${scene.id}-pattern.json`), JSON.stringify({ ...scene, palette: counts, pattern: grid.map(row => row.map(c => c.code)) }, null, 2));
  execFileSync('qlmanage', ['-t', '-s', '1200', '-o', outDir, previewSvg], { stdio: 'ignore' });
  const qlPng = `${previewSvg}.png`;
  execFileSync('mv', [qlPng, resolve(outDir, `${scene.id}-preview.png`)]);
  console.log(`${scene.title}: ${counts.length} colors, ${scene.width * scene.height} beads`);
}
