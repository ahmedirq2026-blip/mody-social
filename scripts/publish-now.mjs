#!/usr/bin/env node
// One-off immediate publish to every connected channel. Uses Buffer's shareNow
// mode, so the post goes out as soon as Buffer picks it up.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { gql, getOrganizationId, getChannels, classifyChannel } from '../src/lib/buffer.mjs';
import { ROOT, imageUrl } from '../src/lib/store.mjs';

const dry = process.argv.includes('--dry-run');
const brand = JSON.parse(await readFile(path.join(ROOT, 'brand.json'), 'utf8'));
const copy = JSON.parse(await readFile(path.join(ROOT, 'scripts', 'publish-now.json'), 'utf8'));
const booking = brand.business.bookingUrl || brand.business.website;

function metadataFor(kind) {
  if (kind === 'google') return { google: { type: 'whats_new', detailsWhatsNew: { button: 'book', link: booking } } };
  if (kind === 'facebook') return { facebook: { type: 'post', firstComment: `Book your hand wash here: ${booking}` } };
  return { instagram: { type: 'post', shouldShareToFeed: true, firstComment: `Book your hand wash: ${brand.business.website} (link in bio too)` } };
}

const MUTATION = `mutation Publish($input: CreatePostInput!) {
  createPost(input: $input) {
    ... on PostActionSuccess { post { id dueAt } }
    ... on MutationError { message }
  }
}`;

const orgId = await getOrganizationId();
const channels = (await getChannels(orgId))
  .map(c => ({ ...c, kind: classifyChannel(c.service) }))
  .filter(c => ['facebook', 'instagram', 'google'].includes(c.kind));

for (const ch of channels) {
  const rel = ch.kind === 'google' ? copy.imageSquare : copy.imageFeed;
  const url = imageUrl(rel);
  const text = ch.kind === 'google' ? copy.gbp : copy.social;

  const head = await fetch(url, { method: 'HEAD' });
  if (!head.ok) { console.error(`! ${ch.kind}: image not reachable (${head.status}) ${url}`); continue; }

  if (dry) { console.log(`[dry] ${ch.kind.padEnd(10)} ${url}`); continue; }

  const { data } = await gql(MUTATION, {
    input: {
      text, channelId: ch.id,
      schedulingType: 'automatic', mode: 'shareNow',
      assets: [{ image: { url } }],
      metadata: metadataFor(ch.kind)
    }
  });
  const r = data?.createPost;
  if (r?.message) console.error(`! ${ch.kind}: ${r.message}`);
  else console.log(`+ ${ch.kind.padEnd(10)} published  id=${r?.post?.id}`);
}
