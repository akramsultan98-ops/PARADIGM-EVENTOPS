import "server-only";

/**
 * Bounded processing of untrusted uploads (P2-G). Office files (DOCX/XLSX) are ZIP archives: their central
 * directory is inspected BEFORE any parser inflates them, so archive bombs are refused without decompressing.
 */
export const FILE_LIMITS = {
  maxEntries: 5000,
  maxUncompressedBytes: 150 * 1024 * 1024,
  maxRatio: 150, // uncompressed / compressed per entry
  maxPdfPages: 200,
  parseTimeoutMs: 20000,
} as const;

export class UnsafeFileError extends Error {}

/** Refuse oversized files using the declared size, before reading the body into a Buffer. */
export function assertDeclaredSize(file: { size: number }, maxBytes: number) {
  if (!(file.size > 0)) throw new UnsafeFileError("File is empty");
  if (file.size > maxBytes) throw new UnsafeFileError(`File exceeds ${Math.round(maxBytes / 1024 / 1024)} MB limit`);
}

/** Sum of uncompressed sizes and entry count from the ZIP central directory (no decompression). */
export function inspectZip(buf: Buffer): { entries: number; uncompressed: number } {
  const EOCD = 0x06054b50, CEN = 0x02014b50;
  const min = Math.max(0, buf.length - 65557);
  let eocd = -1;
  for (let i = buf.length - 22; i >= min; i--) if (buf.readUInt32LE(i) === EOCD) { eocd = i; break; }
  if (eocd < 0) throw new UnsafeFileError("Not a valid Office document (no ZIP directory)");
  const total = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (total === 0xffff || cdOffset === 0xffffffff) throw new UnsafeFileError("ZIP64 archives are not accepted");
  if (total > FILE_LIMITS.maxEntries) throw new UnsafeFileError(`Archive has too many entries (${total})`);
  let p = cdOffset, uncompressed = 0;
  for (let n = 0; n < total; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CEN) throw new UnsafeFileError("Corrupt ZIP directory");
    const csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
    if (csize === 0xffffffff || usize === 0xffffffff) throw new UnsafeFileError("ZIP64 entries are not accepted");
    if (usize > 0 && usize / Math.max(csize, 1) > FILE_LIMITS.maxRatio) throw new UnsafeFileError("Archive compression ratio is too high (possible zip bomb)");
    uncompressed += usize;
    if (uncompressed > FILE_LIMITS.maxUncompressedBytes) throw new UnsafeFileError("Archive expands beyond the allowed size (possible zip bomb)");
    p += 46 + buf.readUInt16LE(p + 28) + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return { entries: total, uncompressed };
}

/** Rejects if the work does not finish in time (the request is released; parsing is abandoned). */
export function withTimeout<T>(work: Promise<T>, ms: number = FILE_LIMITS.parseTimeoutMs, what = "File processing"): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  return Promise.race([work, new Promise<T>((_, reject) => { t = setTimeout(() => reject(new UnsafeFileError(`${what} timed out`)), ms); })]).finally(() => clearTimeout(t));
}
