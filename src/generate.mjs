#!/usr/bin/env node
// THE MONTHLY BUTTON.
// Generates one month of unique images + copy, renders them, and writes a plan
// that topup.mjs feeds into Buffer day by day.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { generateImage } from './lib/cloudflare.mjs';
import { hasVisibleText, guardStatus } from './lib/guard.mjs';
import { withBrowser, renderPost, photoHash, hammingDistance, SIZES } from './lib/render.mjs';
import { buildPost, serviceSequence } from './lib/compose.mjs';
import { monthSlots, targetMonth } from './lib/schedule.mjs';
import { mulberry32, hashString } from './lib/random.mjs';
import { ROOT, POSTS, loadHistory, saveHistory, loadPlan, savePlan } from './lib/store.mjs';

const HASH_MIN_DISTANCE = 12;   // below this two photos are "too similar"
const MAX_IMAGE_ATTEMPTS = 4;
const MAX_COMBO_ATTEMPTS = 12;

const force = process.argv.includes('--force');
const dry = process.argv.includes('--dry-run');

const brand = JSON.parse(await readFile(path.join(ROOT, 'brand.json'), 'utf8'));
const { year, month, key: monthKey } = targetMonth();

const existing = await loadPlan(monthKey);
if (existing && !force) {
  console.error(`A plan for ${monthKey} already exists (${existing.posts.length} posts).`);
  console.error('Re-running would replace it. Pass --force if that is what you want.');
  process.exit(1);
}

const history = await loadHistory();
const slots = monthSlots(year, month);
const rng = mulberry32(hashString('sequence|' + monthKey));
const services = brand.services.map(s => s.id);
const sequence = serviceSequence(rng, slots.length, services);

console.log(`Planning ${monthKey}: ${slots.length} posts, 10:00 AM America/New_York.`);

// ---- 1. pick a non-repeating combo + copy for every day --------------------
const planned = [];
for (const [i, slot] of slots.entries()) {
  const serviceId = sequence[i];
  let post = null;
  for (let attempt = 0; attempt < MAX_COMBO_ATTEMPTS; attempt++) {
    const candidate = buildPost({ monthKey, slot, index: i, serviceId, brand, salt: String(attempt) });
    const headlineKey = candidate.copy.headline.join(' ');
    const comboUsed = history.combos[candidate.comboId];
    const headlineUsed = history.headlines[headlineKey];
    const headlineRecent = headlineUsed && (Date.now() - new Date(headlineUsed).getTime()) < 1000 * 60 * 60 * 24 * 120;
    if (!comboUsed && !headlineRecent) { post = candidate; break; }
    post = post ?? candidate;   // keep the last one as a fallback
    if (!comboUsed) break;
  }
  planned.push(post);
}
console.log(`Selected ${planned.length} unique combinations.`);

if (dry) {
  for (const p of planned) {
    console.log(`  ${p.localLabel}  ${p.serviceId.padEnd(9)} ${p.layout.padEnd(6)} "${p.copy.headline.join(' ')}"`);
  }
  process.exit(0);
}

// ---- 2. generate the photo, dedupe it, typeset the design -----------------
const outDir = path.join(POSTS, monthKey);
await mkdir(outDir, { recursive: true });

const results = [];
await withBrowser(async (page) => {
  for (const post of planned) {
    const dayId = String(post.day).padStart(2, '0');
    let imageB64 = null, hash = null, attempts = 0;

    for (let a = 0; a < MAX_IMAGE_ATTEMPTS; a++) {
      attempts = a + 1;
      const b64 = await generateImage(post.prompt, { variation: a });
      const h = await photoHash(page, b64);

      const text = await hasVisibleText(b64);
      if (text.checked && text.hasText && a < MAX_IMAGE_ATTEMPTS - 1) {
        console.log(`  day ${dayId}: the model rendered lettering into the photo, regenerating`);
        imageB64 = b64; hash = h;
        continue;
      }

      const clash = history.hashes.find(prev => hammingDistance(prev.hash, h) < HASH_MIN_DISTANCE);
      if (!clash) { imageB64 = b64; hash = h; break; }
      console.log(`  day ${dayId}: too similar to ${clash.ref} (distance ${hammingDistance(clash.hash, h)}), regenerating`);
      imageB64 = b64; hash = h;   // keep the last attempt rather than failing the run
    }

    const feed = await renderPost(page, { imageB64, layout: post.layout, size: SIZES.feed, copy: post.copy });
    const square = await renderPost(page, { imageB64, layout: post.layout, size: SIZES.square, copy: post.copy });

    const relFeed = `posts/${monthKey}/day${dayId}-feed.jpg`;
    const relSquare = `posts/${monthKey}/day${dayId}-gbp.jpg`;
    await writeFile(path.join(ROOT, relFeed), feed);
    await writeFile(path.join(ROOT, relSquare), square);

    history.combos[post.comboId] = monthKey;
    history.headlines[post.copy.headline.join(' ')] = new Date().toISOString();
    history.hashes.push({ hash, ref: `${monthKey}/day${dayId}` });

    results.push({
      day: post.day,
      dueAt: post.dueAt,
      localLabel: post.localLabel,
      serviceId: post.serviceId,
      layout: post.layout,
      comboId: post.comboId,
      hash,
      attempts,
      images: { feed: relFeed, square: relSquare },
      copy: post.copy,
      hashtags: post.hashtags,
      captions: post.captions
    });

    console.log(`  ${post.localLabel}  ${post.serviceId.padEnd(9)} ${post.layout.padEnd(6)} "${post.copy.headline.join(' ')}"${attempts > 1 ? `  (${attempts} tries)` : ''}`);
  }
});

// ---- 3. persist -----------------------------------------------------------
const plan = {
  month: monthKey,
  timezone: 'America/New_York',
  postTime: '10:00',
  generatedAt: new Date().toISOString(),
  posts: results
};
await savePlan(monthKey, plan);
await saveHistory(history);
await writeContactSheet(monthKey, plan);

console.log(`\nDone. ${results.length} posts ready in posts/${monthKey}/  (text guard: ${guardStatus()})`);
console.log(`Review them at posts/${monthKey}/index.html before the daily top-up starts.`);

async function writeContactSheet(monthKey, plan) {
  const cards = plan.posts.map(p => `
    <figure>
      <img src="day${String(p.day).padStart(2, '0')}-feed.jpg" loading="lazy" alt="">
      <figcaption>
        <b>${p.localLabel}</b> · ${p.serviceId} · ${p.layout}
        <p>${p.copy.headline.join(' ')}</p>
        <details><summary>caption</summary><pre>${p.captions.social.replace(/[<&]/g, c => c === '<' ? '&lt;' : '&amp;')}</pre></details>
      </figcaption>
    </figure>`).join('');

  const html = `<meta charset="utf-8"><title>Mody ${monthKey} review</title>
<style>
 body{font:14px/1.5 system-ui,sans-serif;background:#0b1218;color:#e6eef5;margin:0;padding:32px}
 h1{font-size:22px;margin:0 0 4px} .sub{color:#8fa6b8;margin-bottom:24px}
 .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:20px}
 figure{margin:0;background:#111c25;border:1px solid #1e2c38;border-radius:14px;overflow:hidden}
 img{width:100%;display:block}
 figcaption{padding:12px 14px;font-size:12px;color:#9fb4c6}
 figcaption b{color:#00ccf9} figcaption p{color:#fff;font-size:14px;margin:6px 0}
 pre{white-space:pre-wrap;font-size:11px;color:#8fa6b8;background:#0b1218;padding:10px;border-radius:8px}
</style>
<h1>Mody Car Wash — ${monthKey}</h1>
<div class="sub">${plan.posts.length} posts · 10:00 AM America/New_York · generated ${plan.generatedAt.slice(0, 10)}</div>
<div class="grid">${cards}</div>`;
  await writeFile(path.join(POSTS, monthKey, 'index.html'), html);
}
