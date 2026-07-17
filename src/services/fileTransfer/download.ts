import {
  ackAgentFileDownloadChunk,
  cancelAgentFileDownload,
  completeAgentFileDownload,
  getAgentDownloadStatus,
  getAgentFileDownloadChunk,
  initAgentArchiveDownload,
  initAgentFileDownload,
  parseContentRangeHeader,
  resumeAgentFileDownload,
} from "@/api/filebrowser";
import {
  ARCHIVE_STATUS_POLL_INTERVAL_MS,
  FILE_TRANSFER_DEFAULT_CHUNK_SIZE,
  MAX_IN_MEMORY_DOWNLOAD_BYTES,
} from "@/constants/fileTransfer";
import { ARCHIVE_PREPARE_TIMEOUT_MS } from "@/constants/filebrowser";
import type {
  FileTransferDownloadResult,
  FileTransferDownloadStatusResponse,
  FileTransferProgress,
} from "@/types/fileTransfer";

import { createSha256Hasher, hashBlobPrefix, hashBytes } from "./hash";
import {
  alignResumeOffset,
  archiveDownloadHandleIdbKey,
  archiveDownloadResumeKey,
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
  onArchiveBuilding?: () => void;
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

async function releaseDownloadSession(
  agentId: string,
  sessionId: string | null | undefined,
): Promise<void> {
  if (!sessionId) return;
  try {
    await cancelAgentFileDownload(agentId, sessionId);
  } catch {
    // frees agent session slot for retry
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Download aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Download aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function waitForArchiveReady(
  agentId: string,
  sessionId: string,
  signal?: AbortSignal,
): Promise<FileTransferDownloadStatusResponse> {
  const deadline = Date.now() + ARCHIVE_PREPARE_TIMEOUT_MS;
  for (;;) {
    if (signal?.aborted) {
      throw new DOMException("Download aborted", "AbortError");
    }
    const status = await getAgentDownloadStatus(agentId, sessionId, signal);
    if (status.status === "agent_ready" || status.status === "transferring") {
      return status;
    }
    if (
      status.status === "failed" ||
      status.status === "cancelled" ||
      status.status === "expired"
    ) {
      throw new Error(status.error || `Archive preparation ${status.status}.`);
    }
    if (Date.now() >= deadline) {
      throw new Error(
        "Timed out waiting for the archive to build on the agent.",
      );
    }
    await sleep(ARCHIVE_STATUS_POLL_INTERVAL_MS, signal);
  }
}

function assertMemoryDownloadAllowed(
  usesMemoryBuffer: boolean,
  totalSize: number,
): void {
  if (usesMemoryBuffer && totalSize > MAX_IN_MEMORY_DOWNLOAD_BYTES) {
    const limitMiB = Math.floor(MAX_IN_MEMORY_DOWNLOAD_BYTES / (1024 * 1024));
    throw new Error(
      `This download (${Math.ceil(totalSize / (1024 * 1024))} MiB) is too large ` +
        `for this browser, which must buffer it in memory (limit ${limitMiB} MiB). ` +
        "Use Chrome or Edge to stream large downloads directly to disk.",
    );
  }
}

async function createDownloadSink(
  agentId: string,
  resumeScopeKey: string,
  fileName: string,
  signal?: AbortSignal,
  handleKeyOverride?: string,
  beforeSavePicker?: () => Promise<void>,
): Promise<{
  sink: DownloadSink;
  resumeOffset: number;
  resumeSessionId: string | null;
  usesMemoryBuffer: boolean;
}> {
  const canFS = "showSaveFilePicker" in window;
  const saved = loadDownloadResume(agentId, resumeScopeKey);
  const handleKey =
    handleKeyOverride ?? downloadHandleIdbKey(agentId, resumeScopeKey);

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
    clearDownloadResume(agentId, resumeScopeKey);
    if (canFS) {
      try {
        if (signal?.aborted) {
          throw new DOMException("Download aborted", "AbortError");
        }
        await beforeSavePicker?.();
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

  return {
    sink,
    resumeOffset,
    resumeSessionId,
    usesMemoryBuffer: buffers !== null,
  };
}

export async function runFileDownloadTransfer(
  agentId: string,
  sourcePath: string,
  options: RunFileDownloadOptions = {},
): Promise<FileTransferDownloadResult> {
  const { signal, onProgress, onStatus } = options;
  const fileName = fileNameFromPath(sourcePath);

  onStatus?.("initializing");
  const { sink, resumeOffset, resumeSessionId, usesMemoryBuffer } =
    await createDownloadSink(agentId, sourcePath, fileName, signal);

  const handleKey = downloadHandleIdbKey(agentId, sourcePath);
  let initData = null as Awaited<
    ReturnType<typeof initAgentFileDownload>
  > | null;
  let effectiveResumeOffset = resumeOffset;
  let sessionId: string | null = null;

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

    const sessionIdValue = initData.session_id;
    sessionId = sessionIdValue;
    const totalSize = initData.total_size;
    const chunkSize = initData.chunk_size;
    let committedOffset =
      initData.committed_offset || effectiveResumeOffset || 0;

    assertMemoryDownloadAllowed(usesMemoryBuffer, totalSize);

    saveDownloadResume(agentId, sourcePath, {
      sessionId: sessionIdValue,
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

    while (committedOffset < totalSize) {
      if (signal?.aborted) {
        throw new DOMException("Download aborted", "AbortError");
      }

      const { data: chunkBuf, contentRange } = await getAgentFileDownloadChunk(
        agentId,
        sessionIdValue,
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

      await ackAgentFileDownloadChunk(agentId, sessionIdValue, newCommitted);
      await sink.writeChunk(chunkBuf);
      committedOffset = newCommitted;

      onProgress?.({
        acceptedOffset: committedOffset,
        committedOffset,
        totalSize,
      });
    }

    onStatus?.("completing");
    const completeData = await completeAgentFileDownload(
      agentId,
      sessionIdValue,
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
    if (!isAbortError(err)) {
      await releaseDownloadSession(agentId, sessionId);
    }
    throw err;
  }
}

export async function runArchiveDownloadTransfer(
  agentId: string,
  paths: string[],
  suggestedFileName: string,
  options: RunFileDownloadOptions = {},
): Promise<FileTransferDownloadResult> {
  const { signal, onProgress, onStatus, onArchiveBuilding } = options;
  const resumeScopeKey = archiveDownloadResumeKey(agentId, paths);
  const fileName = suggestedFileName.trim() || "download.zip";
  const handleKey = archiveDownloadHandleIdbKey(agentId, paths);

  onStatus?.("initializing");

  let initData = null as Awaited<
    ReturnType<typeof initAgentArchiveDownload>
  > | null;
  let sessionId: string | null = null;
  let sink: DownloadSink;
  let resumeOffset = 0;
  let resumeSessionId: string | null = null;
  let usesMemoryBuffer = false;

  try {
    ({ sink, resumeOffset, resumeSessionId, usesMemoryBuffer } =
      await createDownloadSink(
        agentId,
        resumeScopeKey,
        fileName,
        signal,
        handleKey,
        async () => {
          onArchiveBuilding?.();
          initData = await initAgentArchiveDownload(agentId, {
            paths,
            filename: fileName,
            chunk_size: options.chunkSize ?? FILE_TRANSFER_DEFAULT_CHUNK_SIZE,
          });
          sessionId = initData.session_id;
        },
      ));
  } catch (err) {
    if (sessionId) {
      await releaseDownloadSession(agentId, sessionId);
    }
    throw err;
  }

  let effectiveResumeOffset = resumeOffset;

  try {
    if (resumeSessionId && resumeOffset >= 0) {
      try {
        initData = await resumeAgentFileDownload(agentId, {
          session_id: resumeSessionId,
          resume_offset: resumeOffset,
        });
        sessionId = initData.session_id;
      } catch {
        clearDownloadResume(agentId, resumeScopeKey);
        initData = null;
        sessionId = null;
        effectiveResumeOffset = 0;
      }
    }

    if (!initData) {
      if (!sessionId) {
        onArchiveBuilding?.();
        initData = await initAgentArchiveDownload(agentId, {
          paths,
          filename: fileName,
          chunk_size: options.chunkSize ?? FILE_TRANSFER_DEFAULT_CHUNK_SIZE,
        });
        sessionId = initData.session_id;
      }
      effectiveResumeOffset = 0;
    }

    const sessionIdValue = initData.session_id;
    sessionId = sessionIdValue;

    let totalSize = initData.total_size;
    let chunkSize = initData.chunk_size;
    const warnings: string[] = Array.isArray(initData.warnings)
      ? [...initData.warnings]
      : [];
    if (initData.preparing || totalSize < 1) {
      onArchiveBuilding?.();
      const ready = await waitForArchiveReady(agentId, sessionIdValue, signal);
      totalSize = ready.total_size;
      chunkSize = ready.chunk_size || chunkSize;
      if (Array.isArray(ready.warnings)) {
        warnings.push(...ready.warnings);
      }
    }

    assertMemoryDownloadAllowed(usesMemoryBuffer, totalSize);

    let committedOffset =
      initData.committed_offset || effectiveResumeOffset || 0;

    saveDownloadResume(agentId, resumeScopeKey, {
      sessionId: sessionIdValue,
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

    while (committedOffset < totalSize) {
      if (signal?.aborted) {
        throw new DOMException("Download aborted", "AbortError");
      }

      const { data: chunkBuf, contentRange } = await getAgentFileDownloadChunk(
        agentId,
        sessionIdValue,
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

      await ackAgentFileDownloadChunk(agentId, sessionIdValue, newCommitted);
      await sink.writeChunk(chunkBuf);
      committedOffset = newCommitted;

      onProgress?.({
        acceptedOffset: committedOffset,
        committedOffset,
        totalSize,
      });
    }

    onStatus?.("completing");
    const completeData = await completeAgentFileDownload(
      agentId,
      sessionIdValue,
      signal,
    );

    const localSha256 = hasher.hex();
    const agentSha = (completeData.sha256 || "").toLowerCase();
    const integrityOk = !agentSha || agentSha === localSha256;

    if (!integrityOk) {
      throw new Error("Download integrity check failed (SHA-256 mismatch).");
    }

    clearDownloadResume(agentId, resumeScopeKey);
    await idbDeleteFileHandle(handleKey).catch(() => {});
    await sink.finalize();

    return {
      sourcePath: paths.join(";"),
      fileName: initData.filename || fileName,
      sha256: localSha256,
      integrityOk,
      bytesWritten: totalSize,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (err) {
    await sink.abort();
    if (!isAbortError(err)) {
      await releaseDownloadSession(agentId, sessionId);
    }
    throw err;
  }
}

export { isAbortError };
