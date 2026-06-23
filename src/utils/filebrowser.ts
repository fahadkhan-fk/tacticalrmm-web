import type { FileBrowserItem } from "@/types/filebrowser";

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
  const m = size.trim().match(/^([\d.]+)\s*(B|KB|MB|GB)$/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const unit = m[2].toUpperCase();
  const mult: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
  };
  return n * (mult[unit] ?? 1);
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

export function uploadStatusLabel(status: "ready" | "mock_uploaded"): string {
  if (status === "ready") return "Ready";
  return "Mock uploaded";
}

export function uploadStatusBadgeColor(
  status: "ready" | "mock_uploaded",
): string {
  if (status === "ready") return "grey-5";
  return "positive";
}

export function mockDownloadFileName(
  items: FileBrowserItem[],
  asArchive: boolean,
): string {
  if (asArchive) return "download.zip.mock.txt";
  if (items.length === 1) return `${items[0].name}.mock-download.txt`;
  return "download.mock.txt";
}

export function nameSegmentBaseRule(
  v: string | number | null | undefined,
): true | string {
  const name = String(v ?? "").trim();
  if (!name) return "Name is required";
  if (name === "." || name === "..") return "The name cannot be . or ..";
  if (/[\\/:*?"<>|\x00-\x1f]/.test(name))
    return 'Name cannot contain \\ / : * ? " < > | or control characters';
  if (name.endsWith(".") || name.endsWith(" "))
    return "Name cannot end with a space or a period";
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
