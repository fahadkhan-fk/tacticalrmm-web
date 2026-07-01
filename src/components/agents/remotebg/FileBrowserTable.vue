<template>
  <div
    class="col relative-position file-table-wrap"
    :class="{ 'file-table-wrap--dark': $q.dark.isActive }"
  >
    <q-table
      flat
      dense
      virtual-scroll
      row-key="id"
      class="remote-bg-tbl-sticky file-browser-table file-browser-table--fill"
      :table-class="{
        'table-bgcolor': !$q.dark.isActive,
        'table-bgcolor-dark': $q.dark.isActive,
      }"
      :rows="rows"
      :columns="columns"
      :loading="loading"
      v-model:pagination="tablePagination"
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
      class="drop-overlay column items-center justify-center"
    >
      <q-icon name="cloud_upload" size="52px" color="primary" />
      <div class="text-h6 q-mt-sm">Drop files to upload</div>
      <div class="text-caption text-grey-7">
        Files will be uploaded to {{ currentPath }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, useModel } from "vue";
import { useQuasar } from "quasar";

import { fileBrowserTableColumns } from "@/constants/filebrowser";
import type { FileBrowserItem } from "@/types/filebrowser";

const $q = useQuasar();

const props = defineProps<{
  rows: FileBrowserItem[];
  loading: boolean;
  noDataLabel: string;
  emptyIsError?: boolean;
  showDropOverlay: boolean;
  currentPath: string;
  selected?: FileBrowserItem[];
}>();

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
}>();

const selected = useModel(props, "selected");

const columns = fileBrowserTableColumns;

const tablePagination = ref({
  page: 1,
  rowsPerPage: 0,
  sortBy: "name",
  descending: false,
});
</script>

<style scoped>
.file-table-wrap {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  height: 0;
  overflow: hidden;
}

.file-table-wrap :deep(.file-browser-table--fill) {
  flex: 1 1 auto;
  min-height: 0;
  height: 100% !important;
  max-height: 100% !important;
  display: flex;
  flex-direction: column;
}

.file-table-wrap :deep(.file-browser-table--fill .q-table__middle) {
  flex: 1 1 auto;
  min-height: 0;
}

.file-table-wrap :deep(.file-browser-table--fill .q-table__bottom) {
  flex: 0 0 auto;
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

.drop-overlay {
  position: absolute;
  inset: 10px;
  border: 2px dashed var(--q-primary);
  border-radius: 8px;
  z-index: 10;
  pointer-events: none;
}

.ellipsis {
  max-width: 420px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
