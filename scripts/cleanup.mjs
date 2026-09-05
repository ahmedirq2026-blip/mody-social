#!/usr/bin/env node
// Buffer fetches media at publish time, so a file only becomes disposable well
// after its post has gone out. Anything older than RETENTION_DAYS is removed to
// keep the repository - and the GitHub Pages site - from growing without bound.
import { rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, listPlans, loadPlan } from '../src/lib/store.mjs';

const DAYS = Number(process.env.RETENTION_DAYS || 60);
const cutoff = Date.now() - DAYS * 24 * 60 * 60 * 1000;
let removed = 0, bytes = 0;

for (const key of await listPlans()) {
  const plan = await loadPlan(key);
  for (const p of plan?.posts ?? []) {
    if (new Date(p.dueAt).getTime() > cutoff) continue;
    const files = [p.video, p.images?.feed, p.images?.square, p.images?.photo].filter(Boolean);
    for (const rel of files) {
      const full = path.join(ROOT, rel);
      try {
        bytes += (await stat(full)).size;
        await rm(full);
        removed++;
      } catch { /* already gone */ }
    }
  }
}
console.log(`Removed ${removed} file(s), ${(bytes / 1024 / 1024).toFixed(1)} MB older than ${DAYS} days.`);
