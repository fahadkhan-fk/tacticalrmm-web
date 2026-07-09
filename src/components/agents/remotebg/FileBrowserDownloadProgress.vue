<template>
  <div
    class="download-progress-section q-mb-sm"
    :class="{ 'download-progress-section--dark': $q.dark.isActive }"
  >
    <div class="row items-center justify-between q-mb-xs">
      <div class="text-subtitle2 text-weight-medium download-progress-title">
        Download
      </div>
      <q-btn
        v-if="canCancel"
        dense
        flat
        no-caps
        size="sm"
        color="negative"
        label="Stop"
        @click="emit('cancel')"
      />
    </div>
    <div class="text-caption download-progress-file q-mb-xs ellipsis">
      {{ fileName }}
    </div>
    <div class="row items-center justify-between q-mb-xs">
      <span class="text-caption download-progress-status">{{
        statusLabel
      }}</span>
      <span class="text-caption download-progress-pct"
        >{{ progressPercent }}%</span
      >
    </div>
    <q-linear-progress
      :value="progress"
      :color="progressColor"
      :track-color="$q.dark.isActive ? 'grey-8' : 'grey-4'"
      rounded
      size="6px"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useQuasar } from "quasar";

import type { DownloadTransferStatus } from "@/types/fileTransfer";

const $q = useQuasar();

const props = defineProps<{
  fileName: string;
  progress: number;
  status: DownloadTransferStatus;
  errorMessage?: string;
}>();

const emit = defineEmits<{
  (e: "cancel"): void;
}>();

const canCancel = computed(
  () =>
    props.status === "initializing" ||
    props.status === "downloading" ||
    props.status === "completing",
);

const progressPercent = computed(() => Math.round(props.progress * 100));

const progressColor = computed(() => {
  if (props.status === "failed") return "negative";
  if (props.status === "completed") return "positive";
  if (props.status === "cancelled") return "warning";
  return "primary";
});

const statusLabel = computed(() => {
  switch (props.status) {
    case "initializing":
      return "Initialising…";
    case "downloading":
      return "Downloading…";
    case "completing":
      return "Verifying…";
    case "completed":
      return "Complete";
    case "failed":
      return props.errorMessage || "Download failed";
    case "cancelled":
      return "Stopped — click Download to resume";
    default:
      return "";
  }
});
</script>

<style scoped>
.download-progress-section {
  flex: 0 0 auto;
  padding: 10px 12px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  background: #fafafa;
  color: rgba(0, 0, 0, 0.87);
}

.download-progress-section--dark {
  border-color: rgba(255, 255, 255, 0.12);
  background: #1d1d1d;
  color: rgba(255, 255, 255, 0.87);
}

.download-progress-section--dark .download-progress-title,
.download-progress-section--dark .download-progress-file,
.download-progress-section--dark .download-progress-status,
.download-progress-section--dark .download-progress-pct {
  color: rgba(255, 255, 255, 0.87);
}

.download-progress-file {
  color: rgba(0, 0, 0, 0.6);
}

.download-progress-section--dark .download-progress-file {
  color: rgba(255, 255, 255, 0.6);
}

.download-progress-status {
  color: rgba(0, 0, 0, 0.6);
}

.download-progress-section--dark .download-progress-status {
  color: rgba(255, 255, 255, 0.55);
}
</style>
