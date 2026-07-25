// Analyzer: bounded-context / domain inventory for The House.
//
// Enumerates src/domains/* and the governance context under src/governance/*, and
// derives for each: file/line size, whether it invokes the Governance Kernel (a
// governed domain) or is reference-data (never calls the kernel), whether it owns a
// transactional outbox enqueue, and its principal service/store/port classes. This
// is a static classification pass; it makes no judgement about production readiness.

import { basename } from 'node:path';
import { readText, countLines, walk, listDirs, countMatches } from './house-lib.mjs';

const RX = {
  kernelInvoke: /GovernanceKernel|\.transition\s*\(/g,
  outboxEnqueue: /enqueueOutbox|outbox|OutboxMessage|enqueue\s*\(/g,
  classDecl: /export\s+class\s+([A-Za-z0-9_]+)/g,
  serviceClass: /export\s+class\s+([A-Za-z0-9_]*Service)\b/g,
  storeClass: /export\s+class\s+([A-Za-z0-9_]*Store)\b/g,
};

function classesIn(files, rx) {
  const set = new Set();
  for (const f of files) {
    const text = readText(f);
    const re = new RegExp(rx.source, 'g');
    let m;
    while ((m = re.exec(text)) !== null) set.add(m[1]);
  }
  return [...set].sort();
}

function contextReport(ctx, rootRel, kind) {
  const root = ctx.abs(rootRel);
  const dirs = listDirs(root);
  const out = [];
  for (const d of dirs) {
    const files = walk(d, (f) => f.endsWith('.ts') && !/\.test\.ts$/.test(f));
    if (files.length === 0) continue;
    const joined = files.map(readText).join('\n');
    const kernelHits = countMatches(joined, RX.kernelInvoke);
    const outboxHits = countMatches(joined, RX.outboxEnqueue);
    out.push({
      name: basename(d),
      path: ctx.rel(d),
      kind,
      files: files.length,
      lines: files.reduce((n, f) => n + countLines(readText(f)), 0),
      invokes_kernel: kernelHits > 0,
      kernel_reference_count: kernelHits,
      owns_outbox_enqueue: outboxHits > 0,
      services: classesIn(files, RX.serviceClass),
      stores: classesIn(files, RX.storeClass),
    });
  }
  return out;
}

export function analyze(ctx) {
  const domains = contextReport(ctx, 'src/domains', 'domain');
  const governance = contextReport(ctx, 'src/governance', 'governance-context');

  const governed = domains.filter((d) => d.invokes_kernel).map((d) => d.name);
  const referenceData = domains.filter((d) => !d.invokes_kernel).map((d) => d.name);

  return {
    domains: {
      summary: {
        domain_contexts: domains.length,
        governance_contexts: governance.length,
        governed_domains: governed,
        reference_data_domains: referenceData,
        domains_owning_outbox: domains.filter((d) => d.owns_outbox_enqueue).map((d) => d.name),
      },
      domains,
      governance_contexts: governance,
    },
  };
}
