// Reel builder: Chromium draws every frame from a pure function of time, then
// ffmpeg muxes the frames with a royalty-free track. No AI video model, no
// screen recording - the output is deterministic and always in brand.

import { readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { ROOT } from './store.mjs';

const run = promisify(execFile);

export const REEL = { w: 1080, h: 1920, fps: 30, duration: 10 };
const MUSIC_DIR = path.join(ROOT, 'templates', 'music');

let assets = null;
async function loadAssets() {
  if (assets) return assets;
  const [tpl, font] = await Promise.all([
    readFile(path.join(ROOT, 'templates', 'reel.html'), 'utf8'),
    readFile(path.join(ROOT, 'templates', 'fonts', 'Manrope.woff2')).then(b => b.toString('base64'))
  ]);
  let logo = '';
  try { logo = 'data:image/png;base64,' + (await readFile(path.join(ROOT, 'templates', 'logo.png'))).toString('base64'); }
  catch { /* falls back to the wordmark */ }
  assets = { tpl, font, logo };
  return assets;
}

export async function musicTracks() {
  try {
    const files = (await readdir(MUSIC_DIR)).filter(f => /\.(mp3|m4a|aac|wav)$/i.test(f)).sort();
    const usable = [];
    for (const f of files) {
      // a track shorter than the reel would cut the video short via -shortest
      const d = await trackDuration(path.join(MUSIC_DIR, f)).catch(() => 0);
      if (d >= REEL.duration + 0.5) usable.push(f);
      else console.warn("  skipping " + f + ": only " + d.toFixed(1) + "s, shorter than the reel");
    }
    return usable;
  } catch { return []; }
}

async function trackDuration(file) {
  const { stdout } = await run('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', file
  ]);
  return Number(stdout.trim()) || 0;
}

/** Capture every frame, then encode. Returns the output path. */
export async function renderReel(page, { photoB64, copy, brand, musicFile, outPath, workDir }) {
  const { tpl, font, logo } = await loadAssets();
  const b = brand.business;

  const data = {
    duration: REEL.duration,
    photoSrc: 'data:image/jpeg;base64,' + photoB64,
    logoSrc: logo,
    name: b.name,
    city: `${b.city}, ${b.state}`,
    chip: copy.chip,
    eyebrow: copy.eyebrow,
    headline: copy.headline,
    sub: copy.sub,
    cta: copy.cta,
    footer: copy.footer
  };

  const html = tpl
    .replace('__FONT_B64__', font)
    .replace('/*__DATA__*/ null', JSON.stringify(data));

  const frames = path.join(workDir, 'frames');
  await rm(frames, { recursive: true, force: true });
  await mkdir(frames, { recursive: true });

  await page.setViewportSize({ width: REEL.w, height: REEL.h });
  await page.goto('about:blank');
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForFunction('window.__READY__ === true', null, { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => new Promise(r => {
    const img = document.getElementById('bg');
    if (!img || img.complete) return r();
    img.onload = img.onerror = () => r();
  }));

  const total = REEL.fps * REEL.duration;
  for (let i = 0; i < total; i++) {
    const t = i / REEL.fps;
    await page.evaluate(time => window.__seek(time), t);
    const shot = await page.screenshot({ type: 'jpeg', quality: 88 });
    await writeFile(path.join(frames, `${String(i).padStart(4, '0')}.jpg`), shot);
  }

  const args = ['-y', '-hide_banner', '-loglevel', 'error',
    '-framerate', String(REEL.fps), '-i', path.join(frames, '%04d.jpg')];

  if (musicFile) {
    const full = path.join(MUSIC_DIR, musicFile);
    const len = await trackDuration(full);
    // start somewhere past the intro so different reels do not all sound alike
    const offset = len > REEL.duration + 12 ? Math.min(len - REEL.duration - 2, 8 + (len % 17)) : 0;
    args.push('-ss', offset.toFixed(2), '-i', full,
      '-af', `afade=t=in:st=0:d=0.4,afade=t=out:st=${REEL.duration - 1.2}:d=1.2`,
      '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-ac', '2');
  }

  args.push(
    '-t', String(REEL.duration),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
    '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.1',
    '-movflags', '+faststart', '-shortest', outPath
  );

  await run('ffmpeg', args);
  await rm(frames, { recursive: true, force: true });
  return outPath;
}

/** A 1080x1920 still for the reel thumbnail, taken from the settled frame. */
export async function reelCover(page, outPath) {
  await page.evaluate(() => window.__seek(6.5));
  const shot = await page.screenshot({ type: 'jpeg', quality: 92 });
  await writeFile(outPath, shot);
  return outPath;
}
