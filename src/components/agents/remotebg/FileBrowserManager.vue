<template>
  <div
    class="file-browser column q-pa-sm"
    :class="{ 'file-browser--dark': $q.dark.isActive }"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent="onDragOver"
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
  >
    <FileBrowserPathBar
      :current-path="currentPath"
      :can-go-back="canGoBack"
      :can-go-forward="canGoForward"
      :agent-platform="agentPlatform"
      @back="goBack"
      @forward="goForward"
      @navigate="setPath"
    />

    <input
      ref="fileInputRef"
      type="file"
      class="hidden-file-input"
      multiple
      @change="onFileInputChange"
    />

    <FileBrowserToolbar
      :has-upload-path="hasUploadPath"
      :selected-count="selectedRows.length"
      :search="search"
      @upload="openFilePicker"
      @new-folder="openNewFolderDialog"
      @download="downloadSelectedItems"
      @delete="openDeleteDialog"
      @rename="openRenameDialog()"
      @properties="showPropertiesFromToolbar"
      @copy-path="copySelectedPathsToClipboard"
      @refresh="refresh"
      @update:search="search = $event"
    />

    <FileBrowserUploadQueue
      v-if="uploadQueueItems.length"
      :items="uploadQueueItems"
      :destination-label="uploadDestinationLabel"
      @clear="clearUploadQueue"
      @remove="removeUploadItem"
    />

    <FileBrowserTable
      v-model:selected="selectedRows"
      :rows="filteredRows"
      :loading="loading"
      :no-data-label="tableNoDataLabel"
      :empty-is-error="!!listError"
      :show-drop-overlay="isDragging && hasUploadPath"
      :current-path="currentPath"
      @row-dblclick="onRowDoubleClick"
      @open-folder="openFolder"
      @download="downloadFromContext"
      @rename="openRenameDialog"
      @delete="openDeleteDialogFromContext"
      @properties="showProperties"
      @copy-path="copyPathFromContext"
    />

    <FileBrowserPropertiesDialog
      v-model="propertiesDialog"
      :item="selectedPropertyItem"
      :loading="propertiesLoading"
      :error="propertiesError"
    />

    <FileBrowserNewFolderModal
      v-model="newFolderDialog"
      :existing-names="rowNames"
      @save="confirmNewFolder"
    />

    <FileBrowserRenameModal
      v-model="renameDialog"
      :item="renameTargetItem"
      :existing-names="rowNames"
      @save="confirmRename"
      @hide="renameTargetItem = null"
    />

    <ConfirmDialog
      v-model="deleteDialog"
      :title="deleteConfirmTitle"
      :message="deleteConfirmBody"
      type="confirm"
      icon="warning"
      icon-color="orange"
      @confirm="confirmDelete"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, toRef, watch } from "vue";
import { copyToClipboard, useQuasar } from "quasar";

import { fetchAgentFileProperties, fetchAgentFilesAll } from "@/api/agents";
import FileBrowserNewFolderModal from "@/components/agents/remotebg/FileBrowserNewFolderModal.vue";
import FileBrowserPathBar from "@/components/agents/remotebg/FileBrowserPathBar.vue";
import FileBrowserPropertiesDialog from "@/components/agents/remotebg/FileBrowserPropertiesDialog.vue";
import FileBrowserRenameModal from "@/components/agents/remotebg/FileBrowserRenameModal.vue";
import FileBrowserTable from "@/components/agents/remotebg/FileBrowserTable.vue";
import FileBrowserToolbar from "@/components/agents/remotebg/FileBrowserToolbar.vue";
import FileBrowserUploadQueue from "@/components/agents/remotebg/FileBrowserUploadQueue.vue";
import ConfirmDialog from "@/components/ui/ConfirmDialog.vue";
import { useFileBrowser } from "@/composables/filebrowser";
import {
  MAX_UPLOAD_FILE_SIZE_BYTES,
  MAX_UPLOAD_FILES_PER_SELECTION,
  MAX_UPLOAD_QUEUE_ITEMS,
} from "@/constants/filebrowser";
import type { FileBrowserItem, UploadQueueItem } from "@/types/filebrowser";
import { bytes2Human } from "@/utils/format";
import {
  defaultFileBrowserRootPath,
  extensionFromFileName,
  fileListToArray,
  formatMockListTimestamp,
  getListFilesErrorMessage,
  isFileDrag,
  isListFilesAgentOfflineError,
  isListFilesPermissionError,
  mapApiItemToFileBrowserItem,
  mapApiItemsToFileBrowserItems,
  mockDownloadFileName,
} from "@/utils/filebrowser";
import {
  notifyError,
  notifyInfo,
  notifySuccess,
  notifyWarning,
} from "@/utils/notify";

const props = withDefaults(
  defineProps<{
    agent_id: string;
    agentPlatform?: string;
  }>(),
  {
    agentPlatform: "windows",
  },
);

const agentPlatform = toRef(props, "agentPlatform");

const $q = useQuasar();
const {
  joinRemotePathSegment,
  normalizeNavPath,
  replacePathLastSegment,
  pathsEqual,
} = useFileBrowser(agentPlatform);

const loading = ref(false);
const listError = ref<string | null>(null);
const currentPath = ref("");
const search = ref("");
const selectedRows = ref<FileBrowserItem[]>([]);
const isDragging = ref(false);
const dragCounter = ref(0);
const isFileDragSession = ref(false);

const history = ref<string[]>([]);
const historyIndex = ref(0);

const canGoBack = computed(() => historyIndex.value > 0);
const canGoForward = computed(
  () => historyIndex.value < history.value.length - 1,
);

const propertiesDialog = ref(false);
const selectedPropertyItem = ref<FileBrowserItem | null>(null);
const propertiesLoading = ref(false);
const propertiesError = ref<string | null>(null);

const newFolderDialog = ref(false);
const renameDialog = ref(false);
const renameTargetItem = ref<FileBrowserItem | null>(null);

const deleteDialog = ref(false);
const deletePendingItems = ref<FileBrowserItem[]>([]);

const fileInputRef = ref<HTMLInputElement | null>(null);

const uploadQueue = ref<UploadQueueItem[]>([]);
let uploadIdSeq = 0;
let newFolderRowIdSeq = 100;
let loadSeq = 0;

const uploadQueueItems = computed<UploadQueueItem[]>(() => uploadQueue.value);
const hasUploadPath = computed(() => currentPath.value.trim().length > 0);

const rows = ref<FileBrowserItem[]>([]);

const rowNames = computed(() => rows.value.map((r) => r.name));

const uploadDestinationLabel = computed(() => {
  if (!uploadQueue.value.length) return "";
  const first = uploadQueue.value[0].destinationPath;
  const allSame = uploadQueue.value.every((i) => i.destinationPath === first);
  return allSame ? first : `${first} (+ other paths in queue)`;
});

const filteredRows = computed(() => {
  const q = (search.value ?? "").trim().toLowerCase();
  if (!q) return rows.value;
  return rows.value.filter((row) => row.name.toLowerCase().includes(q));
});

const tableNoDataLabel = computed(() => {
  if (listError.value) return listError.value;
  const q = (search.value ?? "").trim();
  if (q && rows.value.length > 0) return "No items match your filter";
  return "Folder is empty";
});

function resetNavigationHistory(path: string) {
  history.value = [path];
  historyIndex.value = 0;
}

function initializeRootPath() {
  const root = defaultFileBrowserRootPath(props.agentPlatform);
  currentPath.value = root;
  resetNavigationHistory(root);
}

async function refresh() {
  const path = normalizeNavPath(currentPath.value.trim());
  if (!path) {
    listError.value = "Path is required";
    rows.value = [];
    return;
  }

  currentPath.value = path;

  const seq = ++loadSeq;
  loading.value = true;
  listError.value = null;
  selectedRows.value = [];

  try {
    const data = await fetchAgentFilesAll(
      props.agent_id,
      path,
      undefined,
      agentPlatform.value,
    );
    if (seq !== loadSeq) return;

    currentPath.value = data.path || path;
    rows.value = mapApiItemsToFileBrowserItems(data.items ?? []);
    listError.value = null;
  } catch (err: unknown) {
    if (seq !== loadSeq) return;

    rows.value = [];
    const message = getListFilesErrorMessage(err);
    listError.value = message;

    if (isListFilesPermissionError(err)) {
      notifyError(message);
    } else if (isListFilesAgentOfflineError(message)) {
      notifyWarning(message);
    }
  } finally {
    if (seq === loadSeq) {
      loading.value = false;
    }
  }
}

onMounted(() => {
  initializeRootPath();
  void refresh();
});

watch(
  () => [props.agent_id, props.agentPlatform] as const,
  () => {
    initializeRootPath();
    void refresh();
  },
);

watch(
  filteredRows,
  (visible) => {
    const ids = new Set(visible.map((r) => r.id));
    selectedRows.value = selectedRows.value.filter((s) => ids.has(s.id));
  },
  { flush: "post" },
);

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

function openNewFolderDialog() {
  if (!hasUploadPath.value) {
    notifyWarning("Select a folder path before creating a folder.");
    return;
  }
  newFolderDialog.value = true;
}

function confirmNewFolder(name: string) {
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
  renameDialog.value = true;
}

function confirmRename(newName: string) {
  const target = renameTargetItem.value;
  if (!target) return;

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
  renameTargetItem.value = null;
}

function openDeleteDialog() {
  if (selectedRows.value.length === 0) {
    notifyWarning("Select one or more items to delete.");
    return;
  }
  deletePendingItems.value = [...selectedRows.value];
  deleteDialog.value = true;
}

function openDeleteDialogFromContext(row: FileBrowserItem) {
  const selected = selectedRows.value;
  const inSelection = selected.some((s) => s.id === row.id);
  deletePendingItems.value =
    inSelection && selected.length > 0 ? [...selected] : [row];
  deleteDialog.value = true;
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
  deletePendingItems.value = [];

  if (count === 1) {
    notifySuccess(`Deleted "${singleName}".`);
  } else {
    notifySuccess(`Deleted ${count} items.`);
  }
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

function downloadFromContext(row: FileBrowserItem) {
  const selected = selectedRows.value;
  const inSelection = selected.some((s) => s.id === row.id);
  startMockDownload(inSelection && selected.length > 0 ? selected : [row]);
}

function setPath(path: string) {
  const normalized = normalizeNavPath(path);
  if (!normalized) {
    notifyWarning("Enter a valid path.");
    return;
  }

  if (pathsEqual(normalized, currentPath.value)) {
    void refresh();
    return;
  }

  currentPath.value = normalized;
  selectedRows.value = [];

  history.value = history.value.slice(0, historyIndex.value + 1);
  history.value.push(normalized);
  historyIndex.value = history.value.length - 1;

  void refresh();
}

function goBack() {
  if (!canGoBack.value) return;

  historyIndex.value -= 1;
  currentPath.value = history.value[historyIndex.value];
  selectedRows.value = [];
  void refresh();
}

function goForward() {
  if (!canGoForward.value) return;

  historyIndex.value += 1;
  currentPath.value = history.value[historyIndex.value];
  selectedRows.value = [];
  void refresh();
}

function onRowDoubleClick(row: FileBrowserItem) {
  if (row.type === "folder") openFolder(row);
}

function openFolder(row: FileBrowserItem) {
  if (row.type !== "folder") return;
  setPath(row.path);
}

async function showProperties(row: FileBrowserItem) {
  selectedPropertyItem.value = row;
  propertiesDialog.value = true;
  propertiesLoading.value = true;
  propertiesError.value = null;

  try {
    const data = await fetchAgentFileProperties(
      props.agent_id,
      row.path,
      agentPlatform.value,
    );
    selectedPropertyItem.value = mapApiItemToFileBrowserItem(data);
  } catch (err: unknown) {
    propertiesError.value = getListFilesErrorMessage(err);
  } finally {
    propertiesLoading.value = false;
  }
}

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

function copyPathFromContext(row: FileBrowserItem) {
  const selected = selectedRows.value;
  const inSelection = selected.some((s) => s.id === row.id);
  copyPathsToClipboard(
    inSelection && selected.length > 0 ? [...selected] : [row],
  );
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
  const files = fileListToArray(input.files);
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
      `${skippedOversized} file(s) skipped — larger than ${bytes2Human(
        MAX_UPLOAD_FILE_SIZE_BYTES,
      )} each.`,
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
      sizeLabel: bytes2Human(file.size),
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

function syncFileDropOverlay() {
  isDragging.value = dragCounter.value > 0 && isFileDragSession.value;
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
}
</style>
