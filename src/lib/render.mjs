// HTML/CSS -> JPEG via headless Chromium. The AI model never renders text;
// all copy is typeset here so it is always crisp, aligned and on-brand.

import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEMPLATE = path.join(ROOT, 'templates', 'post.html');
const FONT = path.join(ROOT, 'templates', 'fonts', 'Manrope.woff2');
const LOGO = path.join(ROOT, 'templates', 'logo.png');

export const SIZES = {
  feed:   { w: 1080, h: 1350 },  // Instagram + Facebook (4:5)
  square: { w: 1080, h: 1080 }   // Google Business Profile
};

let cached = null;
async function assets() {
  if (cached) return cached;
  const [tpl, font] = await Promise.all([
    readFile(TEMPLATE, 'utf8'),
    readFile(FONT).then(b => b.toString('base64'))
  ]);
  let logo = '';
  try {
    logo = 'data:image/png;base64,' + (await readFile(LOGO)).toString('base64');
  } catch { /* template falls back to the wordmark alone */ }
  cached = { tpl, font, logo };
  return cached;
}

export async function withBrowser(fn) {
  const browser = await chromium.launch({ args: ['--font-render-hinting=none', '--force-color-profile=srgb'] });
  try {
    const context = await browser.newContext({ deviceScaleFactor: 1 });
    const page = await context.newPage();
    return await fn(page);
  } finally {
    await browser.close();
  }
}

/** @returns {Promise<Buffer>} JPEG bytes */
export async function renderPost(page, { imageB64, layout, size, copy }) {
  const { tpl, font, logo } = await assets();
  const data = {
    size,
    layout,
    imageSrc: 'data:image/jpeg;base64,' + imageB64,
    logoSrc: logo,
    eyebrow: copy.eyebrow,
    kicker: copy.kicker,
    chip: copy.chip,
    headline: copy.headline,
    sub: copy.sub,
    cta: copy.cta,
    footer: copy.footer
  };

  const html = tpl
    .replace('__FONT_B64__', font)
    .replace('/*__DATA__*/ null', JSON.stringify(data));

  await page.setViewportSize({ width: size.w, height: size.h });
  await page.goto('about:blank');   // guarantees a clean JS context per render
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForFunction('window.__READY__ === true', null, { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => new Promise(r => {
    const img = document.getElementById('bg');
    if (!img || img.complete) return r();
    img.onload = img.onerror = () => r();
  }));

  const el = await page.$('#canvas');
  return await el.screenshot({ type: 'jpeg', quality: 92 });
}

/**
 * 64-bit perceptual hash (DCT) of the raw AI photo, used to reject
 * anything that looks like an image we have already published.
 */
export async function photoHash(page, imageB64) {
  await page.setContent('<body></body>');
  return await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/jpeg;base64,' + b64;
    await img.decode();

    const N = 32;
    const c = document.createElement('canvas');
    c.width = N; c.height = N;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, N, N);
    const d = ctx.getImageData(0, 0, N, N).data;

    const g = new Float64Array(N * N);
    for (let i = 0; i < N * N; i++) {
      g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    }

    const cos = new Float64Array(N * N);
    for (let x = 0; x < N; x++)
      for (let u = 0; u < N; u++)
        cos[x * N + u] = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N));

    const rows = new Float64Array(N * N);
    for (let y = 0; y < N; y++)
      for (let u = 0; u < N; u++) {
        let s = 0;
        for (let x = 0; x < N; x++) s += g[y * N + x] * cos[x * N + u];
        rows[y * N + u] = s;
      }
    const dct = new Float64Array(8 * 8);
    for (let v = 0; v < 8; v++)
      for (let u = 0; u < 8; u++) {
        let s = 0;
        for (let y = 0; y < N; y++) s += rows[y * N + u] * cos[y * N + v];
        dct[v * 8 + u] = s;
      }

    const vals = Array.from(dct).slice(1);
    const sorted = vals.slice().sort((a, b) => a - b);
    const median = (sorted[31] + sorted[32]) / 2;

    let bits = '';
    for (let i = 0; i < 64; i++) bits += (dct[i] > median ? '1' : '0');
    let hex = '';
    for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
    return hex;
  }, imageB64);
}

export function hammingDistance(a = '', b = '') {
  if (a.length !== b.length) return 64;
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) { dist += x & 1; x >>= 1; }
  }
  return dist;
}

/**
 * A small copy of the photo, for the vision guard only. Vision models bill by
 * image tokens, so sending a 1024px JPEG to check for lettering cost about as
 * much as generating the image. 448px is still ample to spot writing a viewer
 * would read, and costs a fraction.
 */
export async function downscale(page, imageB64, maxDim = 448, quality = 70) {
  await page.setContent('<body></body>');
  return await page.evaluate(async ({ b64, maxDim, quality }) => {
    const img = new Image();
    img.src = 'data:image/jpeg;base64,' + b64;
    await img.decode();
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', quality / 100).split(',')[1];
  }, { b64: imageB64, maxDim, quality });
}
