import { toast } from 'sonner';
import { ms } from '@/i18n/ms';
import { en } from '@/i18n/en';
// Client-side capture prep. Rule (notes 12): PNG/JPEG with long edge <= 1600 and <= 4MB upload unchanged; else downscale to JPEG.
export interface Prepared { blob: Blob; width: number; height: number; pageCount: number; name: string; note?: 'page1' }

const MAX_EDGE = 1600;
const MAX_BYTES = 4 * 1024 * 1024;

async function decode(file: Blob): Promise<{ src: CanvasImageSource; width: number; height: number; close: () => void }> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { src: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
  } catch {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    await img.decode();
    return { src: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  }
}

const toBlob = (c: HTMLCanvasElement, type: string, q?: number) =>
  new Promise<Blob>((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('encode failed'))), type, q));

type Decoded = Awaited<ReturnType<typeof decode>>;
async function downscale(d: Decoded, edge: number): Promise<Prepared> {
  const scale = Math.min(1, edge / Math.max(d.width, d.height));
  const w = Math.round(d.width * scale), h = Math.round(d.height * scale);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(d.src, 0, 0, w, h);
  d.close();
  return { blob: await toBlob(c, 'image/jpeg', 0.85), width: w, height: h, pageCount: 1, name: 'scan.jpg' };
}

/** EXIF orientation (tag 0x0112) from the first 64 KB of a JPEG; 1 when absent. */
async function exifOrientation(file: Blob): Promise<number> {
  if (file.type !== 'image/jpeg') return 1;
  const v = new DataView(await file.slice(0, 65536).arrayBuffer());
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return 1;
  let o = 2;
  while (o + 4 < v.byteLength) {
    const marker = v.getUint16(o); const len = v.getUint16(o + 2);
    if (marker === 0xffe1 && o + 10 < v.byteLength && v.getUint32(o + 4) === 0x45786966) {
      const t = o + 10; const le = v.getUint16(t) === 0x4949;
      const ifd = t + v.getUint32(t + 4, le);
      const n = v.getUint16(ifd, le);
      for (let i = 0; i < n; i++) { const e = ifd + 2 + i * 12; if (e + 10 > v.byteLength) break; if (v.getUint16(e, le) === 0x0112) return v.getUint16(e + 8, le); }
      return 1;
    }
    if ((marker & 0xff00) !== 0xff00) break;
    o += 2 + len;
  }
  return 1;
}

async function pdfPage1(file: File): Promise<Prepared> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const page = await pdf.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: MAX_EDGE / Math.max(base.width, base.height) });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width); canvas.height = Math.round(viewport.height);
  await page.render({ canvas, viewport }).promise;
  const blob = await toBlob(canvas, 'image/jpeg', 0.85);
  const pageCount = pdf.numPages;
  await pdf.destroy();
  return { blob, width: canvas.width, height: canvas.height, pageCount, name: 'page1.jpg', note: 'page1' };
}

export async function prepareFile(file: File): Promise<Prepared> {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return pdfPage1(file);
  const d = await decode(file);
  const { width, height } = d;
  const ok = (file.type === 'image/png' || file.type === 'image/jpeg') && Math.max(width, height) <= MAX_EDGE && file.size <= MAX_BYTES && (await exifOrientation(file)) <= 1;
  if (ok) { d.close(); return { blob: file, width, height, pageCount: 1, name: file.name }; }
  return downscale(d, MAX_EDGE);
}

export function uploadDocument(p: Prepared, fields: Record<string, string>, onProgress?: (pct: number) => void) {
  return new Promise<{ id: string; sha256: string; width: number | null; height: number | null }>((resolve, reject) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    fd.append('width', String(p.width)); fd.append('height', String(p.height)); fd.append('pageCount', String(p.pageCount));
    fd.append('file', p.blob, p.name);
    const x = new XMLHttpRequest();
    x.open('POST', '/api/documents');
    x.timeout = 60_000;
    x.withCredentials = true;
    x.upload.onprogress = e => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    x.onload = () => {
      if (x.status >= 200 && x.status < 300) return resolve(JSON.parse(x.responseText));
      const d = (localStorage.getItem('tb_lang') === 'en' ? en : ms) as Record<string, string>;
      if (x.status === 401) window.location.reload();
      else if (x.status === 413) toast.error(d['scan.tooLarge']);
      else if (x.status === 415) toast.error(d['scan.badType']);
      let msg = `upload ${x.status}`;
      try { msg = JSON.parse(x.responseText)?.error?.message ?? msg; } catch { /* not json */ }
      reject(new Error(msg));
    };
    x.ontimeout = () => reject(new Error('timeout'));
    x.onerror = () => reject(new Error('network'));
    x.send(fd);
  });
}
