<template>
  <div
    class="row items-center justify-between file-toolbar"
    :class="{ 'file-toolbar--dark': $q.dark.isActive }"
  >
    <div class="row items-center q-gutter-sm">
      <q-btn
        dense
        unelevated
        no-caps
        color="primary"
        icon="upload"
        label="Upload"
        class="toolbar-btn toolbar-primary-btn"
        :disable="!hasUploadPath"
        @click="emit('upload')"
      />

      <q-btn
        dense
        unelevated
        icon="create_new_folder"
        label="New Folder"
        class="toolbar-btn"
        :disable="!hasUploadPath"
        @click="emit('new-folder')"
      />
      <q-btn
        dense
        unelevated
        icon="download"
        label="Download"
        class="toolbar-btn"
        :disable="selectedCount === 0"
        @click="emit('download')"
      />
      <q-btn
        dense
        unelevated
        icon="delete"
        label="Delete"
        class="toolbar-btn"
        :disable="selectedCount === 0"
        @click="emit('delete')"
      />
      <q-btn
        dense
        unelevated
        icon="edit"
        label="Rename"
        class="toolbar-btn"
        :disable="selectedCount !== 1"
        @click="emit('rename')"
      />

      <q-btn
        dense
        unelevated
        label="More"
        icon-right="expand_more"
        class="toolbar-btn"
      >
        <q-menu transition-show="jump-up" transition-hide="jump-down">
          <q-list dense class="file-context-menu" style="min-width: 180px">
            <q-item
              clickable
              v-close-popup
              :disable="selectedCount !== 1"
              @click="emit('properties')"
            >
              <q-item-section avatar>
                <q-icon name="info" size="18px" />
              </q-item-section>
              <q-item-section>Properties</q-item-section>
            </q-item>

            <q-item
              clickable
              v-close-popup
              :disable="selectedCount === 0"
              @click="emit('copy-path')"
            >
              <q-item-section avatar>
                <q-icon name="content_copy" size="18px" />
              </q-item-section>
              <q-item-section>Copy Path</q-item-section>
            </q-item>
          </q-list>
        </q-menu>
      </q-btn>
    </div>

    <div class="row items-center q-gutter-sm">
      <q-input
        :model-value="search"
        dense
        outlined
        clearable
        hide-bottom-space
        class="toolbar-search"
        placeholder="Filter by name in this folder"
        :dark="$q.dark.isActive"
        @update:model-value="onSearchUpdate"
      >
        <template #prepend>
          <q-icon name="search" size="18px" />
        </template>
      </q-input>

      <q-btn
        dense
        unelevated
        icon="refresh"
        class="toolbar-btn toolbar-icon-btn"
        @click="emit('refresh')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useQuasar } from "quasar";

const $q = useQuasar();

defineProps<{
  hasUploadPath: boolean;
  selectedCount: number;
  search: string;
}>();

const emit = defineEmits<{
  (e: "upload"): void;
  (e: "new-folder"): void;
  (e: "download"): void;
  (e: "delete"): void;
  (e: "rename"): void;
  (e: "properties"): void;
  (e: "copy-path"): void;
  (e: "refresh"): void;
  (e: "update:search", value: string): void;
}>();

function onSearchUpdate(val: string | number | null) {
  emit("update:search", String(val ?? ""));
}
</script>

<style scoped>
.file-toolbar {
  gap: 12px;
}

.file-toolbar :deep(.q-btn) {
  text-transform: none !important;
}

.file-toolbar :deep(.toolbar-btn),
.file-toolbar :deep(.toolbar-primary-btn) {
  height: 32px;
  min-height: 32px;
  max-height: 32px;
  border-radius: 6px;
  padding: 0 12px;
  font-size: 13px;
  font-weight: 400;
  line-height: 1.25;
}

.file-toolbar :deep(.toolbar-btn .q-btn__wrapper),
.file-toolbar :deep(.toolbar-primary-btn .q-btn__wrapper) {
  min-height: 32px;
  padding: 0 12px;
}

.file-toolbar :deep(.toolbar-btn .q-btn__content),
.file-toolbar :deep(.toolbar-primary-btn .q-btn__content) {
  font-size: 13px;
  line-height: 1.25;
}

.file-toolbar :deep(.toolbar-btn .q-icon),
.file-toolbar :deep(.toolbar-primary-btn .q-icon) {
  font-size: 18px;
}

.file-toolbar :deep(.toolbar-btn:not(.toolbar-primary-btn)) {
  background: #fff;
  border: 1px solid #d0d0d0;
  color: rgba(0, 0, 0, 0.87);
}

.file-toolbar :deep(.toolbar-primary-btn) {
  border: none;
}

.file-toolbar :deep(.toolbar-btn:not(.toolbar-primary-btn):hover) {
  background: #f0f0f0;
}

.file-toolbar :deep(.toolbar-btn.q-btn--disabled) {
  opacity: 0.45;
}

.file-toolbar :deep(.toolbar-primary-btn.q-btn--disabled) {
  opacity: 0.55;
}

.file-toolbar :deep(.toolbar-icon-btn) {
  width: 32px;
  min-width: 32px;
  padding: 0;
}

.file-toolbar :deep(.toolbar-icon-btn .q-btn__content) {
  padding: 0;
}

.file-toolbar :deep(.toolbar-search) {
  width: 260px;
}

.file-toolbar :deep(.toolbar-search .q-field__control) {
  min-height: 32px;
  height: 32px;
  border-radius: 6px;
  background: #fff;
  align-items: center;
}

.file-toolbar :deep(.toolbar-search .q-field__control:before) {
  border-color: #d0d0d0;
}

.file-toolbar :deep(.toolbar-search .q-field__prepend) {
  height: 32px;
  padding-right: 6px;
  align-self: center;
}

.file-toolbar :deep(.toolbar-search .q-field__prepend .q-icon) {
  font-size: 18px;
}

.file-toolbar :deep(.toolbar-search .q-field__native) {
  min-height: 32px;
  line-height: 32px;
  padding-top: 0;
  padding-bottom: 0;
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

.file-toolbar--dark :deep(.toolbar-btn:not(.toolbar-primary-btn)) {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.16);
  color: rgba(255, 255, 255, 0.9);
}

.file-toolbar--dark :deep(.toolbar-btn:not(.toolbar-primary-btn):hover) {
  background: rgba(255, 255, 255, 0.12);
}

.file-toolbar--dark :deep(.toolbar-btn.q-btn--disabled) {
  opacity: 0.38;
  color: rgba(255, 255, 255, 0.45);
}

.file-toolbar--dark :deep(.toolbar-search .q-field__control) {
  background: rgba(255, 255, 255, 0.06);
}

.file-toolbar--dark :deep(.toolbar-search .q-field__control:before) {
  border-color: rgba(255, 255, 255, 0.16);
}

.file-toolbar--dark :deep(.toolbar-search input) {
  color: rgba(255, 255, 255, 0.88);
}

.file-toolbar--dark :deep(.toolbar-search .q-field__native::placeholder) {
  color: rgba(255, 255, 255, 0.45);
}
</style>
