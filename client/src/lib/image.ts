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

async function downscale(file: Blob, edge: number): Promise<Prepared> {
  const d = await decode(file);
  const scale = Math.min(1, edge / Math.max(d.width, d.height));
  const w = Math.round(d.width * scale), h = Math.round(d.height * scale);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d')!.drawImage(d.src, 0, 0, w, h);
  d.close();
  return { blob: await toBlob(c, 'image/jpeg', 0.85), width: w, height: h, pageCount: 1, name: 'scan.jpg' };
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
  d.close();
  const ok = (file.type === 'image/png' || file.type === 'image/jpeg') && Math.max(width, height) <= MAX_EDGE && file.size <= MAX_BYTES;
  if (ok) return { blob: file, width, height, pageCount: 1, name: file.name };
  return downscale(file, MAX_EDGE);
}

export function uploadDocument(p: Prepared, fields: Record<string, string>, onProgress?: (pct: number) => void) {
  return new Promise<{ id: string; sha256: string; width: number | null; height: number | null }>((resolve, reject) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    fd.append('width', String(p.width)); fd.append('height', String(p.height)); fd.append('pageCount', String(p.pageCount));
    fd.append('file', p.blob, p.name);
    const x = new XMLHttpRequest();
    x.open('POST', '/api/documents');
    x.upload.onprogress = e => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    x.onload = () => (x.status >= 200 && x.status < 300 ? resolve(JSON.parse(x.responseText)) : reject(new Error(`upload ${x.status}`)));
    x.onerror = () => reject(new Error('network'));
    x.send(fd);
  });
}
