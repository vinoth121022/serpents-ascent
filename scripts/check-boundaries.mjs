// Gate 2 enforcement: src/core must have zero imports from three/react/@react-three/zustand.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FORBIDDEN = /from\s+['"](three|react|zustand|@react-three)[/'"]/;
const root = fileURLToPath(new URL('../src/core', import.meta.url));

const offenders = [];
function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(entry)) {
      const lines = readFileSync(p, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (FORBIDDEN.test(line)) offenders.push(`${p}:${i + 1}  ${line.trim()}`);
      });
    }
  }
}
walk(root);

if (offenders.length > 0) {
  console.error('BOUNDARY VIOLATION — src/core imports framework code:');
  for (const o of offenders) console.error('  ' + o);
  process.exit(1);
}
console.log('boundaries OK: src/core is framework-free');
