<template>
  <div
    class="upload-queue-section q-mb-sm"
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
          label="Clear all"
          @click="emit('clear')"
        />
      </div>
    </div>
    <div class="text-caption upload-queue-destination q-mb-sm">
      Destination:
      <span class="upload-queue-destination-path">{{ destinationLabel }}</span>
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
          <div class="upload-progress-wrap q-mt-xs">
            <q-linear-progress
              :value="item.progress"
              color="primary"
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
            @click="emit('remove', item.id)"
          />
        </q-item-section>
      </q-item>
    </q-list>
  </div>
</template>

<script setup lang="ts">
import { useQuasar } from "quasar";

import type { UploadQueueItem } from "@/types/filebrowser";
import { uploadStatusBadgeColor, uploadStatusLabel } from "@/utils/filebrowser";

const $q = useQuasar();

defineProps<{
  items: UploadQueueItem[];
  destinationLabel: string;
}>();

const emit = defineEmits<{
  (e: "clear"): void;
  (e: "remove", id: string): void;
}>();
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
