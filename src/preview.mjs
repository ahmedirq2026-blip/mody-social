#!/usr/bin/env node
// Generates a handful of REAL posts (Cloudflare image + full design) without
// touching the plan, the history or Buffer. Use it to sanity-check quality.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { generateImage } from './lib/cloudflare.mjs';
import { withBrowser, renderPost, photoHash, hammingDistance, SIZES } from './lib/render.mjs';
import { buildPost } from './lib/compose.mjs';
import { monthSlots, targetMonth } from './lib/schedule.mjs';
import { ROOT } from './lib/store.mjs';

const count = Number(process.argv[2] || 3);
const brand = JSON.parse(await readFile(path.join(ROOT, 'brand.json'), 'utf8'));
const { year, month, key } = targetMonth();
const slots = monthSlots(year, month);
const services = brand.services.map(s => s.id);
const dir = path.join(ROOT, 'preview');
await mkdir(dir, { recursive: true });

const salt = String(Date.now());   // fresh copy/photo on every preview run
const hashes = [];

await withBrowser(async (page) => {
  for (let i = 0; i < count; i++) {
    const serviceId = services[i % services.length];
    const post = buildPost({ monthKey: key, slot: slots[i], index: i, serviceId, brand, salt });

    console.log(`\n[${i + 1}/${count}] ${serviceId} / ${post.layout}`);
    console.log(`  headline: "${post.copy.headline.join(' ')}"`);

    const t0 = Date.now();
    const b64 = await generateImage(post.prompt);
    const hash = await photoHash(page, b64);
    const near = hashes.map(h => hammingDistance(h, hash));
    console.log(`  image: ${(b64.length * 0.75 / 1024).toFixed(0)} KB in ${((Date.now() - t0) / 1000).toFixed(1)}s` +
                (near.length ? `, distance from previous: ${near.join(', ')}` : ''));
    hashes.push(hash);

    const feed = await renderPost(page, { imageB64: b64, layout: post.layout, size: SIZES.feed, copy: post.copy });
    await writeFile(path.join(dir, `real-${i + 1}-${serviceId}-${post.layout}.jpg`), feed);
    const sq = await renderPost(page, { imageB64: b64, layout: post.layout, size: SIZES.square, copy: post.copy });
    await writeFile(path.join(dir, `real-${i + 1}-${serviceId}-gbp.jpg`), sq);
    console.log(`  saved preview/real-${i + 1}-${serviceId}-*.jpg`);
  }
});
console.log('\nDone.');
