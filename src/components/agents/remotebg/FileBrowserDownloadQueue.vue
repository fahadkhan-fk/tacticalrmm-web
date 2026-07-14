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
        />
        <q-btn
          dense
          flat
          no-caps
          size="sm"
          color="negative"
          label="Stop all"
          :disable="!canStopAll"
          @click="emit('stop-all')"
        />
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
            {{ downloadStatusLabel(item.status) }}
          </q-badge>
          <q-btn
            v-if="canRemoveDownloadQueueItem(item.status)"
            dense
            flat
            round
            icon="close"
            size="sm"
            class="q-mt-xs"
            @click="emit('remove', item.id)"
          />
          <q-btn
            v-if="isDownloadQueueItemActive(item.status)"
            dense
            flat
            round
            icon="stop"
            size="sm"
            color="negative"
            class="q-mt-xs"
            @click="emit('cancel', item.id)"
          />
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
  canRemoveDownloadQueueItem,
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
  (e: "stop-all"): void;
  (e: "remove", id: string): void;
  (e: "cancel", id: string): void;
}>();

const canClearFinished = computed(() =>
  props.items.some(
    (item) =>
      item.status === "completed" ||
      item.status === "failed" ||
      item.status === "cancelled",
  ),
);

const canStopAll = computed(() =>
  props.items.some(
    (item) =>
      item.status === "queued" || isDownloadQueueItemActive(item.status),
  ),
);

function showItemProgress(item: DownloadQueueItem): boolean {
  return (
    isDownloadQueueItemActive(item.status) ||
    item.status === "completed" ||
    item.status === "failed"
  );
}

function progressColor(status: DownloadQueueStatus): string {
  if (status === "failed") return "negative";
  if (status === "completed") return "positive";
  if (status === "cancelled") return "warning";
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
