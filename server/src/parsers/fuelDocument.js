// server/src/parsers/fuelDocument.js
// Extrai data/hora do nome de cupons e notas na pasta COMBUSTÍVEL (PDFs escaneados).

/**
 * @param {string} name
 * @param {import('fs').Stats} [stat]
 */
export function parseFuelFilename(name, stat) {
  // Scan_20260624_144751.jpg
  let m = name.match(/Scan_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/i);
  if (m) {
    return {
      doc_date: `${m[1]}-${m[2]}-${m[3]}`,
      doc_time: `${m[4]}:${m[5]}`,
    };
  }

  // Digitalizado_20260616-1520.pdf
  m = name.match(/Digitalizado_(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})/i);
  if (m) {
    return {
      doc_date: `${m[1]}-${m[2]}-${m[3]}`,
      doc_time: `${m[4]}:${m[5]}`,
    };
  }

  // combustível 09062026.pdf — DDMMYYYY
  m = name.match(/(\d{2})(\d{2})(\d{4})/);
  if (m) {
    return {
      doc_date: `${m[3]}-${m[2]}-${m[1]}`,
      doc_time: null,
    };
  }

  // combustível 062026.pdf — MMYYYY
  m = name.match(/(\d{2})(\d{4})/);
  if (m) {
    const day = stat ? String(stat.mtime.getDate()).padStart(2, '0') : '01';
    return {
      doc_date: `${m[2]}-${m[1]}-${day}`,
      doc_time: null,
    };
  }

  if (stat?.mtime) {
    return { doc_date: stat.mtime.toISOString().slice(0, 10), doc_time: null };
  }

  return { doc_date: null, doc_time: null };
}

export const FUEL_DOC_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.tif', '.tiff']);
