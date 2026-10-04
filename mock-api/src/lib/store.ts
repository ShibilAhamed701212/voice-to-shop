import fs from 'fs';
import path from 'path';

function resolveDataDir(): string {
  const candidates = [
    process.env.SEED_DATA_DIR,
    path.join(__dirname, '..', '..', 'data'),
    path.resolve(process.cwd(), 'data'),
    path.resolve(process.cwd(), 'mock-api', 'data')
  ].filter(Boolean) as string[];
  return candidates.find(dir => fs.existsSync(path.join(dir, 'providers.json'))) || candidates[0];
}

export const SEED_DIR = resolveDataDir();
export const RUNTIME_DIR = process.env.DATA_DIR || path.join(SEED_DIR, 'runtime');

const persistenceEnabled = () => process.env.NODE_ENV !== 'test';

export function readSeed<T>(filename: string): T {
  return JSON.parse(fs.readFileSync(path.join(SEED_DIR, filename), 'utf-8')) as T;
}

/** Reads mutable runtime state, or returns null if it has never been written. */
export function readRuntime<T>(filename: string): T | null {
  if (!persistenceEnabled()) return null;
  const file = path.join(RUNTIME_DIR, filename);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
  } catch (err) {
    console.error(`Runtime file ${file} is corrupt, re-seeding:`, err);
    return null;
  }
}

/** Atomic write (tmp + rename) so a crash mid-write never corrupts state. */
export function writeRuntime(filename: string, data: unknown): void {
  if (!persistenceEnabled()) return;
  try {
    fs.mkdirSync(RUNTIME_DIR, { recursive: true });
    const file = path.join(RUNTIME_DIR, filename);
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmp, file);
  } catch (err) {
    console.error(`Failed to persist ${filename}:`, err);
  }
}
