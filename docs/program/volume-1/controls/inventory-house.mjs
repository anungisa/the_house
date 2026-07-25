// Orchestrator: deterministic House-implementation qualification inventory.
//
// Runs the analyze-house-* controls over the committed repository, writes a set of
// NON-AUTHORITATIVE JSON inventories plus a human-readable markdown report under
// docs/program/volume-1/generated/house/, and derives automated observations. Every
// artifact is anchored to the repository/runtime fingerprint (assessed commit,
// runtime-tree commit, tree digests) so the inventory is reproducible.
//
// Usage:  node docs/program/volume-1/controls/inventory-house.mjs
//
// This tooling is evidence INPUT to Package 3. It authorizes nothing and decides
// nothing; qualification decisions live in the ratified chapters and registers.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createContext, walk, countLines, readText } from './house-lib.mjs';
import { analyze as analyzeDatabase } from './analyze-house-database.mjs';
import { analyze as analyzeDomains } from './analyze-house-domains.mjs';
import { analyze as analyzeApis } from './analyze-house-apis.mjs';
import { analyze as analyzeAuthorization } from './analyze-house-authorization.mjs';
import { analyze as analyzeWorkflows } from './analyze-house-workflows.mjs';
import { analyze as analyzeOperations } from './analyze-house-operations.mjs';

function buildSourceManifest(ctx) {
  const roots = {};
  for (const [key, rel] of Object.entries(ctx.roots)) {
    const files = walk(ctx.abs(rel));
    const codeFiles = files.filter((f) => /\.(ts|sql|mjs|bicep|ya?ml)$/.test(f));
    roots[key] = {
      path: rel,
      files: files.length,
      code_files: codeFiles.length,
      lines: codeFiles.reduce((n, f) => n + countLines(readText(f)), 0),
    };
  }
  return {
    summary: {
      assessed_repository_commit: ctx.fingerprint.repository_commit,
      assessed_runtime_commit: ctx.fingerprint.runtime_commit,
      runtime_commit_date: ctx.fingerprint.runtime_commit_date,
      branch: ctx.fingerprint.branch,
      working_tree_state: ctx.fingerprint.working_tree_state,
      src_tree_digest: ctx.fingerprint.src_tree_digest,
      src_ts_file_count: ctx.fingerprint.src_ts_file_count,
      migrations_digest: ctx.fingerprint.migrations_digest,
      migration_file_count: ctx.fingerprint.migration_file_count,
      package_json_sha256: ctx.fingerprint.package_json_sha256,
      package_lock_sha256: ctx.fingerprint.package_lock_sha256,
    },
    roots,
  };
}

// Derive deterministic, NON-AUTHORITATIVE observations from analyzer summaries.
function deriveObservations(sections) {
  const o = [];
  const push = (code, observation, evidence) => o.push({ code, observation, evidence });

  const db = sections.database.summary;
  push(
    'OBS-DB-RLS',
    `${db.rls_forced_tables}/${db.tenant_owned_tables} tenant-owned tables use FORCE row-level security; ${db.tenant_owned_without_forced_rls.length} tenant-owned table(s) lack forced RLS.`,
    'database-inventory.json',
  );
  const authz = sections.authorization.summary;
  push(
    'OBS-AUTHZ-RESOURCE',
    authz.resource_aware_authorization_gap.startsWith('CONFIRMED')
      ? 'Governed affiliation authorization is role-only; it is NOT resource/jurisdiction-aware.'
      : 'Resource-aware authorization was not conclusively detected as present.',
    'authorization-analysis.json',
  );
  push(
    'OBS-AUTHZ-EDGE',
    `Edge authorization exposes ${authz.edge_action_count} actions across ${authz.edge_role_count} roles with a single platform-admin wildcard; there is no affiliation.* edge action (affiliation authority is the kernel).`,
    'authorization-analysis.json',
  );
  const wf = sections.workflow.summary;
  push(
    'OBS-WF-GUARDS',
    `The seeded state machine has ${wf.states} states and ${wf.transitions} transitions; ${wf.seeded_guards} seeded guards vs ${wf.implemented_guards} implemented handlers (unimplemented: ${wf.guards_seeded_not_implemented.join(', ') || 'none'}).`,
    'workflow-analysis.json',
  );
  const io = sections.integrationOutbox.summary;
  push(
    'OBS-OUTBOX',
    `Outbox default publisher is ${io.default_publisher_is_noop ? 'the Noop publisher' : 'not Noop'}; a real Azure Service Bus publisher is ${io.real_broker_publisher_present ? 'present but config-gated' : 'absent'}; lease-based claim: ${io.lease_based_claim}; full-jitter backoff detected: ${io.full_jitter_backoff_detected}.`,
    'integration-outbox-analysis.json',
  );
  const ev = sections.evidenceAudit.summary;
  push(
    'OBS-EVIDENCE',
    `Evidence storage providers: ${ev.storage_providers.join(', ')}; malware scanning: ${ev.malware_scanning.join(', ')}; evidence metadata + audit are written inside the governance store transaction (${ev.evidence_metadata_written_in_governance_store}/${ev.audit_written_in_governance_store}).`,
    'evidence-audit-analysis.json',
  );
  const tests = sections.tests.summary;
  push(
    'OBS-TESTS',
    `${tests.unit_test_files} unit test files (${tests.unit_test_cases} cases) and ${tests.integration_test_files} integration files (${tests.integration_test_cases} cases). All ${tests.db_gated_suites_skipped_by_default} integration suites are DB-gated (RUN_DB_TESTS=1) and skipped by default hermetic \`npm test\`.`,
    'test-inventory.json',
  );
  const ops = sections.operations.summary;
  push(
    'OBS-OPS',
    `${ops.deployment_validators} deployment baseline validators and ${ops.ci_workflows.length} CI workflows exist; infra is Bicep source (${ops.infra_bicep_modules.length} modules). No evidence of a provisioned, running House environment.`,
    'operational-readiness.json',
  );
  return o;
}

function writeReport(ctx, manifest, sections, observations) {
  const fp = ctx.fingerprint;
  const lines = [];
  lines.push('# The House v2 — Implementation Qualification Inventory (NON-AUTHORITATIVE)');
  lines.push('');
  lines.push(
    'Deterministic evidence input to Volume 1 Package 3. Generated by ' +
      '`docs/program/volume-1/controls/inventory-house.mjs`. This report decides nothing ' +
      'and authorizes nothing; qualification decisions live in the ratified chapters/registers.',
  );
  lines.push('');
  lines.push('## Assessed baseline (fingerprint)');
  lines.push('');
  lines.push(`- Assessed repository commit: \`${fp.repository_commit}\``);
  lines.push(`- Runtime-tree last-change commit (src + db/migrations only): \`${fp.runtime_commit}\` (${fp.runtime_commit_date})`);
  lines.push(`- Branch: \`${fp.branch}\`; working tree: **${fp.working_tree_state}**`);
  lines.push(`- src tree digest: \`${fp.src_tree_digest}\` (${fp.src_ts_file_count} .ts files)`);
  lines.push(`- migrations digest: \`${fp.migrations_digest}\` (${fp.migration_file_count} migrations)`);
  lines.push(`- package.json sha256: \`${fp.package_json_sha256}\``);
  lines.push(`- package-lock.json sha256: \`${fp.package_lock_sha256}\``);
  lines.push('');
  lines.push('## Material roots assessed');
  lines.push('');
  lines.push('| Root | Path | Files | Code files | Lines |');
  lines.push('| --- | --- | ---: | ---: | ---: |');
  for (const [k, v] of Object.entries(manifest.roots)) {
    lines.push(`| ${k} | \`${v.path}\` | ${v.files} | ${v.code_files} | ${v.lines} |`);
  }
  lines.push('');
  lines.push('## Section summaries');
  lines.push('');
  for (const [name, section] of Object.entries(sections)) {
    lines.push(`### ${name}`);
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(section.summary, null, 2));
    lines.push('```');
    lines.push('');
  }
  lines.push('## Automated observations (non-authoritative)');
  lines.push('');
  for (const obs of observations) {
    lines.push(`- **${obs.code}** — ${obs.observation} _(evidence: ${obs.evidence})_`);
  }
  lines.push('');
  return lines.join('\n');
}

function main() {
  const ctx = createContext(process.argv.slice(2));
  ctx.ensureGenDir();

  const database = analyzeDatabase(ctx);
  const domains = analyzeDomains(ctx);
  const apis = analyzeApis(ctx);
  const authorization = analyzeAuthorization(ctx);
  const workflows = analyzeWorkflows(ctx);
  const operations = analyzeOperations(ctx);

  const sections = {
    database: database.database,
    migrations: database.migrations,
    domains: domains.domains,
    api: apis.api,
    composition: apis.composition,
    authorization: authorization.authorization,
    workflow: workflows.workflow,
    evidenceAudit: workflows.evidenceAudit,
    integrationOutbox: workflows.integrationOutbox,
    configuration: operations.configuration,
    tests: operations.tests,
    operations: operations.operations,
  };

  const manifest = buildSourceManifest(ctx);
  const observations = deriveObservations(sections);

  const outputs = {
    'source-manifest.json': manifest,
    'database-inventory.json': sections.database,
    'migration-inventory.json': sections.migrations,
    'domain-inventory.json': sections.domains,
    'api-inventory.json': sections.api,
    'composition-inventory.json': sections.composition,
    'authorization-analysis.json': sections.authorization,
    'workflow-analysis.json': sections.workflow,
    'evidence-audit-analysis.json': sections.evidenceAudit,
    'integration-outbox-analysis.json': sections.integrationOutbox,
    'configuration-analysis.json': sections.configuration,
    'test-inventory.json': sections.tests,
    'operational-readiness.json': sections.operations,
    'automated-observations.json': { summary: { observation_count: observations.length }, observations },
  };

  for (const [name, data] of Object.entries(outputs)) {
    ctx.writeJson(name, data);
  }

  const report = writeReport(ctx, manifest, sections, observations);
  writeFileSync(join(ctx.GEN_DIR, 'house-qualification-report.md'), `${report}\n`, 'utf8');

  process.stdout.write(
    `House qualification inventory written to ${ctx.rel(ctx.GEN_DIR)} ` +
      `(commit ${ctx.fingerprint.repository_commit?.slice(0, 8)}, runtime ${ctx.fingerprint.runtime_commit?.slice(0, 8)}, ` +
      `${Object.keys(outputs).length} JSON + 1 report).\n`,
  );
}

main();
