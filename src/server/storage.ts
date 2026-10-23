// Object storage: Replit App Storage, with a local-disk fallback (.data/objects) when the client can't initialise (tests).
import { Client } from '@replit/object-storage';
import { promises as fs, createReadStream } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

export interface Storage {
  put(key: string, buf: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  stream(key: string): Promise<Readable | null>;
  exists(key: string): Promise<boolean>;
}

export function memoryStorage(): Storage & { map: Map<string, Buffer> } {
  const map = new Map<string, Buffer>();
  return {
    map,
    async put(k, b) { map.set(k, b); },
    async get(k) { return map.get(k) ?? null; },
    async stream(k) { const b = map.get(k); return b ? Readable.from([b]) : null; },
    async exists(k) { return map.has(k); },
  };
}

function diskStorage(): Storage {
  const root = path.resolve(process.cwd(), '.data', 'objects');
  const p = (k: string) => path.join(root, k.replace(/[^a-zA-Z0-9._/-]/g, '_'));
  return {
    async put(k, b) { await fs.mkdir(path.dirname(p(k)), { recursive: true }); await fs.writeFile(p(k), b); },
    async get(k) { try { return await fs.readFile(p(k)); } catch { return null; } },
    async stream(k) { try { await fs.access(p(k)); return createReadStream(p(k)); } catch { return null; } },
    async exists(k) { try { await fs.access(p(k)); return true; } catch { return false; } },
  };
}

function replitStorage(): Storage {
  const c = new Client();
  return {
    async put(k, b) {
      const r = await c.uploadFromBytes(k, b);
      if (!r.ok) throw new Error(`storage put failed: ${r.error?.message}`);
    },
    async get(k) {
      const r = await c.downloadAsBytes(k);
      return r.ok ? r.value[0] : null;
    },
    async stream(k) {
      const e = await c.exists(k);
      if (!e.ok || !e.value) return null;
      return c.downloadAsStream(k);
    },
    async exists(k) {
      const e = await c.exists(k);
      return e.ok && e.value;
    },
  };
}

export function makeStorage(): Storage {
  try {
    return replitStorage();
  } catch (e) {
    console.warn('[storage] App Storage unavailable, using local disk:', (e as Error).message);
    return diskStorage();
  }
}

export const docExt = (mime: string) => (mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'bin');
