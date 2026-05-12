<template>
  <div
    class="file-browser column"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent="onDragOver"
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
  >
    <!-- Path / Breadcrumb Row -->
    <div class="row items-center q-mb-md file-path-row">
      <q-btn
        dense
        flat
        icon="arrow_back"
        :disable="historyIndex <= 0"
        @click="goBack"
        class="nav-btn"
      />

      <q-btn dense flat icon="arrow_forward" disable class="nav-btn" />

      <div class="folder-path path-bar row no-wrap px-2 min-width-0">
        <q-icon
          name="far fa-folder-open"
          class="q-mr-sm text-blue-5 crumb-folder-icon self-center"
          size="18px"
          @click.stop="onFolderPathIconClick"
        />

        <!-- Browse: click empty bar / separators / padding → edit; segment buttons navigate (click.stop). -->
        <div
          v-if="!pathEditMode"
          class="row items-center col crumb-path-hitbox min-width-0"
          @click="onPathBarClick"
        >
          <div class="row items-center col crumb-bar no-wrap min-width-0">
            <div class="row items-center col crumb-scroll min-width-0">
              <template
                v-for="(seg, idx) in breadcrumbSegments"
                :key="`${idx}-${seg.fullPath}`"
              >
                <span
                  v-if="idx > 0"
                  class="crumb-separator text-grey-6"
                  aria-hidden="true"
                  >&gt;</span
                >
                <q-btn
                  dense
                  flat
                  no-caps
                  class="crumb-btn"
                  :class="{
                    'crumb-btn--current': isCurrentBreadcrumbSegment(seg),
                  }"
                  :disable="isCurrentBreadcrumbSegment(seg)"
                  @click.stop="onBreadcrumbSegmentClick(seg)"
                >
                  {{ seg.label }}
                </q-btn>
              </template>
              <span
                v-if="breadcrumbSegments.length === 0 && currentPath.trim()"
                class="text-grey-7 ellipsis col crumb-fallback-path"
                >{{ currentPath }}</span
              >
            </div>
          </div>
        </div>

        <!-- Edit mode: paste / type full path -->
        <q-input
          v-else
          ref="pathEditInputRef"
          v-model="pathInput"
          dense
          class="col path-edit-input min-width-0"
          borderless
          @keyup.enter="navigateToPath"
          @keyup.esc="cancelPathEdit"
          @blur="onPathEditBlur"
        />
      </div>
    </div>

    <!-- Toolbar Row -->
    <input
      ref="fileInputRef"
      type="file"
      class="hidden-file-input"
      multiple
      @change="onFileInputChange"
    />

    <div class="row items-center justify-between file-toolbar">
      <div class="row items-center q-gutter-sm">
        <!-- Primary CTA -->
        <q-btn
          dense
          color="primary"
          icon="upload"
          label="Upload"
          class="toolbar-primary-btn"
          :disable="!hasUploadPath"
          @click="openFilePicker"
        />

        <!-- Action buttons -->
        <q-btn
          dense
          unelevated
          icon="create_new_folder"
          label="New Folder"
          class="toolbar-btn"
          :disable="!hasUploadPath"
          @click="openNewFolderDialog"
        />
        <q-btn
          dense
          unelevated
          icon="download"
          label="Download"
          class="toolbar-btn"
          :disable="selectedRows.length === 0"
          @click="downloadSelectedItems"
        />
        <q-btn
          dense
          unelevated
          icon="delete"
          label="Delete"
          class="toolbar-btn"
          :disable="selectedRows.length === 0"
          @click="openDeleteDialog"
        />
        <q-btn
          dense
          unelevated
          icon="edit"
          label="Rename"
          class="toolbar-btn"
          :disable="selectedRows.length !== 1"
          @click="openRenameDialog()"
        />

        <q-btn
          dense
          unelevated
          label="More"
          icon-right="expand_more"
          class="toolbar-btn"
        >
          <q-menu transition-show="jump-up" transition-hide="jump-down">
            <q-list dense class="file-context-menu" style="min-width: 180px">
              <q-item
                clickable
                v-close-popup
                :disable="selectedRows.length !== 1"
                @click="showPropertiesFromToolbar"
              >
                <q-item-section avatar>
                  <q-icon name="info" size="18px" />
                </q-item-section>
                <q-item-section>Properties</q-item-section>
              </q-item>

              <q-item
                clickable
                v-close-popup
                :disable="selectedRows.length === 0"
                @click="copySelectedPathsToClipboard"
              >
                <q-item-section avatar>
                  <q-icon name="content_copy" size="18px" />
                </q-item-section>
                <q-item-section>Copy Path</q-item-section>
              </q-item>
            </q-list>
          </q-menu>
        </q-btn>
      </div>

      <div class="row items-center q-gutter-sm">
        <q-input
          v-model="search"
          dense
          outlined
          clearable
          placeholder="Filter by name in this folder"
          class="file-search"
        >
          <template #prepend>
            <q-icon name="search" />
          </template>
        </q-input>

        <!-- Keep outline for icon buttons -->
        <q-btn
          dense
          outline
          icon="refresh"
          class="toolbar-icon-btn"
          @click="refresh"
        />
      </div>
    </div>

    <!-- Upload queue (picker + drag-drop share the same pipeline) -->
    <div v-if="uploadQueueItems.length" class="upload-queue-section q-mb-sm">
      <div class="row items-center justify-between q-mb-xs">
        <div class="text-subtitle2 text-weight-medium">Upload queue</div>
        <div class="row items-center q-gutter-xs">
          <q-btn
            dense
            flat
            no-caps
            size="sm"
            label="Clear all"
            @click="clearUploadQueue"
          />
        </div>
      </div>
      <div class="text-caption text-grey-6 q-mb-sm">
        Destination:
        <span class="text-grey-4">{{ uploadDestinationLabel }}</span>
      </div>
      <q-list bordered separator dense class="upload-queue-list">
        <q-item
          v-for="item in uploadQueueItems"
          :key="item.id"
          class="upload-queue-item"
        >
          <q-item-section avatar>
            <q-icon name="description" color="primary" size="22px" />
          </q-item-section>
          <q-item-section>
            <q-item-label class="ellipsis">{{ item.name }}</q-item-label>
            <q-item-label caption>{{ item.sizeLabel }}</q-item-label>
            <q-linear-progress
              :value="item.progress"
              color="primary"
              track-color="grey-9"
              class="q-mt-xs upload-progress"
              rounded
              size="6px"
            />
          </q-item-section>
          <q-item-section side>
            <q-badge
              :color="uploadStatusBadgeColor(item.status)"
              :text-color="item.status === 'ready' ? 'dark' : undefined"
              align="middle"
            >
              {{ uploadStatusLabel(item.status) }}
            </q-badge>
            <q-btn
              dense
              flat
              round
              icon="close"
              size="sm"
              class="q-mt-xs"
              @click="removeUploadItem(item.id)"
            />
          </q-item-section>
        </q-item>
      </q-list>
    </div>

    <!-- Table Area -->
    <div class="col relative-position file-table-wrap">
      <q-table
        flat
        dense
        virtual-scroll
        row-key="id"
        class="file-table"
        :rows="filteredRows"
        :columns="columns"
        :loading="loading"
        :pagination="{ rowsPerPage: 0, sortBy: 'type', descending: true }"
        :rows-per-page-options="[0]"
        selection="multiple"
        v-model:selected="selectedRows"
        :no-data-label="tableNoDataLabel"
      >
        <template #body="props">
          <q-tr
            :props="props"
            class="cursor-pointer"
            @dblclick="onRowDoubleClick(props.row)"
          >
            <q-menu
              context-menu
              transition-show="jump-up"
              transition-hide="jump-down"
            >
              <q-list dense class="file-context-menu" style="min-width: 180px">
                <q-item
                  v-if="props.row.type === 'folder'"
                  clickable
                  v-close-popup
                  @click="openFolder(props.row)"
                >
                  <q-item-section avatar>
                    <q-icon name="folder_open" size="18px" />
                  </q-item-section>
                  <q-item-section>Open</q-item-section>
                </q-item>

                <q-item
                  clickable
                  v-close-popup
                  @click="downloadFromContext(props.row)"
                >
                  <q-item-section avatar>
                    <q-icon name="download" size="18px" />
                  </q-item-section>
                  <q-item-section>Download</q-item-section>
                </q-item>

                <q-item
                  clickable
                  v-close-popup
                  @click="openRenameDialog(props.row)"
                >
                  <q-item-section avatar>
                    <q-icon name="edit" size="18px" />
                  </q-item-section>
                  <q-item-section>Rename</q-item-section>
                </q-item>

                <q-item
                  clickable
                  v-close-popup
                  @click="openDeleteDialogFromContext(props.row)"
                >
                  <q-item-section avatar>
                    <q-icon name="delete" size="18px" color="negative" />
                  </q-item-section>
                  <q-item-section class="text-negative">Delete</q-item-section>
                </q-item>

                <q-separator />

                <q-item
                  clickable
                  v-close-popup
                  @click="showProperties(props.row)"
                >
                  <q-item-section avatar>
                    <q-icon name="info" size="18px" />
                  </q-item-section>
                  <q-item-section>Properties</q-item-section>
                </q-item>

                <q-item
                  clickable
                  v-close-popup
                  @click="copyPathFromContext(props.row)"
                >
                  <q-item-section avatar>
                    <q-icon name="content_copy" size="18px" />
                  </q-item-section>
                  <q-item-section>Copy Path</q-item-section>
                </q-item>
              </q-list>
            </q-menu>

            <q-td auto-width>
              <q-checkbox v-model="props.selected" dense />
            </q-td>

            <q-td key="name" :props="props">
              <div class="row items-center no-wrap">
                <q-icon
                  :name="props.row.type === 'folder' ? 'folder' : 'description'"
                  :color="props.row.type === 'folder' ? 'yellow-8' : 'primary'"
                  size="20px"
                  class="q-mr-sm"
                />
                <span class="ellipsis">{{ props.row.name }}</span>
              </div>
            </q-td>

            <q-td key="modified" :props="props">
              {{ props.row.modified }}
            </q-td>

            <q-td key="type" :props="props">
              {{
                props.row.type === "folder"
                  ? "Folder"
                  : props.row.extension || "File"
              }}
            </q-td>

            <q-td key="size" :props="props">
              {{ props.row.type === "folder" ? "—" : props.row.size }}
            </q-td>
          </q-tr>
        </template>
      </q-table>

      <!-- Drag Upload Overlay -->
      <div
        v-if="isDragging && hasUploadPath"
        class="drop-overlay column items-center justify-center"
      >
        <q-icon name="cloud_upload" size="52px" color="primary" />
        <div class="text-h6 q-mt-sm">Drop files to upload</div>
        <div class="text-caption text-grey-7">
          Files will be uploaded to {{ currentPath }}
        </div>
      </div>
    </div>

    <!-- Properties Dialog -->
    <q-dialog v-model="propertiesDialog">
      <q-card style="min-width: 420px">
        <q-card-section>
          <div class="text-h6">Properties</div>
        </q-card-section>

        <q-separator />

        <q-card-section v-if="selectedPropertyItem" class="q-gutter-sm">
          <div><strong>Name:</strong> {{ selectedPropertyItem.name }}</div>
          <div><strong>Path:</strong> {{ selectedPropertyItem.path }}</div>
          <div><strong>Type:</strong> {{ selectedPropertyItem.type }}</div>
          <div>
            <strong>Size:</strong> {{ selectedPropertyItem.size || "—" }}
          </div>
          <div>
            <strong>Modified:</strong> {{ selectedPropertyItem.modified }}
          </div>
          <div>
            <strong>Created:</strong> {{ selectedPropertyItem.created }}
          </div>
          <div>
            <strong>Accessed:</strong> {{ selectedPropertyItem.accessed }}
          </div>
        </q-card-section>

        <q-card-actions align="right">
          <q-btn flat label="Close" color="primary" v-close-popup />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- New Folder -->
    <q-dialog v-model="newFolderDialog" @hide="resetNewFolderDialog">
      <q-card style="min-width: 360px">
        <q-card-section>
          <div class="text-h6">New Folder</div>
        </q-card-section>

        <q-separator />

        <q-card-section>
          <q-input
            ref="newFolderInputRef"
            v-model="newFolderName"
            dense
            outlined
            autofocus
            label="Folder name"
            lazy-rules
            :rules="newFolderNameRules"
            maxlength="255"
            counter
            @keyup.enter="submitNewFolder"
          />
        </q-card-section>

        <q-card-actions align="right">
          <q-btn flat label="Cancel" color="primary" v-close-popup />
          <q-btn
            unelevated
            label="Create"
            color="primary"
            :disable="!newFolderName.trim()"
            @click="submitNewFolder"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Rename -->
    <q-dialog v-model="renameDialog" @hide="resetRenameDialog">
      <q-card style="min-width: 360px">
        <q-card-section>
          <div class="text-h6">Rename</div>
        </q-card-section>

        <q-separator />

        <q-card-section>
          <q-input
            ref="renameInputRef"
            v-model="renameName"
            dense
            outlined
            autofocus
            label="Name"
            lazy-rules
            :rules="renameNameRules"
            maxlength="255"
            counter
            @keyup.enter="submitRename"
          />
        </q-card-section>

        <q-card-actions align="right">
          <q-btn flat label="Cancel" color="primary" v-close-popup />
          <q-btn
            unelevated
            label="Rename"
            color="primary"
            :disable="
              !renameName.trim() ||
              renameName.trim() === renameOriginalName.trim()
            "
            @click="submitRename"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Delete confirmation (mandatory before removing items) -->
    <q-dialog v-model="deleteDialog" @hide="resetDeleteDialog">
      <q-card class="delete-confirm-card">
        <q-card-section>
          <div class="text-h6 delete-confirm-title">
            {{ deleteConfirmTitle }}
          </div>
          <div class="text-body2 q-mt-sm text-negative delete-confirm-body">
            {{ deleteConfirmBody }}
          </div>
        </q-card-section>

        <q-separator />

        <q-card-actions align="right">
          <q-btn flat label="Cancel" color="primary" v-close-popup />
          <q-btn
            unelevated
            label="Delete"
            color="negative"
            text-color="white"
            @click="confirmDelete"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { copyToClipboard, QInput, type QTableColumn } from "quasar";
import {
  notifyError,
  notifyInfo,
  notifySuccess,
  notifyWarning,
} from "@/utils/notify";

// Client-side upload caps (align with backend when streaming is wired).
const MAX_UPLOAD_FILES_PER_SELECTION = 100;
const MAX_UPLOAD_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MiB per file
const MAX_UPLOAD_QUEUE_ITEMS = 500;

defineProps<{
  agent_id: string;
}>();

type FileBrowserItem = {
  id: string;
  name: string;
  path: string;
  type: "folder" | "file";
  extension?: string;
  size?: string;
  modified?: string;
  created?: string;
  accessed?: string;
};

const loading = ref(false);
const currentPath = ref("C:\\Users\\Public\\Documents");
const pathInput = ref(currentPath.value);
// When false, show clickable breadcrumb segments; when true, show full path input.
const pathEditMode = ref(false);
const pathEditInputRef = ref<InstanceType<typeof QInput> | null>(null);
const search = ref("");
const selectedRows = ref<FileBrowserItem[]>([]);
// True while a file-type drag is over the browser (overlay + drop affordance).
const isDragging = ref(false);
const dragCounter = ref(0);
// Set when DataTransfer looks like OS files; paired with dragCounter for overlay.
const isFileDragSession = ref(false);

const history = ref<string[]>([currentPath.value]);
const historyIndex = ref(0);

const propertiesDialog = ref(false);
const selectedPropertyItem = ref<FileBrowserItem | null>(null);

const newFolderDialog = ref(false);
const newFolderName = ref("");
const newFolderInputRef = ref<InstanceType<typeof QInput> | null>(null);

const renameDialog = ref(false);
const renameTargetItem = ref<FileBrowserItem | null>(null);
const renameName = ref("");
const renameOriginalName = ref("");
const renameInputRef = ref<InstanceType<typeof QInput> | null>(null);

const deleteDialog = ref(false);
const deletePendingItems = ref<FileBrowserItem[]>([]);

const fileInputRef = ref<HTMLInputElement | null>(null);

type UploadQueueStatus = "ready" | "mock_uploaded";

type UploadQueueItem = {
  id: string;
  file: File;
  name: string;
  sizeLabel: string;
  destinationPath: string;
  status: UploadQueueStatus;
  // 0–1; reserved for streaming progress — mock uses a quick ramp then full
  progress: number;
};

const uploadQueue = ref<UploadQueueItem[]>([]);
let uploadIdSeq = 0;
let newFolderRowIdSeq = 100;

// Windows / SMB-style single-segment name checks (agent is often Windows).
const WINDOWS_FOLDER_NAME_INVALID_CHARS = /[\\/:*?"<>|\x00-\x1f]/;

// Exposed for template `v-for` typing (avoids `unknown` item in some vue-tsc setups).
const uploadQueueItems = computed<UploadQueueItem[]>(() => uploadQueue.value);

const hasUploadPath = computed(() => currentPath.value.trim().length > 0);

type BreadcrumbSegment = { label: string; fullPath: string };

function normalizePathSlashes(p: string): string {
  return p.trim().replace(/\//g, "\\");
}

// Case-insensitive path identity for Windows-style browsing (drive + UNC).
function pathKeyForCompare(p: string): string {
  let s = normalizePathSlashes(p);
  const driveOnly = /^([A-Za-z]:)\\*$/.exec(s);
  if (driveOnly) return `${driveOnly[1].toLowerCase()}\\`;
  if (s.startsWith("\\\\")) {
    return s.replace(/\\+$/, "").toLowerCase();
  }
  return s.replace(/\\+$/, "").toLowerCase();
}

function pathsEqual(a: string, b: string): boolean {
  return pathKeyForCompare(a) === pathKeyForCompare(b);
}

// Build segments for C: > Users > Public > … and UNC \\server > share >
function parsePathToBreadcrumbs(raw: string): BreadcrumbSegment[] {
  const normalized = normalizePathSlashes(raw);
  if (!normalized) return [];

  if (normalized.startsWith("\\\\")) {
    const noTrail = normalized.replace(/\\+$/, "");
    const inner = noTrail.slice(2).split("\\").filter(Boolean);
    if (inner.length === 0) {
      return [{ label: "\\\\", fullPath: "\\\\" }];
    }
    return inner.map((label, i) => ({
      label,
      fullPath: "\\\\" + inner.slice(0, i + 1).join("\\"),
    }));
  }

  const parts = normalized.split("\\").filter(Boolean);
  if (parts.length === 0) return [];

  const first = parts[0];
  if (/^[A-Za-z]:$/.test(first)) {
    const out: BreadcrumbSegment[] = [{ label: first, fullPath: `${first}\\` }];
    for (let i = 1; i < parts.length; i++) {
      const fullPath = `${first}\\${parts.slice(1, i + 1).join("\\")}`;
      out.push({ label: parts[i], fullPath });
    }
    return out;
  }

  return parts.map((label, i) => ({
    label,
    fullPath: parts.slice(0, i + 1).join("\\"),
  }));
}

const breadcrumbSegments = computed(() =>
  parsePathToBreadcrumbs(currentPath.value),
);

function isCurrentBreadcrumbSegment(seg: BreadcrumbSegment): boolean {
  return pathsEqual(seg.fullPath, currentPath.value);
}

function onBreadcrumbSegmentClick(seg: BreadcrumbSegment) {
  if (isCurrentBreadcrumbSegment(seg)) return;
  setPath(seg.fullPath);
}

// Windows-style: click the path bar (not a folder segment) to type a path.
function onPathBarClick(ev: MouseEvent) {
  const el = ev.target as HTMLElement | null;
  if (el?.closest?.(".crumb-btn")) return;
  enterPathEditMode();
}

function onFolderPathIconClick() {
  if (!pathEditMode.value) enterPathEditMode();
}

function enterPathEditMode() {
  pathEditMode.value = true;
  pathInput.value = currentPath.value;
  nextTick(() => {
    const inp = pathEditInputRef.value;
    if (!inp) return;
    inp.focus();
    const root = inp.$el as HTMLElement | undefined;
    const native = root?.querySelector("input");
    if (native instanceof HTMLInputElement) native.select();
  });
}

function cancelPathEdit() {
  pathInput.value = currentPath.value;
  pathEditMode.value = false;
}

function onPathEditBlur() {
  window.setTimeout(() => {
    if (pathEditMode.value) cancelPathEdit();
  }, 0);
}

const uploadDestinationLabel = computed(() => {
  if (!uploadQueue.value.length) return "";
  const first = uploadQueue.value[0].destinationPath;
  const allSame = uploadQueue.value.every((i) => i.destinationPath === first);
  return allSame ? first : `${first} (+ other paths in queue)`;
});

const rows = ref<FileBrowserItem[]>([
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
]);

const columns: QTableColumn<FileBrowserItem>[] = [
  {
    name: "name",
    label: "Name",
    field: "name",
    align: "left",
    sortable: true,
  },
  {
    name: "modified",
    label: "Date modified",
    field: "modified",
    align: "left",
    sortable: true,
  },
  {
    name: "type",
    label: "Type",
    field: "type",
    align: "left",
    sortable: true,
  },
  {
    name: "size",
    label: "Size",
    field: "size",
    align: "left",
    sortable: true,
  },
];

const filteredRows = computed(() => {
  const q = (search.value ?? "").trim().toLowerCase();
  if (!q) return rows.value;

  return rows.value.filter((row) => row.name.toLowerCase().includes(q));
});

// Shown when the table has zero rows (empty folder vs no filter matches).
const tableNoDataLabel = computed(() => {
  const q = (search.value ?? "").trim();
  if (q && rows.value.length > 0) return "No items match your filter";
  return "Folder is empty";
});

watch(
  filteredRows,
  (visible) => {
    const ids = new Set(visible.map((r) => r.id));
    selectedRows.value = selectedRows.value.filter((s) => ids.has(s.id));
  },
  { flush: "post" },
);

function nameSegmentBaseRule(
  v: string | number | null | undefined,
): true | string {
  const name = String(v ?? "").trim();
  if (!name) return "Name is required";
  if (name === "." || name === "..") return "The name cannot be . or ..";
  if (WINDOWS_FOLDER_NAME_INVALID_CHARS.test(name))
    return 'Name cannot contain \\ / : * ? " < > | or control characters';
  if (name.endsWith(".") || name.endsWith(" "))
    return "Name cannot end with a space or a period";
  return true;
}

// Pass `excludeId` when renaming so the current row does not count as a duplicate.
function duplicateNameAmongRowsRule(
  v: string | number | null | undefined,
  excludeId?: string,
): true | string {
  const name = String(v ?? "").trim();
  if (!name) return true;
  const lower = name.toLowerCase();
  const dup = rows.value.some(
    (r) =>
      r.name.toLowerCase() === lower &&
      (excludeId === undefined || r.id !== excludeId),
  );
  return !dup || "A file or folder with this name already exists";
}

const newFolderNameRules = computed(() => [
  (v: string | number | null | undefined) => nameSegmentBaseRule(v),
  (v: string | number | null | undefined) => duplicateNameAmongRowsRule(v),
]);

const renameNameRules = computed(() => {
  const excludeId = renameTargetItem.value?.id;
  return [
    (v: string | number | null | undefined) => nameSegmentBaseRule(v),
    (v: string | number | null | undefined) =>
      duplicateNameAmongRowsRule(v, excludeId),
  ];
});

function joinRemotePathSegment(basePath: string, segment: string): string {
  return `${basePath.replace(/\\+$/, "")}\\${segment}`;
}

// Parent directory of a full file/folder path (last segment removed).
function getParentRemotePath(fullPath: string): string {
  const trimmed = fullPath.trim().replace(/[/\\]+$/, "");
  const lastBack = trimmed.lastIndexOf("\\");
  const lastFwd = trimmed.lastIndexOf("/");
  const lastSep = Math.max(lastBack, lastFwd);
  if (lastSep <= 0) return trimmed;
  return trimmed.slice(0, lastSep);
}

function replacePathLastSegment(
  fullPath: string,
  newLastSegment: string,
): string {
  return joinRemotePathSegment(getParentRemotePath(fullPath), newLastSegment);
}

function extensionFromFileName(fileName: string): string | undefined {
  const i = fileName.lastIndexOf(".");
  if (i <= 0 || i === fileName.length - 1) return undefined;
  return fileName.slice(i + 1).toUpperCase();
}

function formatMockListTimestamp(d: Date): string {
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

function openNewFolderDialog() {
  if (!hasUploadPath.value) {
    notifyWarning("Select a folder path before creating a folder.");
    return;
  }
  newFolderName.value = "";
  newFolderDialog.value = true;
  nextTick(() => {
    newFolderInputRef.value?.resetValidation();
  });
}

function resetNewFolderDialog() {
  newFolderName.value = "";
  nextTick(() => {
    newFolderInputRef.value?.resetValidation();
  });
}

async function submitNewFolder() {
  const input = newFolderInputRef.value;
  if (input) {
    const ok = await input.validate();
    if (!ok) return;
  }

  const name = newFolderName.value.trim();
  if (!name) return;

  const now = new Date();
  const stamp = formatMockListTimestamp(now);

  rows.value.push({
    id: `nf-${newFolderRowIdSeq++}`,
    name,
    path: joinRemotePathSegment(currentPath.value.trim(), name),
    type: "folder",
    modified: stamp,
    created: stamp,
    accessed: stamp,
  });

  notifySuccess("Folder created");
  newFolderDialog.value = false;
}

function openRenameDialog(row?: FileBrowserItem) {
  const item = row ?? selectedRows.value[0];
  if (!item) {
    notifyWarning("Select a single item to rename.");
    return;
  }
  renameTargetItem.value = item;
  renameOriginalName.value = item.name;
  renameName.value = item.name;
  renameDialog.value = true;
  nextTick(() => {
    renameInputRef.value?.resetValidation();
  });
}

function resetRenameDialog() {
  renameTargetItem.value = null;
  renameName.value = "";
  renameOriginalName.value = "";
  nextTick(() => {
    renameInputRef.value?.resetValidation();
  });
}

async function submitRename() {
  const target = renameTargetItem.value;
  if (!target) return;

  const input = renameInputRef.value;
  if (input) {
    const ok = await input.validate();
    if (!ok) return;
  }

  const newName = renameName.value.trim();
  if (!newName) return;

  if (newName === target.name) {
    renameDialog.value = false;
    return;
  }

  const newPath = replacePathLastSegment(target.path, newName);
  const idx = rows.value.findIndex((r) => r.id === target.id);
  if (idx === -1) return;

  const prev = rows.value[idx];
  const next: FileBrowserItem = {
    ...prev,
    name: newName,
    path: newPath,
  };
  if (prev.type === "file") {
    const ext = extensionFromFileName(newName);
    if (ext !== undefined) next.extension = ext;
    else delete next.extension;
  }

  rows.value.splice(idx, 1, next);
  selectedRows.value = selectedRows.value.map((s) =>
    s.id === target.id ? next : s,
  );

  notifySuccess("Renamed");
  renameDialog.value = false;
}

const deleteConfirmTitle = computed(() => {
  const pending = deletePendingItems.value;
  if (pending.length === 0) return "";
  if (pending.length === 1) return `Delete "${pending[0].name}" ?`;
  return `Delete ${pending.length} items ?`;
});

const deleteConfirmBody = computed(() => {
  const n = deletePendingItems.value.length;
  if (n === 0) return "";
  if (n === 1) return "This item will be permanently deleted.";
  return "These items will be permanently deleted.";
});

function openDeleteDialog() {
  if (selectedRows.value.length === 0) {
    notifyWarning("Select one or more items to delete.");
    return;
  }
  deletePendingItems.value = [...selectedRows.value];
  deleteDialog.value = true;
}

// Right-click Delete: if the row is part of the current selection, delete all selected; otherwise delete that row only.
function openDeleteDialogFromContext(row: FileBrowserItem) {
  const selected = selectedRows.value;
  const inSelection = selected.some((s) => s.id === row.id);
  deletePendingItems.value =
    inSelection && selected.length > 0 ? [...selected] : [row];
  deleteDialog.value = true;
}

function resetDeleteDialog() {
  deletePendingItems.value = [];
}

function confirmDelete() {
  const pending = deletePendingItems.value;
  if (!pending.length) {
    deleteDialog.value = false;
    return;
  }

  const ids = new Set(pending.map((i) => i.id));
  const count = pending.length;
  const singleName = count === 1 ? pending[0].name : "";

  rows.value = rows.value.filter((r) => !ids.has(r.id));
  selectedRows.value = [];
  deleteDialog.value = false;
  deletePendingItems.value = [];

  if (count === 1) {
    notifySuccess(`Deleted "${singleName}".`);
  } else {
    notifySuccess(`Deleted ${count} items.`);
  }
}

function mockDownloadFileName(
  items: FileBrowserItem[],
  asArchive: boolean,
): string {
  if (asArchive) return "download.zip.mock.txt";
  if (items.length === 1) return `${items[0].name}.mock-download.txt`;
  return "download.mock.txt";
}

function startMockDownload(items: FileBrowserItem[]) {
  if (!items.length) {
    notifyWarning("Select one or more items to download.");
    return;
  }

  const folderCount = items.filter((item) => item.type === "folder").length;
  const asArchive = folderCount > 0;

  const manifest = [
    "Mock Tactical RMM file browser download",
    `Mode: ${asArchive ? "ZIP archive" : "direct file download"}`,
    `Source path: ${currentPath.value}`,
    "",
    "Items:",
    ...items.map((item) => `- [${item.type}] ${item.path}`),
    "",
  ].join("\n");

  const blob = new Blob([manifest], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = mockDownloadFileName(items, asArchive);
  link.click();
  URL.revokeObjectURL(url);

  notifyInfo(
    items.length === 1
      ? `Downloading "${items[0].name}"${asArchive ? " as ZIP" : ""}.`
      : `Downloading ${items.length} items${asArchive ? " as ZIP archive" : ""}.`,
  );
}

function downloadSelectedItems() {
  startMockDownload(selectedRows.value);
}

// Right-click Download mirrors delete behavior: selected row downloads the selection.
function downloadFromContext(row: FileBrowserItem) {
  const selected = selectedRows.value;
  const inSelection = selected.some((s) => s.id === row.id);
  startMockDownload(inSelection && selected.length > 0 ? selected : [row]);
}

function navigateToPath() {
  const nextPath = normalizePathSlashes(pathInput.value);
  if (!nextPath) {
    cancelPathEdit();
    return;
  }
  if (pathsEqual(nextPath, currentPath.value)) {
    pathInput.value = currentPath.value;
    pathEditMode.value = false;
    return;
  }
  setPath(nextPath);
  pathEditMode.value = false;
}

function setPath(path: string) {
  let normalized = normalizePathSlashes(path);
  const driveRoot = /^([A-Za-z]):\\*$/.exec(normalized);
  if (driveRoot) {
    normalized = `${driveRoot[1]}:\\`;
  } else if (normalized.startsWith("\\\\")) {
    normalized = normalized.replace(/\\+$/, "");
  }

  currentPath.value = normalized;
  pathInput.value = normalized;
  selectedRows.value = [];

  history.value = history.value.slice(0, historyIndex.value + 1);
  history.value.push(normalized);
  historyIndex.value = history.value.length - 1;

  // Mock refresh for now. Backend will later load rows for this path.
  refresh();
}

function goBack() {
  if (historyIndex.value <= 0) return;

  pathEditMode.value = false;

  historyIndex.value -= 1;
  currentPath.value = history.value[historyIndex.value];
  pathInput.value = currentPath.value;
  selectedRows.value = [];
}

function refresh() {
  loading.value = true;
  selectedRows.value = [];

  // UI-only: brief loading; path unchanged; `search` stays (still filters reloaded `rows` when backend exists).
  // TODO: await directory reload for `currentPath` (agent/filesystem); then set `rows` from response.
  window.setTimeout(() => {
    loading.value = false;
  }, 350);
}

function onRowDoubleClick(row: FileBrowserItem) {
  if (row.type === "folder") openFolder(row);
}

function openFolder(row: FileBrowserItem) {
  setPath(row.path);
}

function showProperties(row: FileBrowserItem) {
  selectedPropertyItem.value = row;
  propertiesDialog.value = true;
}

// Properties: same as Explorer — one focused item.
function showPropertiesFromToolbar() {
  const sel = selectedRows.value;
  if (sel.length !== 1) {
    notifyWarning("Select exactly one item to view properties.");
    return;
  }
  showProperties(sel[0]);
}

function copyPathsToClipboard(items: FileBrowserItem[]) {
  if (!items.length) {
    notifyWarning("Select one or more items to copy their paths.");
    return;
  }
  const text = items.map((r) => r.path).join("\n");
  copyToClipboard(text)
    .then(() => {
      notifySuccess(
        items.length === 1
          ? "Path copied to clipboard."
          : `${items.length} paths copied to clipboard.`,
      );
    })
    .catch(() => {
      notifyError("Unable to copy to clipboard.");
    });
}

function copySelectedPathsToClipboard() {
  copyPathsToClipboard(selectedRows.value);
}

// Same selection rule as context Download / Delete: row in selection: copy all selected paths.
function copyPathFromContext(row: FileBrowserItem) {
  const selected = selectedRows.value;
  const inSelection = selected.some((s) => s.id === row.id);
  copyPathsToClipboard(
    inSelection && selected.length > 0 ? [...selected] : [row],
  );
}

function isFileDrag(dataTransfer: DataTransfer | null | undefined): boolean {
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

function syncFileDropOverlay() {
  isDragging.value = dragCounter.value > 0 && isFileDragSession.value;
}

function fileListToArray(list: FileList | null | undefined): File[] {
  if (!list?.length) return [];
  const out: File[] = [];
  for (let i = 0; i < list.length; i++) {
    const f = list.item(i);
    if (f) out.push(f);
  }
  return out;
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"] as const;
  const i = Math.min(
    sizes.length - 1,
    Math.floor(Math.log(bytes) / Math.log(k)),
  );
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function uploadStatusLabel(status: UploadQueueStatus): string {
  if (status === "ready") return "Ready";
  return "Mock uploaded";
}

function uploadStatusBadgeColor(status: UploadQueueStatus): string {
  if (status === "ready") return "grey-5";
  return "positive";
}

function assertUploadPath(): boolean {
  if (!hasUploadPath.value) {
    notifyWarning("Select a folder path before uploading.");
    return false;
  }
  return true;
}

function openFilePicker() {
  if (!assertUploadPath()) return;
  fileInputRef.value?.click();
}

function onFileInputChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const list = input.files;
  const files = fileListToArray(list);
  if (!files.length) return;
  queueFilesForUpload(files);
  input.value = "";
}

function queueFilesForUpload(files: File[]) {
  if (!assertUploadPath()) return;
  if (!files.length) return;

  let batch = files;
  const notes: string[] = [];

  if (batch.length > MAX_UPLOAD_FILES_PER_SELECTION) {
    notes.push(
      `Only the first ${MAX_UPLOAD_FILES_PER_SELECTION} of ${batch.length} files were considered (per-selection limit).`,
    );
    batch = batch.slice(0, MAX_UPLOAD_FILES_PER_SELECTION);
  }

  const room = MAX_UPLOAD_QUEUE_ITEMS - uploadQueue.value.length;
  if (room <= 0) {
    notifyWarning(
      `The upload queue is full (max ${MAX_UPLOAD_QUEUE_ITEMS} items). Remove some or clear the queue.`,
    );
    return;
  }

  const skippedOversized = batch.filter(
    (f) => f.size > MAX_UPLOAD_FILE_SIZE_BYTES,
  ).length;
  const sizeOk = batch.filter((f) => f.size <= MAX_UPLOAD_FILE_SIZE_BYTES);
  const toEnqueue = sizeOk.slice(0, room);
  const skippedDueToQueue = sizeOk.length - toEnqueue.length;

  if (skippedOversized > 0) {
    notes.push(
      `${skippedOversized} file(s) skipped — larger than ${formatBytes(MAX_UPLOAD_FILE_SIZE_BYTES)} each.`,
    );
  }
  if (skippedDueToQueue > 0) {
    notes.push(
      `${skippedDueToQueue} file(s) not queued — would exceed the queue limit (${MAX_UPLOAD_QUEUE_ITEMS}).`,
    );
  }

  if (notes.length) {
    notifyWarning(notes.join(" "));
  }

  if (!toEnqueue.length) {
    if (!notes.length) {
      notifyWarning("No files could be added to the upload queue.");
    }
    return;
  }

  const destinationPath = currentPath.value.trim();

  for (const file of toEnqueue) {
    const id = `up-${Date.now()}-${uploadIdSeq++}`;
    const item: UploadQueueItem = {
      id,
      file,
      name: file.name,
      sizeLabel: formatBytes(file.size),
      destinationPath,
      status: "ready",
      progress: 0,
    };
    uploadQueue.value.push(item);
    scheduleMockUpload(item.id);
  }
}

function scheduleMockUpload(itemId: string) {
  const startDelay = 400;
  const rampMs = 700;

  window.setTimeout(() => {
    const item = uploadQueue.value.find((i) => i.id === itemId);
    if (!item || item.status !== "ready") return;

    const start = performance.now();

    function tick(now: number) {
      const t = uploadQueue.value.find((i) => i.id === itemId);
      if (!t) return;
      if (t.status === "mock_uploaded") return;

      const elapsed = now - start;
      t.progress = Math.min(1, elapsed / rampMs);
      if (elapsed < rampMs) {
        requestAnimationFrame(tick);
      } else {
        t.progress = 1;
        t.status = "mock_uploaded";
      }
    }

    requestAnimationFrame(tick);
  }, startDelay);
}

function removeUploadItem(id: string) {
  uploadQueue.value = uploadQueue.value.filter((i) => i.id !== id);
}

function clearUploadQueue() {
  uploadQueue.value = [];
}

function onDragEnter(e: DragEvent) {
  dragCounter.value += 1;
  if (isFileDrag(e.dataTransfer)) {
    isFileDragSession.value = true;
  }
  syncFileDropOverlay();
}

function onDragOver(e: DragEvent) {
  if (isFileDrag(e.dataTransfer)) {
    isFileDragSession.value = true;
  }
  syncFileDropOverlay();
}

function onDragLeave() {
  dragCounter.value -= 1;

  if (dragCounter.value <= 0) {
    dragCounter.value = 0;
    isFileDragSession.value = false;
    isDragging.value = false;
  } else {
    syncFileDropOverlay();
  }
}

function onDrop(event: DragEvent) {
  dragCounter.value = 0;
  isFileDragSession.value = false;
  isDragging.value = false;

  const files = fileListToArray(event.dataTransfer?.files);

  if (!files.length) return;

  queueFilesForUpload(files);
}
</script>

<style scoped>
.hidden-file-input {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}

.file-browser {
  height: calc(100vh - 80px);
  overflow: hidden;
  padding: 16px;
}

.file-table-wrap {
  min-height: 0;
}

.upload-queue-section {
  flex: 0 0 auto;
  max-height: min(240px, 35vh);
  overflow: auto;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.02);
}

.upload-queue-list {
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.15);
}

.upload-queue-item :deep(.q-item__section--side) {
  flex-direction: column;
  align-items: flex-end;
}

.upload-progress {
  max-width: 100%;
}

.folder-path.path-bar {
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: stretch;
  flex: 1;
  max-width: 720px;
  height: 40px;
  min-height: 40px;
  box-sizing: border-box;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 0 6px;
  margin-bottom: 0;
  min-width: 0;
  /* Match body2 so breadcrumb labels and path input don’t shift on mode change */
  font-size: 0.875rem;
  line-height: 1.25rem;
}

.min-width-0 {
  min-width: 0;
}

.crumb-folder-icon {
  flex-shrink: 0;
}

.crumb-path-hitbox {
  cursor: default;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}

.crumb-btn:not(:disabled) {
  cursor: pointer;
}

.crumb-bar {
  gap: 0;
}

.crumb-scroll {
  overflow-x: auto;
  overflow-y: hidden;
  flex: 1 1 auto;
  scrollbar-width: thin;
}

.crumb-separator {
  flex-shrink: 0;
  font-size: 0.75rem;
  line-height: 1.25rem;
  user-select: none;
  padding: 0 1px;
  margin: 0 1px;
  align-self: center;
}

.crumb-btn {
  flex-shrink: 0;
  font-weight: 500;
  min-height: 0;
  min-width: unset;
  border-radius: 6px;
}

.crumb-btn :deep(.q-btn__wrapper) {
  padding: 0 3px;
  min-height: 0;
}

.crumb-btn :deep(.q-btn__content) {
  font-size: inherit;
  line-height: inherit;
}

.crumb-btn--current,
.crumb-btn:disabled {
  opacity: 1;
  color: rgba(255, 255, 255, 0.95);
}

.crumb-btn:not(:disabled):hover {
  background: rgba(255, 255, 255, 0.08);
}

.crumb-fallback-path {
  padding-left: 4px;
}

.path-edit-input {
  display: flex;
  align-items: stretch;
}

.path-edit-input :deep(.q-field) {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
}

.path-edit-input :deep(.q-field__inner) {
  height: 100%;
}

.path-edit-input :deep(.q-field__control) {
  height: 100%;
  min-height: 0 !important;
  align-items: center;
}

.path-edit-input :deep(input) {
  font-size: inherit;
  line-height: inherit;
  padding: 0;
}

.file-toolbar {
  padding: 0 0 14px 0;
  border-bottom: none;
}

.file-toolbar :deep(.q-btn) {
  text-transform: none !important;
}

.file-search {
  width: 280px;
}

.file-search :deep(.q-field__control) {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  box-shadow: none !important;
}

.file-search :deep(.q-field--outlined .q-field__control:before),
.file-search :deep(.q-field--outlined .q-field__control:after) {
  border: none !important;
  box-shadow: none !important;
}

.file-search :deep(.q-field__control:hover),
.file-search :deep(.q-field--focused .q-field__control) {
  border-color: rgba(255, 255, 255, 0.08);
  box-shadow: none !important;
}

.file-table {
  height: 100%;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.file-table :deep(.q-table tbody tr) {
  height: 52px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.file-table :deep(.q-table tbody tr:hover) {
  background: rgba(255, 255, 255, 0.045);
}

.file-table :deep(.q-tr--selected) {
  background: rgba(25, 118, 210, 0.12) !important;
}

.file-table :deep(.q-table th),
.file-table :deep(.q-table td) {
  border-color: rgba(255, 255, 255, 0.06);
}

.file-table :deep(.q-table th) {
  font-weight: 500;
  color: rgba(255, 255, 255, 0.75);
}

.file-table :deep(td:first-child),
.file-table :deep(th:first-child) {
  padding-left: 12px;
}

.file-path-row {
  gap: 0;
}

.nav-btn {
  width: 42px;
  height: 40px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0;
}

.nav-btn:first-child {
  border-radius: 8px 0 0 8px;
}

.nav-btn:nth-child(2) {
  border-radius: 0 8px 8px 0;
  margin-right: 12px;
}

.file-toolbar :deep(.q-btn .q-icon),
.file-toolbar :deep(.q-btn .q-spinner) {
  font-size: 1.515em;
  margin: 0;
}

.file-toolbar :deep(.toolbar-primary-btn),
.file-toolbar :deep(.toolbar-btn) {
  height: 36px;
  border-radius: 4px;
  padding: 0 14px;
}

.file-toolbar :deep(.toolbar-primary-btn .q-btn__content),
.file-toolbar :deep(.toolbar-btn .q-btn__content) {
  justify-content: center;
  gap: 6px;
}

.file-toolbar :deep(.toolbar-btn) {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.86);
}

.file-toolbar :deep(.toolbar-btn:hover) {
  background: rgba(255, 255, 255, 0.06);
}

.file-toolbar :deep(.toolbar-icon-btn::before) {
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
}

.file-toolbar :deep(.toolbar-icon-btn) {
  width: 36px;
  height: 36px;
}

.delete-confirm-card {
  min-width: 360px;
  max-width: min(480px, 92vw);
}

.delete-confirm-title {
  word-break: break-word;
}

.delete-confirm-body {
  line-height: 1.45;
}

.file-context-menu .q-item__section--avatar {
  min-width: 28px;
  padding-right: 8px;
}

.file-context-menu .q-item__section--main {
  padding-left: 0;
}

.file-context-menu .q-icon {
  font-size: 18px;
}

.drop-overlay {
  position: absolute;
  inset: 10px;
  border: 2px dashed var(--q-primary);
  border-radius: 8px;
  background: rgba(25, 118, 210, 0.08);
  z-index: 10;
  pointer-events: none;
}

.ellipsis {
  max-width: 420px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
