export function normalizeSchemeName(str) {
  if (!str) return '';
  return str.toUpperCase()
    .replace(/\s*-\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/DIRECT PLAN/g, 'DIRECT')
    .replace(/REGULAR PLAN/g, 'REGULAR')
    .replace(/GROWTH OPTION/g, 'GROWTH')
    .replace(/IDCW OPTION/g, 'IDCW')
    .replace(/[^A-Z0-9]/g, '')
    .trim();
}
