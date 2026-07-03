<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="(val) => emit('update:modelValue', val)"
  >
    <q-card style="min-width: 420px">
      <q-card-section>
        <div class="text-h6">Properties</div>
        <div v-if="item?.name" class="text-caption text-grey-7 q-mt-xs">
          {{ item.name }}
        </div>
      </q-card-section>

      <q-separator />

      <q-card-section v-if="loading" class="row justify-center q-pa-lg">
        <q-spinner color="primary" size="32px" />
      </q-card-section>

      <q-card-section v-else-if="error" class="text-negative">
        {{ error }}
      </q-card-section>

      <q-card-section v-else-if="item" class="q-gutter-sm">
        <div><strong>Name:</strong> {{ item.name }}</div>
        <div><strong>Path:</strong> {{ item.path }}</div>
        <div><strong>Type:</strong> {{ item.type }}</div>
        <div><strong>Size:</strong> {{ item.size || "—" }}</div>
        <div><strong>Modified:</strong> {{ item.modified || "—" }}</div>
        <div><strong>Created:</strong> {{ item.created || "—" }}</div>
        <div><strong>Accessed:</strong> {{ item.accessed || "—" }}</div>
        <div><strong>Hidden:</strong> {{ formatBool(item.hidden) }}</div>
        <div><strong>System:</strong> {{ formatBool(item.system) }}</div>
        <div><strong>Read-only:</strong> {{ formatBool(item.readonly) }}</div>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat label="Close" color="primary" v-close-popup />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import type { FileBrowserItem } from "@/types/filebrowser";

defineProps<{
  modelValue: boolean;
  item: FileBrowserItem | null;
  loading?: boolean;
  error?: string | null;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
}>();

function formatBool(value: boolean | undefined): string {
  if (value === undefined) return "—";
  return value ? "Yes" : "No";
}
</script>
