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
      v-if="activeSingleDownloadItem"
      :file-name="activeSingleDownloadItem.name"
      :progress="activeSingleDownloadItem.progress"
      :status="singleDownloadProgressStatus"
      :error-message="activeSingleDownloadItem.errorMessage"
      @cancel="cancelDownloadItem(activeSingleDownloadItem.id)"
    />

    <FileBrowserDownloadQueue
      v-if="showDownloadQueuePanel"
      :items="downloadQueue"
      :summary-caption="downloadQueueSummary ?? undefined"
      @clear-finished="clearFinishedDownloads"
      @stop-all="stopAllDownloads"
      @remove="removeDownloadItem"
      @cancel="cancelDownloadItem"
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
import FileBrowserDownloadQueue from "@/components/agents/remotebg/FileBrowserDownloadQueue.vue";
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
  MAX_DOWNLOAD_QUEUE_ITEMS,
  MAX_SEQUENTIAL_DOWNLOAD_FILES,
  MAX_UPLOAD_FILE_SIZE_BYTES,
  MAX_UPLOAD_FILES_PER_SELECTION,
  MAX_UPLOAD_QUEUE_ITEMS,
} from "@/constants/filebrowser";
import { FILE_TRANSFER_DEFAULT_CHUNK_SIZE } from "@/constants/fileTransfer";
import type {
  DownloadQueueItem,
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
import type { DownloadTransferStatus } from "@/types/fileTransfer";
import { bytes2Human } from "@/utils/format";
import {
  defaultFileBrowserRootPath,
  fileListToArray,
  classifyDownloadSelection,
  getFileBrowserErrorMessage,
  getListFilesErrorMessage,
  isFileDrag,
  isListFilesAgentOfflineError,
  isListFilesPermissionError,
  isDownloadQueueItemActive,
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

const downloadQueue = ref<DownloadQueueItem[]>([]);
const downloadQueueSummary = ref<string | null>(null);
const downloadAbortControllers = new Map<string, AbortController>();
let downloadProcessorRunning = false;
let downloadIdSeq = 0;
let downloadStopAllRequested = false;
let loadSeq = 0;

const mutationSaving = ref(false);

const uploadQueueItems = computed<UploadQueueItem[]>(() => uploadQueue.value);
const hasUploadPath = computed(() => currentPath.value.trim().length > 0);

const activeSingleDownloadItem = computed(() => {
  if (downloadQueue.value.length !== 1) return null;
  return downloadQueue.value[0];
});

const showDownloadQueuePanel = computed(() => downloadQueue.value.length >= 2);

const singleDownloadProgressStatus = computed((): DownloadTransferStatus => {
  const item = activeSingleDownloadItem.value;
  if (!item) return "idle";
  if (item.status === "queued") return "initializing";
  return item.status as DownloadTransferStatus;
});

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

function isDownloadProcessorBusy(): boolean {
  return (
    downloadProcessorRunning ||
    downloadQueue.value.some((item) => isDownloadQueueItemActive(item.status))
  );
}

function findDownloadItem(itemId: string): DownloadQueueItem | undefined {
  return downloadQueue.value.find((item) => item.id === itemId);
}

function offerZipDownloadDialog(selection: {
  folderCount: number;
  fileCount: number;
}): Promise<boolean> {
  const parts: string[] = [];
  if (selection.folderCount > 0) {
    parts.push(
      selection.folderCount === 1
        ? "1 folder"
        : `${selection.folderCount} folders`,
    );
  }
  if (selection.fileCount > 0) {
    parts.push(
      selection.fileCount === 1 ? "1 file" : `${selection.fileCount} files`,
    );
  }
  const summary = parts.join(" and ");
  const reason =
    selection.folderCount > 0 &&
    selection.fileCount > MAX_SEQUENTIAL_DOWNLOAD_FILES
      ? "Folders and large multi-file selections are downloaded as a single ZIP archive."
      : selection.folderCount > 0
        ? "Folders are downloaded as a single ZIP archive."
        : `More than ${MAX_SEQUENTIAL_DOWNLOAD_FILES} files are downloaded as a single ZIP archive.`;

  return new Promise((resolve) => {
    $q.dialog({
      title: "Download as ZIP?",
      message: `${summary} selected. ${reason}`,
      cancel: true,
      persistent: true,
      ok: { label: "Download ZIP", color: "primary" },
      cancel: { label: "Cancel", flat: true, color: "primary" },
    })
      .onOk(() => resolve(true))
      .onCancel(() => resolve(false));
  });
}

function startZipDownload() {
  notifyInfo(
    "ZIP download is not available yet. Select up to 10 individual files, or continue when folder download (Phase E2) is enabled.",
  );
}

async function confirmContinueAfterDownloadFailure(
  item: DownloadQueueItem,
): Promise<boolean> {
  const remaining = downloadQueue.value.filter(
    (entry) => entry.status === "queued",
  ).length;
  if (remaining === 0) return false;

  const detail = item.errorMessage
    ? `"${item.name}": ${item.errorMessage}`
    : `"${item.name}" failed.`;

  return new Promise((resolve) => {
    $q.dialog({
      title: "Download failed",
      message: `${detail}\n\nContinue with the remaining ${remaining} file(s)?`,
      cancel: true,
      persistent: true,
      ok: { label: "Continue", color: "primary" },
      cancel: { label: "Stop", flat: true, color: "negative" },
    })
      .onOk(() => resolve(true))
      .onCancel(() => resolve(false));
  });
}

function cancelRemainingDownloads() {
  downloadStopAllRequested = true;
  for (const item of downloadQueue.value) {
    if (item.status === "queued") {
      item.status = "cancelled";
    }
  }
}

function notifyDownloadBatchSummary(
  succeeded: number,
  failed: number,
  cancelled: number,
) {
  const total = succeeded + failed + cancelled;
  if (total === 0) return;

  if (failed === 0 && cancelled === 0) {
    if (succeeded === 1) {
      notifySuccess("Download complete.");
      downloadQueueSummary.value = "All downloads finished successfully.";
      return;
    }
    notifySuccess(`Downloaded ${succeeded} files.`);
    downloadQueueSummary.value = `All ${succeeded} downloads finished successfully.`;
    return;
  }

  if (succeeded === 0 && failed > 0 && cancelled === 0) {
    notifyError(
      failed === 1 ? "Download failed." : `All ${failed} downloads failed.`,
    );
    downloadQueueSummary.value =
      failed === 1 ? "Download failed." : `All ${failed} downloads failed.`;
    return;
  }

  const parts: string[] = [];
  if (succeeded > 0) parts.push(`${succeeded} succeeded`);
  if (failed > 0) parts.push(`${failed} failed`);
  if (cancelled > 0) parts.push(`${cancelled} stopped`);

  downloadQueueSummary.value = `Finished: ${parts.join(", ")}.`;
  notifyWarning(`Downloads finished: ${parts.join(", ")}.`);
}

function enqueueDownloads(files: FileBrowserItem[]) {
  if (!files.length) return;

  if (isDownloadProcessorBusy()) {
    notifyWarning("Downloads are already in progress.");
    return;
  }

  const room = MAX_DOWNLOAD_QUEUE_ITEMS - downloadQueue.value.length;
  if (room <= 0) {
    notifyWarning(
      `The download queue is full (max ${MAX_DOWNLOAD_QUEUE_ITEMS} items). Clear finished items first.`,
    );
    return;
  }

  let batch = files;
  if (batch.length > room) {
    notifyWarning(
      `Only the first ${room} of ${batch.length} files were queued (queue limit).`,
    );
    batch = batch.slice(0, room);
  }

  downloadQueueSummary.value = null;
  downloadStopAllRequested = false;

  for (const file of batch) {
    const id = `dl-${Date.now()}-${downloadIdSeq++}`;
    downloadQueue.value.push({
      id,
      name: file.name,
      sourcePath: file.path,
      status: "queued",
      progress: 0,
    });
  }

  void processDownloadQueue();
}

async function runSingleDownload(itemId: string): Promise<void> {
  const item = findDownloadItem(itemId);
  if (!item || item.status !== "queued") return;

  item.status = "initializing";
  item.errorMessage = undefined;
  item.progress = 0;

  const controller = new AbortController();
  downloadAbortControllers.set(itemId, controller);

  try {
    const result = await runFileDownloadTransfer(
      props.agent_id,
      item.sourcePath,
      {
        signal: controller.signal,
        chunkSize: FILE_TRANSFER_DEFAULT_CHUNK_SIZE,
        onProgress: ({ committedOffset, totalSize }) => {
          const current = findDownloadItem(itemId);
          if (!current) return;
          current.progress = totalSize > 0 ? committedOffset / totalSize : 0;
          if (current.status === "initializing") {
            current.status = "downloading";
          }
        },
        onStatus: (status) => {
          const current = findDownloadItem(itemId);
          if (!current) return;
          current.status = status;
        },
      },
    );

    const current = findDownloadItem(itemId);
    if (!current) return;

    current.status = "completed";
    current.progress = 1;

    if (downloadQueue.value.length === 1) {
      notifySuccess(
        result.integrityOk
          ? `Downloaded "${result.fileName}" (${bytes2Human(result.bytesWritten)}). Integrity verified.`
          : `Downloaded "${result.fileName}" (${bytes2Human(result.bytesWritten)}).`,
      );
      window.setTimeout(() => {
        if (
          downloadQueue.value.length === 1 &&
          downloadQueue.value[0]?.id === itemId &&
          downloadQueue.value[0]?.status === "completed"
        ) {
          downloadQueue.value = [];
        }
      }, 4000);
    }
  } catch (err: unknown) {
    const current = findDownloadItem(itemId);
    if (!current) return;

    if (isDownloadAbortError(err)) {
      current.status = "cancelled";
      if (downloadQueue.value.length === 1) {
        notifyInfo(
          "Download stopped. Click Download again on the same file to resume.",
        );
      }
      return;
    }

    current.status = "failed";
    current.errorMessage = getFileBrowserErrorMessage(err, "Download failed.");
    if (downloadQueue.value.length === 1) {
      notifyError(current.errorMessage);
    }
  } finally {
    downloadAbortControllers.delete(itemId);
  }
}

async function processDownloadQueue(): Promise<void> {
  if (downloadProcessorRunning) return;
  downloadProcessorRunning = true;

  const batchIdSet = new Set(
    downloadQueue.value
      .filter(
        (item) =>
          item.status === "queued" || isDownloadQueueItemActive(item.status),
      )
      .map((item) => item.id),
  );

  try {
    while (true) {
      if (downloadStopAllRequested) {
        cancelRemainingDownloads();
        break;
      }

      const next = downloadQueue.value.find((item) => item.status === "queued");
      if (!next) break;

      await runSingleDownload(next.id);

      const current = findDownloadItem(next.id);
      if (!current) continue;

      if (current.status === "cancelled") {
        break;
      }

      if (current.status === "failed") {
        if (downloadStopAllRequested) break;

        const shouldContinue =
          await confirmContinueAfterDownloadFailure(current);
        if (!shouldContinue) {
          cancelRemainingDownloads();
          break;
        }
      }
    }
  } finally {
    downloadProcessorRunning = false;
    downloadStopAllRequested = false;

    if (downloadQueue.value.length >= 2 && batchIdSet.size > 0) {
      const batchItems = downloadQueue.value.filter((item) =>
        batchIdSet.has(item.id),
      );
      const succeeded = batchItems.filter(
        (item) => item.status === "completed",
      ).length;
      const failed = batchItems.filter(
        (item) => item.status === "failed",
      ).length;
      const cancelled = batchItems.filter(
        (item) => item.status === "cancelled",
      ).length;
      notifyDownloadBatchSummary(succeeded, failed, cancelled);
    }

    if (downloadQueue.value.some((item) => item.status === "queued")) {
      void processDownloadQueue();
    }
  }
}

function cancelDownloadItem(id: string) {
  downloadAbortControllers.get(id)?.abort();
  const item = findDownloadItem(id);
  if (item && item.status === "queued") {
    item.status = "cancelled";
  }
}

function removeDownloadItem(id: string) {
  cancelDownloadItem(id);
  downloadQueue.value = downloadQueue.value.filter((item) => item.id !== id);
}

function clearFinishedDownloads() {
  downloadQueue.value = downloadQueue.value.filter(
    (item) =>
      item.status !== "completed" &&
      item.status !== "failed" &&
      item.status !== "cancelled",
  );
  if (!downloadQueue.value.length) {
    downloadQueueSummary.value = null;
  }
}

function stopAllDownloads() {
  downloadStopAllRequested = true;
  for (const item of downloadQueue.value) {
    if (isDownloadQueueItemActive(item.status)) {
      downloadAbortControllers.get(item.id)?.abort();
    } else if (item.status === "queued") {
      item.status = "cancelled";
    }
  }
}

async function startDownloads(items: FileBrowserItem[]) {
  if (!items.length) {
    notifyWarning("Select one or more items to download.");
    return;
  }

  const selection = classifyDownloadSelection(items);

  if (selection.mode === "none") {
    notifyWarning("Select one or more items to download.");
    return;
  }

  if (selection.mode === "zip") {
    const proceed = await offerZipDownloadDialog(selection);
    if (proceed) {
      startZipDownload();
    }
    return;
  }

  if (selection.mode === "single") {
    enqueueDownloads(selection.files);
    return;
  }

  enqueueDownloads(selection.files);
}

function downloadSelectedItems() {
  void startDownloads(selectedRows.value);
}

function downloadFromContext(row: FileBrowserItem) {
  const selected = selectedRows.value;
  const inSelection = selected.some((s) => s.id === row.id);
  void startDownloads(inSelection && selected.length > 0 ? selected : [row]);
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
  gap: 12px;
}
</style>
