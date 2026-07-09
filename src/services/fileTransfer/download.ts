import {
  ackAgentFileDownloadChunk,
  completeAgentFileDownload,
  getAgentFileDownloadChunk,
  initAgentFileDownload,
  parseContentRangeHeader,
  resumeAgentFileDownload,
} from "@/api/filebrowser";
import { FILE_TRANSFER_DEFAULT_CHUNK_SIZE } from "@/constants/fileTransfer";
import type {
  FileTransferDownloadResult,
  FileTransferProgress,
} from "@/types/fileTransfer";

import { createSha256Hasher, hashBlobPrefix, hashBytes } from "./hash";
import {
  alignResumeOffset,
  clearDownloadResume,
  downloadHandleIdbKey,
  ensureFileHandlePermission,
  idbDeleteFileHandle,
  idbGetFileHandle,
  idbPutFileHandle,
  isAbortError,
  loadDownloadResume,
  saveDownloadResume,
} from "./resume";

export interface RunFileDownloadOptions {
  signal?: AbortSignal;
  chunkSize?: number;
  onProgress?: (progress: FileTransferProgress) => void;
  onStatus?: (status: "initializing" | "downloading" | "completing") => void;
}

interface DownloadSink {
  writeChunk(buf: ArrayBuffer): Promise<void>;
  hashPrefix(
    endOffset: number,
    chunkSize: number,
    hasher: ReturnType<typeof createSha256Hasher>,
  ): Promise<void>;
  finalize(): Promise<void>;
  abort(): Promise<void>;
}

function fileNameFromPath(sourcePath: string): string {
  return sourcePath.replace(/\\/g, "/").split("/").pop() || "download";
}

async function createDownloadSink(
  agentId: string,
  sourcePath: string,
  fileName: string,
  signal?: AbortSignal,
): Promise<{
  sink: DownloadSink;
  resumeOffset: number;
  resumeSessionId: string | null;
}> {
  const canFS = "showSaveFilePicker" in window;
  const saved = loadDownloadResume(agentId, sourcePath);
  const handleKey = downloadHandleIdbKey(agentId, sourcePath);

  let fileHandle: FileSystemFileHandle | null = null;
  let writable: FileSystemWritableFileStream | null = null;
  let buffers: ArrayBuffer[] | null = null;
  let resumeOffset = 0;
  let resumeSessionId: string | null = null;

  if (saved && canFS) {
    try {
      fileHandle = (await idbGetFileHandle(handleKey)) ?? null;
      if (fileHandle && (await ensureFileHandlePermission(fileHandle))) {
        const existing = await fileHandle.getFile();
        const priorChunk = saved.chunkSize || FILE_TRANSFER_DEFAULT_CHUNK_SIZE;
        resumeOffset = alignResumeOffset(existing.size, priorChunk);
        resumeSessionId = saved.sessionId;
        writable = await fileHandle.createWritable({ keepExistingData: true });
        await writable.truncate(resumeOffset);
        await writable.seek(resumeOffset);
      } else {
        fileHandle = null;
      }
    } catch {
      fileHandle = null;
      writable = null;
    }
  }

  if (!writable) {
    resumeOffset = 0;
    resumeSessionId = null;
    clearDownloadResume(agentId, sourcePath);
    if (canFS) {
      try {
        if (signal?.aborted) {
          throw new DOMException("Download aborted", "AbortError");
        }
        fileHandle = await window.showSaveFilePicker({
          suggestedName: fileName,
          startIn: "downloads",
        });
        writable = await fileHandle.createWritable();
        await idbPutFileHandle(handleKey, fileHandle).catch(() => {});
      } catch (err) {
        if (isAbortError(err)) throw err;
        fileHandle = null;
        buffers = [];
      }
    } else {
      buffers = [];
    }
  }

  const sink: DownloadSink = {
    async writeChunk(buf) {
      if (writable) {
        await writable.write(buf);
      } else if (buffers) {
        buffers.push(buf);
      }
    },
    async hashPrefix(endOffset, chunkSize, hasher) {
      if (fileHandle) {
        const existing = await fileHandle.getFile();
        await hashBlobPrefix(existing, endOffset, chunkSize, hasher);
      } else if (buffers) {
        for (const part of buffers) {
          hashBytes(hasher, part);
        }
      }
    },
    async finalize() {
      if (writable) {
        await writable.close();
        writable = null;
      } else if (buffers) {
        const blob = new Blob(buffers);
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        buffers = null;
      }
    },
    async abort() {
      if (writable) {
        try {
          await writable.close();
        } catch {
          /* partial file kept for resume */
        }
        writable = null;
      }
    },
  };

  return { sink, resumeOffset, resumeSessionId };
}

export async function runFileDownloadTransfer(
  agentId: string,
  sourcePath: string,
  options: RunFileDownloadOptions = {},
): Promise<FileTransferDownloadResult> {
  const { signal, onProgress, onStatus } = options;
  const fileName = fileNameFromPath(sourcePath);

  onStatus?.("initializing");
  const { sink, resumeOffset, resumeSessionId } = await createDownloadSink(
    agentId,
    sourcePath,
    fileName,
    signal,
  );

  const handleKey = downloadHandleIdbKey(agentId, sourcePath);
  let initData = null as Awaited<
    ReturnType<typeof initAgentFileDownload>
  > | null;
  let effectiveResumeOffset = resumeOffset;

  try {
    if (resumeSessionId && resumeOffset >= 0) {
      try {
        initData = await resumeAgentFileDownload(agentId, {
          session_id: resumeSessionId,
          resume_offset: resumeOffset,
        });
      } catch {
        clearDownloadResume(agentId, sourcePath);
        initData = null;
        effectiveResumeOffset = 0;
      }
    }

    if (!initData) {
      initData = await initAgentFileDownload(agentId, {
        source_path: sourcePath,
        chunk_size: options.chunkSize ?? FILE_TRANSFER_DEFAULT_CHUNK_SIZE,
      });
      effectiveResumeOffset = 0;
    }

    const sessionId = initData.session_id;
    const totalSize = initData.total_size;
    const chunkSize = initData.chunk_size;
    let committedOffset =
      initData.committed_offset || effectiveResumeOffset || 0;

    saveDownloadResume(agentId, sourcePath, {
      sessionId,
      chunkSize,
      totalSize,
    });

    const hasher = createSha256Hasher();
    if (committedOffset > 0) {
      await sink.hashPrefix(committedOffset, chunkSize, hasher);
      onProgress?.({
        acceptedOffset: committedOffset,
        committedOffset,
        totalSize,
      });
    }

    onStatus?.("downloading");
    let pendingAck: Promise<void> | null = null;

    while (committedOffset < totalSize) {
      if (signal?.aborted) {
        throw new DOMException("Download aborted", "AbortError");
      }

      const { data: chunkBuf, contentRange } = await getAgentFileDownloadChunk(
        agentId,
        sessionId,
        committedOffset,
        signal,
      );
      const range = parseContentRangeHeader(contentRange);
      const expectedLen = range.end - range.start + 1;
      if (chunkBuf.byteLength !== expectedLen) {
        throw new Error(
          `Chunk size mismatch: received ${chunkBuf.byteLength}, expected ${expectedLen}`,
        );
      }

      hashBytes(hasher, chunkBuf);
      const newCommitted = range.end + 1;

      if (pendingAck) {
        await pendingAck;
      }

      pendingAck = ackAgentFileDownloadChunk(
        agentId,
        sessionId,
        newCommitted,
      ).then(() => {});

      await sink.writeChunk(chunkBuf);
      committedOffset = newCommitted;

      onProgress?.({
        acceptedOffset: committedOffset,
        committedOffset,
        totalSize,
      });
    }

    if (pendingAck) {
      await pendingAck;
    }

    onStatus?.("completing");
    const completeData = await completeAgentFileDownload(
      agentId,
      sessionId,
      signal,
    );

    const localSha256 = hasher.hex();
    const agentSha = (completeData.sha256 || "").toLowerCase();
    const integrityOk = !agentSha || agentSha === localSha256;

    if (!integrityOk) {
      throw new Error("Download integrity check failed (SHA-256 mismatch).");
    }

    clearDownloadResume(agentId, sourcePath);
    await idbDeleteFileHandle(handleKey).catch(() => {});
    await sink.finalize();

    return {
      sourcePath: completeData.source_path,
      fileName,
      sha256: localSha256,
      integrityOk,
      bytesWritten: totalSize,
    };
  } catch (err) {
    await sink.abort();
    throw err;
  }
}

export { isAbortError };
