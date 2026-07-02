// server/src/routes/upload.js
import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const { bankAccountId, month } = req.body;
    const dir = path.join(__dirname, '../../data/uploads', bankAccountId || 'unknown', month || 'unknown');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => cb(null, file.originalname),
});
const upload = multer({ storage });

// POST /api/upload  (multipart: file, bankAccountId, month)
router.post('/', upload.single('file'), (req, res) => {
  res.json({ ok: true, path: req.file.path });
});

export default router;
