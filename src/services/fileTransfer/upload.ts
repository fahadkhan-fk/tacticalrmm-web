import {
  cancelAgentFileUpload,
  completeAgentFileUpload,
  getUploadChunkReady,
  initAgentFileUpload,
  resumeAgentFileUpload,
  uploadAgentFileChunk,
} from "@/api/filebrowser";
import {
  FILE_TRANSFER_ACK_POLL_MS,
  FILE_TRANSFER_DEFAULT_CHUNK_SIZE,
  FILE_TRANSFER_TRANSIENT_RETRY_MAX_DURATION_MS,
} from "@/constants/fileTransfer";
import type {
  FileTransferProgress,
  FileTransferUploadChunkReadyResponse,
  FileTransferUploadChunkResponse,
  FileTransferUploadResult,
  TransferAbortIntent,
} from "@/types/fileTransfer";

import {
  createSha256Hasher,
  hashBytes,
  hashFilePrefix,
  type Sha256Hasher,
} from "./hash";
import {
  clearUploadResume,
  isAbortError,
  loadUploadResume,
  saveUploadResume,
} from "./resume";
import {
  type TransferSlotWaitInfo,
  type TransientRetryInfo,
  RetryableTransferError,
  isRetryableTransferError,
  isTransferAckWaitError,
  sleepAbortable,
  withTransferSessionRetry,
  withTransientRetry,
} from "./sessionLimit";

export interface RunFileUploadOptions {
  signal?: AbortSignal;
  abortIntent?: TransferAbortIntent;
  chunkSize?: number;
  conflictPolicy?: "skip" | "replace";
  onProgress?: (progress: FileTransferProgress) => void;
  onSession?: (sessionId: string) => void;
  knownSessionId?: string;
  onWaitingForSlot?: (info: TransferSlotWaitInfo) => void;
  onRetrying?: (info: TransientRetryInfo) => void;
}

async function releaseUploadSession(
  agentId: string,
  sessionId: string | null | undefined,
  reason: "user" | "error" = "error",
): Promise<void> {
  if (!sessionId) return;
  try {
    await cancelAgentFileUpload(agentId, sessionId, reason);
  } catch {
    // frees the server session slot for retry
  }
}

const UPLOAD_TERMINAL_STATUSES = new Set([
  "completed",
  "failed",
  "cancelled",
  "expired",
]);

async function hashFileRange(
  file: File,
  start: number,
  end: number,
  blockSize: number,
  hasher: Sha256Hasher,
): Promise<void> {
  let pos = start;
  while (pos < end) {
    const slice = file.slice(pos, Math.min(pos + blockSize, end));
    hashBytes(hasher, await slice.arrayBuffer());
    pos += slice.size;
  }
}

async function waitForUploadPipelineSlot(
  agentId: string,
  sessionId: string,
  offset: number,
  options: {
    signal?: AbortSignal;
    onRetry?: (info: TransientRetryInfo) => void;
  } = {},
): Promise<FileTransferUploadChunkReadyResponse> {
  const { signal, onRetry } = options;
  const started = Date.now();
  for (;;) {
    if (signal?.aborted) {
      throw new DOMException("Upload aborted", "AbortError");
    }
    const ready = await withTransientRetry(
      () => getUploadChunkReady(agentId, sessionId, signal),
      { signal, onRetry },
    );
    if (UPLOAD_TERMINAL_STATUSES.has(ready.status)) {
      if (ready.accepted_offset > offset) {
        return ready;
      }
      throw new Error(
        ready.status === "failed"
          ? "Upload failed"
          : `Upload session is ${ready.status}`,
      );
    }
    if (ready.accepted_offset > offset || ready.can_put) {
      return ready;
    }
    if (Date.now() - started >= FILE_TRANSFER_TRANSIENT_RETRY_MAX_DURATION_MS) {
      throw new RetryableTransferError(
        "Timed out waiting for agent to commit previous chunk",
      );
    }
    await sleepAbortable(FILE_TRANSFER_ACK_POLL_MS, signal);
  }
}

export async function runFileUploadTransfer(
  agentId: string,
  file: File,
  destinationPath: string,
  options: RunFileUploadOptions = {},
): Promise<FileTransferUploadResult> {
  const {
    signal,
    abortIntent,
    onProgress,
    onSession,
    knownSessionId,
    onWaitingForSlot,
    onRetrying,
  } = options;
  const totalSize = file.size;
  const saved = loadUploadResume(agentId, file, destinationPath);
  const resumeSessionId = knownSessionId || saved?.sessionId || null;

  let initData = null as Awaited<ReturnType<typeof initAgentFileUpload>> | null;
  let staleSessionId: string | null = null;

  if (resumeSessionId) {
    try {
      initData = await resumeAgentFileUpload(
        agentId,
        {
          session_id: resumeSessionId,
          filename: file.name,
          total_size: totalSize,
        },
        signal,
      );
    } catch {
      staleSessionId = resumeSessionId;
      clearUploadResume(agentId, file, destinationPath);
      initData = null;
    }
  }

  if (!initData) {
    if (staleSessionId) {
      await releaseUploadSession(agentId, staleSessionId, "user");
      staleSessionId = null;
    }
    initData = await withTransferSessionRetry(
      () =>
        initAgentFileUpload(
          agentId,
          {
            filename: file.name,
            destination_path: destinationPath,
            total_size: totalSize,
            chunk_size: options.chunkSize ?? FILE_TRANSFER_DEFAULT_CHUNK_SIZE,
            conflict_policy: options.conflictPolicy ?? "replace",
          },
          signal,
        ),
      { signal, onWaitingForSlot },
    );
  }

  saveUploadResume(agentId, file, destinationPath, initData.session_id);

  const sessionId = initData.session_id;
  onSession?.(sessionId);
  const chunkSize = initData.chunk_size;
  let offset = initData.committed_offset || 0;

  try {
    const hasher = createSha256Hasher();
    if (offset > 0) {
      await hashFilePrefix(file, offset, chunkSize, hasher);
      onProgress?.({
        acceptedOffset: offset,
        committedOffset: offset,
        totalSize,
      });
    }

    while (offset < totalSize) {
      if (signal?.aborted) {
        throw new DOMException("Upload aborted", "AbortError");
      }

      const ready = await waitForUploadPipelineSlot(
        agentId,
        sessionId,
        offset,
        {
          signal,
          onRetry: onRetrying,
        },
      );
      if (ready.accepted_offset > offset) {
        const skipTo = Math.min(ready.accepted_offset, totalSize);
        await hashFileRange(file, offset, skipTo, chunkSize, hasher);
        offset = skipTo;
        onProgress?.({
          acceptedOffset: ready.accepted_offset,
          committedOffset: ready.committed_offset,
          totalSize,
        });
        continue;
      }

      const blob = file.slice(offset, offset + chunkSize);
      const end = offset + blob.size - 1;
      hashBytes(hasher, await blob.arrayBuffer());

      let chunkRes: FileTransferUploadChunkResponse | null = null;
      while (chunkRes === null) {
        try {
          chunkRes = await withTransientRetry(
            () =>
              uploadAgentFileChunk(
                agentId,
                sessionId,
                blob,
                `bytes ${offset}-${end}/${totalSize}`,
                signal,
              ),
            {
              signal,
              onRetry: onRetrying,
              isRetryable: (err) =>
                isRetryableTransferError(err) && !isTransferAckWaitError(err),
            },
          );
        } catch (err) {
          if (!isTransferAckWaitError(err)) {
            throw err;
          }
          const again = await waitForUploadPipelineSlot(
            agentId,
            sessionId,
            offset,
            { signal, onRetry: onRetrying },
          );
          if (again.accepted_offset > offset) {
            chunkRes = {
              session_id: sessionId,
              status: again.status,
              accepted_offset: again.accepted_offset,
              committed_offset: again.committed_offset,
              chunk_start: offset,
              chunk_end: end,
              chunk_bytes: blob.size,
            };
          }
        }
      }

      offset = chunkRes.accepted_offset;
      onProgress?.({
        acceptedOffset: chunkRes.accepted_offset,
        committedOffset: chunkRes.committed_offset,
        totalSize,
      });
    }

    const fileSha256 = hasher.hex();
    const completeData = await withTransientRetry(
      () => completeAgentFileUpload(agentId, sessionId, fileSha256, signal),
      { signal, onRetry: onRetrying },
    );

    const agentSha = (completeData.sha256 || "").toLowerCase();
    const integrityOk = !agentSha || agentSha === fileSha256;

    clearUploadResume(agentId, file, destinationPath);

    return {
      destinationPath: completeData.destination_path,
      sha256: fileSha256,
      integrityOk,
    };
  } catch (err) {
    if (isAbortError(err)) {
      if (abortIntent?.mode === "cancel") {
        await releaseUploadSession(agentId, sessionId, "user");
        clearUploadResume(agentId, file, destinationPath);
      }
    } else if (!isRetryableTransferError(err)) {
      await releaseUploadSession(agentId, sessionId, "error");
      clearUploadResume(agentId, file, destinationPath);
    }
    throw err;
  }
}

export { isAbortError };
