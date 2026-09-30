// server/src/routes/scan.js
import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { listNetworkMonths, scanMonthFolder } from '../engine/networkScanner.js';
import { netlifyDataRoot } from '../config.js';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pipelineScript = path.join(__dirname, '../engine/runFullPipeline.js');

function listLedgerMonths() {
  if (!fs.existsSync(netlifyDataRoot)) return [];
  return fs.readdirSync(netlifyDataRoot)
    .filter((f) => /^ledger-\d{4}-\d{2}\.json$/.test(f))
    .map((f) => f.slice('ledger-'.length, -'.json'.length))
    .sort();
}

/** Roda o pipeline em processo filho para não ser interrompido pelo --watch da API. */
function runPipelineChild(monthOrAll) {
  const args = monthOrAll === 'all'
    ? [pipelineScript, '--all']
    : [pipelineScript, `--month=${monthOrAll}`];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: path.join(__dirname, '../..'),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        const detail = (stderr || stdout).trim().split('\n').filter(Boolean).slice(-8).join('\n');
        reject(new Error(detail || `Pipeline encerrou com código ${code}`));
        return;
      }
      const marker = '__PIPELINE_RESULT__';
      const line = stdout.split('\n').reverse().find((l) => l.includes(marker));
      if (line) {
        try {
          resolve(JSON.parse(line.slice(line.indexOf(marker) + marker.length)));
          return;
        } catch { /* fallback abaixo */ }
      }
      resolve({
        month: monthOrAll,
        action: monthOrAll === 'all' ? 'process_all' : 'process',
        stats: {},
      });
    });
  });
}

// GET /api/scan/months — meses na rede da contadora + meses já processados (ledger)
router.get('/months', (_req, res) => {
  try {
    const network = listNetworkMonths();
    const processed = listLedgerMonths();
    const all = [...new Set([...network, ...processed])].sort();
    res.json({
      months: all,
      network,
      processed,
      pending: network.filter((m) => !processed.includes(m)),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/scan?month=2026-06 — lista arquivos na pasta de rede (sem processar)
router.get('/', (req, res) => {
  const { month } = req.query;
  if (!month) return res.status(400).json({ error: 'Parâmetro month obrigatório (YYYY-MM)' });
  try {
    const result = scanMonthFolder(month);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/scan/process { month: "YYYY-MM" | "all" } — pipeline completo
router.post('/process', async (req, res) => {
  const month = req.body?.month || req.query?.month;
  if (!month || (month !== 'all' && !/^\d{4}-\d{2}$/.test(month))) {
    return res.status(400).json({ error: 'Informe month no formato YYYY-MM ou "all"' });
  }
  req.setTimeout(0);
  res.setTimeout(0);
  try {
    const result = await runPipelineChild(month);
    res.json(result);
  } catch (err) {
    console.error('[scan/process]', err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

export default router;
