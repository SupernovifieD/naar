import JSZip from "jszip";

export interface ExtractedBundle {
  textFiles: Record<string, string>;
  binaryPaths: string[];
  allPaths: string[];
}

export async function extractZipBundle(bytes: Uint8Array): Promise<ExtractedBundle> {
  const zip = await JSZip.loadAsync(bytes);
  const textFiles: Record<string, string> = {};
  const binaryPaths: string[] = [];
  const allPaths: string[] = [];

  const entries = Object.values(zip.files)
    .filter((entry) => !entry.dir)
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const normalizedPath = normalizeZipPath(entry.name);
    allPaths.push(normalizedPath);

    const fileBytes = await entry.async("uint8array");
    if (looksBinary(fileBytes, normalizedPath)) {
      binaryPaths.push(normalizedPath);
      continue;
    }

    const content = new TextDecoder("utf-8", { fatal: false }).decode(fileBytes);
    textFiles[normalizedPath] = content;
  }

  return {
    textFiles,
    binaryPaths,
    allPaths
  };
}

function normalizeZipPath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\/+/, "");
}

function looksBinary(bytes: Uint8Array, filePath: string): boolean {
  if (/\.(png|jpe?g|gif|webp|svgz|ico|pdf|zip|gz|bz2|xz|7z|exe|dll|so|dylib|bin|wasm)$/i.test(filePath)) {
    return true;
  }

  if (bytes.length === 0) {
    return false;
  }

  const sampleSize = Math.min(512, bytes.length);
  let nonPrintable = 0;
  for (let i = 0; i < sampleSize; i += 1) {
    const value = bytes[i];
    if (value === 0) return true;
    if (value < 9 || (value > 13 && value < 32)) {
      nonPrintable += 1;
    }
  }

  return nonPrintable / sampleSize > 0.2;
}
