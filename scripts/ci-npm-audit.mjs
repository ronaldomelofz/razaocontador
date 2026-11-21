#!/usr/bin/env node
/**
 * CI: npm audit em client/ e server/ com allowlist de riscos aceitos.
 * Falha o job se houver vulnerabilidade NÃO listada / acima do nível aceito.
 * Uso: node scripts/ci-npm-audit.mjs
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const allowPath = path.join(root, '.github', 'npm-audit-allowlist.yml');

const SEV_RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };

function parseAllowlist(text) {
  const map = new Map(); // key: dir|pkg -> maxSeverity
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*-\s*"([^"|]+)\|([^"|]+)\|([^"|]+)"\s*$/);
    if (!m) continue;
    const [, dir, pkg, sev] = m;
    map.set(`${dir}|${pkg}`, sev.toLowerCase());
  }
  return map;
}

function auditDir(dir) {
  const cwd = path.join(root, dir);
  if (!fs.existsSync(path.join(cwd, 'package.json'))) {
    return { dir, skipped: true, findings: [] };
  }
  const r = spawnSync('npm', ['audit', '--json'], {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    maxBuffer: 20 * 1024 * 1024,
  });
  let json = {};
  try {
    json = JSON.parse(r.stdout || '{}');
  } catch {
    return { dir, error: 'Falha ao parsear npm audit JSON', findings: [] };
  }
  const vulns = json.vulnerabilities || {};
  const findings = [];
  for (const [name, info] of Object.entries(vulns)) {
    findings.push({
      name,
      severity: String(info.severity || 'info').toLowerCase(),
      via: info.via,
      range: info.range,
      fixAvailable: info.fixAvailable,
    });
  }
  return { dir, findings, metadata: json.metadata };
}

function isAllowed(allow, dir, finding) {
  const key = `${dir}|${finding.name}`;
  const max = allow.get(key);
  if (!max) return false;
  return SEV_RANK[finding.severity] <= SEV_RANK[max];
}

const allowText = fs.existsSync(allowPath) ? fs.readFileSync(allowPath, 'utf8') : '';
const allow = parseAllowlist(allowText);

const targets = ['client', 'server'];
let failed = false;
const summary = [];

console.log('== npm audit CI (alerta anti-CVE automatizado) ==\n');

for (const dir of targets) {
  const result = auditDir(dir);
  if (result.skipped) {
    console.log(`[${dir}] sem package.json — ignorado`);
    continue;
  }
  if (result.error) {
    console.error(`[${dir}] ${result.error}`);
    failed = true;
    continue;
  }

  const allowed = [];
  const blocking = [];
  for (const f of result.findings) {
    if (isAllowed(allow, dir, f)) allowed.push(f);
    else blocking.push(f);
  }

  console.log(`\n### ${dir} — ${result.findings.length} pacote(s) com advisory`);
  for (const f of allowed) {
    console.log(`  ALLOW  ${f.severity.padEnd(8)} ${f.name}`);
  }
  for (const f of blocking) {
    console.log(`  BLOCK  ${f.severity.padEnd(8)} ${f.name}  fix=${JSON.stringify(f.fixAvailable)}`);
  }

  summary.push({ dir, allowed: allowed.length, blocking: blocking.length, total: result.findings.length });
  if (blocking.length) failed = true;
}

console.log('\n--- resumo ---');
for (const s of summary) {
  console.log(`${s.dir}: total=${s.total} allow=${s.allowed} block=${s.blocking}`);
}

if (failed) {
  console.error('\nFALHA: vulnerabilidade nova/fora da allowlist. Atualize a dep ou documente em .github/npm-audit-allowlist.yml');
  process.exit(1);
}

console.log('\nOK: sem CVEs bloqueantes além dos riscos aceitos documentados.');
process.exit(0);
