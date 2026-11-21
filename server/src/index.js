// server/src/index.js
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ledgerRoutes from './routes/ledger.js';
import uploadRoutes from './routes/upload.js';
import exportRoutes from './routes/export.js';
import reconciliationRoutes from './routes/reconciliation.js';
import attachmentsRoutes from './routes/attachments.js';
import scanRoutes from './routes/scan.js';
import taxAssessmentRoutes from './routes/taxAssessment.js';
import boletosFornecedoresRoutes from './routes/boletosFornecedores.js';
import fiscalPagamentosRoutes from './routes/fiscalPagamentos.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const isProd = process.env.NODE_ENV === 'production';
const bindHost = process.env.BIND_HOST || '127.0.0.1';

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cache-Control', 'no-store');
  next();
});

app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
  ],
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

app.use('/api/ledger', ledgerRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/reconciliation', reconciliationRoutes);
app.use('/api/attachments', attachmentsRoutes);
app.use('/api/scan', scanRoutes);
// Local apenas: não existe equivalente em netlify/functions/api.mjs
app.use('/api/tax-assessment', taxAssessmentRoutes);
app.use('/api/boletos-fornecedores', boletosFornecedoresRoutes);
app.use('/api/fiscal-pagamentos', fiscalPagamentosRoutes);

app.get('/api/health', (_req, res) => res.json({ ok: true, bind: bindHost }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, bindHost, () => {
  console.log(`MADEPINUS ledger API em http://${bindHost}:${PORT}${isProd ? ' (production)' : ''}`);
});
