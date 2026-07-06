import type { QTableColumn } from "quasar";

import type { FileBrowserItem } from "@/types/filebrowser";
import {
  compareNameAsc,
  makeColumnSort,
  parseModifiedToTimestamp,
  parseSizeLabelToBytes,
  typeSortLabel,
} from "@/utils/filebrowser";

export const MAX_UPLOAD_FILES_PER_SELECTION = 100;
export const MAX_DELETE_PATHS_PER_REQUEST = 100;
export const MAX_UPLOAD_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MiB per file
export const MAX_UPLOAD_QUEUE_ITEMS = 500;
export const FILE_BROWSER_MAX_NAME_LENGTH = 255;
export const FILE_BROWSER_INVALID_NAME_CHARS = /[\\/:*?"<>|\x00-\x1f]/;

export const fileBrowserTableColumns: QTableColumn<FileBrowserItem>[] = [
  {
    name: "name",
    label: "Name",
    field: "name",
    align: "left",
    sortable: true,
    sortOrder: "ad",
    sort: makeColumnSort((a, b) => compareNameAsc(a, b)),
  },
  {
    name: "modified",
    label: "Date modified",
    field: "modified",
    align: "left",
    sortable: true,
    sortOrder: "da",
    sort: makeColumnSort(
      (a, b) =>
        parseModifiedToTimestamp(a.modified) -
        parseModifiedToTimestamp(b.modified),
    ),
  },
  {
    name: "type",
    label: "Type",
    field: "type",
    align: "left",
    sortable: true,
    sortOrder: "ad",
    sort: makeColumnSort((a, b) =>
      typeSortLabel(a).localeCompare(typeSortLabel(b), undefined, {
        sensitivity: "base",
      }),
    ),
  },
  {
    name: "size",
    label: "Size",
    field: "size",
    align: "left",
    sortable: true,
    sortOrder: "da",
    sort: makeColumnSort(
      (a, b) => parseSizeLabelToBytes(a.size) - parseSizeLabelToBytes(b.size),
    ),
  },
];
