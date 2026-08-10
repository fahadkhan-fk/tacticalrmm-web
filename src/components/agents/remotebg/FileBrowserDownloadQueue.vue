<template>
  <div
    class="download-queue-section"
    :class="{ 'download-queue-section--dark': $q.dark.isActive }"
  >
    <div class="row items-center justify-between q-mb-xs">
      <div class="text-subtitle2 text-weight-medium download-queue-title">
        Download queue
      </div>
      <div class="row items-center q-gutter-xs">
        <q-btn
          dense
          flat
          no-caps
          size="sm"
          label="Clear finished"
          :disable="!canClearFinished"
          @click="emit('clear-finished')"
        >
          <q-tooltip>{{ TRANSFER_TOOLTIP_CLEAR_FINISHED }}</q-tooltip>
        </q-btn>
        <q-btn
          dense
          flat
          no-caps
          size="sm"
          label="Hide all"
          :disable="!canHideAll"
          @click="emit('hide-all')"
        >
          <q-tooltip>{{ TRANSFER_TOOLTIP_HIDE_PAUSED }}</q-tooltip>
        </q-btn>
        <q-btn
          dense
          flat
          no-caps
          size="sm"
          color="negative"
          label="Pause all"
          :disable="!canPauseAll"
          @click="emit('pause-all')"
        >
          <q-tooltip>{{ TRANSFER_TOOLTIP_PAUSE_ALL }}</q-tooltip>
        </q-btn>
      </div>
    </div>
    <div
      v-if="summaryCaption"
      class="text-caption download-queue-summary q-mb-sm"
    >
      {{ summaryCaption }}
    </div>
    <q-list
      bordered
      separator
      dense
      class="download-queue-list"
      :class="{ 'download-queue-list--dark': $q.dark.isActive }"
      :dark="$q.dark.isActive"
    >
      <q-item v-for="item in items" :key="item.id" class="download-queue-item">
        <q-item-section avatar>
          <q-icon name="description" color="primary" size="22px" />
        </q-item-section>
        <q-item-section>
          <q-item-label class="ellipsis download-queue-item-name">{{
            item.name
          }}</q-item-label>
          <q-item-label
            v-if="item.errorMessage && item.status === 'failed'"
            caption
            class="download-queue-item-error"
          >
            {{ item.errorMessage }}
          </q-item-label>
          <q-item-label
            v-else-if="
              item.errorMessage && isDownloadQueueItemActive(item.status)
            "
            caption
            class="download-queue-item-meta"
          >
            {{ item.errorMessage }}
          </q-item-label>
          <q-item-label
            v-else-if="item.status === 'paused' && pausedCaption(item)"
            caption
            class="download-queue-item-meta"
          >
            {{ pausedCaption(item) }}
          </q-item-label>
          <div
            v-if="showItemProgress(item)"
            class="download-progress-wrap q-mt-xs"
          >
            <q-linear-progress
              :value="item.progress"
              :color="progressColor(item.status)"
              :track-color="$q.dark.isActive ? 'grey-8' : 'grey-4'"
              class="download-progress"
              rounded
              size="6px"
            />
          </div>
        </q-item-section>
        <q-item-section side>
          <q-badge
            :color="downloadStatusBadgeColor(item.status)"
            :text-color="item.status === 'queued' ? 'dark' : undefined"
            align="middle"
          >
            {{ downloadStatusLabelForItem(item) }}
          </q-badge>
          <div
            v-if="isDownloadQueueItemActive(item.status)"
            class="row q-gutter-xs q-mt-xs"
          >
            <q-btn
              dense
              flat
              no-caps
              size="sm"
              label="Pause"
              @click="emit('pause', item.id)"
            >
              <q-tooltip>{{ TRANSFER_TOOLTIP_PAUSE }}</q-tooltip>
            </q-btn>
            <q-btn
              dense
              flat
              no-caps
              size="sm"
              color="negative"
              label="Cancel"
              @click="emit('cancel', item.id)"
            >
              <q-tooltip>{{ TRANSFER_TOOLTIP_CANCEL }}</q-tooltip>
            </q-btn>
          </div>
          <div
            v-else-if="item.status === 'paused'"
            class="row q-gutter-xs q-mt-xs"
          >
            <q-btn
              dense
              flat
              no-caps
              size="sm"
              color="primary"
              label="Resume"
              :disable="
                item.recoveryHint === 'non_resumable' || !!item.ownedByOtherTab
              "
              @click="emit('resume', item.id)"
            >
              <q-tooltip v-if="item.ownedByOtherTab">{{
                TRANSFER_TOOLTIP_OPEN_IN_OTHER_TAB
              }}</q-tooltip>
            </q-btn>
            <q-btn
              dense
              flat
              no-caps
              size="sm"
              color="negative"
              label="Cancel"
              @click="emit('cancel', item.id)"
            >
              <q-tooltip>{{ TRANSFER_TOOLTIP_CANCEL }}</q-tooltip>
            </q-btn>
            <q-btn
              dense
              flat
              no-caps
              size="sm"
              label="Hide"
              @click="emit('hide', item.id)"
            >
              <q-tooltip>{{ TRANSFER_TOOLTIP_HIDE_PAUSED }}</q-tooltip>
            </q-btn>
          </div>
          <q-btn
            v-else-if="canDismissDownloadQueueItem(item.status)"
            dense
            flat
            round
            icon="close"
            size="sm"
            class="q-mt-xs"
            @click="emit('dismiss', item.id)"
          >
            <q-tooltip>{{ TRANSFER_TOOLTIP_DISMISS }}</q-tooltip>
          </q-btn>
          <q-btn
            v-else-if="item.status === 'queued'"
            dense
            flat
            round
            icon="close"
            size="sm"
            class="q-mt-xs"
            @click="emit('dismiss', item.id)"
          >
            <q-tooltip>{{ TRANSFER_TOOLTIP_REMOVE_FROM_QUEUE }}</q-tooltip>
          </q-btn>
        </q-item-section>
      </q-item>
    </q-list>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useQuasar } from "quasar";

import type {
  DownloadQueueItem,
  DownloadQueueStatus,
} from "@/types/filebrowser";
import {
  TRANSFER_TOOLTIP_CANCEL,
  TRANSFER_TOOLTIP_CLEAR_FINISHED,
  TRANSFER_TOOLTIP_DISMISS,
  TRANSFER_TOOLTIP_HIDE_PAUSED,
  TRANSFER_TOOLTIP_OPEN_IN_OTHER_TAB,
  TRANSFER_TOOLTIP_PAUSE,
  TRANSFER_TOOLTIP_PAUSE_ALL,
  TRANSFER_TOOLTIP_REMOVE_FROM_QUEUE,
} from "@/constants/fileTransfer";
import { formatResumeWindowCaption } from "@/services/fileTransfer/transferQueuePersist";
import {
  canDismissDownloadQueueItem,
  downloadStatusBadgeColor,
  downloadStatusLabel,
  isDownloadQueueItemActive,
} from "@/utils/filebrowser";

const $q = useQuasar();

const props = defineProps<{
  items: DownloadQueueItem[];
  summaryCaption?: string;
}>();

const emit = defineEmits<{
  (e: "clear-finished"): void;
  (e: "hide-all"): void;
  (e: "pause-all"): void;
  (e: "dismiss", id: string): void;
  (e: "pause", id: string): void;
  (e: "resume", id: string): void;
  (e: "cancel", id: string): void;
  (e: "hide", id: string): void;
}>();

function pausedCaption(item: DownloadQueueItem): string | null {
  if (item.ownedByOtherTab) {
    return "Open in another tab";
  }
  const parts: string[] = [];
  if (item.errorMessage) parts.push(item.errorMessage);
  const window = formatResumeWindowCaption(item.expiresAt);
  if (window) parts.push(window);
  return parts.length ? parts.join(" · ") : null;
}

function downloadStatusLabelForItem(item: DownloadQueueItem): string {
  if (
    item.errorMessage &&
    isDownloadQueueItemActive(item.status) &&
    /waiting for a free transfer slot/i.test(item.errorMessage)
  ) {
    return "Waiting for slot…";
  }
  return downloadStatusLabel(item.status);
}

const canClearFinished = computed(() =>
  props.items.some((item) => canDismissDownloadQueueItem(item.status)),
);

const canHideAll = computed(() =>
  props.items.some((item) => item.status === "paused"),
);

const canPauseAll = computed(() =>
  props.items.some(
    (item) =>
      item.status === "queued" || isDownloadQueueItemActive(item.status),
  ),
);

function showItemProgress(item: DownloadQueueItem): boolean {
  return (
    isDownloadQueueItemActive(item.status) ||
    item.status === "completed" ||
    item.status === "failed" ||
    item.status === "paused"
  );
}

function progressColor(status: DownloadQueueStatus): string {
  if (status === "failed") return "negative";
  if (status === "completed") return "positive";
  if (status === "paused") return "warning";
  if (status === "cancelled") return "grey-7";
  return "primary";
}
</script>

<style scoped>
.download-queue-section {
  flex: 0 0 auto;
  max-height: min(240px, 35vh);
  overflow: auto;
  padding: 10px 12px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  background: #fafafa;
  color: rgba(0, 0, 0, 0.87);
}

.download-queue-section--dark {
  border-color: rgba(255, 255, 255, 0.12);
  background: #1d1d1d;
  color: rgba(255, 255, 255, 0.87);
}

.download-queue-section--dark .download-queue-title,
.download-queue-section--dark .download-queue-summary,
.download-queue-section--dark .download-queue-item-name {
  color: rgba(255, 255, 255, 0.87);
}

.download-queue-summary {
  color: rgba(0, 0, 0, 0.6);
}

.download-queue-section--dark .download-queue-summary {
  color: rgba(255, 255, 255, 0.55);
}

.download-queue-list {
  border-radius: 6px;
  background: transparent;
}

.download-queue-list--dark {
  background: transparent;
  color: rgba(255, 255, 255, 0.87);
}

.download-queue-list--dark :deep(.q-item) {
  background: transparent;
  color: rgba(255, 255, 255, 0.87);
}

.download-queue-item-error {
  color: rgba(244, 67, 54, 0.9) !important;
}

.download-queue-item-meta {
  white-space: normal;
  opacity: 0.8;
}

.download-queue-list--dark .download-queue-item-error {
  color: rgba(244, 67, 54, 0.85) !important;
}

.download-queue-list--dark :deep(.q-list--bordered) {
  border-color: rgba(255, 255, 255, 0.12);
}

.download-queue-list--dark :deep(.q-separator) {
  background: rgba(255, 255, 255, 0.12);
}

.download-queue-item :deep(.q-item__section--main) {
  min-width: 0;
}

.download-queue-item :deep(.q-item__section--side) {
  flex-direction: column;
  align-items: flex-end;
}

.download-progress-wrap {
  flex: 0 0 auto;
  width: 100%;
  height: 6px;
}

.download-progress {
  width: 100%;
  height: 6px;
}
</style>
