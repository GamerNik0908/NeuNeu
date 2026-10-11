// Länder als ISO-3166-Codes (nötig für E-Rechnungen) mit deutschen Namen.
const EU = ['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK'];

const COUNTRIES = {
  DE: 'Deutschland', AT: 'Österreich', CH: 'Schweiz', LI: 'Liechtenstein', LU: 'Luxemburg', NL: 'Niederlande',
  BE: 'Belgien', FR: 'Frankreich', IT: 'Italien', ES: 'Spanien', PT: 'Portugal', PL: 'Polen', CZ: 'Tschechien',
  DK: 'Dänemark', SE: 'Schweden', FI: 'Finnland', IE: 'Irland', GR: 'Griechenland', HU: 'Ungarn', SK: 'Slowakei',
  SI: 'Slowenien', HR: 'Kroatien', RO: 'Rumänien', BG: 'Bulgarien', EE: 'Estland', LV: 'Lettland', LT: 'Litauen',
  MT: 'Malta', CY: 'Zypern', NO: 'Norwegen', GB: 'Vereinigtes Königreich', US: 'Vereinigte Staaten', CA: 'Kanada',
  AU: 'Australien', TR: 'Türkei', AE: 'Vereinigte Arabische Emirate', JP: 'Japan', CN: 'China', IN: 'Indien',
};

// Für Altdaten, in denen das Land als Name gespeichert wurde.
const BY_NAME = Object.fromEntries(Object.entries(COUNTRIES).map(([code, name]) => [name.toLowerCase(), code]));

function toCode(value) {
  const v = String(value || '').trim();
  if (!v) return 'DE';
  if (COUNTRIES[v.toUpperCase()]) return v.toUpperCase();
  return BY_NAME[v.toLowerCase()] || v;
}

const isEU = (code) => EU.includes(code);
const countryName = (code) => COUNTRIES[code] || code;

module.exports = { COUNTRIES, EU, toCode, isEU, countryName };
