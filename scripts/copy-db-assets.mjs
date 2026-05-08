import { cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname ?? new URL('.', import.meta.url).pathname, '..');
const src = resolve(root, 'db');
const dest = resolve(root, 'dist', 'db');

await mkdir(resolve(root, 'dist'), { recursive: true });
await cp(src, dest, { recursive: true });

