/**
 * Parses PostgreSQL text array format into a JavaScript array.
 * PostgreSQL returns text[] as strings like: {tag1,"tag with spaces",tag3}
 * Handles: null, undefined, already-parsed arrays, raw strings, escaped quotes (""), empty elements.
 */
export function parsePostgresArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  
  const str = value.trim();
  if (!str.startsWith('{') || !str.endsWith('}')) return [];
  
  const inner = str.slice(1, -1);
  if (inner === '') return [];
  
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;
  
  while (i < inner.length) {
    const char = inner[i];
    
    if (inQuotes) {
      if (char === '"') {
        if (inner[i + 1] === '"') {
          current += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else if (char === '\\' && i + 1 < inner.length) {
        current += inner[i + 1];
        i += 2;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      } else if (char === ',') {
        result.push(current);
        current = '';
        i++;
        continue;
      }
    }
    
    current += char;
    i++;
  }
  
  result.push(current);
  return result;
}
