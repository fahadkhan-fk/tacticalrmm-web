import type {
  DownloadQueueStatus,
  DownloadSelectionMode,
  FileBrowserApiItem,
  FileBrowserItem,
  UploadQueueStatus,
} from "@/types/filebrowser";
import {
  FILE_BROWSER_INVALID_NAME_CHARS,
  FILE_BROWSER_MAX_NAME_LENGTH,
  MAX_SEQUENTIAL_DOWNLOAD_FILES,
} from "@/constants/filebrowser";
import { bytes2Human, formatDate } from "@/utils/format";
import { AxiosError } from "axios";

export function isFolderRow(row: FileBrowserItem): boolean {
  return row.type === "folder";
}

export function compareFolderFirst(
  rowA: FileBrowserItem,
  rowB: FileBrowserItem,
): number {
  const aFolder = isFolderRow(rowA);
  const bFolder = isFolderRow(rowB);
  if (aFolder && !bFolder) return -1;
  if (!aFolder && bFolder) return 1;
  return 0;
}

export function compareNameAsc(
  rowA: FileBrowserItem,
  rowB: FileBrowserItem,
): number {
  return rowA.name.localeCompare(rowB.name, undefined, { sensitivity: "base" });
}

export function typeSortLabel(row: FileBrowserItem): string {
  if (isFolderRow(row)) return "Folder";
  return (row.extension || "File").toUpperCase();
}

export function parseModifiedToTimestamp(modified?: string): number {
  if (!modified) return 0;
  const t = new Date(modified).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export function parseSizeLabelToBytes(size?: string): number {
  if (!size || size === "—") return 0;
  const trimmed = size.trim();
  const m = trimmed.match(/^([\d.]+)\s*(B|KB|MB|GB|TB)$/i);
  if (m) {
    const n = parseFloat(m[1]);
    const unit = m[2].toUpperCase();
    const mult: Record<string, number> = {
      B: 1,
      KB: 1024,
      MB: 1024 * 1024,
      GB: 1024 * 1024 * 1024,
      TB: 1024 * 1024 * 1024 * 1024,
    };
    return n * (mult[unit] ?? 1);
  }
  const raw = parseInt(trimmed, 10);
  return Number.isFinite(raw) && raw >= 0 ? raw : 0;
}

export function defaultFileBrowserRootPath(platform: string): string {
  switch ((platform || "").toLowerCase()) {
    case "windows":
      return "C:\\Users\\Public";
    case "darwin":
      return "/Users";
    case "linux":
    default:
      return "/";
  }
}

export function isLikelyWindowsPath(path: string): boolean {
  const trimmed = (path || "").trim();
  return /^[A-Za-z]:[\\/]/.test(trimmed) || trimmed.startsWith("\\\\");
}

export function normalizeAgentListPath(
  path: string,
  platform?: string,
): string {
  const trimmed = (path || "").trim();
  if (!trimmed) return trimmed;

  const plat = (platform || "").toLowerCase();
  const useWindows = plat === "windows" || isLikelyWindowsPath(trimmed);

  if (useWindows) {
    const normalized = trimmed.replace(/\//g, "\\");
    const driveRoot = /^([A-Za-z]):\\*$/.exec(normalized);
    if (driveRoot) return `${driveRoot[1]}:\\`;
    if (normalized.startsWith("\\\\")) return normalized.replace(/\\+$/, "");
    return normalized;
  }

  let normalized = trimmed.replace(/\\/g, "/");
  if (normalized !== "/") normalized = normalized.replace(/\/+$/, "");
  return normalized || "/";
}

export function formatFileBrowserTimestamp(iso?: string): string {
  if (!iso) return "";
  return formatDate(iso, "YYYY-MM-DD h:mm A");
}

export function mapApiItemToFileBrowserItem(
  raw: FileBrowserApiItem,
  platform?: string,
): FileBrowserItem {
  const normalizedPath = normalizeAgentListPath(raw.path, platform);
  const bytes = parseInt(raw.size, 10);
  const hasBytes = Number.isFinite(bytes) && bytes >= 0;

  const item: FileBrowserItem = {
    id: normalizeAgentListPath(raw.id || raw.path, platform),
    name: raw.name,
    path: normalizedPath,
    type: raw.type,
    modified: formatFileBrowserTimestamp(raw.modified),
    created: formatFileBrowserTimestamp(raw.created),
    accessed: formatFileBrowserTimestamp(raw.accessed),
    hidden: raw.hidden,
    system: raw.system,
    readonly: raw.readonly,
  };

  if (raw.extension) {
    item.extension = raw.extension;
  }

  if (raw.location) {
    item.location = normalizeAgentListPath(raw.location, platform);
  }

  if (raw.type === "file") {
    if (hasBytes) {
      item.sizeBytes = bytes;
      item.size = bytes2Human(bytes);
    } else {
      item.size = "—";
    }
  } else if (raw.type === "folder" && hasBytes) {
    item.sizeBytes = bytes;
    item.size = bytes2Human(bytes);
  }

  if (typeof raw.file_count === "number") {
    item.fileCount = raw.file_count;
  }
  if (typeof raw.folder_count === "number") {
    item.folderCount = raw.folder_count;
  }
  if (raw.summary_truncated != null) {
    item.summaryTruncated = Boolean(raw.summary_truncated);
  }

  return item;
}

export function mapApiItemsToFileBrowserItems(
  items: FileBrowserApiItem[],
  platform?: string,
): FileBrowserItem[] {
  return items.map((item) => mapApiItemToFileBrowserItem(item, platform));
}

export function getListFilesErrorMessage(err: unknown): string {
  if (err instanceof AxiosError) {
    if (err.code === "ERR_NETWORK") {
      return "Unable to reach the server. Check your connection.";
    }
    if (err.code === "ERR_CANCELED") {
      return "Request was cancelled.";
    }
    if (err.response?.status === 403) {
      const data = err.response.data as
        | { detail?: string }
        | string
        | undefined;
      if (typeof data === "object" && data?.detail) {
        return formatFileBrowserApiErrorMessage(data.detail);
      }
      return "You do not have permission to use the file browser.";
    }
    const data = err.response?.data;
    if (typeof data === "string" && data.trim()) {
      return formatFileBrowserApiErrorMessage(data);
    }
    if (data && typeof data === "object") {
      const record = data as Record<string, unknown>;
      for (const key of ["detail", "message", "error"]) {
        const value = record[key];
        if (typeof value === "string" && value.trim()) {
          return formatFileBrowserApiErrorMessage(value);
        }
      }
    }
    if (err.response?.statusText) {
      if (
        err.message &&
        !/^Request failed with status code \d+$/i.test(err.message)
      ) {
        return formatFileBrowserApiErrorMessage(err.message);
      }
    }
  } else if (err instanceof Error && err.message.trim()) {
    return formatFileBrowserApiErrorMessage(err.message);
  }
  return "Unable to load directory contents.";
}

export function formatFileBrowserApiErrorMessage(raw: string): string {
  const afterFailed = unwrapApiErrorText(raw);
  if (!afterFailed) return afterFailed;

  if (
    /this destination already contains a (file|folder) named/i.test(afterFailed)
  ) {
    return ensureSentence(afterFailed);
  }
  if (/^a (file|folder) named .+ already exists\.?$/i.test(afterFailed)) {
    return ensureSentence(afterFailed);
  }

  const namedDup =
    /^a file or folder named ["“]?(.+?)["”]? already exists\.?$/i.exec(
      afterFailed,
    );
  if (namedDup?.[1]) {
    return `A file or folder named "${namedDup[1]}" already exists.`;
  }
  if (/already exists/i.test(afterFailed)) {
    return "A file or folder with this name already exists.";
  }

  return ensureSentence(afterFailed);
}

function unwrapApiErrorText(raw: string): string {
  let text = raw.trim();
  if (!text) return text;

  if (text.startsWith('"') && text.endsWith('"')) {
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed === "string") {
        text = parsed.trim();
      }
    } catch {
      // Keep as it is, trailing "may be part of a name like ...named"
    }
  }

  const filesFailed = /^Files \w+ failed:\s*(.+)$/i.exec(text);
  if (filesFailed?.[1]) return filesFailed[1].trim();

  const genericFailed = /^[^:]+\s+failed:\s*(.+)$/i.exec(text);
  if (genericFailed?.[1]) return genericFailed[1].trim();

  return text;
}

function ensureSentence(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) return trimmed;
  const capped = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capped) ? capped : `${capped}.`;
}

export function isDuplicateNameError(err: unknown, message?: string): boolean {
  const text =
    (message && message.trim()) || getFileBrowserErrorMessage(err, "");
  return /already exists|already contains/i.test(text);
}

export function getFileBrowserErrorMessage(
  err: unknown,
  fallback = "Unable to complete the operation.",
): string {
  const message = getListFilesErrorMessage(err);
  if (message === "Unable to load directory contents.") {
    return fallback;
  }
  return message;
}

export function isListFilesPermissionError(err: unknown): boolean {
  return err instanceof AxiosError && err.response?.status === 403;
}

export function isListFilesAgentOfflineError(message: string): boolean {
  return /unable to contact the agent/i.test(message);
}

export function makeColumnSort(
  compareField: (rowA: FileBrowserItem, rowB: FileBrowserItem) => number,
): (
  _a: string | undefined,
  _b: string | undefined,
  rowA: FileBrowserItem,
  rowB: FileBrowserItem,
) => number {
  return (_a, _b, rowA, rowB) => {
    const folderCmp = compareFolderFirst(rowA, rowB);
    if (folderCmp !== 0) return folderCmp;

    const fieldCmp = compareField(rowA, rowB);
    if (fieldCmp !== 0) return fieldCmp;

    return compareNameAsc(rowA, rowB);
  };
}

export function extensionFromFileName(fileName: string): string | undefined {
  const i = fileName.lastIndexOf(".");
  if (i <= 0 || i === fileName.length - 1) return undefined;
  return fileName.slice(i + 1).toUpperCase();
}

export function formatMockListTimestamp(d: Date): string {
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const y = d.getFullYear();
  const mo = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  const h24 = d.getHours();
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 || 12;
  const hh = pad2(h12);
  const min = pad2(d.getMinutes());
  return `${y}-${mo}-${day} ${hh}:${min} ${ampm}`;
}

export function isFileDrag(
  dataTransfer: DataTransfer | null | undefined,
): boolean {
  if (!dataTransfer) return false;

  const types = dataTransfer.types;
  if (types) {
    for (let i = 0; i < types.length; i++) {
      if (types[i] === "Files") return true;
    }
  }

  const items = dataTransfer.items;
  if (items?.length) {
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === "file") return true;
    }
  }

  return false;
}

export function fileListToArray(list: FileList | null | undefined): File[] {
  if (!list?.length) return [];
  const out: File[] = [];
  for (let i = 0; i < list.length; i++) {
    const f = list.item(i);
    if (f) out.push(f);
  }
  return out;
}

export function fileNamesMatch(
  a: string,
  b: string,
  platform: string,
): boolean {
  if (platform === "windows") {
    return a.toLowerCase() === b.toLowerCase();
  }
  return a === b;
}

export function listUploadNameConflicts(
  files: File[],
  rows: FileBrowserItem[],
  platform: string,
): File[] {
  const existingFiles = rows.filter((row) => row.type === "file");
  return files.filter((file) =>
    existingFiles.some((row) => fileNamesMatch(row.name, file.name, platform)),
  );
}

export function uploadStatusLabel(status: UploadQueueStatus): string {
  switch (status) {
    case "queued":
      return "Queued";
    case "uploading":
      return "Uploading";
    case "completed":
      return "Uploaded";
    case "failed":
      return "Failed";
    case "paused":
      return "Paused";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

export function uploadStatusBadgeColor(status: UploadQueueStatus): string {
  switch (status) {
    case "queued":
      return "grey-5";
    case "uploading":
      return "primary";
    case "completed":
      return "positive";
    case "failed":
      return "negative";
    case "paused":
      return "warning";
    case "cancelled":
      return "grey-7";
    default:
      return "grey-5";
  }
}

export function classifyDownloadSelection(items: FileBrowserItem[]): {
  mode: DownloadSelectionMode;
  files: FileBrowserItem[];
  folderCount: number;
  fileCount: number;
} {
  if (!items.length) {
    return { mode: "none", files: [], folderCount: 0, fileCount: 0 };
  }

  const folders = items.filter((item) => item.type === "folder");
  const files = items.filter((item) => item.type === "file");
  const folderCount = folders.length;
  const fileCount = files.length;

  if (folderCount > 0 || fileCount > MAX_SEQUENTIAL_DOWNLOAD_FILES) {
    return { mode: "zip", files, folderCount, fileCount };
  }
  if (fileCount === 1) {
    return { mode: "single", files, folderCount, fileCount };
  }
  if (fileCount >= 2) {
    return { mode: "sequential", files, folderCount, fileCount };
  }

  return { mode: "none", files: [], folderCount, fileCount: 0 };
}

export function downloadStatusLabel(status: DownloadQueueStatus): string {
  switch (status) {
    case "queued":
      return "Queued";
    case "initializing":
      return "Initialising…";
    case "downloading":
      return "Downloading…";
    case "completing":
      return "Verifying…";
    case "completed":
      return "Downloaded";
    case "failed":
      return "Failed";
    case "paused":
      return "Paused";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

export function downloadStatusBadgeColor(status: DownloadQueueStatus): string {
  switch (status) {
    case "queued":
      return "grey-5";
    case "initializing":
    case "downloading":
    case "completing":
      return "primary";
    case "completed":
      return "positive";
    case "failed":
      return "negative";
    case "paused":
      return "warning";
    case "cancelled":
      return "grey-7";
    default:
      return "grey-5";
  }
}

export function isDownloadQueueItemTerminal(
  status: DownloadQueueStatus,
): boolean {
  return (
    status === "completed" || status === "failed" || status === "cancelled"
  );
}

export function canDismissDownloadQueueItem(
  status: DownloadQueueStatus,
): boolean {
  return isDownloadQueueItemTerminal(status);
}

export function canHideDownloadQueueItem(status: DownloadQueueStatus): boolean {
  return status === "paused";
}

export function canRemoveDownloadQueueItem(
  status: DownloadQueueStatus,
): boolean {
  return canDismissDownloadQueueItem(status) || status === "queued";
}

export function isDownloadQueueItemActive(
  status: DownloadQueueStatus,
): boolean {
  return (
    status === "initializing" ||
    status === "downloading" ||
    status === "completing"
  );
}

export function isUploadQueueItemActive(status: UploadQueueStatus): boolean {
  return status === "uploading";
}

export function isUploadQueueItemTerminal(status: UploadQueueStatus): boolean {
  return (
    status === "completed" || status === "failed" || status === "cancelled"
  );
}

export function deriveArchiveDownloadName(items: FileBrowserItem[]): string {
  if (items.length === 1) {
    const base =
      items[0].name.replace(/[\\/:*?"<>|]/g, "_").trim() || "download";
    return base.toLowerCase().endsWith(".zip") ? base : `${base}.zip`;
  }
  return "download.zip";
}

export function nameSegmentBaseRule(
  v: string | number | null | undefined,
): true | string {
  const raw = String(v ?? "");
  if (!raw.trim()) return "Name is required";
  if (raw.endsWith(".") || raw.endsWith(" ")) {
    return "Name cannot end with a space or a period";
  }

  const name = raw.trim();
  if (name === "." || name === "..") return "The name cannot be . or ..";
  if (FILE_BROWSER_INVALID_NAME_CHARS.test(name)) {
    return 'Name cannot contain \\ / : * ? " < > | or control characters';
  }
  if (name.length > FILE_BROWSER_MAX_NAME_LENGTH) {
    return `Name must be at most ${FILE_BROWSER_MAX_NAME_LENGTH} characters`;
  }
  return true;
}

export function duplicateNameRule(
  v: string | number | null | undefined,
  existingNames: string[],
  excludeName?: string,
): true | string {
  const name = String(v ?? "").trim();
  if (!name) return true;
  const lower = name.toLowerCase();
  const excludeLower = excludeName?.toLowerCase();
  const dup = existingNames.some(
    (n) => n.toLowerCase() === lower && n.toLowerCase() !== excludeLower,
  );
  return !dup || "A file or folder with this name already exists";
}

/** Placeholder rows until directory listing API is wired. */
export function createMockFileBrowserRows(): FileBrowserItem[] {
  return [
    {
      id: "1",
      name: "Desktop",
      path: "C:\\Users\\Public\\Documents\\Desktop",
      type: "folder",
      modified: "2026-04-28 09:12 AM",
      created: "2026-04-20 11:22 AM",
      accessed: "2026-04-28 09:15 AM",
    },
    {
      id: "2",
      name: "Downloads",
      path: "C:\\Users\\Public\\Documents\\Downloads",
      type: "folder",
      modified: "2026-04-27 04:42 PM",
      created: "2026-04-19 10:00 AM",
      accessed: "2026-04-28 08:50 AM",
    },
    {
      id: "3",
      name: "system-report.log",
      path: "C:\\Users\\Public\\Documents\\system-report.log",
      type: "file",
      extension: "LOG",
      size: "245 KB",
      modified: "2026-04-28 08:33 AM",
      created: "2026-04-26 01:15 PM",
      accessed: "2026-04-28 08:40 AM",
    },
    {
      id: "4",
      name: "backup-config.json",
      path: "C:\\Users\\Public\\Documents\\backup-config.json",
      type: "file",
      extension: "JSON",
      size: "18 KB",
      modified: "2026-04-25 06:10 PM",
      created: "2026-04-22 02:44 PM",
      accessed: "2026-04-27 09:10 AM",
    },
  ];
}
