import {
  cancelAgentFileUpload,
  completeAgentFileUpload,
  initAgentFileUpload,
  resumeAgentFileUpload,
  uploadAgentFileChunk,
} from "@/api/filebrowser";
import { FILE_TRANSFER_DEFAULT_CHUNK_SIZE } from "@/constants/fileTransfer";
import type {
  FileTransferProgress,
  FileTransferUploadResult,
  TransferAbortIntent,
} from "@/types/fileTransfer";

import { createSha256Hasher, hashFilePrefix, hashBytes } from "./hash";
import {
  clearUploadResume,
  isAbortError,
  loadUploadResume,
  saveUploadResume,
} from "./resume";

export interface RunFileUploadOptions {
  signal?: AbortSignal;
  abortIntent?: TransferAbortIntent;
  chunkSize?: number;
  conflictPolicy?: "skip" | "replace";
  onProgress?: (progress: FileTransferProgress) => void;
  onSession?: (sessionId: string) => void;
  knownSessionId?: string;
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

export async function runFileUploadTransfer(
  agentId: string,
  file: File,
  destinationPath: string,
  options: RunFileUploadOptions = {},
): Promise<FileTransferUploadResult> {
  const { signal, abortIntent, onProgress, onSession, knownSessionId } =
    options;
  const totalSize = file.size;
  const saved = loadUploadResume(agentId, file, destinationPath);

  let initData = null as Awaited<ReturnType<typeof initAgentFileUpload>> | null;
  let staleSessionId: string | null = null;

  if (saved?.sessionId) {
    try {
      initData = await resumeAgentFileUpload(agentId, {
        session_id: saved.sessionId,
        filename: file.name,
        total_size: totalSize,
      });
    } catch {
      staleSessionId = saved.sessionId;
      clearUploadResume(agentId, file, destinationPath);
      initData = null;
    }
  } else if (knownSessionId) {
    staleSessionId = knownSessionId;
  }

  if (!initData) {
    if (staleSessionId) {
      await releaseUploadSession(agentId, staleSessionId, "user");
      staleSessionId = null;
    }
    initData = await initAgentFileUpload(agentId, {
      filename: file.name,
      destination_path: destinationPath,
      total_size: totalSize,
      chunk_size: options.chunkSize ?? FILE_TRANSFER_DEFAULT_CHUNK_SIZE,
      conflict_policy: options.conflictPolicy ?? "replace",
    });
    saveUploadResume(agentId, file, destinationPath, initData.session_id);
  }

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

      const blob = file.slice(offset, offset + chunkSize);
      const end = offset + blob.size - 1;
      hashBytes(hasher, await blob.arrayBuffer());

      const chunkRes = await uploadAgentFileChunk(
        agentId,
        sessionId,
        blob,
        `bytes ${offset}-${end}/${totalSize}`,
        signal,
      );

      offset = chunkRes.accepted_offset;
      onProgress?.({
        acceptedOffset: chunkRes.accepted_offset,
        committedOffset: chunkRes.committed_offset,
        totalSize,
      });
    }

    const fileSha256 = hasher.hex();
    const completeData = await completeAgentFileUpload(
      agentId,
      sessionId,
      fileSha256,
      signal,
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
    } else {
      await releaseUploadSession(agentId, sessionId, "error");
      clearUploadResume(agentId, file, destinationPath);
    }
    throw err;
  }
}

export { isAbortError };
