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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/ledger', ledgerRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/reconciliation', reconciliationRoutes);
app.use('/api/attachments', attachmentsRoutes);
app.use('/api/scan', scanRoutes);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`MADEPINUS ledger API rodando em http://localhost:${PORT}`));
