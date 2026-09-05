// Renders the three layouts with a stand-in photo so the design can be judged
// before any API keys exist. Not part of the production pipeline.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { withBrowser, renderPost, SIZES } from '../src/lib/render.mjs';
import { buildPost } from '../src/lib/compose.mjs';
import { monthSlots } from '../src/lib/schedule.mjs';

const brand = JSON.parse(await readFile(new URL('../brand.json', import.meta.url)));
await mkdir(new URL('../preview/', import.meta.url), { recursive: true });

const STANDIN = `<style>
 body{margin:0}
 .s{width:1024px;height:1024px;position:relative;overflow:hidden;
    background:radial-gradient(120% 90% at 22% 18%, #2a3b4d 0%, #16222e 42%, #0b1319 100%)}
 .car{position:absolute;left:6%;right:6%;top:44%;height:30%;border-radius:60px 120px 40px 40px;
      background:linear-gradient(180deg,#5d7183,#2b3946 55%,#161f27);
      box-shadow:0 60px 90px rgba(0,0,0,.55), inset 0 4px 20px rgba(255,255,255,.22)}
 .glass{position:absolute;left:22%;right:34%;top:38%;height:16%;border-radius:50px 70px 10px 10px;
      background:linear-gradient(180deg,rgba(180,220,255,.75),rgba(90,130,165,.35))}
 .foam{position:absolute;inset:auto 0 0 0;height:34%;
      background:radial-gradient(60% 120% at 30% 100%, rgba(255,255,255,.55), rgba(255,255,255,0) 70%),
                 radial-gradient(50% 110% at 72% 100%, rgba(255,255,255,.42), rgba(255,255,255,0) 70%)}
 .drop{position:absolute;border-radius:50%;background:rgba(255,255,255,.5);filter:blur(1px)}
</style><div class="s"><div class="car"></div><div class="glass"></div><div class="foam"></div>
<script>
 const s=document.querySelector('.s');
 for(let i=0;i<70;i++){const d=document.createElement('div');d.className='drop';
  const r=2+Math.random()*9;d.style.width=r+'px';d.style.height=r+'px';
  d.style.left=(Math.random()*100)+'%';d.style.top=(Math.random()*100)+'%';
  d.style.opacity=(.15+Math.random()*.5);s.appendChild(d);}
</script>`;

const slots = monthSlots(2026, 10);
const samples = [
  { serviceId: 'exterior', slot: slots[0],  index: 0 },
  { serviceId: 'interior', slot: slots[1],  index: 1 },
  { serviceId: 'tint',     slot: slots[2],  index: 2 },
  { serviceId: 'super',    slot: slots[3],  index: 0 },
  { serviceId: 'combo',    slot: slots[3],  index: 1 }
];

await withBrowser(async (page) => {
  await page.setViewportSize({ width: 1024, height: 1024 });
  await page.setContent(STANDIN, { waitUntil: 'load' });
  const shot = await (await page.$('.s')).screenshot({ type: 'jpeg', quality: 90 });
  const imageB64 = shot.toString('base64');

  for (const s of samples) {
    const post = buildPost({ monthKey: '2026-10', slot: s.slot, index: s.index, serviceId: s.serviceId, brand });
    const jpeg = await renderPost(page, {
      imageB64, layout: post.layout, size: SIZES.feed, copy: post.copy
    });
    const name = `preview/${post.layout}-${s.serviceId}.jpg`;
    await writeFile(new URL('../' + name, import.meta.url), jpeg);
    console.log(name, '|', post.copy.headline.join(' '), '|', jpeg.length, 'bytes');
  }

  // one square (Google Business Profile) sample
  const p = buildPost({ monthKey: '2026-10', slot: slots[4], index: 1, serviceId: 'exterior', brand });
  const sq = await renderPost(page, { imageB64, layout: 'scrim', size: SIZES.square, copy: p.copy });
  await writeFile(new URL('../preview/square-gbp.jpg', import.meta.url), sq);
  console.log('preview/square-gbp.jpg |', sq.length, 'bytes');
});
