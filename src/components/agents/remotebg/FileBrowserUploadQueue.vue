<template>
  <div
    class="upload-queue-section"
    :class="{ 'upload-queue-section--dark': $q.dark.isActive }"
  >
    <div class="row items-center justify-between q-mb-xs">
      <div class="text-subtitle2 text-weight-medium upload-queue-title">
        Upload queue
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
        />
        <q-btn
          dense
          flat
          no-caps
          size="sm"
          label="Hide all"
          :disable="!canHideAll"
          @click="emit('hide-all')"
        >
          <q-tooltip
            >Hide paused items. Open Transfers to show them again.</q-tooltip
          >
        </q-btn>
      </div>
    </div>
    <div class="text-caption upload-queue-destination q-mb-sm">
      Destination:
      <span class="upload-queue-destination-path">{{ destinationLabel }}</span>
    </div>
    <div v-if="limitsCaption" class="text-caption upload-queue-limits q-mb-sm">
      {{ limitsCaption }}
    </div>
    <q-list
      bordered
      separator
      dense
      class="upload-queue-list"
      :class="{ 'upload-queue-list--dark': $q.dark.isActive }"
      :dark="$q.dark.isActive"
    >
      <q-item v-for="item in items" :key="item.id" class="upload-queue-item">
        <q-item-section avatar>
          <q-icon name="description" color="primary" size="22px" />
        </q-item-section>
        <q-item-section>
          <q-item-label class="ellipsis upload-queue-item-name">{{
            item.name
          }}</q-item-label>
          <q-item-label caption class="upload-queue-item-meta">{{
            item.sizeLabel
          }}</q-item-label>
          <q-item-label
            v-if="
              item.errorMessage &&
              item.status === 'uploading' &&
              /waiting for a free transfer slot/i.test(item.errorMessage)
            "
            caption
            class="upload-queue-item-meta"
          >
            {{ item.errorMessage }}
          </q-item-label>
          <q-item-label
            v-else-if="item.status === 'paused' && resumeCaption(item)"
            caption
            class="upload-queue-item-meta"
          >
            {{ resumeCaption(item) }}
          </q-item-label>
          <div class="upload-progress-wrap q-mt-xs">
            <q-linear-progress
              :value="item.progress"
              :color="progressColor(item.status)"
              :track-color="$q.dark.isActive ? 'grey-8' : 'grey-4'"
              class="upload-progress"
              rounded
              size="6px"
            />
          </div>
        </q-item-section>
        <q-item-section side>
          <q-badge
            :color="uploadStatusBadgeColor(item.status)"
            :text-color="item.status === 'queued' ? 'dark' : undefined"
            align="middle"
          >
            {{ uploadStatusLabelForItem(item) }}
          </q-badge>
          <div
            v-if="item.status === 'uploading'"
            class="row q-gutter-xs q-mt-xs"
          >
            <q-btn
              dense
              flat
              no-caps
              size="sm"
              label="Pause"
              @click="emit('pause', item.id)"
            />
            <q-btn
              dense
              flat
              no-caps
              size="sm"
              color="negative"
              label="Cancel"
              @click="emit('cancel', item.id)"
            />
          </div>
          <div
            v-else-if="item.status === 'paused'"
            class="row q-gutter-xs q-mt-xs"
          >
            <q-btn
              v-if="item.recoveryHint === 'needs_file' && !item.file"
              dense
              flat
              no-caps
              size="sm"
              color="primary"
              label="Select file"
              :disable="!!item.ownedByOtherTab"
              @click="emit('select-file', item.id)"
            >
              <q-tooltip v-if="item.ownedByOtherTab"
                >Open in another tab</q-tooltip
              >
            </q-btn>
            <q-btn
              v-else
              dense
              flat
              no-caps
              size="sm"
              color="primary"
              label="Resume"
              :disable="!!item.ownedByOtherTab"
              @click="emit('resume', item.id)"
            >
              <q-tooltip v-if="item.ownedByOtherTab"
                >Open in another tab</q-tooltip
              >
            </q-btn>
            <q-btn
              dense
              flat
              no-caps
              size="sm"
              color="negative"
              label="Cancel"
              @click="emit('cancel', item.id)"
            />
            <q-btn
              dense
              flat
              no-caps
              size="sm"
              label="Hide"
              @click="emit('hide', item.id)"
            />
          </div>
          <q-btn
            v-else-if="isUploadQueueItemTerminal(item.status)"
            dense
            flat
            round
            icon="close"
            size="sm"
            class="q-mt-xs"
            @click="emit('dismiss', item.id)"
          >
            <q-tooltip>Dismiss</q-tooltip>
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
            <q-tooltip>Remove from queue</q-tooltip>
          </q-btn>
        </q-item-section>
      </q-item>
    </q-list>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useQuasar } from "quasar";

import type { UploadQueueItem, UploadQueueStatus } from "@/types/filebrowser";
import { formatResumeWindowCaption } from "@/services/fileTransfer/transferQueuePersist";
import {
  isUploadQueueItemTerminal,
  uploadStatusBadgeColor,
  uploadStatusLabel,
} from "@/utils/filebrowser";

const $q = useQuasar();

const props = defineProps<{
  items: UploadQueueItem[];
  destinationLabel: string;
  limitsCaption?: string;
}>();

const emit = defineEmits<{
  (e: "clear-finished"): void;
  (e: "hide-all"): void;
  (e: "dismiss", id: string): void;
  (e: "pause", id: string): void;
  (e: "resume", id: string): void;
  (e: "select-file", id: string): void;
  (e: "cancel", id: string): void;
  (e: "hide", id: string): void;
}>();

function resumeCaption(item: UploadQueueItem): string | null {
  if (item.ownedByOtherTab) {
    return "Open in another tab";
  }
  if (item.recoveryHint === "needs_file" && !item.file) {
    const window = formatResumeWindowCaption(item.expiresAt);
    return window
      ? `Select original file to resume · ${window}`
      : "Select the original file to resume";
  }
  return formatResumeWindowCaption(item.expiresAt);
}

function uploadStatusLabelForItem(item: UploadQueueItem): string {
  if (
    item.status === "uploading" &&
    item.errorMessage &&
    /waiting for a free transfer slot/i.test(item.errorMessage)
  ) {
    return "Waiting for slot…";
  }
  return uploadStatusLabel(item.status);
}

const canClearFinished = computed(() =>
  props.items.some((item) => isUploadQueueItemTerminal(item.status)),
);

const canHideAll = computed(() =>
  props.items.some((item) => item.status === "paused"),
);

function progressColor(status: UploadQueueStatus): string {
  if (status === "failed") return "negative";
  if (status === "completed") return "positive";
  if (status === "paused") return "warning";
  if (status === "cancelled") return "grey-7";
  return "primary";
}
</script>

<style scoped>
.upload-queue-section {
  flex: 0 0 auto;
  max-height: min(240px, 35vh);
  overflow: auto;
  padding: 10px 12px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  background: #fafafa;
  color: rgba(0, 0, 0, 0.87);
}

.upload-queue-section--dark {
  border-color: rgba(255, 255, 255, 0.12);
  background: #1d1d1d;
  color: rgba(255, 255, 255, 0.87);
}

.upload-queue-section--dark .upload-queue-title,
.upload-queue-section--dark .upload-queue-destination,
.upload-queue-section--dark .upload-queue-destination-path,
.upload-queue-section--dark .upload-queue-item-name {
  color: rgba(255, 255, 255, 0.87);
}

.upload-queue-destination {
  color: rgba(0, 0, 0, 0.6);
}

.upload-queue-limits {
  color: rgba(0, 0, 0, 0.55);
}

.upload-queue-section--dark .upload-queue-limits {
  color: rgba(255, 255, 255, 0.5);
}

.upload-queue-section--dark .upload-queue-destination {
  color: rgba(255, 255, 255, 0.6);
}

.upload-queue-destination-path {
  color: rgba(0, 0, 0, 0.87);
}

.upload-queue-list {
  border-radius: 6px;
  background: transparent;
}

.upload-queue-list--dark {
  background: transparent;
  color: rgba(255, 255, 255, 0.87);
}

.upload-queue-list--dark :deep(.q-item) {
  background: transparent;
  color: rgba(255, 255, 255, 0.87);
}

.upload-queue-list--dark :deep(.q-item__label--caption),
.upload-queue-section--dark .upload-queue-item-meta {
  color: rgba(255, 255, 255, 0.55) !important;
}

.upload-queue-list--dark :deep(.q-list--bordered) {
  border-color: rgba(255, 255, 255, 0.12);
}

.upload-queue-list--dark :deep(.q-separator) {
  background: rgba(255, 255, 255, 0.12);
}

.upload-queue-item :deep(.q-item__section--main) {
  min-width: 0;
}

.upload-queue-item :deep(.q-item__section--side) {
  flex-direction: column;
  align-items: flex-end;
}

.upload-progress-wrap {
  flex: 0 0 auto;
  width: 100%;
  height: 6px;
}

.upload-progress {
  width: 100%;
  height: 6px;
}

.upload-progress :deep(.q-linear-progress) {
  height: 6px !important;
  font-size: 6px;
}
</style>
