import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Caminho UNC padrão da pasta contábil no servidor local */
export const NETWORK_BASE = process.env.NETWORK_PATH
  || '\\\\192.168.1.190\\f\\GOOGLE DRIVE\\NOVA EMPRESA-LOJA\\FALCÃO & FRAZÃO M E F\\CONTABILIDADE\\ALAINE - CONTADORA';

/** Mapeamento pasta de banco → id interno + código COA (balancete Abr/2026) */
export const BANK_FOLDER_MAP = {
  'BANCO DO BRASIL': { id: 'bb-847-8', coa: '1.01.01.01.02.0001' },
  'BANCO INTER': { id: 'inter-9908006-0', coa: '1.01.01.01.02.0004' },
  'BANCO BNB': { id: 'bnb-119424-3', coa: '1.01.01.01.02.0005' },
  'BANCO MERCADO PAGO': { id: 'mercadopago', coa: '1.01.01.01.02.0008' },
};

export const ITAU_ACCOUNT_MAP = {
  '29660-2': { id: 'itau-29660-2', coa: '1.01.01.01.02.0002' },
  '57563-6': { id: 'itau-57563-6', coa: '1.01.01.01.02.0010' },
  '31689-7': { id: 'itau-31689-7', coa: '1.01.01.01.02.0003' },
  '05068-7': { id: 'itau-05068-7', coa: '1.01.01.01.02.0006' },
  '33489-0': { id: 'itau-33489-0', coa: '1.01.01.01.02.0007' },
};

export const ATTACHMENT_EXTENSIONS = new Set([
  '.pdf', '.jpg', '.jpeg', '.tiff', '.tif', '.txt', '.xml',
]);

export const STATEMENT_EXTENSIONS = new Set(['.csv', '.txt', '.xlsx', '.xls', '.ofx']);

export const dbPath = path.join(__dirname, '../data/madepinus.db');
export const uploadsRoot = path.join(__dirname, '../data/uploads');
export const attachmentsRoot = path.join(__dirname, '../data/attachments');
export const netlifyDataRoot = path.join(__dirname, '../../client/public/data');
