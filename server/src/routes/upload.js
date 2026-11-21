// server/src/routes/upload.js
import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();
const uploadsRoot = path.resolve(__dirname, '../../data/uploads');

const ALLOWED_EXT = new Set([
  '.pdf', '.csv', '.txt', '.ofx', '.ofc', '.xlsx', '.xls', '.xml', '.jpg', '.jpeg', '.png', '.tif', '.tiff',
]);

function safeSegment(value, fallback = 'unknown') {
  const s = String(value || fallback).trim();
  if (!/^[a-zA-Z0-9._-]{1,64}$/.test(s)) return fallback;
  return s;
}

function safeFilename(original) {
  const base = path.basename(String(original || 'upload.bin')).replace(/[^\w.\-()\s\u00C0-\u024F]/g, '_');
  const cleaned = base.slice(0, 180) || 'upload.bin';
  const ext = path.extname(cleaned).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) return null;
  return cleaned;
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const bankAccountId = safeSegment(req.body?.bankAccountId);
    const month = safeSegment(req.body?.month);
    if (month !== 'unknown' && !/^\d{4}-\d{2}$/.test(month)) {
      cb(new Error('month inválido'));
      return;
    }
    const dir = path.join(uploadsRoot, bankAccountId, month);
    const resolved = path.resolve(dir);
    if (!resolved.startsWith(uploadsRoot + path.sep) && resolved !== uploadsRoot) {
      cb(new Error('destino inválido'));
      return;
    }
    fs.mkdirSync(resolved, { recursive: true });
    cb(null, resolved);
  },
  filename: (_req, file, cb) => {
    const name = safeFilename(file.originalname);
    if (!name) {
      cb(new Error('extensão não permitida'));
      return;
    }
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
});

// POST /api/upload  (multipart: file, bankAccountId, month) — só DEV local
router.post('/', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload rejeitado' });
    if (!req.file) return res.status(400).json({ error: 'Arquivo obrigatório' });
    res.json({ ok: true, name: req.file.filename, size: req.file.size });
  });
});

export default router;
