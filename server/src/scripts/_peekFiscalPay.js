import fs from 'fs';
import path from 'path';
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
const dir = String.raw`\\192.168.1.190\f\ALAINE - CONTADORA\10-2026\XML 10-2026`;
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.xml')).slice(0, 8);
for (const f of files) {
  const j = parser.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const inf = j?.nfeProc?.NFe?.infNFe ?? j?.NFe?.infNFe;
  console.log({
    file: f.slice(-45),
    mod: inf?.ide?.mod,
    nNF: inf?.ide?.nNF,
    pag: inf?.pag,
  });
}

const cielo = String.raw`\\192.168.1.190\f\ALAINE - CONTADORA\10-2026\RELATÓRIO OPERADORAS DE CARTÃO\CIELO\Vendas_cielo_historico_detalhe-20261001-20261031-1-1-csv.csv`;
const lines = fs.readFileSync(cielo, 'utf8').split(/\r?\n/);
console.log('cielo lines', lines.length);
for (let i = 0; i < Math.min(40, lines.length); i++) {
  if (/data|valor|autoriz|nsu|venda/i.test(lines[i]) || i > 25) {
    console.log(i, lines[i].slice(0, 160));
  }
}
