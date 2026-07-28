import type { QTableColumn } from "quasar";

import type { FileBrowserItem } from "@/types/filebrowser";

/**
 * Fixed column model for the File Browser table.
 *
 * Checkbox (selection): fixed via CSS on the first column (44px).
 * Name: flexible — min 320px, grows with leftover space (≈ minmax(320px, 1fr));
 *   long names ellipsize.
 * Date modified / Type / Size: fixed — stable anchors across folders
 * (avoids WinSxS-style content-driven layout shift).
 */
const FIXED_COL =
  "white-space: nowrap; overflow: hidden; text-overflow: ellipsis;";

export const fileBrowserTableColumns: QTableColumn<FileBrowserItem>[] = [
  {
    name: "name",
    label: "Name",
    field: "name",
    align: "left",
    sortable: true,
    sortOrder: "ad",
    // width:100% + max-width:0 ≈ 1fr under table-layout:fixed; min-width
    // approximates minmax(320px, 1fr) (narrow panels may scroll horizontally).
    classes: "file-col-name",
    headerClasses: "file-col-name",
    style: `width: 100%; min-width: 320px; max-width: 0; ${FIXED_COL}`,
    headerStyle: "width: 100%; min-width: 320px; max-width: 0;",
  },
  {
    name: "modified",
    label: "Date modified",
    field: "modified",
    align: "left",
    sortable: true,
    sortOrder: "da",
    classes: "file-col-modified",
    headerClasses: "file-col-modified",
    style: `width: 220px; max-width: 220px; ${FIXED_COL}`,
    headerStyle: "width: 220px; max-width: 220px;",
  },
  {
    name: "type",
    label: "Type",
    field: "type",
    align: "left",
    sortable: true,
    sortOrder: "ad",
    classes: "file-col-type",
    headerClasses: "file-col-type",
    style: `width: 130px; max-width: 130px; ${FIXED_COL}`,
    headerStyle: "width: 130px; max-width: 130px;",
  },
  {
    name: "size",
    label: "Size",
    field: "size",
    align: "left",
    sortable: true,
    sortOrder: "da",
    classes: "file-col-size",
    headerClasses: "file-col-size",
    style: `width: 120px; max-width: 120px; ${FIXED_COL}`,
    headerStyle: "width: 120px; max-width: 120px;",
  },
];
