import axios from "axios";

import {
  FILE_TRANSFER_DOWNLOAD_CHUNK_TIMEOUT_MS,
  FILE_TRANSFER_UPLOAD_CHUNK_TIMEOUT_MS,
} from "@/constants/fileTransfer";
import type {
  FileTransferCompleteDownloadResponse,
  FileTransferCompleteUploadResponse,
  FileTransferDownloadStatusResponse,
  FileTransferInitDownloadResponse,
  FileTransferInitUploadResponse,
  FileTransferUploadChunkResponse,
} from "@/types/fileTransfer";

const baseUrl = "/agents";

export interface InitFileUploadPayload {
  filename: string;
  destination_path: string;
  total_size: number;
  chunk_size?: number;
}

export interface ResumeFileUploadPayload {
  session_id: string;
  filename: string;
  total_size: number;
}

export async function initAgentFileUpload(
  agentId: string,
  payload: InitFileUploadPayload,
): Promise<FileTransferInitUploadResponse> {
  const { data } = await axios.post<FileTransferInitUploadResponse>(
    `${baseUrl}/${agentId}/files/upload/init/`,
    payload,
    { timeout: 60_000 },
  );
  return data;
}

export async function resumeAgentFileUpload(
  agentId: string,
  payload: ResumeFileUploadPayload,
): Promise<FileTransferInitUploadResponse> {
  const { data } = await axios.post<FileTransferInitUploadResponse>(
    `${baseUrl}/${agentId}/files/upload/init/`,
    payload,
    { timeout: 60_000 },
  );
  return data;
}

export async function uploadAgentFileChunk(
  agentId: string,
  sessionId: string,
  body: Blob,
  contentRange: string,
  signal?: AbortSignal,
): Promise<FileTransferUploadChunkResponse> {
  const { data } = await axios.put<FileTransferUploadChunkResponse>(
    `${baseUrl}/${agentId}/files/upload/${sessionId}/chunk/`,
    body,
    {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Range": contentRange,
      },
      timeout: FILE_TRANSFER_UPLOAD_CHUNK_TIMEOUT_MS,
      signal,
    },
  );
  return data;
}

export async function completeAgentFileUpload(
  agentId: string,
  sessionId: string,
  sha256: string,
  signal?: AbortSignal,
): Promise<FileTransferCompleteUploadResponse> {
  const { data } = await axios.post<FileTransferCompleteUploadResponse>(
    `${baseUrl}/${agentId}/files/upload/${sessionId}/complete/`,
    { sha256 },
    { timeout: 60_000, signal },
  );
  return data;
}

export interface InitFileDownloadPayload {
  source_path: string;
  chunk_size?: number;
}

export interface InitArchiveDownloadPayload {
  paths: string[];
  filename?: string;
  chunk_size?: number;
}

export interface ResumeFileDownloadPayload {
  session_id: string;
  resume_offset: number;
}

export async function initAgentArchiveDownload(
  agentId: string,
  payload: InitArchiveDownloadPayload,
): Promise<FileTransferInitDownloadResponse> {
  const { data } = await axios.post<FileTransferInitDownloadResponse>(
    `${baseUrl}/${agentId}/files/download/archive/init/`,
    payload,
    { timeout: 60_000 },
  );
  return data;
}

export async function getAgentDownloadStatus(
  agentId: string,
  sessionId: string,
  signal?: AbortSignal,
): Promise<FileTransferDownloadStatusResponse> {
  const { data } = await axios.get<FileTransferDownloadStatusResponse>(
    `${baseUrl}/${agentId}/files/download/${sessionId}/status/`,
    { timeout: 30_000, signal },
  );
  return data;
}

export async function initAgentFileDownload(
  agentId: string,
  payload: InitFileDownloadPayload,
): Promise<FileTransferInitDownloadResponse> {
  const { data } = await axios.post<FileTransferInitDownloadResponse>(
    `${baseUrl}/${agentId}/files/download/init/`,
    payload,
    { timeout: 60_000 },
  );
  return data;
}

export async function resumeAgentFileDownload(
  agentId: string,
  payload: ResumeFileDownloadPayload,
): Promise<FileTransferInitDownloadResponse> {
  const { data } = await axios.post<FileTransferInitDownloadResponse>(
    `${baseUrl}/${agentId}/files/download/init/`,
    payload,
    { timeout: 60_000 },
  );
  return data;
}

export function parseContentRangeHeader(header: string | undefined): {
  start: number;
  end: number;
  total: number;
} {
  // bytes START-END/TOTAL
  const match = (header ?? "").match(/bytes (\d+)-(\d+)\/(\d+)/);
  if (!match) {
    throw new Error(`Invalid Content-Range header: ${header ?? "(missing)"}`);
  }
  return {
    start: parseInt(match[1], 10),
    end: parseInt(match[2], 10),
    total: parseInt(match[3], 10),
  };
}

export async function getAgentFileDownloadChunk(
  agentId: string,
  sessionId: string,
  committedOffset: number,
  signal?: AbortSignal,
): Promise<{ data: ArrayBuffer; contentRange: string }> {
  const response = await axios.get<ArrayBuffer>(
    `${baseUrl}/${agentId}/files/download/${sessionId}/chunk/`,
    {
      params: { committed_offset: committedOffset },
      responseType: "arraybuffer",
      timeout: FILE_TRANSFER_DOWNLOAD_CHUNK_TIMEOUT_MS,
      signal,
    },
  );
  const contentRange =
    (response.headers["content-range"] as string | undefined) ??
    (response.headers["Content-Range"] as string | undefined) ??
    "";
  return { data: response.data, contentRange };
}

export async function ackAgentFileDownloadChunk(
  agentId: string,
  sessionId: string,
  committedOffset: number,
): Promise<{ committed_offset: number }> {
  const { data } = await axios.post<{ committed_offset: number }>(
    `${baseUrl}/${agentId}/files/download/${sessionId}/ack/`,
    { committed_offset: committedOffset },
    { timeout: 30_000 },
  );
  return data;
}

export async function completeAgentFileDownload(
  agentId: string,
  sessionId: string,
  signal?: AbortSignal,
): Promise<FileTransferCompleteDownloadResponse> {
  const { data } = await axios.post<FileTransferCompleteDownloadResponse>(
    `${baseUrl}/${agentId}/files/download/${sessionId}/complete/`,
    {},
    { timeout: 60_000, signal },
  );
  return data;
}

export type FileTransferCancelReason = "user" | "error";

export async function cancelAgentFileDownload(
  agentId: string,
  sessionId: string,
  reason: FileTransferCancelReason = "user",
): Promise<void> {
  await axios.post(
    `${baseUrl}/${agentId}/files/download/${sessionId}/cancel/`,
    { reason },
    { timeout: 30_000 },
  );
}

export async function cancelAgentFileUpload(
  agentId: string,
  sessionId: string,
  reason: FileTransferCancelReason = "user",
): Promise<void> {
  await axios.post(
    `${baseUrl}/${agentId}/files/upload/${sessionId}/cancel/`,
    { reason },
    { timeout: 30_000 },
  );
}
