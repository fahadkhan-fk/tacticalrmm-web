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
  chunkSize?: number;
  onProgress?: (progress: FileTransferProgress) => void;
}

async function releaseUploadSession(
  agentId: string,
  sessionId: string | null | undefined,
): Promise<void> {
  if (!sessionId) return;
  try {
    await cancelAgentFileUpload(agentId, sessionId, "error");
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
  const { signal, onProgress } = options;
  const totalSize = file.size;
  const saved = loadUploadResume(agentId, file, destinationPath);

  let initData = null as Awaited<ReturnType<typeof initAgentFileUpload>> | null;

  if (saved?.sessionId) {
    try {
      initData = await resumeAgentFileUpload(agentId, {
        session_id: saved.sessionId,
        filename: file.name,
        total_size: totalSize,
      });
    } catch {
      clearUploadResume(agentId, file, destinationPath);
      initData = null;
    }
  }

  if (!initData) {
    initData = await initAgentFileUpload(agentId, {
      filename: file.name,
      destination_path: destinationPath,
      total_size: totalSize,
      chunk_size: options.chunkSize ?? FILE_TRANSFER_DEFAULT_CHUNK_SIZE,
    });
    saveUploadResume(agentId, file, destinationPath, initData.session_id);
  }

  const sessionId = initData.session_id;
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
    if (!isAbortError(err)) {
      await releaseUploadSession(agentId, sessionId);
      clearUploadResume(agentId, file, destinationPath);
    }
    throw err;
  }
}

export { isAbortError };
