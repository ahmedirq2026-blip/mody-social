#!/usr/bin/env node
// THE DAILY ROBOT.
// Keeps each Buffer channel topped up to TARGET_QUEUE scheduled posts, which
// stays safely under Buffer's free-plan cap of 10 queued posts per channel.

import { getOrganizationId, getChannels, getScheduledByChannel, createPost, classifyChannel } from './lib/buffer.mjs';
import { listPlans, loadPlan, loadPosted, savePosted, imageUrl, pagesBaseUrl, ROOT } from './lib/store.mjs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const brand = JSON.parse(await readFile(path.join(ROOT, 'brand.json'), 'utf8'));
const site = brand.business.website;
const booking = brand.business.bookingUrl || site;
// Buffer gates automatic first comments behind a paid plan.
const FIRST_COMMENT = process.env.BUFFER_FIRST_COMMENT === '1';

// The owner opted out of the AI disclosure label. We simply do not declare
// anything: the field is omitted rather than set to false, because telling Meta
// these photos are not AI-generated would be a false statement. Set AI_LABEL=on
// to disclose. Meta may still detect and label the images on its own.
const aiLabel = process.env.AI_LABEL === 'on';

/**
 * Google Business Profile is the only one of the three that supports a real
 * button. Facebook makes URLs in the caption clickable and allows an automatic
 * first comment. Instagram feed posts cannot carry a link at all, so the link
 * goes in the first comment and the profile bio.
 */
function metadataFor(kind, isReel = false) {
  if (kind === 'google') {
    return { google: { type: 'whats_new', detailsWhatsNew: { button: 'book', link: booking } } };
  }
  // firstComment is a paid Buffer feature; the booking link lives in the caption instead
  if (kind === 'facebook') {
    return { facebook: { type: isReel ? 'reel' : 'post', ...(FIRST_COMMENT ? { firstComment: `Book your hand wash here: ${booking}` } : {}) } };
  }
  return {
    instagram: {
      type: isReel ? 'reel' : 'post',
      shouldShareToFeed: true,        // required by the schema
      ...(aiLabel ? { isAiGenerated: true } : {}),
      ...(FIRST_COMMENT ? { firstComment: `Book your hand wash: ${site} (link in bio too)` } : {})
    }
  };
}

const TARGET_QUEUE = Number(process.env.TARGET_QUEUE || 9);
const HARD_CAP = Number(process.env.QUEUE_HARD_CAP || 10);
const LEAD_MINUTES = 20;                       // never schedule something almost due
const dry = process.argv.includes('--dry-run');

if (TARGET_QUEUE >= HARD_CAP) {
  console.error(`TARGET_QUEUE (${TARGET_QUEUE}) must stay below the plan cap (${HARD_CAP}).`);
  process.exit(1);
}

const base = pagesBaseUrl();
if (!base) {
  console.error('No public image base URL. Set PAGES_BASE_URL, or run inside GitHub Actions.');
  process.exit(1);
}

const orgId = await getOrganizationId();
const channels = await getChannels(orgId);
const wanted = channels
  .map(c => ({ ...c, kind: classifyChannel(c.service) }))
  .filter(c => ['facebook', 'instagram', 'google'].includes(c.kind));

if (!wanted.length) {
  console.error('No Facebook / Instagram / Google Business Profile channels connected in Buffer.');
  process.exit(1);
}
console.log(`Channels: ${wanted.map(c => `${c.kind}:${c.name}`).join(', ')}`);
console.log(`Call to action: Google = Book button -> ${booking}; Facebook + Instagram = first comment with the link.`);
console.log(`Instagram AI label: ${aiLabel ? 'declared' : 'not declared'}`);

const { counts } = await getScheduledByChannel(orgId);
const posted = await loadPosted();

// Every planned post, oldest month first, that is still in the future.
const cutoff = Date.now() + LEAD_MINUTES * 60 * 1000;
const queue = [];
for (const monthKey of await listPlans()) {
  const plan = await loadPlan(monthKey);
  for (const p of plan?.posts ?? []) {
    if (new Date(p.dueAt).getTime() > cutoff) queue.push({ ...p, monthKey });
  }
}
queue.sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
console.log(`${queue.length} future posts available across ${(await listPlans()).length} plan(s).`);

let created = 0;
for (const channel of wanted) {
  const already = counts.get(channel.id) ?? 0;
  const room = Math.min(TARGET_QUEUE, HARD_CAP - 1) - already;
  const log = `${channel.kind} (${channel.name}): ${already} queued`;

  if (room <= 0) { console.log(`${log} — full, nothing to add`); continue; }

  const done = posted[channel.id] ?? {};
  // Google Business Profile takes no video, so a reel landing in its slice used
  // to be skipped inside the loop and the slot went unused. Filter first.
  const eligible = queue.filter(p => {
    if (done[`${p.monthKey}#${p.day}`]) return false;
    if (p.kind === 'reel' && channel.kind === 'google') return false;
    return true;
  });
  const todo = eligible.slice(0, room);
  if (!todo.length) { console.log(`${log} — no unposted plan entries left`); continue; }
  console.log(`${log} — adding ${todo.length}`);

  for (const p of todo) {
    const isGoogle = channel.kind === 'google';
    const isReel = p.kind === 'reel';

    const rel = isReel ? p.video : (isGoogle ? p.images.square : p.images.feed);
    const url = imageUrl(rel);
    const text = isGoogle ? p.captions.gbp : p.captions.social;

    const head = await fetch(url, { method: 'HEAD' }).catch(() => null);
    if (!head?.ok) {
      console.error(`  ! ${p.localLabel}: image not reachable (${head?.status ?? 'network error'}) ${url}`);
      console.error('    Skipping — Buffer fetches the image at publish time, a dead URL would fail silently.');
      continue;
    }

    if (dry) { console.log(`  [dry] ${p.localLabel} -> ${url}`); continue; }

    const post = await createPost({
      channelId: channel.id, text, url, dueAt: p.dueAt, isReel,
      metadata: metadataFor(channel.kind, isReel)
    });
    posted[channel.id] = posted[channel.id] ?? {};
    posted[channel.id][`${p.monthKey}#${p.day}`] = { postId: post.id, dueAt: p.dueAt, at: new Date().toISOString() };
    created++;
    console.log(`  + ${p.localLabel}  ${post.id}`);
  }
}

if (!dry) await savePosted(posted);
console.log(`\nScheduled ${created} new post(s).`);
