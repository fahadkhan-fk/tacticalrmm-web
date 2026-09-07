import axios from "axios";

import {
  FILE_TRANSFER_DOWNLOAD_BYTES_STORE,
  FILE_TRANSFER_DOWNLOAD_IDB_NAME,
  FILE_TRANSFER_DOWNLOAD_IDB_STORE,
  FILE_TRANSFER_DOWNLOAD_RESUME_LS_KEY,
  FILE_TRANSFER_IDB_VERSION,
  FILE_TRANSFER_UI_META_IDB_STORE,
  FILE_TRANSFER_UPLOAD_RESUME_LS_KEY,
} from "@/constants/fileTransfer";

export interface UploadResumeEntry {
  sessionId: string;
  destinationPath: string;
  ts: number;
}

export interface DownloadResumeEntry {
  sessionId: string;
  chunkSize: number;
  totalSize: number;
  ts: number;
}

function lsGet<T extends Record<string, unknown>>(key: string): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "{}") as T;
  } catch {
    return {} as T;
  }
}

function lsSet(key: string, value: Record<string, unknown>): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export function uploadResumeKey(
  agentId: string,
  file: File,
  destinationPath: string,
): string {
  return `${agentId}:${destinationPath}:${file.name}:${file.size}:${file.lastModified}`;
}

export function downloadResumeKey(agentId: string, sourcePath: string): string {
  return `${agentId}:${sourcePath}`;
}

export function archiveDownloadResumeKey(
  agentId: string,
  paths: string[],
): string {
  return `${agentId}:archive:${paths.slice().sort().join("\u0000")}`;
}

export function downloadHandleIdbKey(
  agentId: string,
  sourcePath: string,
): string {
  return `dl:${downloadResumeKey(agentId, sourcePath)}`;
}

export function archiveDownloadHandleIdbKey(
  agentId: string,
  paths: string[],
): string {
  return `dl:${archiveDownloadResumeKey(agentId, paths)}`;
}

export function downloadSessionHandleIdbKey(sessionId: string): string {
  return `dl:session:${sessionId}`;
}

export function downloadBytesPathKey(
  agentId: string,
  resumeScopeKey: string,
): string {
  return `bytes:${agentId}:${resumeScopeKey}`;
}

export function downloadBytesSessionKey(sessionId: string): string {
  return `bytes:session:${sessionId}`;
}

export function canPickDownloadSaveFile(): boolean {
  return "showSaveFilePicker" in window;
}

export function canPickExistingDownloadFile(): boolean {
  return "showOpenFilePicker" in window;
}

export async function pickDownloadSaveHandle(
  suggestedName: string,
): Promise<FileSystemFileHandle> {
  return window.showSaveFilePicker({
    suggestedName,
    startIn: "downloads",
  });
}

export async function pickExistingDownloadHandle(): Promise<FileSystemFileHandle> {
  const [handle] = await window.showOpenFilePicker({
    multiple: false,
    startIn: "downloads",
  });
  if (!(await requestFileHandlePermission(handle))) {
    throw new Error("Write access to that file was denied.");
  }
  return handle;
}

export async function persistDownloadFileHandle(
  keys: Array<string | null | undefined>,
  handle: FileSystemFileHandle,
): Promise<void> {
  const unique = [...new Set(keys.filter((key): key is string => !!key))];
  for (const key of unique) {
    await idbPutFileHandle(key, handle);
  }
}

export function loadUploadResume(
  agentId: string,
  file: File,
  destinationPath: string,
): UploadResumeEntry | null {
  const entry = lsGet<Record<string, UploadResumeEntry>>(
    FILE_TRANSFER_UPLOAD_RESUME_LS_KEY,
  )[uploadResumeKey(agentId, file, destinationPath)];
  return entry ?? null;
}

export function saveUploadResume(
  agentId: string,
  file: File,
  destinationPath: string,
  sessionId: string,
): void {
  const map = lsGet<Record<string, UploadResumeEntry>>(
    FILE_TRANSFER_UPLOAD_RESUME_LS_KEY,
  );
  map[uploadResumeKey(agentId, file, destinationPath)] = {
    sessionId,
    destinationPath,
    ts: Date.now(),
  };
  lsSet(FILE_TRANSFER_UPLOAD_RESUME_LS_KEY, map);
}

export function clearUploadResume(
  agentId: string,
  file: File,
  destinationPath: string,
): void {
  const map = lsGet<Record<string, UploadResumeEntry>>(
    FILE_TRANSFER_UPLOAD_RESUME_LS_KEY,
  );
  delete map[uploadResumeKey(agentId, file, destinationPath)];
  lsSet(FILE_TRANSFER_UPLOAD_RESUME_LS_KEY, map);
}

export function loadDownloadResume(
  agentId: string,
  sourcePath: string,
): DownloadResumeEntry | null {
  const entry = lsGet<Record<string, DownloadResumeEntry>>(
    FILE_TRANSFER_DOWNLOAD_RESUME_LS_KEY,
  )[downloadResumeKey(agentId, sourcePath)];
  return entry ?? null;
}

export function saveDownloadResume(
  agentId: string,
  sourcePath: string,
  data: Omit<DownloadResumeEntry, "ts">,
): void {
  const map = lsGet<Record<string, DownloadResumeEntry>>(
    FILE_TRANSFER_DOWNLOAD_RESUME_LS_KEY,
  );
  map[downloadResumeKey(agentId, sourcePath)] = { ...data, ts: Date.now() };
  lsSet(FILE_TRANSFER_DOWNLOAD_RESUME_LS_KEY, map);
}

export function clearDownloadResume(agentId: string, sourcePath: string): void {
  const map = lsGet<Record<string, DownloadResumeEntry>>(
    FILE_TRANSFER_DOWNLOAD_RESUME_LS_KEY,
  );
  delete map[downloadResumeKey(agentId, sourcePath)];
  lsSet(FILE_TRANSFER_DOWNLOAD_RESUME_LS_KEY, map);
}

export function clearUploadResumeBySessionId(sessionId: string): void {
  const map = lsGet<Record<string, UploadResumeEntry>>(
    FILE_TRANSFER_UPLOAD_RESUME_LS_KEY,
  );
  let changed = false;
  for (const [key, entry] of Object.entries(map)) {
    if (entry?.sessionId === sessionId) {
      delete map[key];
      changed = true;
    }
  }
  if (changed) lsSet(FILE_TRANSFER_UPLOAD_RESUME_LS_KEY, map);
}

export function clearDownloadResumeBySessionId(sessionId: string): void {
  const map = lsGet<Record<string, DownloadResumeEntry>>(
    FILE_TRANSFER_DOWNLOAD_RESUME_LS_KEY,
  );
  let changed = false;
  for (const [key, entry] of Object.entries(map)) {
    if (entry?.sessionId === sessionId) {
      delete map[key];
      changed = true;
    }
  }
  if (changed) lsSet(FILE_TRANSFER_DOWNLOAD_RESUME_LS_KEY, map);
}

export function findDownloadResumeScopeKeyBySessionId(
  agentId: string,
  sessionId: string,
): string | null {
  const map = lsGet<Record<string, DownloadResumeEntry>>(
    FILE_TRANSFER_DOWNLOAD_RESUME_LS_KEY,
  );
  const prefix = `${agentId}:`;
  for (const [key, entry] of Object.entries(map)) {
    if (entry?.sessionId === sessionId && key.startsWith(prefix)) {
      return key.slice(prefix.length);
    }
  }
  return null;
}

function openTransferIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(
      FILE_TRANSFER_DOWNLOAD_IDB_NAME,
      FILE_TRANSFER_IDB_VERSION,
    );
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(FILE_TRANSFER_DOWNLOAD_IDB_STORE)) {
        db.createObjectStore(FILE_TRANSFER_DOWNLOAD_IDB_STORE);
      }
      if (!db.objectStoreNames.contains(FILE_TRANSFER_UI_META_IDB_STORE)) {
        db.createObjectStore(FILE_TRANSFER_UI_META_IDB_STORE);
      }
      if (!db.objectStoreNames.contains(FILE_TRANSFER_DOWNLOAD_BYTES_STORE)) {
        db.createObjectStore(FILE_TRANSFER_DOWNLOAD_BYTES_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function openFileTransferIdb(): Promise<IDBDatabase> {
  return openTransferIdb();
}

export async function idbPutFileHandle(
  key: string,
  handle: FileSystemFileHandle,
): Promise<void> {
  const db = await openTransferIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_TRANSFER_DOWNLOAD_IDB_STORE, "readwrite");
    tx.objectStore(FILE_TRANSFER_DOWNLOAD_IDB_STORE).put(handle, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbGetFileHandle(
  key: string,
): Promise<FileSystemFileHandle | undefined> {
  const db = await openTransferIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_TRANSFER_DOWNLOAD_IDB_STORE, "readonly");
    const request = tx.objectStore(FILE_TRANSFER_DOWNLOAD_IDB_STORE).get(key);
    request.onsuccess = () =>
      resolve(request.result as FileSystemFileHandle | undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function idbDeleteFileHandle(key: string): Promise<void> {
  const db = await openTransferIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_TRANSFER_DOWNLOAD_IDB_STORE, "readwrite");
    tx.objectStore(FILE_TRANSFER_DOWNLOAD_IDB_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export interface DownloadBytesRecord {
  buffers: ArrayBuffer[];
  committedOffset: number;
  chunkSize: number;
}

export async function idbPutDownloadBytes(
  key: string,
  record: DownloadBytesRecord,
): Promise<void> {
  const db = await openTransferIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_TRANSFER_DOWNLOAD_BYTES_STORE, "readwrite");
    tx.objectStore(FILE_TRANSFER_DOWNLOAD_BYTES_STORE).put(record, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbGetDownloadBytes(
  key: string,
): Promise<DownloadBytesRecord | undefined> {
  const db = await openTransferIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_TRANSFER_DOWNLOAD_BYTES_STORE, "readonly");
    const request = tx.objectStore(FILE_TRANSFER_DOWNLOAD_BYTES_STORE).get(key);
    request.onsuccess = () =>
      resolve(request.result as DownloadBytesRecord | undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function idbDeleteDownloadBytes(key: string): Promise<void> {
  const db = await openTransferIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_TRANSFER_DOWNLOAD_BYTES_STORE, "readwrite");
    tx.objectStore(FILE_TRANSFER_DOWNLOAD_BYTES_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function queryFileHandlePermission(
  handle: FileSystemFileHandle,
): Promise<PermissionState> {
  try {
    return await handle.queryPermission({ mode: "readwrite" });
  } catch {
    return "prompt";
  }
}

export async function requestFileHandlePermission(
  handle: FileSystemFileHandle,
): Promise<boolean> {
  try {
    if ((await queryFileHandlePermission(handle)) === "granted") return true;
    return (
      (await handle.requestPermission({ mode: "readwrite" })) === "granted"
    );
  } catch {
    return false;
  }
}

export async function ensureFileHandlePermission(
  handle: FileSystemFileHandle,
): Promise<boolean> {
  return requestFileHandlePermission(handle);
}

export function alignResumeOffset(
  partialSize: number,
  chunkSize: number,
): number {
  return Math.floor(partialSize / chunkSize) * chunkSize;
}

export function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (typeof err !== "object" || err === null) return false;

  const e = err as {
    code?: string;
    name?: string;
    message?: string;
  };

  if (e.code === "ERR_CANCELED") return true;
  if (e.name === "CanceledError" || e.name === "AbortError") return true;
  if (typeof axios.isCancel === "function" && axios.isCancel(err)) return true;
  if (
    /^(canceled|cancelled|download aborted|upload aborted|transfer aborted)$/i.test(
      (e.message ?? "").trim(),
    )
  ) {
    return true;
  }
  return false;
}
