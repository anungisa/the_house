import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { URL } from 'node:url';

const PORT = Number(process.env.E2E_EDGE_PORT ?? '8090');
const TARGET = process.env.E2E_API_TARGET ?? 'http://127.0.0.1:8080';
const COOKIE_NAME = 'house-e2e-profile';
const FIXTURE_PATH =
  process.env.E2E_REAL_FIXTURE_PATH ?? join(tmpdir(), 'the-house-button-real-e2e-fixture.json');

const defaultFixture = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  seasonId: '2025-26',
  profiles: {
    'rep-a': {
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      organizationId: 'aaaaaaaa-1111-4111-8111-111111111111',
      roleKeys: ['club_affiliation_representative'],
    },
    'rep-b': {
      userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      organizationId: 'bbbbbbbb-2222-4222-8222-222222222222',
      roleKeys: ['club_affiliation_representative'],
    },
  },
};

function loadFixture() {
  try {
    const parsed = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
    if (
      parsed &&
      typeof parsed === 'object' &&
      parsed.profiles &&
      typeof parsed.profiles === 'object' &&
      typeof parsed.tenantId === 'string'
    ) {
      return parsed;
    }
    return defaultFixture;
  } catch {
    return defaultFixture;
  }
}

function parseCookie(header) {
  if (!header) return {};
  const result = {};
  for (const segment of header.split(';')) {
    const [rawKey, ...rest] = segment.trim().split('=');
    if (!rawKey || rest.length === 0) continue;
    result[rawKey] = decodeURIComponent(rest.join('='));
  }
  return result;
}

function selectedProfile(req, fixture) {
  const cookies = parseCookie(req.headers.cookie);
  const key = cookies[COOKIE_NAME] ?? 'rep-a';
  return fixture.profiles[key] ?? fixture.profiles['rep-a'];
}

function writeJson(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}

function forward(req, res, fixture) {
  const target = new URL(req.url ?? '/', TARGET);
  const headers = { ...req.headers };
  const profile = selectedProfile(req, fixture);

  headers['x-house-tenant-id'] = fixture.tenantId;
  headers['x-house-actor-user-id'] = profile.userId;
  headers['x-house-actor-role-keys'] = Array.isArray(profile.roleKeys)
    ? profile.roleKeys.join(',')
    : 'club_affiliation_representative';
  headers['x-house-organization-id'] = profile.organizationId;
  headers.host = target.host;

  const upstreamReq = fetch(target, {
    method: req.method,
    headers,
    body:
      req.method === 'GET' || req.method === 'HEAD'
        ? undefined
        : req,
    duplex: 'half',
  });

  upstreamReq
    .then(async (upstream) => {
      const responseHeaders = {};
      upstream.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });
      res.writeHead(upstream.status, responseHeaders);
      if (upstream.body) {
        for await (const chunk of upstream.body) {
          res.write(chunk);
        }
      }
      res.end();
    })
    .catch((error) => {
      writeJson(res, 503, {
        status: 'error',
        code: 'EDGE_FORWARD_FAILED',
        message: 'Synthetic identity edge failed to reach API target.',
        detail: String(error),
      });
    });
}

createServer((req, res) => {
  const fixture = loadFixture();
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);

  if (url.pathname.startsWith('/__e2e__/identity/')) {
    const profileKey = decodeURIComponent(url.pathname.split('/').pop() ?? 'rep-a');
    if (!fixture.profiles[profileKey]) {
      writeJson(res, 404, { status: 'error', message: 'Unknown profile.' });
      return;
    }
    const returnTo = url.searchParams.get('returnTo') ?? '/button';
    res.writeHead(302, {
      'set-cookie': `${COOKIE_NAME}=${encodeURIComponent(profileKey)}; Path=/; HttpOnly; SameSite=Lax`,
      location: returnTo,
    });
    res.end();
    return;
  }

  if (url.pathname === '/__e2e__/fixture') {
    const profile = selectedProfile(req, fixture);
    writeJson(res, 200, {
      tenantId: fixture.tenantId,
      seasonId: fixture.seasonId,
      currentProfile: profile,
      profiles: fixture.profiles,
    });
    return;
  }

  if (url.pathname.startsWith('/v1/')) {
    forward(req, res, fixture);
    return;
  }

  writeJson(res, 404, { status: 'error', message: 'Not found.' });
})
  .listen(PORT, '127.0.0.1', () => {
    process.stdout.write(`trusted-identity-edge listening on http://127.0.0.1:${PORT}\n`);
  });
