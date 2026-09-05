#!/usr/bin/env node
// One-off immediate publish to every connected channel, using Buffer's
// shareNow mode. Reads scripts/publish-now.json (an array of posts).
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { gql, getOrganizationId, getChannels, classifyChannel } from '../src/lib/buffer.mjs';
import { ROOT, imageUrl } from '../src/lib/store.mjs';

const dry = process.argv.includes('--dry-run');
const brand = JSON.parse(await readFile(path.join(ROOT, 'brand.json'), 'utf8'));
const posts = JSON.parse(await readFile(path.join(ROOT, 'scripts', 'publish-now.json'), 'utf8'));
const booking = brand.business.bookingUrl || brand.business.website;

function metadataFor(kind) {
  if (kind === 'google') {
    return { google: { type: 'whats_new', detailsWhatsNew: { button: 'book', link: booking } } };
  }
  if (kind === 'facebook') {
    return { facebook: { type: 'post', firstComment: `Book your hand wash here: ${booking}` } };
  }
  return {
    instagram: {
      type: 'post',
      shouldShareToFeed: true,
      firstComment: `Book your hand wash: ${brand.business.website} (link in bio too)`
    }
  };
}

const MUTATION = `mutation Publish($input: CreatePostInput!) {
  createPost(input: $input) {
    ... on PostActionSuccess { post { id } }
    ... on MutationError { message }
  }
}`;

const orgId = await getOrganizationId();
const channels = (await getChannels(orgId))
  .map(c => ({ ...c, kind: classifyChannel(c.service) }))
  .filter(c => ['facebook', 'instagram', 'google'].includes(c.kind));

console.log(`Channels: ${channels.map(c => c.kind).join(', ')}`);
let ok = 0, failed = 0;

for (const copy of posts) {
  console.log(`\n--- ${copy.id} ---`);
  for (const ch of channels) {
    const rel = ch.kind === 'google' ? copy.imageSquare : copy.imageFeed;
    const url = imageUrl(rel);
    const text = ch.kind === 'google' ? copy.gbp : copy.social;

    const head = await fetch(url, { method: 'HEAD' }).catch(() => null);
    if (!head?.ok) {
      console.error(`! ${ch.kind}: image not reachable (${head?.status ?? 'no response'}) ${url}`);
      failed++;
      continue;
    }

    if (dry) { console.log(`[dry] ${ch.kind.padEnd(10)} ${text.length} chars, ${url}`); continue; }

    const { data } = await gql(MUTATION, {
      input: {
        text,
        channelId: ch.id,
        schedulingType: 'automatic',
        mode: 'shareNow',
        assets: [{ image: { url } }],
        metadata: metadataFor(ch.kind)
      }
    }, { throwOnError: false });

    const r = data?.createPost;
    if (!r?.post?.id) { console.error(`! ${ch.kind}: ${r?.message ?? 'unknown error'}`); failed++; }
    else { console.log(`+ ${ch.kind.padEnd(10)} published  id=${r.post.id}`); ok++; }

    await new Promise(res => setTimeout(res, 1500));
  }
}

console.log(`\n${ok} published, ${failed} failed.`);
