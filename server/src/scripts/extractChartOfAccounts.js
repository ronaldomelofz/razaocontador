// server/src/scripts/extractChartOfAccounts.js
// Extrai plano de contas completo dos PDFs Balanço e Balancete (PROSIS/Alterdata)

import fs from 'node:fs';
import path from 'node:path';
import pdfParse from 'pdf-parse';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '../../../');

const PDFS = [
  path.join(root, 'Balancete Contabil 042026.pdf'),
  path.join(root, 'Balanço 2024 assinado.pdf'),
];

const CODE = '[1-5]\\.\\d{2}(?:\\.\\d{2}){1,5}(?:\\.\\d{4})?';
const CODE_LINE_RE = new RegExp(`^(${CODE})\\s+[\\d.,]`);
const GLUED_RE = new RegExp(`^(.+?)(${CODE})\\s+[\\d.,]`);
const GLOBAL_CODE_RE = new RegExp(`(${CODE})\\s+[\\d.,]+`, 'g');

const SKIP = /^(Folha:|Empresa:|CNPJ:|Período:|IE:|Junta|Local|Data|Número|Endereço|Descrição|Conta|Débito|Crédito|Saldo|ATIVOPASSIVO|PROSIS|BALANCETE|BALANÇO)/i;

const KNOWN_NAMES = {
  '1.01.01.01.02.0001': 'Banco do Brasil - Ag: 3219-0 Cc: 847-8',
  '1.01.01.01.02.0002': 'Banco Itaú - Ag: 4826 Cc: 29660-2',
  '1.01.01.01.02.0003': 'Banco Itaú - Ag: 4826 Cc: 31689-7',
  '1.01.01.01.02.0004': 'Banco Inter - Ag: 0001-9 Cc: 9908006-0',
  '1.01.01.01.02.0005': 'Banco do Nordeste - Ag: 56 Cc: 119424-3',
  '1.01.01.01.02.0006': 'Banco Itaú - Ag: 0575 Cc: 05068-7',
  '1.01.01.01.02.0007': 'Banco Itaú - Ag: 4826 Cc: 33489-0',
  '1.01.01.01.02.0008': 'Mercado Pago',
  '1.01.01.01.02.0010': 'Banco Itaú - Ag: 8840 Cc: 57563-6',
  '1.01.01.01.03.0001': 'Aplicação Auto Mais',
  '2.02.01.04.01.0001': 'Dividendos a Pagar - Ariosto',
  '2.02.01.04.01.0002': 'Dividendos a Pagar - Ronaldo',
};

function inferType(code, name, section = '') {
  const n = `${name} ${section}`.toUpperCase();
  if (/PATRIM|CAPITAL SOCIAL|LUCRO|PREJU|RESULTADO/i.test(n)) return 'patrimonio';
  if (code.startsWith('1.')) return 'ativo';
  if (code.startsWith('2.')) return 'passivo';
  if (code.startsWith('3.')) return 'receita';
  if (code.startsWith('4.')) return 'despesa';
  return 'patrimonio';
}

function cleanName(s) {
  return s
    .replace(/\*+/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\d.,\s]+/i, '')
    .trim();
}

function validName(s) {
  if (!s || s.length < 2 || s.length > 120) return false;
  if (/^[\d.,\s]+$/i.test(s)) return false;
  if ((s.match(/\d/g) || []).length > s.length * 0.3) return false;
  return /[A-Za-zÀ-ú]/.test(s);
}

function lineHasCode(line) {
  return CODE_LINE_RE.test(line) || GLUED_RE.test(line);
}

function set(map, code, name, section) {
  if (KNOWN_NAMES[code]) name = KNOWN_NAMES[code];
  const type = inferType(code, name, section);
  const prev = map.get(code);
  const rank = (n) => (KNOWN_NAMES[code] ? 1000 : n === code ? 0 : n.length);
  if (!prev || rank(name) > rank(prev.name) || (rank(name) === rank(prev.name) && name.length > prev.name.length)) {
    map.set(code, { code, name, type });
  }
}

function isAnalyticLine(line) {
  const glued = line.match(GLUED_RE);
  if (glued) return true;
  const codeLine = line.match(CODE_LINE_RE);
  return Boolean(codeLine && /\.\d{4}$/.test(codeLine[1]));
}

function nameBefore(lines, i) {
  let name = '';
  for (let j = i - 1; j >= Math.max(0, i - 6); j--) {
    const prev = lines[j];
    if (SKIP.test(prev) || /^\* \* \*/.test(prev)) break;
    if (isAnalyticLine(prev)) break;
    const part = cleanName(prev);
    if (!validName(part)) continue;
    name = name ? `${part} ${name}` : part;
  }
  return cleanName(name);
}

function nameAfter(lines, i, code) {
  for (let j = i + 1; j <= Math.min(lines.length - 1, i + 4); j++) {
    const next = lines[j];
    const glued = next.match(GLUED_RE);
    if (glued && glued[2].startsWith(code) && validName(cleanName(glued[1]))) {
      return cleanName(glued[1]);
    }
    if (isAnalyticLine(next)) break;
    if (SKIP.test(next) || /^\* \* \*/.test(next)) break;
    const part = cleanName(next);
    if (validName(part)) return part;
  }
  return '';
}

function parseBalancete(text) {
  const accounts = new Map();
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  let section = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\* \* \*/.test(line)) { section = line; continue; }
    if (SKIP.test(line)) continue;

    const glued = line.match(GLUED_RE);
    if (glued) {
      const name = cleanName(glued[1]);
      if (validName(name)) set(accounts, glued[2], name, section);
      continue;
    }

    const codeLine = line.match(CODE_LINE_RE);
    if (!codeLine) continue;

    const code = codeLine[1];
    let name = nameBefore(lines, i);
    if (!validName(name)) name = nameAfter(lines, i, code);
    if (!validName(name)) {
      const sec = section.replace(/\*+/g, '').trim();
      if (sec.length > 3) name = sec;
    }
    if (validName(name)) set(accounts, code, name, section);
    else set(accounts, code, code, section);
  }

  // Garante todos os códigos presentes no PDF (inclui grupos sintéticos)
  for (const m of text.matchAll(GLOBAL_CODE_RE)) {
    if (!accounts.has(m[1])) set(accounts, m[1], m[1], '');
  }

  repairGluedNames(text, accounts);
  repairLineNames(text, accounts);

  return accounts;
}

function repairLineNames(text, accounts) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const codeLine = lines[i].match(CODE_LINE_RE);
    if (!codeLine) continue;
    const code = codeLine[1];
    if (accounts.get(code)?.name !== code) continue;
    let name = nameBefore(lines, i);
    if (!validName(name)) name = nameAfter(lines, i, code);
    if (validName(name)) set(accounts, code, name, '');
  }
}

function repairGluedNames(text, accounts) {
  for (const acc of accounts.values()) {
    if (acc.name !== acc.code) continue;
    const esc = acc.code.replace(/\./g, '\\.');
    const re = new RegExp(`([A-ZÀ-Úa-zà-ú][A-Za-zÀ-ú0-9 &./\\-]{2,100}?)${esc}\\s+[\\d.,]`, 'i');
    const m = text.match(re);
    if (m) {
      const name = cleanName(m[1]);
      if (validName(name)) set(accounts, acc.code, name, '');
    }
  }
}

function enrichFromBalanco(text, accounts) {
  for (const line of text.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const glued = line.match(GLUED_RE);
    if (glued) {
      const name = cleanName(glued[1]);
      if (validName(name)) set(accounts, glued[2], name, '');
      continue;
    }

    const m = line.match(/^(.+?)\s+([\d.,]+)\s*(DB|CR)\s*$/i);
    if (!m) continue;
    const name = cleanName(m[1]);
    if (!validName(name) || name.length < 6) continue;
    if (/^(ATIVO|PASSIVO|TOTAL|P A T R)/i.test(name)) continue;

    for (const acc of accounts.values()) {
      const a = name.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const b = acc.name.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (a.length >= 8 && b.length >= 8 && (a.includes(b.slice(0, 12)) || b.includes(a.slice(0, 12)))) {
        if (name.length > acc.name.length) acc.name = name;
      }
    }
  }
}

async function main() {
  const merged = new Map();

  for (const pdf of PDFS) {
    if (!fs.existsSync(pdf)) { console.warn('Ausente:', pdf); continue; }
    const { text } = await pdfParse(fs.readFileSync(pdf));
    const base = path.basename(pdf);

    if (/BALANÇO PATRIMONIAL/i.test(text)) {
      enrichFromBalanco(text, merged);
      console.log(`${base}: nomes complementados`);
    } else {
      const parsed = parseBalancete(text);
      for (const [k, v] of parsed) merged.set(k, v);
      console.log(`${base}: ${parsed.size} contas`);
    }
  }

  for (const [code, name] of Object.entries(KNOWN_NAMES)) {
    set(merged, code, name, '');
  }

  merged.set('9.9.9.99', { code: '9.9.9.99', name: 'Conta a classificar (revisão manual)', type: 'despesa' });

  const list = [...merged.values()].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  const out = path.join(__dirname, '../data/chartOfAccounts.json');
  fs.writeFileSync(out, JSON.stringify(list, null, 2));

  const semNome = list.filter((a) => a.name === a.code && a.code !== '9.9.9.99');
  console.log(`\n✅ Total: ${list.length} contas → ${out}`);
  console.log(`   Fornecedores: ${list.filter((a) => a.code.startsWith('2.01.01.01.01.')).length}`);
  console.log(`   Sem nome descritivo: ${semNome.length}`);
  list.filter((a) => /dividendo/i.test(a.name)).forEach((a) => console.log(`   ${a.code} — ${a.name}`));
}

main();
