import { sha256 } from "js-sha256";

export type Sha256Hasher = ReturnType<typeof sha256.create>;

export function createSha256Hasher(): Sha256Hasher {
  return sha256.create();
}

export async function hashBlobPrefix(
  blob: Blob,
  endOffset: number,
  blockSize: number,
  hasher: Sha256Hasher,
): Promise<void> {
  let pos = 0;
  while (pos < endOffset) {
    const slice = blob.slice(pos, Math.min(pos + blockSize, endOffset));
    hasher.update(new Uint8Array(await slice.arrayBuffer()));
    pos += slice.size;
  }
}

export async function hashFilePrefix(
  file: File,
  endOffset: number,
  blockSize: number,
  hasher: Sha256Hasher,
): Promise<void> {
  await hashBlobPrefix(file, endOffset, blockSize, hasher);
}

export function hashBytes(
  hasher: Sha256Hasher,
  bytes: ArrayBuffer | Uint8Array,
): void {
  hasher.update(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
}
