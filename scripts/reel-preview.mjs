// Builds one reel end-to-end so the motion, typography and audio can be judged.
// Uses a stand-in background when no generated photo is available yet.
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { renderReel, musicTracks, REEL } from '../src/lib/video.mjs';
import { buildPost } from '../src/lib/compose.mjs';
import { monthSlots } from '../src/lib/schedule.mjs';
import { ROOT } from '../src/lib/store.mjs';

const brand = JSON.parse(await readFile(path.join(ROOT, 'brand.json'), 'utf8'));
const photoArg = process.argv.find(a => a.startsWith('--photo='));
const out = path.join(ROOT, 'preview');
const work = path.join(ROOT, '.tmp-reel');
await mkdir(out, { recursive: true });
await mkdir(work, { recursive: true });

const STANDIN = `<style>body{margin:0}
.s{width:1080px;height:1920px;position:relative;overflow:hidden;
   background:radial-gradient(120% 70% at 30% 30%, #35485c 0%, #16222e 45%, #0a1117 100%)}
.car{position:absolute;left:-4%;right:-4%;top:40%;height:22%;border-radius:80px 160px 50px 50px;
     background:linear-gradient(180deg,#6b8298,#2b3946 55%,#141d25);
     box-shadow:0 70px 110px rgba(0,0,0,.6), inset 0 6px 26px rgba(255,255,255,.22)}
.gl{position:absolute;left:16%;right:30%;top:33%;height:11%;border-radius:60px 80px 12px 12px;
    background:linear-gradient(180deg,rgba(190,225,255,.8),rgba(90,130,165,.35))}
.f{position:absolute;inset:auto 0 0 0;height:30%;
   background:radial-gradient(60% 120% at 30% 100%, rgba(255,255,255,.5), rgba(255,255,255,0) 70%)}
</style><div class="s"><div class="car"></div><div class="gl"></div><div class="f"></div></div>`;

const tracks = await musicTracks();
console.log(`music tracks found: ${tracks.length}`);
if (!tracks.length) console.log('(no music - the reel will be silent)');

const browser = await chromium.launch();
const page = await (await browser.newContext({ deviceScaleFactor: 1 })).newPage();

let photoB64;
if (photoArg) {
  photoB64 = (await readFile(photoArg.split('=')[1])).toString('base64');
  console.log('background: real generated photo');
} else {
  await page.setViewportSize({ width: 1080, height: 1920 });
  await page.setContent(STANDIN, { waitUntil: 'load' });
  photoB64 = (await page.screenshot({ type: 'jpeg', quality: 90 })).toString('base64');
  console.log('background: STAND-IN placeholder (Cloudflare quota is spent until 00:00 UTC)');
}

const slots = monthSlots(2026, 9, 20);   // 8:00 PM ET reel slot
const post = buildPost({ monthKey: '2026-09', slot: slots[7], index: 1, serviceId: 'exterior', brand, salt: 'reel' });
console.log(`headline: "${post.copy.headline.join(' ')}"`);
console.log(`slot:     ${post.localLabel}`);

const t0 = Date.now();
const file = path.join(out, 'reel-sample.mp4');
await renderReel(page, {
  photoB64, copy: post.copy, brand,
  musicFile: tracks[0], outPath: file, workDir: work
});
await browser.close();

const { statSync } = await import('node:fs');
console.log(`\nbuilt in ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${(statSync(file).size / 1024 / 1024).toFixed(2)} MB`);
console.log(`${REEL.w}x${REEL.h}, ${REEL.duration}s @ ${REEL.fps}fps, track: ${tracks[0] ?? 'none'}`);
