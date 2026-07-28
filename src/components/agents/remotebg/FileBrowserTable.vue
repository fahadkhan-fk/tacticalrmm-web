<template>
  <div
    class="col relative-position file-table-wrap"
    :class="{
      'file-table-wrap--dark': $q.dark.isActive,
    }"
    role="region"
    :aria-label="dropRegionLabel"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent="onDragOver"
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
  >
    <q-table
      flat
      dense
      virtual-scroll
      row-key="id"
      class="file-browser-table file-browser-table--fill"
      :table-class="{
        'table-bgcolor': !$q.dark.isActive,
        'table-bgcolor-dark': $q.dark.isActive,
      }"
      :rows="rows"
      :columns="columns"
      :loading="loading"
      v-model:pagination="tablePagination"
      :sort-method="sortFileBrowserRows"
      binary-state-sort
      :rows-per-page-options="[0]"
      selection="multiple"
      v-model:selected="selected"
      :no-data-label="noDataLabel"
    >
      <template #no-data>
        <span class="hidden-no-data-slot" aria-hidden="true" />
      </template>

      <template #header-selection="scope">
        <q-checkbox v-model="scope.selected" dense size="xs" />
      </template>

      <template #body="props">
        <q-tr
          :props="props"
          class="cursor-pointer file-table-row"
          @dblclick="emit('row-dblclick', props.row)"
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
                @click="emit('open-folder', props.row)"
              >
                <q-item-section avatar>
                  <q-icon name="folder_open" size="18px" />
                </q-item-section>
                <q-item-section>Open</q-item-section>
              </q-item>

              <q-item
                clickable
                v-close-popup
                @click="emit('download', props.row)"
              >
                <q-item-section avatar>
                  <q-icon name="download" size="18px" />
                </q-item-section>
                <q-item-section>Download</q-item-section>
              </q-item>

              <q-item
                clickable
                v-close-popup
                @click="emit('rename', props.row)"
              >
                <q-item-section avatar>
                  <q-icon name="edit" size="18px" />
                </q-item-section>
                <q-item-section>Rename</q-item-section>
              </q-item>

              <q-item
                clickable
                v-close-popup
                @click="emit('delete', props.row)"
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
                @click="emit('properties', props.row)"
              >
                <q-item-section avatar>
                  <q-icon name="info" size="18px" />
                </q-item-section>
                <q-item-section>Properties</q-item-section>
              </q-item>

              <q-item
                clickable
                v-close-popup
                @click="emit('copy-path', props.row)"
              >
                <q-item-section avatar>
                  <q-icon name="content_copy" size="18px" />
                </q-item-section>
                <q-item-section>Copy Path</q-item-section>
              </q-item>
            </q-list>
          </q-menu>

          <q-td auto-width>
            <q-checkbox v-model="props.selected" dense size="xs" />
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

    <div
      v-if="showEmptyState"
      class="file-browser-empty-state"
      :class="{ 'file-browser-empty-state--error': emptyIsError }"
      aria-live="polite"
    >
      <span class="file-browser-empty-state__label">{{ noDataLabel }}</span>
    </div>

    <div
      v-if="showDropOverlay"
      class="drop-target"
      :class="{ 'drop-target--reject': dropRejected }"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div class="drop-target__scrim" aria-hidden="true" />
      <div class="drop-target__card">
        <q-icon
          class="drop-target__icon"
          :name="dropRejected ? 'block' : 'upload'"
          size="26px"
          aria-hidden="true"
        />
        <div class="drop-target__title">{{ dropTitle }}</div>
        <template v-if="!dropRejected">
          <div class="drop-target__dest">
            Uploading to
            <span class="drop-target__leaf">{{ destinationLeaf }}</span>
          </div>
          <div
            v-if="currentPath"
            class="drop-target__path"
            :title="currentPath"
          >
            {{ pathDisplay }}
            <q-tooltip
              v-if="pathIsTruncated"
              anchor="top middle"
              self="bottom middle"
            >
              {{ currentPath }}
            </q-tooltip>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useModel } from "vue";
import { useQuasar } from "quasar";

import { fileBrowserTableColumns } from "@/utils/filebrowserColumns";
import {
  collectDroppedUploadFiles,
  formatDropOverlayTitle,
  fileBrowserPathLeaf,
  inspectFileDrag,
  isFileDrag,
  resolveDropOverlayReject,
  sortFileBrowserRows,
  truncatePathMiddle,
  type DropOverlayRejectReason,
} from "@/utils/filebrowser";
import type { FileBrowserItem } from "@/types/filebrowser";

const $q = useQuasar();

const props = withDefaults(
  defineProps<{
    rows: FileBrowserItem[];
    loading: boolean;
    noDataLabel: string;
    emptyIsError?: boolean;
    dropEnabled?: boolean;
    currentPath: string;
    selected?: FileBrowserItem[];
    queueRoom?: number;
    maxFilesPerSelection?: number;
    maxFileSizeBytes?: number;
  }>(),
  {
    dropEnabled: false,
    emptyIsError: false,
    queueRoom: Number.POSITIVE_INFINITY,
    maxFilesPerSelection: 100,
    maxFileSizeBytes: 0,
  },
);

const showEmptyState = computed(
  () => !props.loading && props.rows.length === 0,
);

const emit = defineEmits<{
  (e: "row-dblclick", row: FileBrowserItem): void;
  (e: "open-folder", row: FileBrowserItem): void;
  (e: "download", row: FileBrowserItem): void;
  (e: "rename", row: FileBrowserItem): void;
  (e: "delete", row: FileBrowserItem): void;
  (e: "properties", row: FileBrowserItem): void;
  (e: "copy-path", row: FileBrowserItem): void;
  (e: "update:selected", value: FileBrowserItem[]): void;
  (e: "files-dropped", payload: { files: File[]; folderCount: number }): void;
  (e: "drop-rejected", reason: DropOverlayRejectReason): void;
}>();

const selected = useModel(props, "selected");

const columns = fileBrowserTableColumns;

const tablePagination = ref({
  page: 1,
  rowsPerPage: 0,
  sortBy: "name",
  descending: false,
});

const dragCounter = ref(0);
const isFileDragSession = ref(false);
const rejectReason = ref<DropOverlayRejectReason | null>(null);
const dragFileCount = ref<number | null>(null);

const PATH_DISPLAY_MAX = 52;

const showDropOverlay = computed(
  () => !!props.dropEnabled && dragCounter.value > 0 && isFileDragSession.value,
);

const dropRejected = computed(() => rejectReason.value != null);

const destinationLeaf = computed(() =>
  fileBrowserPathLeaf(props.currentPath || ""),
);

const pathDisplay = computed(() =>
  truncatePathMiddle(props.currentPath || "", PATH_DISPLAY_MAX),
);

const pathIsTruncated = computed(
  () => (props.currentPath || "").trim().length > PATH_DISPLAY_MAX,
);

const dropTitle = computed(() =>
  formatDropOverlayTitle(rejectReason.value, dragFileCount.value),
);

const dropRegionLabel = computed(() => {
  if (!props.dropEnabled) {
    return "File list";
  }
  return "File list. Drop files here to upload, or use the Upload button.";
});

function resetDragState() {
  dragCounter.value = 0;
  isFileDragSession.value = false;
  rejectReason.value = null;
  dragFileCount.value = null;
}

function syncDropState(dataTransfer?: DataTransfer | null) {
  if (!props.dropEnabled) {
    isFileDragSession.value = false;
    rejectReason.value = null;
    dragFileCount.value = null;
    return;
  }

  if (!isFileDrag(dataTransfer)) {
    return;
  }

  isFileDragSession.value = true;

  const inspection = inspectFileDrag(dataTransfer, props.maxFileSizeBytes);

  dragFileCount.value = inspection.countKnown ? inspection.fileCount : null;

  rejectReason.value = resolveDropOverlayReject({
    inspection,
    queueRoom: props.queueRoom,
    maxFilesPerSelection: props.maxFilesPerSelection,
    maxFileSizeBytes: props.maxFileSizeBytes,
  });
}

function applyDropEffect(dataTransfer: DataTransfer | null | undefined) {
  if (!dataTransfer || !props.dropEnabled || !isFileDrag(dataTransfer)) return;
  dataTransfer.dropEffect = rejectReason.value ? "none" : "copy";
}

function onDragEnter(e: DragEvent) {
  dragCounter.value += 1;
  syncDropState(e.dataTransfer);
  applyDropEffect(e.dataTransfer);
}

function onDragOver(e: DragEvent) {
  syncDropState(e.dataTransfer);
  applyDropEffect(e.dataTransfer);
}

function onDragLeave() {
  dragCounter.value -= 1;
  if (dragCounter.value <= 0) {
    resetDragState();
  }
}

function onDrop(e: DragEvent) {
  const reasonAtDrop = rejectReason.value;
  const wasFileDrag = isFileDragSession.value;
  resetDragState();

  if (!props.dropEnabled || !wasFileDrag) return;

  const { files, folderCount } = collectDroppedUploadFiles(e.dataTransfer);
  const inspection = inspectFileDrag(e.dataTransfer, props.maxFileSizeBytes);
  if (files.length > 0 || folderCount > 0) {
    inspection.fileCount = files.length;
    inspection.folderCount = folderCount;
    inspection.countKnown = true;
    if (props.maxFileSizeBytes > 0 && files.length > 0) {
      inspection.oversizedFileCount = files.filter(
        (f) => f.size > props.maxFileSizeBytes,
      ).length;
      inspection.sizeKnown = true;
    }
  }

  const reason =
    resolveDropOverlayReject({
      inspection,
      queueRoom: props.queueRoom,
      maxFilesPerSelection: props.maxFilesPerSelection,
      maxFileSizeBytes: props.maxFileSizeBytes,
    }) ?? reasonAtDrop;

  if (reason) {
    emit("drop-rejected", reason);
    return;
  }

  if (!files.length) {
    emit("drop-rejected", folderCount > 0 ? "folders" : "unsupported");
    return;
  }

  emit("files-dropped", { files, folderCount });
}

onMounted(() => {
  window.addEventListener("dragend", resetDragState);
  window.addEventListener("blur", resetDragState);
});

onBeforeUnmount(() => {
  window.removeEventListener("dragend", resetDragState);
  window.removeEventListener("blur", resetDragState);
  resetDragState();
});
</script>

<style scoped>
.file-table-wrap {
  display: flex;
  flex-direction: column;
  flex: 1 1 0% !important;
  min-height: 0 !important;
  height: 0 !important;
  max-height: none !important;
  overflow: hidden;
  align-self: stretch;
  width: 100%;
}

.file-table-wrap :deep(.file-browser-table--fill) {
  flex: 1 1 auto;
  min-height: 0;
  height: 100% !important;
  max-height: none !important;
  display: flex;
  flex-direction: column;
}

.file-table-wrap :deep(.file-browser-table--fill .q-table__top),
.file-table-wrap :deep(.file-browser-table--fill .q-table__bottom) {
  flex: 0 0 auto;
}

.file-table-wrap :deep(.file-browser-table--fill .q-table__middle) {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}

.file-table-wrap :deep(.file-browser-table--fill thead tr th) {
  position: sticky;
  top: 0;
  z-index: 1;
}

.file-table-wrap :deep(.hidden-no-data-slot) {
  display: none;
}

.file-browser-empty-state {
  position: absolute;
  left: 0;
  right: 0;
  top: 34px;
  bottom: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  pointer-events: none;
  z-index: 1;
  text-align: center;
}

.file-browser-empty-state__label {
  font-size: 0.95rem;
  line-height: 1.4;
  color: rgba(0, 0, 0, 0.55);
}

.file-table-wrap--dark .file-browser-empty-state__label {
  color: rgba(255, 255, 255, 0.55);
}

.file-browser-empty-state--error .file-browser-empty-state__label {
  color: var(--q-negative);
}

.file-table-wrap :deep(.file-table-row:hover > td) {
  background: rgba(0, 0, 0, 0.045) !important;
}

.file-table-wrap--dark :deep(.file-table-row:hover > td) {
  background: rgba(255, 255, 255, 0.07) !important;
}

.file-table-wrap :deep(.file-browser-table tbody td) {
  height: auto;
  min-height: 32px;
  padding-top: 5px;
  padding-bottom: 5px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.14) !important;
}

.file-table-wrap--dark :deep(.file-browser-table tbody td) {
  border-bottom: 1px solid rgba(255, 255, 255, 0.14) !important;
  color: rgba(255, 255, 255, 0.87);
}

.file-table-wrap :deep(.file-browser-table thead tr th) {
  height: auto;
  min-height: 34px;
  padding-top: 6px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.16) !important;
}

.file-table-wrap--dark :deep(.file-browser-table thead tr th) {
  border-bottom: 1px solid rgba(255, 255, 255, 0.16) !important;
  color: rgba(255, 255, 255, 0.7);
}

.file-table-wrap :deep(th.sortable .q-table__sort-icon) {
  opacity: 0;
  transition: opacity 0.15s ease;
}
.file-table-wrap :deep(th.sortable:hover .q-table__sort-icon) {
  opacity: 0.45;
}
.file-table-wrap :deep(th.sorted .q-table__sort-icon),
.file-table-wrap :deep(th.sorted:hover .q-table__sort-icon) {
  opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
  .file-table-wrap :deep(th.sortable .q-table__sort-icon) {
    transition: none;
  }
}

.file-table-wrap--dark :deep(.file-browser-table .q-table__bottom) {
  color: rgba(255, 255, 255, 0.7);
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

.drop-target {
  --drop-bg: #f4f8fc;
  --drop-border: #5aa3e8;
  --drop-icon: #3d8fd4;
  --drop-title: #20252b;
  --drop-secondary: #5c6670;
  --drop-leaf: #2a3138;
  --drop-path: #4a5560;
  --drop-shadow: 0 6px 20px rgba(32, 37, 43, 0.12);
  --drop-scrim: rgba(255, 255, 255, 0.28);

  position: absolute;
  left: 0;
  right: 0;
  top: 34px;
  bottom: 32px;
  z-index: 10;
  pointer-events: none;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.file-table-wrap--dark .drop-target {
  --drop-bg: #1d2b38;
  --drop-border: #2f80c9;
  --drop-icon: #4ea1e0;
  --drop-title: #f5f7fa;
  --drop-secondary: #b0bac4;
  --drop-leaf: #e8eef4;
  --drop-path: #9aa6b2;
  --drop-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  --drop-scrim: rgba(0, 0, 0, 0.22);
}

.drop-target--reject {
  --drop-border: #d64545;
  --drop-icon: #d64545;
  --drop-title: #8f1f1f;
  --drop-bg: #fbf4f4;
  --drop-shadow: 0 6px 20px rgba(143, 31, 31, 0.12);
}

.file-table-wrap--dark .drop-target--reject {
  --drop-border: #e57373;
  --drop-icon: #ef9a9a;
  --drop-title: #ffebee;
  --drop-bg: #2a2226;
  --drop-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
}

.drop-target__scrim {
  position: absolute;
  inset: 0;
  background: var(--drop-scrim);
}

.drop-target__card {
  position: relative;
  z-index: 1;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: min(280px, 100%);
  padding: 24px 28px;
  border-radius: 10px;
  border: 1px solid var(--drop-border);
  background: var(--drop-bg);
  box-shadow: var(--drop-shadow);
  text-align: center;
  animation: drop-target-fade-in 140ms ease-out;
}

.drop-target__icon {
  margin-bottom: 2px;
  color: var(--drop-icon);
}

.drop-target__title {
  font-size: 0.95rem;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: 0.01em;
  color: var(--drop-title);
}

.drop-target__dest {
  font-size: 0.8125rem;
  line-height: 1.35;
  color: var(--drop-secondary);
}

.drop-target__leaf {
  font-weight: 600;
  color: var(--drop-leaf);
}

.drop-target__path {
  position: relative;
  max-width: 100%;
  margin-top: 2px;
  font-size: 0.6875rem;
  line-height: 1.35;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  color: var(--drop-path);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@keyframes drop-target-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .drop-target__card {
    animation: none;
  }
}

.ellipsis {
  max-width: 420px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
