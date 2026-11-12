// One browser export format. The audited strict writer remains separate in the
// core for explicit API/CLI use; the browser uses the complete ProCAM output.
export const NC1_OUTPUT_MODE = 'procam';

export function partMarkFromFilename(filename) {
  const stem = String(filename).split(/[\\/]/).pop().replace(/\.(step|stp|dxf)$/i, '');
  // Keep space for _P01…_P16 when a file contains multiple members or plates.
  return stem.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/×/g, 'x')
    .replace(/[^A-Za-z0-9_-]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '')
    .slice(0, 66).replace(/_+$/g, '') || 'MEMBER';
}
