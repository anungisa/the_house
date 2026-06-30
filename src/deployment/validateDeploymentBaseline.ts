/**
 * Pure, deterministic validator for the production deployment / IaC baseline.
 *
 * This is a STATIC checker. It only reads files from disk under a given repo root
 * and reasons about their presence and content. It NEVER:
 *  - calls Azure or the `az` CLI,
 *  - requires credentials, a database, Service Bus, Entra/JWKS, or any network,
 *  - mutates anything.
 *
 * It exists so CI and developers can confirm the deployment baseline stays
 * coherent (required IaC files present, required env vars documented, the
 * `deploy:check` script wired) and that NO secret-looking values leak into the
 * committed IaC / example parameter files.
 *
 * The thin CLI wrapper lives in scripts/validate-deployment-baseline.ts.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** A single named check outcome. */
export interface DeploymentBaselineCheck {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

/** Aggregated validation result. */
export interface DeploymentBaselineResult {
  readonly ok: boolean;
  readonly checks: readonly DeploymentBaselineCheck[];
  /** Human-readable messages for every failing check (empty when ok). */
  readonly errors: readonly string[];
}

/** A secret-like value found in a scanned file. */
export interface SecretFinding {
  /** Repo-relative path of the file the match was found in. */
  readonly file: string;
  /** 1-based line number. */
  readonly line: number;
  /** Short label of the rule that matched (never the full secret). */
  readonly rule: string;
}

/** IaC module files (relative to infra/azure) that must exist. */
export const REQUIRED_INFRA_MODULES: readonly string[] = [
  'modules/container-apps.bicep',
  'modules/postgres.bicep',
  'modules/service-bus.bicep',
  'modules/storage.bicep',
  'modules/key-vault.bicep',
  'modules/key-vault-access.bicep',
  'modules/observability.bicep',
];

/** Example parameter files (relative to infra/azure) that must exist. */
export const REQUIRED_PARAMETER_FILES: readonly string[] = [
  'parameters/dev.example.bicepparam',
  'parameters/test.example.bicepparam',
  'parameters/prod.example.bicepparam',
];

/** Production-relevant environment variables that must be documented in .env.example. */
export const REQUIRED_ENV_VARS: readonly string[] = [
  'NODE_ENV',
  'APP_ENV',
  'AUTH_MODE',
  'ENTRA_ISSUER',
  'ENTRA_AUDIENCE',
  'ENTRA_JWKS_URI',
  'DATABASE_URL',
  'MIGRATE_DATABASE_URL',
  'SERVICE_BUS_ENABLED',
  'SERVICE_BUS_CONNECTION_STRING',
  'SERVICE_BUS_TOPIC_NAME',
  'EVIDENCE_STORAGE_PROVIDER',
  'EVIDENCE_BLOB_CONNECTION_STRING',
  'EVIDENCE_BLOB_CONTAINER_NAME',
  'EVIDENCE_MALWARE_SCANNING_MODE',
  'EVIDENCE_QUARANTINE_ENABLED',
  'OBSERVABILITY_ENABLED',
  'OBSERVABILITY_EXPORTER',
  'LOG_LEVEL',
  'SECRET_PROVIDER',
  'KEY_VAULT_URI',
  'KEY_VAULT_SECRET_PREFIX',
];

/** Sport-specific terminology that must never leak into platform IaC. */
export const FORBIDDEN_DOMAIN_TERMS: readonly string[] = [
  'ptso',
  'bonspiel',
  'curling',
  'curler',
  'rink',
];

/**
 * Substrings that mark a value as an intentional placeholder (never a real
 * secret). Matched case-insensitively. Key Vault references and obvious template
 * tokens are treated as safe.
 */
const PLACEHOLDER_MARKERS: readonly string[] = [
  'replace',
  'changeme',
  'change_me',
  'example',
  'your-',
  'your_',
  'placeholder',
  'todo',
  '<',
  '{{',
  '$(',
  '__',
  'keyvault',
  'key-vault',
  'secreturi',
  'secretref',
  'getsecret',
];

interface SecretRule {
  readonly rule: string;
  readonly pattern: RegExp;
}

/**
 * High-signal secret patterns. These essentially never appear in a legitimate,
 * placeholder-only parameter or IaC file, so a match is treated as a leak.
 */
const SECRET_RULES: readonly SecretRule[] = [
  { rule: 'azure-shared-access-key', pattern: /SharedAccessKey\s*=\s*[A-Za-z0-9+/]{16,}={0,2}/i },
  { rule: 'azure-account-key', pattern: /AccountKey\s*=\s*[A-Za-z0-9+/]{16,}={0,2}/i },
  { rule: 'inline-url-credentials', pattern: /[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:[^\s:@/]+@/i },
  { rule: 'private-key-block', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { rule: 'jwt-token', pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/ },
  { rule: 'bearer-token', pattern: /\bBearer\s+[A-Za-z0-9._-]{16,}/ },
];

function isPlaceholder(value: string): boolean {
  const lowered = value.toLowerCase();
  return PLACEHOLDER_MARKERS.some((marker) => lowered.includes(marker));
}

/**
 * Scan text for obvious secret-like values. Returns the matched rule labels (the
 * matched secret text itself is never returned). Lines whose match is clearly a
 * placeholder are ignored.
 */
export function findSecretLikeValues(text: string): readonly string[] {
  const findings: string[] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    for (const { rule, pattern } of SECRET_RULES) {
      const match = pattern.exec(line);
      if (match !== null && !isPlaceholder(match[0])) {
        findings.push(rule);
      }
    }
  }
  return findings;
}

/** Recursively list every file under a directory (returns absolute paths). */
function listFilesRecursive(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listFilesRecursive(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

function readIfExists(path: string): string | undefined {
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

/** True when `.env.example` documents `name` as a `NAME=` assignment line. */
function envDeclares(envText: string, name: string): boolean {
  const re = new RegExp(`^\\s*${name}\\s*=`, 'm');
  return re.test(envText);
}

/**
 * Validate the deployment baseline under `repoRoot`. Pure and deterministic: only
 * reads files; never touches the network, Azure, a DB, or credentials.
 */
export function validateDeploymentBaseline(repoRoot: string): DeploymentBaselineResult {
  const checks: DeploymentBaselineCheck[] = [];
  const infraAzure = join(repoRoot, 'infra', 'azure');

  // 1. main.bicep present.
  const mainBicep = join(infraAzure, 'main.bicep');
  checks.push({
    name: 'infra/azure/main.bicep exists',
    ok: existsSync(mainBicep),
    detail: relative(repoRoot, mainBicep),
  });

  // 2. Required modules present.
  for (const moduleRel of REQUIRED_INFRA_MODULES) {
    const modulePath = join(infraAzure, moduleRel);
    checks.push({
      name: `module ${moduleRel} exists`,
      ok: existsSync(modulePath),
      detail: `infra/azure/${moduleRel}`,
    });
  }

  // 3. Example parameter files present.
  for (const paramRel of REQUIRED_PARAMETER_FILES) {
    const paramPath = join(infraAzure, paramRel);
    checks.push({
      name: `parameter file ${paramRel} exists`,
      ok: existsSync(paramPath),
      detail: `infra/azure/${paramRel}`,
    });
  }

  // 4. Deployment baseline doc present.
  const doc = join(repoRoot, 'docs', 'architecture', 'production-deployment-baseline.md');
  checks.push({
    name: 'production deployment baseline doc exists',
    ok: existsSync(doc),
    detail: relative(repoRoot, doc),
  });

  // 5. .env.example documents required production-relevant variables.
  const envExample = readIfExists(join(repoRoot, '.env.example'));
  if (envExample === undefined) {
    checks.push({ name: '.env.example exists', ok: false, detail: '.env.example' });
  } else {
    const missing = REQUIRED_ENV_VARS.filter((name) => !envDeclares(envExample, name));
    checks.push({
      name: '.env.example documents required production env vars',
      ok: missing.length === 0,
      detail: missing.length === 0 ? 'all present' : `missing: ${missing.join(', ')}`,
    });
  }

  // 6. package.json exposes the deploy:check script.
  const pkgText = readIfExists(join(repoRoot, 'package.json'));
  let deployCheckOk = false;
  if (pkgText !== undefined) {
    try {
      const pkg = JSON.parse(pkgText) as { scripts?: Record<string, string> };
      deployCheckOk = typeof pkg.scripts?.['deploy:check'] === 'string';
    } catch {
      deployCheckOk = false;
    }
  }
  checks.push({
    name: 'package.json defines deploy:check script',
    ok: deployCheckOk,
    detail: 'scripts["deploy:check"]',
  });

  // 7. No secret-like values in any infra file.
  const secretFindings = scanInfraForSecrets(repoRoot, infraAzure);
  checks.push({
    name: 'no secret-like values in infra files',
    ok: secretFindings.length === 0,
    detail:
      secretFindings.length === 0
        ? 'clean'
        : secretFindings.map((f) => `${f.file}:${f.line} (${f.rule})`).join('; '),
  });

  // 8. No sport-specific terminology in infra files.
  const domainLeaks = scanInfraForDomainTerms(repoRoot, infraAzure);
  checks.push({
    name: 'no sport-specific terminology in infra files',
    ok: domainLeaks.length === 0,
    detail: domainLeaks.length === 0 ? 'clean' : domainLeaks.join('; '),
  });

  const failed = checks.filter((c) => !c.ok);
  return {
    ok: failed.length === 0,
    checks,
    errors: failed.map((c) => `${c.name}: ${c.detail}`),
  };
}

/** Scan every infra file for secret-like values. */
export function scanInfraForSecrets(repoRoot: string, infraDir: string): readonly SecretFinding[] {
  const findings: SecretFinding[] = [];
  for (const file of listFilesRecursive(infraDir)) {
    const text = readFileSync(file, 'utf8');
    const lines = text.split(/\r?\n/);
    lines.forEach((line, idx) => {
      for (const { rule, pattern } of SECRET_RULES) {
        const match = pattern.exec(line);
        if (match !== null && !isPlaceholder(match[0])) {
          findings.push({ file: toRepoRel(repoRoot, file), line: idx + 1, rule });
        }
      }
    });
  }
  return findings;
}

/** Scan every infra file for forbidden sport-specific terminology. */
function scanInfraForDomainTerms(repoRoot: string, infraDir: string): readonly string[] {
  const leaks: string[] = [];
  for (const file of listFilesRecursive(infraDir)) {
    const lowered = readFileSync(file, 'utf8').toLowerCase();
    for (const term of FORBIDDEN_DOMAIN_TERMS) {
      if (lowered.includes(term)) {
        leaks.push(`${toRepoRel(repoRoot, file)} contains "${term}"`);
      }
    }
  }
  return leaks;
}

function toRepoRel(repoRoot: string, file: string): string {
  return relative(repoRoot, file).split(sep).join('/');
}
