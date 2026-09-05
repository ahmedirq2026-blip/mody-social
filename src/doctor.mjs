#!/usr/bin/env node
// Preflight. Run this before anything else - it tells you exactly what is
// missing and what to paste where.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getOrganizationId, getChannels, getScheduledByChannel, classifyChannel } from './lib/buffer.mjs';
import { verifyCloudflare } from './lib/cloudflare.mjs';
import { ROOT, listPlans, loadPlan, pagesBaseUrl } from './lib/store.mjs';

const ok = (m) => console.log(`  \x1b[32mPASS\x1b[0m  ${m}`);
const bad = (m) => { console.log(`  \x1b[31mFAIL\x1b[0m  ${m}`); failures++; };
const warn = (m) => console.log(`  \x1b[33mWARN\x1b[0m  ${m}`);
let failures = 0;

console.log('\nMody Car Wash - social pipeline check\n');

console.log('1. Secrets');
for (const key of ['BUFFER_API_KEY', 'CF_ACCOUNT_ID', 'CF_API_TOKEN']) {
  process.env[key] ? ok(`${key} is set`) : bad(`${key} is missing`);
}

console.log('\n2. Brand assets');
try {
  await readFile(path.join(ROOT, 'templates', 'logo.png'));
  ok('templates/logo.png found');
} catch { warn('templates/logo.png missing - designs fall back to the wordmark only'); }
try {
  await readFile(path.join(ROOT, 'templates', 'fonts', 'Manrope.woff2'));
  ok('Manrope font bundled');
} catch { bad('templates/fonts/Manrope.woff2 missing'); }

console.log('\n3. Image hosting');
const base = pagesBaseUrl();
if (!base) bad('No public base URL (set PAGES_BASE_URL, or run in GitHub Actions)');
else {
  ok(`Base URL: ${base}`);
  const res = await fetch(base, { method: 'HEAD' }).catch(() => null);
  if (res?.ok) ok('Base URL responds - GitHub Pages is live');
  else warn(`Base URL returned ${res?.status ?? 'no response'} - enable Pages before the first top-up`);
}

console.log('\n4. Cloudflare Workers AI');
if (process.env.CF_API_TOKEN && process.env.CF_ACCOUNT_ID) {
  const cf = await verifyCloudflare().catch(e => ({ ok: false, detail: e.message }));
  cf.ok ? ok('Token and account verified') : bad(`Cloudflare rejected the credentials: ${JSON.stringify(cf.detail)}`);
} else warn('skipped - credentials missing');

console.log('\n5. Buffer');
if (process.env.BUFFER_API_KEY) {
  try {
    const orgId = await getOrganizationId();
    ok(`Organization: ${orgId}`);
    const channels = await getChannels(orgId);
    if (!channels.length) bad('No channels connected to this Buffer organization');
    const found = { facebook: 0, instagram: 0, google: 0 };
    for (const c of channels) {
      const kind = classifyChannel(c.service);
      if (kind in found) found[kind]++;
      const flag = c.isQueuePaused ? '  [QUEUE PAUSED]' : '';
      console.log(`        ${kind.padEnd(10)} ${c.service.padEnd(24)} ${c.name}  id=${c.id}${flag}`);
    }
    for (const [kind, n] of Object.entries(found)) {
      n ? ok(`${kind} channel connected`) : bad(`no ${kind} channel connected in Buffer`);
    }
    const { counts } = await getScheduledByChannel(orgId);
    for (const c of channels) {
      const n = counts.get(c.id) ?? 0;
      if (n >= 10) bad(`${c.name}: ${n} posts queued - at the free-plan cap`);
      else ok(`${c.name}: ${n} queued (cap 10)`);
    }
  } catch (e) { bad(`Buffer error: ${e.message}`); }
} else warn('skipped - BUFFER_API_KEY missing');

console.log('\n6. Plans on disk');
const plans = await listPlans();
if (!plans.length) warn('no plans yet - run: npm run generate');
for (const key of plans) {
  const plan = await loadPlan(key);
  ok(`${key}: ${plan.posts.length} posts, first ${plan.posts[0]?.localLabel}`);
}

console.log(failures ? `\n${failures} problem(s) to fix.\n` : '\nAll good.\n');
process.exit(failures ? 1 : 0);
