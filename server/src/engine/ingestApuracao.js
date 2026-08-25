// server/src/engine/ingestApuracao.js
// Copia documentos oficiais de apuração da pasta de rede para APURAÇÃO/YYYY-MM (local).

import fs from 'node:fs';
import path from 'node:path';
import { NETWORK_BASE, TAX_APURACAO_DIR } from '../config.js';
import { monthToFolder } from './networkScanner.js';

const SKIP = /^(desktop\.ini|thumbs\.db)$/i;
const TAX_DIR_RE = /APURA|ICMS|PIS|COFINS|IRPJ|CSLL|BALANC/i;
const TAX_FILE_RE = /DAR|MEMORIA|BALANCETE|ICMS|PIS|COFINS|IRPJ|CSLL|ANTEC/i;

function safeCopy(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

export function localApuracaoDir(month) {
  return path.join(TAX_APURACAO_DIR, month);
}

export function inventoryLocalApuracao(month) {
  const dir = localApuracaoDir(month);
  const files = [];
  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir)) {
      if (SKIP.test(name) || name.startsWith('_')) continue;
      const full = path.join(dir, name);
      if (!fs.statSync(full).isFile()) continue;
      files.push({ name, path: full, size: fs.statSync(full).size });
    }
  }
  const dars = files.filter((f) => /^DAR/i.test(f.name));
  const icms = files.find((f) => /MEMORIA.+ICMS|APURA.+ICM|ICMS\s+\d{6}/i.test(f.name));
  const pis = files.find((f) => /PIS|COFINS/i.test(f.name) && /MEMORIA|APURA/i.test(f.name));
  const irpj = files.find((f) => /IRPJ|CSLL/i.test(f.name));
  const balancete = files.find((f) => /BALANCETE/i.test(f.name));
  return { dir, files, dars, icms, pis, irpj, balancete };
}

export function ingestApuracaoFromNetwork(month) {
  const monthFolder = monthToFolder(month);
  const root = path.join(NETWORK_BASE, monthFolder);
  const dest = localApuracaoDir(month);
  const copied = [];
  if (!fs.existsSync(root)) {
    return { dest, copied, missing: true };
  }

  fs.mkdirSync(dest, { recursive: true });

  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(root, ent.name);
    if (ent.isDirectory() && TAX_DIR_RE.test(ent.name)) {
      for (const name of fs.readdirSync(full)) {
        if (SKIP.test(name) || !TAX_FILE_RE.test(name)) continue;
        const src = path.join(full, name);
        if (!fs.statSync(src).isFile()) continue;
        const target = path.join(dest, name);
        safeCopy(src, target);
        copied.push(name);
      }
    } else if (ent.isFile() && TAX_FILE_RE.test(ent.name) && !SKIP.test(ent.name)) {
      safeCopy(full, path.join(dest, ent.name));
      copied.push(ent.name);
    }
  }

  return { dest, copied, missing: false, inventory: inventoryLocalApuracao(month) };
}
