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
      :limits-caption="uploadLimitsCaption"
      @clear="clearUploadQueue"
      @remove="removeUploadItem"
      @cancel="cancelUploadItem"
    />

    <FileBrowserDownloadProgress
      v-if="downloadState.active"
      :file-name="downloadState.fileName"
      :progress="downloadState.progress"
      :status="downloadState.status"
      :error-message="downloadState.errorMessage"
      @cancel="cancelDownload"
    />

    <FileBrowserTable
      v-model:selected="selectedRows"
      :rows="filteredRows"
      :loading="loading || mutationSaving"
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
      :saving="mutationSaving"
      @save="confirmNewFolder"
    />

    <FileBrowserRenameModal
      v-model="renameDialog"
      :item="renameTargetItem"
      :existing-names="rowNames"
      :saving="mutationSaving"
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

import {
  createAgentFileFolder,
  deleteAgentFiles,
  fetchAgentFileProperties,
  fetchAgentFilesAll,
  renameAgentFile,
} from "@/api/agents";
import FileBrowserDownloadProgress from "@/components/agents/remotebg/FileBrowserDownloadProgress.vue";
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
  MAX_DELETE_PATHS_PER_REQUEST,
  MAX_UPLOAD_FILE_SIZE_BYTES,
  MAX_UPLOAD_FILES_PER_SELECTION,
  MAX_UPLOAD_QUEUE_ITEMS,
} from "@/constants/filebrowser";
import { FILE_TRANSFER_DEFAULT_CHUNK_SIZE } from "@/constants/fileTransfer";
import type {
  FileBrowserDeleteResult,
  FileBrowserItem,
  UploadQueueItem,
} from "@/types/filebrowser";
import {
  isAbortError as isDownloadAbortError,
  runFileDownloadTransfer,
} from "@/services/fileTransfer/download";
import {
  isAbortError as isUploadAbortError,
  runFileUploadTransfer,
} from "@/services/fileTransfer/upload";
import type { DownloadTransferState } from "@/types/fileTransfer";
import { bytes2Human } from "@/utils/format";
import {
  defaultFileBrowserRootPath,
  fileListToArray,
  getFileBrowserErrorMessage,
  getListFilesErrorMessage,
  isFileDrag,
  isListFilesAgentOfflineError,
  isListFilesPermissionError,
  listUploadNameConflicts,
  mapApiItemToFileBrowserItem,
  mapApiItemsToFileBrowserItems,
  normalizeAgentListPath,
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
const { normalizeNavPath, pathsEqual } = useFileBrowser(agentPlatform);

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
const uploadAbortControllers = new Map<string, AbortController>();
let uploadProcessorRunning = false;
let uploadIdSeq = 0;

const downloadState = ref<DownloadTransferState>({
  active: false,
  fileName: "",
  sourcePath: "",
  progress: 0,
  status: "idle",
});
let downloadAbortController: AbortController | null = null;
let loadSeq = 0;

const mutationSaving = ref(false);

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

const uploadLimitsCaption = computed(() => {
  const maxSizeLabel =
    MAX_UPLOAD_FILE_SIZE_BYTES > 0
      ? bytes2Human(MAX_UPLOAD_FILE_SIZE_BYTES)
      : "unlimited";
  return `Max ${maxSizeLabel} per file · up to ${MAX_UPLOAD_FILES_PER_SELECTION} files per selection · queue capacity ${MAX_UPLOAD_QUEUE_ITEMS}`;
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
    rows.value = mapApiItemsToFileBrowserItems(
      data.items ?? [],
      agentPlatform.value,
    );
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

async function confirmNewFolder(name: string) {
  if (mutationSaving.value) return;

  const parentPath = normalizeNavPath(currentPath.value.trim());
  if (!parentPath) {
    notifyWarning("Select a folder path before creating a folder.");
    return;
  }

  mutationSaving.value = true;
  try {
    await createAgentFileFolder(
      props.agent_id,
      parentPath,
      name,
      agentPlatform.value,
    );
    newFolderDialog.value = false;
    notifySuccess("Folder created");
    await refresh();
  } catch (err: unknown) {
    notifyError(getFileBrowserErrorMessage(err, "Unable to create folder."));
  } finally {
    mutationSaving.value = false;
  }
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

async function confirmRename(newName: string) {
  if (mutationSaving.value) return;

  const target = renameTargetItem.value;
  if (!target) return;

  mutationSaving.value = true;
  try {
    await renameAgentFile(
      props.agent_id,
      normalizeNavPath(target.path),
      newName,
      agentPlatform.value,
    );
    renameDialog.value = false;
    renameTargetItem.value = null;
    notifySuccess("Renamed");
    await refresh();
  } catch (err: unknown) {
    notifyError(getFileBrowserErrorMessage(err, "Unable to rename item."));
  } finally {
    mutationSaving.value = false;
  }
}

function openDeleteDialog() {
  if (selectedRows.value.length === 0) {
    notifyWarning("Select one or more items to delete.");
    return;
  }
  if (selectedRows.value.length > MAX_DELETE_PATHS_PER_REQUEST) {
    notifyWarning(
      `Select at most ${MAX_DELETE_PATHS_PER_REQUEST} items to delete at once.`,
    );
    return;
  }
  deletePendingItems.value = [...selectedRows.value];
  deleteDialog.value = true;
}

function openDeleteDialogFromContext(row: FileBrowserItem) {
  const selected = selectedRows.value;
  const inSelection = selected.some((s) => s.id === row.id);
  const pending = inSelection && selected.length > 0 ? [...selected] : [row];
  if (pending.length > MAX_DELETE_PATHS_PER_REQUEST) {
    notifyWarning(
      `Select at most ${MAX_DELETE_PATHS_PER_REQUEST} items to delete at once.`,
    );
    return;
  }
  deletePendingItems.value = pending;
  deleteDialog.value = true;
}

function pendingItemName(
  pending: FileBrowserItem[],
  resultPath: string,
): string {
  const match = pending.find((item) => pathsEqual(item.path, resultPath));
  return match?.name ?? resultPath.split(/[/\\]/).pop() ?? resultPath;
}

function notifyDeleteResults(
  pending: FileBrowserItem[],
  results: FileBrowserDeleteResult[],
) {
  const succeeded = results.filter((result) => result.success);
  const failed = results.filter((result) => !result.success);

  if (failed.length === 0) {
    if (succeeded.length === 1) {
      notifySuccess(
        `Deleted "${pendingItemName(pending, succeeded[0].path)}".`,
      );
      return;
    }
    notifySuccess(`Deleted ${succeeded.length} items.`);
    return;
  }

  if (succeeded.length === 0) {
    const detail = failed
      .map((result) => {
        const name = pendingItemName(pending, result.path);
        return result.error ? `${name}: ${result.error}` : name;
      })
      .join("; ");
    notifyError(detail || "Unable to delete items.");
    return;
  }

  notifyWarning(
    `Deleted ${succeeded.length} of ${results.length} items. ${failed.length} failed.`,
  );
}

async function confirmDelete() {
  if (mutationSaving.value) return;

  const pending = [...deletePendingItems.value];
  if (!pending.length) return;

  mutationSaving.value = true;
  try {
    const data = await deleteAgentFiles(
      props.agent_id,
      pending.map((item) => item.path),
      agentPlatform.value,
    );
    selectedRows.value = [];
    deletePendingItems.value = [];
    notifyDeleteResults(pending, data.results ?? []);
    await refresh();
  } catch (err: unknown) {
    notifyError(getFileBrowserErrorMessage(err, "Unable to delete items."));
  } finally {
    mutationSaving.value = false;
  }
}

function resolveDownloadItems(items: FileBrowserItem[]): FileBrowserItem[] {
  if (!items.length) return [];
  const files = items.filter((item) => item.type === "file");
  const folders = items.filter((item) => item.type === "folder");
  if (folders.length > 0) {
    notifyWarning(
      "Folder download is not available yet. Select a single file to download.",
    );
    return [];
  }
  if (files.length !== 1) {
    notifyWarning("Select exactly one file to download.");
    return [];
  }
  return files;
}

async function startFileDownload(items: FileBrowserItem[]) {
  const targets = resolveDownloadItems(items);
  if (!targets.length) return;

  if (
    downloadState.value.active &&
    (downloadState.value.status === "initializing" ||
      downloadState.value.status === "downloading" ||
      downloadState.value.status === "completing")
  ) {
    notifyWarning("A download is already in progress.");
    return;
  }

  const item = targets[0];
  downloadAbortController?.abort();
  downloadAbortController = new AbortController();
  const signal = downloadAbortController.signal;

  downloadState.value = {
    active: true,
    fileName: item.name,
    sourcePath: item.path,
    progress: 0,
    status: "initializing",
  };

  try {
    const result = await runFileDownloadTransfer(props.agent_id, item.path, {
      signal,
      chunkSize: FILE_TRANSFER_DEFAULT_CHUNK_SIZE,
      onProgress: ({ committedOffset, totalSize }) => {
        downloadState.value.progress =
          totalSize > 0 ? committedOffset / totalSize : 0;
        if (downloadState.value.status === "initializing") {
          downloadState.value.status = "downloading";
        }
      },
      onStatus: (status) => {
        downloadState.value.status = status;
      },
    });

    downloadState.value.progress = 1;
    downloadState.value.status = "completed";
    notifySuccess(
      result.integrityOk
        ? `Downloaded "${result.fileName}" (${bytes2Human(result.bytesWritten)}). Integrity verified.`
        : `Downloaded "${result.fileName}" (${bytes2Human(result.bytesWritten)}).`,
    );

    window.setTimeout(() => {
      if (downloadState.value.status === "completed") {
        downloadState.value.active = false;
        downloadState.value.status = "idle";
      }
    }, 4000);
  } catch (err: unknown) {
    if (isDownloadAbortError(err)) {
      downloadState.value.status = "cancelled";
      notifyInfo(
        "Download stopped. Click Download again on the same file to resume.",
      );
      return;
    }

    downloadState.value.status = "failed";
    downloadState.value.errorMessage = getFileBrowserErrorMessage(
      err,
      "Download failed.",
    );
    notifyError(downloadState.value.errorMessage);
  } finally {
    downloadAbortController = null;
  }
}

function cancelDownload() {
  downloadAbortController?.abort();
}

function downloadSelectedItems() {
  void startFileDownload(selectedRows.value);
}

function downloadFromContext(row: FileBrowserItem) {
  const selected = selectedRows.value;
  const inSelection = selected.some((s) => s.id === row.id);
  void startFileDownload(inSelection && selected.length > 0 ? selected : [row]);
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
    selectedPropertyItem.value = mapApiItemToFileBrowserItem(
      data,
      agentPlatform.value,
    );
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
  void queueFilesForUpload(files);
  input.value = "";
}

function confirmUploadOverwrite(conflicts: File[]): Promise<boolean> {
  const names = conflicts.map((f) => f.name);
  const preview =
    names.length <= 3 ? names.join(", ") : `${names.slice(0, 3).join(", ")}, …`;
  const message =
    conflicts.length === 1
      ? `"${names[0]}" already exists in this folder. Replace it?`
      : `${conflicts.length} files already exist in this folder (${preview}). Replace them?`;

  return new Promise((resolve) => {
    $q.dialog({
      title:
        conflicts.length === 1
          ? "Replace existing file?"
          : "Replace existing files?",
      message,
      cancel: true,
      persistent: true,
      ok: { label: "Replace", color: "primary" },
      cancel: { label: "Skip", flat: true, color: "primary" },
    })
      .onOk(() => resolve(true))
      .onCancel(() => resolve(false));
  });
}

async function queueFilesForUpload(files: File[]) {
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

  const maxFileBytes = MAX_UPLOAD_FILE_SIZE_BYTES;
  const skippedOversized =
    maxFileBytes > 0 ? batch.filter((f) => f.size > maxFileBytes).length : 0;
  const sizeOk =
    maxFileBytes > 0 ? batch.filter((f) => f.size <= maxFileBytes) : batch;
  const toEnqueue = sizeOk.slice(0, room);
  const skippedDueToQueue = sizeOk.length - toEnqueue.length;

  if (skippedOversized > 0) {
    notes.push(
      `${skippedOversized} file(s) skipped — larger than ${bytes2Human(
        maxFileBytes,
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

  const conflicts = listUploadNameConflicts(
    toEnqueue,
    rows.value,
    agentPlatform.value,
  );
  if (conflicts.length > 0) {
    const replace = await confirmUploadOverwrite(conflicts);
    if (!replace) {
      const conflictSet = new Set(conflicts);
      toEnqueue = toEnqueue.filter((f) => !conflictSet.has(f));
      if (!toEnqueue.length) {
        notifyInfo("Upload skipped — existing files were not replaced.");
        return;
      }
      notifyInfo(
        "Skipped files that already exist. Uploading the remaining items.",
      );
    }
  }

  const destinationPath = normalizeAgentListPath(
    currentPath.value.trim(),
    agentPlatform.value,
  );

  for (const file of toEnqueue) {
    const id = `up-${Date.now()}-${uploadIdSeq++}`;
    const item: UploadQueueItem = {
      id,
      file,
      name: file.name,
      sizeLabel: bytes2Human(file.size),
      sizeBytes: file.size,
      destinationPath,
      status: "queued",
      progress: 0,
    };
    uploadQueue.value.push(item);
  }

  void processUploadQueue();
}

function findUploadItem(itemId: string): UploadQueueItem | undefined {
  return uploadQueue.value.find((i) => i.id === itemId);
}

function updateUploadProgress(
  itemId: string,
  progress: {
    acceptedOffset: number;
    committedOffset: number;
    totalSize: number;
  },
): void {
  const item = findUploadItem(itemId);
  if (!item) return;
  item.acceptedOffset = progress.acceptedOffset;
  item.committedOffset = progress.committedOffset;
  item.progress =
    progress.totalSize > 0 ? progress.committedOffset / progress.totalSize : 0;
}

async function runSingleUpload(itemId: string): Promise<void> {
  const item = findUploadItem(itemId);
  if (!item || item.status !== "queued") return;

  item.status = "uploading";
  item.errorMessage = undefined;
  item.progress = 0;

  const controller = new AbortController();
  uploadAbortControllers.set(itemId, controller);

  try {
    const result = await runFileUploadTransfer(
      props.agent_id,
      item.file,
      item.destinationPath,
      {
        signal: controller.signal,
        chunkSize: FILE_TRANSFER_DEFAULT_CHUNK_SIZE,
        onProgress: (p) => updateUploadProgress(itemId, p),
      },
    );

    const current = findUploadItem(itemId);
    if (!current) return;

    current.status = "completed";
    current.progress = 1;
    notifySuccess(
      result.integrityOk
        ? `Uploaded "${item.name}" to ${result.destinationPath}. Integrity verified.`
        : `Uploaded "${item.name}" to ${result.destinationPath}.`,
    );
    await refresh();
  } catch (err: unknown) {
    const current = findUploadItem(itemId);
    if (!current) return;

    if (isUploadAbortError(err)) {
      current.status = "cancelled";
      notifyInfo(
        `"${item.name}" stopped. Add the same file again to resume the upload.`,
      );
      return;
    }

    current.status = "failed";
    current.errorMessage = getFileBrowserErrorMessage(err, "Upload failed.");
    notifyError(`"${item.name}": ${current.errorMessage}`);
  } finally {
    uploadAbortControllers.delete(itemId);
  }
}

async function processUploadQueue(): Promise<void> {
  if (uploadProcessorRunning) return;
  uploadProcessorRunning = true;

  try {
    while (true) {
      const next = uploadQueue.value.find((i) => i.status === "queued");
      if (!next) break;
      await runSingleUpload(next.id);
    }
  } finally {
    uploadProcessorRunning = false;
    if (uploadQueue.value.some((i) => i.status === "queued")) {
      void processUploadQueue();
    }
  }
}

function cancelUploadItem(id: string) {
  uploadAbortControllers.get(id)?.abort();
}

function removeUploadItem(id: string) {
  cancelUploadItem(id);
  uploadQueue.value = uploadQueue.value.filter((i) => i.id !== id);
}

function clearUploadQueue() {
  for (const item of uploadQueue.value) {
    if (item.status === "uploading") {
      uploadAbortControllers.get(item.id)?.abort();
    }
  }
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

  void queueFilesForUpload(files);
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
