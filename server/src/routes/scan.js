// server/src/routes/scan.js
import { Router } from 'express';
import { scanMonthFolder } from '../engine/networkScanner.js';

const router = Router();

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

export default router;
