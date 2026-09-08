#!/usr/bin/env node
// Builds the month's reels: its own photos, its own copy, rendered to MP4 with
// a royalty-free track. Runs separately from the image pipeline so neither can
// time the other out.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { generateImage, DailyQuotaExhausted, chargeNeurons, neuronsUsed, budgetLeft, GUARD_NEURONS_ESTIMATE, BUDGET } from './lib/cloudflare.mjs';
import { hasVisibleText } from './lib/guard.mjs';
import { photoHash, hammingDistance, downscale } from './lib/render.mjs';
import { renderReel, musicTracks, REEL } from './lib/video.mjs';
import { buildPost, serviceSequence } from './lib/compose.mjs';
import { monthSlots, targetMonth } from './lib/schedule.mjs';
import { mulberry32, hashString } from './lib/random.mjs';
import { ROOT, POSTS, loadHistory, saveHistory, loadPlan, savePlan, findIncompleteMonth } from './lib/store.mjs';

const REEL_HOUR = Number(process.env.REEL_HOUR || 20);   // 8:00 PM America/New_York
const HASH_MIN_DISTANCE = 12;
const MAX_IMAGE_ATTEMPTS = 3;
const PACE_MS = Number(process.env.PACE_MS || 2500);
// Reels reuse the raw photos the image pipeline already generated. Set
// REEL_FRESH_PHOTOS=1 to spend neurons on new ones instead.
const REUSE_PHOTOS = process.env.REEL_FRESH_PHOTOS !== '1';
const PHOTO_OFFSET = Number(process.env.REEL_PHOTO_OFFSET || 14);

const force = process.argv.includes('--force');
const limitArg = process.argv.find(a => a.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : Infinity;

const brand = JSON.parse(await readFile(path.join(ROOT, 'brand.json'), 'utf8'));
let { year, month, key: baseKey } = targetMonth();

if (!process.env.MONTH) {
  const pending = await findIncompleteMonth('-reels');
  if (pending) {
    ({ year, month } = pending);
    baseKey = pending.key.replace('-reels', '');
    console.log(`Resuming reels for ${baseKey}: ${pending.done}/${pending.days} done.`);
  } else {
    const now = new Date();
    const curKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const remaining = monthSlots(now.getUTCFullYear(), now.getUTCMonth() + 1, REEL_HOUR)
      .filter(s => new Date(s.dueAt).getTime() > Date.now()).length;
    if (remaining >= 3 && !(await loadPlan(`${curKey}-reels`))) {
      year = now.getUTCFullYear(); month = now.getUTCMonth() + 1; baseKey = curKey;
    }
  }
}

const planKey = `${baseKey}-reels`;
const slots = monthSlots(year, month, REEL_HOUR);
const existing = await loadPlan(planKey);
if (existing && existing.posts.length >= slots.length && !force) {
  console.log(`${planKey} is already complete (${existing.posts.length} reels). Nothing to do.`);
  process.exit(0);
}

const tracks = await musicTracks();
if (!tracks.length) {
  console.error('No music in templates/music - add royalty-free mp3 files first.');
  process.exit(1);
}

const done = force ? new Map() : new Map((existing?.posts ?? []).map(p => [p.day, p]));
if (done.size) console.log(`Resuming: ${done.size} reel(s) already rendered.`);

const history = await loadHistory();
const rng = mulberry32(hashString('reel-sequence|' + planKey));
const sequence = serviceSequence(rng, slots.length, brand.services.map(s => s.id));

const planned = slots.map((slot, i) =>
  buildPost({ monthKey: planKey, slot, index: i, serviceId: sequence[i], brand, salt: 'reel' }));

// map each reel day to a photo from a distant day of the same month
const imagePlan = await loadPlan(baseKey);
const photoByDay = new Map((imagePlan?.posts ?? [])
  .filter(p => p.images?.photo)
  .map(p => [p.day, p.images.photo]));

function reusablePhoto(day) {
  if (!REUSE_PHOTOS || !photoByDay.size) return null;
  const days = [...photoByDay.keys()].sort((a, b) => a - b);
  const wanted = ((day - 1 + PHOTO_OFFSET) % days.length);
  for (let i = 0; i < days.length; i++) {
    const candidate = days[(wanted + i) % days.length];
    if (candidate !== day) return photoByDay.get(candidate);
  }
  return null;
}

const outDir = path.join(POSTS, planKey);
const work = path.join(ROOT, '.tmp-reel');
await mkdir(outDir, { recursive: true });
await mkdir(work, { recursive: true });

const results = [...done.values()];
const toRender = planned.filter(p => !done.has(p.day)).slice(0, limit);
console.log(`Building ${toRender.length} reel(s) for ${baseKey} at ${REEL_HOUR}:00 America/New_York.`);
console.log(REUSE_PHOTOS && photoByDay.size
  ? `Reusing ${photoByDay.size} existing photos - no image generation needed.`
  : 'Generating fresh photos for each reel.');

let quotaHit = false;
let budgetStop = false;
const browser = await chromium.launch({ args: ['--font-render-hinting=none', '--force-color-profile=srgb'] });
const page = await (await browser.newContext({ deviceScaleFactor: 1 })).newPage();

for (const post of toRender) {
  if (quotaHit) break;
  if (budgetLeft() < 200) { quotaHit = true; budgetStop = true; break; }
  const dayId = String(post.day).padStart(2, '0');

  let photoB64 = null, hash = null;

  const reuse = reusablePhoto(post.day);
  if (reuse) {
    try {
      photoB64 = (await readFile(path.join(ROOT, reuse))).toString('base64');
      hash = await photoHash(page, photoB64);
    } catch {
      photoB64 = null;
    }
  }

  for (let a = 0; photoB64 === null && a < MAX_IMAGE_ATTEMPTS; a++) {
    let b64;
    try { b64 = await generateImage(post.prompt, { variation: a }); }
    catch (err) { if (err instanceof DailyQuotaExhausted) { quotaHit = true; break; } throw err; }

    const h = await photoHash(page, b64);
    photoB64 = b64; hash = h;

    const small = await downscale(page, b64);
    const text = await hasVisibleText(small);
    if (text.checked) chargeNeurons(GUARD_NEURONS_ESTIMATE);
    if (text.checked && text.hasText && a < MAX_IMAGE_ATTEMPTS - 1) {
      console.log(`  day ${dayId}: lettering in the photo, regenerating`);
      continue;
    }
    if (!history.hashes.find(prev => hammingDistance(prev.hash, h) < HASH_MIN_DISTANCE)) break;
    console.log(`  day ${dayId}: too similar to an earlier photo, regenerating`);
  }
  if (quotaHit || !photoB64) break;

  const track = tracks[hashString(planKey + dayId) % tracks.length];
  const rel = `posts/${planKey}/day${dayId}.mp4`;
  await renderReel(page, {
    photoB64, copy: post.copy, brand,
    musicFile: track, outPath: path.join(ROOT, rel), workDir: work
  });

  history.combos[post.comboId] = planKey;
  history.headlines[post.copy.headline.join(' ')] = new Date().toISOString();
  history.hashes.push({ hash, ref: `${planKey}/day${dayId}` });

  results.push({
    day: post.day, dueAt: post.dueAt, localLabel: post.localLabel,
    kind: 'reel', serviceId: post.serviceId, comboId: post.comboId, hash, track,
    video: rel, copy: post.copy, hashtags: post.hashtags, captions: post.captions
  });

  results.sort((a, b) => a.day - b.day);
  await savePlan(planKey, {
    month: baseKey, kind: 'reel', timezone: 'America/New_York',
    postTime: `${String(REEL_HOUR).padStart(2, '0')}:00`,
    generatedAt: new Date().toISOString(), posts: results
  });
  await saveHistory(history);
  await writeReelSheet(planKey, {
    month: baseKey, postTime: `${String(REEL_HOUR).padStart(2, '0')}:00`, posts: results
  });

  console.log(`  ${post.localLabel}  ${post.serviceId.padEnd(9)} "${post.copy.headline.join(' ')}"  ${track.slice(0, 24)}`);
  await new Promise(r => setTimeout(r, PACE_MS));
}

await browser.close();

console.log(`\nEstimated spend this run: ~${neuronsUsed()} neurons (budget ${BUDGET}, daily free allowance 10,000).`);
if (quotaHit) {
  console.log(budgetStop
    ? `\nStopped at the budget: ${results.length}/${slots.length} reels done.`
    : `\nStopped early: ${results.length}/${slots.length} reels done. The Cloudflare allowance is spent.`);
  console.log('Everything rendered so far is saved; the next run resumes from here.');
} else {
  console.log(`\nDone. ${results.length}/${slots.length} reels in posts/${planKey}/`);
}

/** A page to watch the month's reels, mirroring the image review sheet. */
async function writeReelSheet(planKey, plan) {
  const cards = plan.posts.map(p => {
    const id = String(p.day).padStart(2, '0');
    const caption = (p.captions?.social ?? '').replace(/[<&]/g, c => (c === '<' ? '&lt;' : '&amp;'));
    return `
    <figure>
      <video controls preload="metadata" playsinline src="day${id}.mp4"></video>
      <figcaption>
        <b>${p.localLabel}</b> · ${p.serviceId}
        <p>${p.copy.headline.join(' ')}</p>
        <small>${(p.track ?? '').replace(/\.mp3$/, '')}</small>
        <details><summary>caption</summary><pre>${caption}</pre></details>
      </figcaption>
    </figure>`;
  }).join('');

  const html = `<meta charset="utf-8"><title>Mody ${planKey} reels</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
 body{font:14px/1.5 system-ui,sans-serif;background:#0b1218;color:#e6eef5;margin:0;padding:32px}
 h1{font-size:22px;margin:0 0 4px} .sub{color:#8fa6b8;margin-bottom:24px}
 .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:20px}
 figure{margin:0;background:#111c25;border:1px solid #1e2c38;border-radius:14px;overflow:hidden}
 video{width:100%;display:block;background:#000;aspect-ratio:9/16}
 figcaption{padding:12px 14px;font-size:12px;color:#9fb4c6}
 figcaption b{color:#00ccf9} figcaption p{color:#fff;font-size:14px;margin:6px 0}
 small{color:#6d8497;font-size:11px}
 pre{white-space:pre-wrap;font-size:11px;color:#8fa6b8;background:#0b1218;padding:10px;border-radius:8px}
</style>
<h1>Mody Car Wash — reels — ${plan.month}</h1>
<div class="sub">${plan.posts.length} reels · ${plan.postTime} America/New_York · 1080×1920 · 10s</div>
<div class="grid">${cards}</div>`;

  await writeFile(path.join(POSTS, planKey, 'index.html'), html);
}
