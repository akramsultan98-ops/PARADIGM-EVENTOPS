import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";

/**
 * Storage abstraction. "local" stores files under STORAGE_LOCAL_DIR (development / single VPS
 * with a persistent volume). "s3" is the production target for S3-compatible object storage —
 * the adapter interface is defined, but the driver is NOT implemented in this build and will
 * refuse to run rather than silently fall back to the local disk.
 */
export interface StorageDriver {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

class LocalStorage implements StorageDriver {
  constructor(private root: string) {}
  private resolve(key: string) {
    const p = path.resolve(this.root, key);
    if (!p.startsWith(path.resolve(this.root) + path.sep)) throw new Error("Invalid storage key");
    return p;
  }
  async put(key: string, data: Buffer) {
    const p = this.resolve(key);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, data);
  }
  get(key: string) { return readFile(this.resolve(key)); }
  async remove(key: string) { await unlink(this.resolve(key)).catch(() => undefined); }
}

class S3NotConfigured implements StorageDriver {
  private fail(): never { throw new Error("S3 storage driver is not implemented in this build. Set STORAGE_DRIVER=local or add the S3 adapter (see docs/DEPLOYMENT.md)."); }
  put(): Promise<void> { this.fail(); }
  get(): Promise<Buffer> { this.fail(); }
  remove(): Promise<void> { this.fail(); }
}

let driver: StorageDriver | null = null;
export function storage(): StorageDriver {
  if (!driver) driver = process.env.STORAGE_DRIVER === "s3" ? new S3NotConfigured() : new LocalStorage(path.resolve(process.env.STORAGE_LOCAL_DIR ?? "./storage/uploads"));
  return driver;
}

export const ALLOWED_MIME: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "text/csv": [".csv"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
  "text/plain": [".txt"],
};

export function maxUploadBytes() { return Number(process.env.MAX_UPLOAD_MB ?? 20) * 1024 * 1024; }

/** Validate by extension, declared type and magic bytes. Returns the normalised mime type. */
export function validateUpload(name: string, declared: string, data: Buffer): string {
  if (data.length === 0) throw new Error("File is empty");
  if (data.length > maxUploadBytes()) throw new Error(`File exceeds ${process.env.MAX_UPLOAD_MB ?? 20} MB limit`);
  const ext = path.extname(name).toLowerCase();
  const mime = Object.entries(ALLOWED_MIME).find(([, exts]) => exts.includes(ext))?.[0];
  if (!mime) throw new Error(`File type ${ext || "(none)"} is not allowed`);
  if (declared && declared !== "application/octet-stream" && declared !== mime && !(mime === "text/csv" && declared.includes("excel"))) throw new Error("File content type does not match its extension");
  const head = data.subarray(0, 8);
  const sig = (bytes: number[]) => bytes.every((b, i) => head[i] === b);
  const ok =
    mime === "application/pdf" ? sig([0x25, 0x50, 0x44, 0x46]) :
    mime === "image/png" ? sig([0x89, 0x50, 0x4e, 0x47]) :
    mime === "image/jpeg" ? sig([0xff, 0xd8, 0xff]) :
    mime === "image/webp" ? data.subarray(8, 12).toString() === "WEBP" :
    mime.includes("openxmlformats") ? sig([0x50, 0x4b, 0x03, 0x04]) :
    !data.subarray(0, 512).includes(0);
  if (!ok) throw new Error("File content does not match its type");
  return mime;
}

export function newStorageKey(companyId: string, fileName: string) {
  const ext = path.extname(fileName).toLowerCase().replace(/[^.a-z0-9]/g, "");
  return `${companyId}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}${ext}`;
}
export const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");
