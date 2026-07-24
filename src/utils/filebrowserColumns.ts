import type { QTableColumn } from "quasar";

import type { FileBrowserItem } from "@/types/filebrowser";

export const fileBrowserTableColumns: QTableColumn<FileBrowserItem>[] = [
  {
    name: "name",
    label: "Name",
    field: "name",
    align: "left",
    sortable: true,
    sortOrder: "ad",
  },
  {
    name: "modified",
    label: "Date modified",
    field: "modified",
    align: "left",
    sortable: true,
    sortOrder: "da",
  },
  {
    name: "type",
    label: "Type",
    field: "type",
    align: "left",
    sortable: true,
    sortOrder: "ad",
  },
  {
    name: "size",
    label: "Size",
    field: "size",
    align: "left",
    sortable: true,
    sortOrder: "da",
  },
];
