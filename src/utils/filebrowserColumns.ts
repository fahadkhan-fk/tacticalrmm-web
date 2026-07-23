import type { QTableColumn } from "quasar";

import type { FileBrowserItem } from "@/types/filebrowser";
import {
  compareNameAsc,
  makeColumnSort,
  parseModifiedToTimestamp,
  parseSizeLabelToBytes,
  typeSortLabel,
} from "@/utils/filebrowser";

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
