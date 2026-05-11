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

      <div class="text-body2 row items-center px-2 folder-path">
        <q-input
          v-model="pathInput"
          dense
          class="col"
          borderless
          @keyup.enter="navigateToPath"
        >
          <template #prepend>
            <q-icon
              name="far fa-folder-open"
              class="q-mr-sm text-blue-5"
              size="18px"
            />
          </template>
        </q-input>
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
        />
        <q-btn
          dense
          unelevated
          icon="download"
          label="Download"
          class="toolbar-btn"
          :disable="selectedRows.length === 0"
        />
        <q-btn
          dense
          unelevated
          icon="delete"
          label="Delete"
          class="toolbar-btn"
          :disable="selectedRows.length === 0"
        />
        <q-btn
          dense
          unelevated
          icon="edit"
          label="Rename"
          class="toolbar-btn"
          :disable="selectedRows.length !== 1"
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
              <q-item clickable v-close-popup>
                <q-item-section avatar>
                  <q-icon name="info" size="18px" />
                </q-item-section>
                <q-item-section>Properties</q-item-section>
              </q-item>

              <q-item clickable v-close-popup>
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
          debounce="250"
          placeholder="Search files"
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
        no-data-label="Folder is empty"
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
                  v-if="props.row.type === 'file'"
                  clickable
                  v-close-popup
                >
                  <q-item-section avatar>
                    <q-icon name="download" size="18px" />
                  </q-item-section>
                  <q-item-section>Download</q-item-section>
                </q-item>

                <q-item clickable v-close-popup>
                  <q-item-section avatar>
                    <q-icon name="edit" size="18px" />
                  </q-item-section>
                  <q-item-section>Rename</q-item-section>
                </q-item>

                <q-item clickable v-close-popup>
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
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { QTableColumn } from "quasar";
import { notifyWarning } from "@/utils/notify";

// Client-side upload caps (align with backend when streaming is wired). */
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
const search = ref("");
const selectedRows = ref<FileBrowserItem[]>([]);
// True while a file-type drag is over the browser (overlay + drop affordance). */
const isDragging = ref(false);
const dragCounter = ref(0);
// Set when DataTransfer looks like OS files; paired with dragCounter for overlay. */
const isFileDragSession = ref(false);

const history = ref<string[]>([currentPath.value]);
const historyIndex = ref(0);

const propertiesDialog = ref(false);
const selectedPropertyItem = ref<FileBrowserItem | null>(null);

const fileInputRef = ref<HTMLInputElement | null>(null);

type UploadQueueStatus = "ready" | "mock_uploaded";

type UploadQueueItem = {
  id: string;
  file: File;
  name: string;
  sizeLabel: string;
  destinationPath: string;
  status: UploadQueueStatus;
  /** 0–1; reserved for streaming progress — mock uses a quick ramp then full */
  progress: number;
};

const uploadQueue = ref<UploadQueueItem[]>([]);
let uploadIdSeq = 0;

/** Exposed for template `v-for` typing (avoids `unknown` item in some vue-tsc setups). */
const uploadQueueItems = computed<UploadQueueItem[]>(() => uploadQueue.value);

const hasUploadPath = computed(() => currentPath.value.trim().length > 0);

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
  if (!search.value.trim()) return rows.value;

  const query = search.value.toLowerCase();

  return rows.value.filter((row) => row.name.toLowerCase().includes(query));
});

function navigateToPath() {
  const nextPath = pathInput.value.trim();
  if (!nextPath || nextPath === currentPath.value) return;

  setPath(nextPath);
}

function setPath(path: string) {
  currentPath.value = path;
  pathInput.value = path;
  selectedRows.value = [];

  history.value = history.value.slice(0, historyIndex.value + 1);
  history.value.push(path);
  historyIndex.value = history.value.length - 1;

  // Mock refresh for now. Backend will later load rows for this path.
  refresh();
}

function goBack() {
  if (historyIndex.value <= 0) return;

  historyIndex.value -= 1;
  currentPath.value = history.value[historyIndex.value];
  pathInput.value = currentPath.value;
  selectedRows.value = [];
}

function refresh() {
  loading.value = true;

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

.folder-path {
  flex: 1;
  max-width: 720px;
  height: 40px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 0 6px;
  margin-bottom: 0;
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
