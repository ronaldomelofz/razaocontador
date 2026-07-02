// Extrai nome da contraparte a partir do histórico bancário (PIX recebido)

const OWN_CNPJ = '10876822000194';
const PARTNERS = [
  { pattern: /RONALDO\s*MEL/i, name: 'RONALDO MELO FRAZAO', doc: '70886407320' },
  { pattern: /ARIOSTO\s*FALC/i, name: 'ARIOSTO FALCAO MARTINS', doc: null },
];

export function isOwnCompany(text) {
  return new RegExp(OWN_CNPJ, 'i').test(text || '')
    || /FALCAO\s*&?\s*FRAZAO\s*LTDA|MADEPINUS/i.test(text || '');
}

export function isPartner(text) {
  return PARTNERS.some((p) => p.pattern.test(text || ''));
}

export function getPartner(text) {
  return PARTNERS.find((p) => p.pattern.test(text || '')) || null;
}

/** Nome legível da contraparte extraído do histórico PIX */
export function extractClientName(description, counterparty) {
  const hay = `${description || ''} ${counterparty || ''}`.trim();
  if (isOwnCompany(hay)) return null;
  if (isPartner(hay)) return null;

  // Itaú: "Pix - Recebido DD/MM HH:MM DOC NOME"
  let m = hay.match(/Pix\s*-\s*Recebido\s+(?:\d{2}\/\d{2}\s+\d{2}:\d{2}\s+)?\d{11,14}\s+(.+)$/i);
  if (m) return m[1].trim().split(/\s+\d{2}\/\d{2}/)[0].trim();

  // BB: "Pix - Recebido NOME"
  m = hay.match(/Pix\s*-\s*Recebido\s+(.+)$/i);
  if (m && !/^\d/.test(m[1])) return m[1].trim();

  // Inter / genérico após CPF/CNPJ
  m = hay.match(/(?:Cp\s*:|Recebido\s+)(?:\d+-)?([A-ZÀ-Ú][A-ZÀ-Ú\s]+)/i);
  if (m) return m[1].trim();

  return counterparty?.replace(/^\d{2}\/\d{2}.*?\d{11,14}\s+/, '').trim() || null;
}

export { PARTNERS, OWN_CNPJ };
