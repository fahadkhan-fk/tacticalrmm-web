<template>
  <div
    class="row items-center q-mb-sm file-path-row"
    :class="{ 'file-path-row--dark': $q.dark.isActive }"
  >
    <q-btn
      dense
      flat
      icon="arrow_back"
      class="nav-btn"
      :disable="!canGoBack"
      @click="emit('back')"
    />

    <q-btn
      dense
      flat
      icon="arrow_forward"
      disable
      class="nav-btn nav-btn--forward"
    />

    <div class="text-body2 folder-path path-bar row no-wrap min-width-0">
      <q-icon
        name="far fa-folder-open"
        class="q-mr-sm text-blue-5 crumb-folder-icon self-center"
        size="18px"
        @click.stop="onFolderPathIconClick"
      />

      <div
        v-if="!pathEditMode"
        class="row items-center col crumb-path-hitbox min-width-0"
        @click="onPathBarClick"
      >
        <div class="row items-center col crumb-bar no-wrap min-width-0">
          <div class="row items-center col crumb-scroll min-width-0">
            <template
              v-for="(seg, idx) in breadcrumbSegments"
              :key="`${idx}-${seg.fullPath}`"
            >
              <span v-if="idx > 0" class="crumb-separator" aria-hidden="true"
                >&gt;</span
              >
              <q-btn
                dense
                flat
                no-caps
                class="crumb-btn"
                :class="{
                  'crumb-btn--current': isCurrentBreadcrumbSegment(seg),
                }"
                :disable="isCurrentBreadcrumbSegment(seg)"
                @click.stop="onBreadcrumbSegmentClick(seg)"
              >
                {{ seg.label }}
              </q-btn>
            </template>
            <span
              v-if="breadcrumbSegments.length === 0 && currentPath.trim()"
              class="ellipsis col crumb-fallback-path"
              >{{ currentPath }}</span
            >
          </div>
        </div>
      </div>

      <q-input
        v-else
        ref="pathEditInputRef"
        v-model="pathInput"
        dense
        class="col path-edit-input min-width-0"
        borderless
        @keyup.enter="submitPathEdit"
        @keyup.esc="cancelPathEdit"
        @blur="onPathEditBlur"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { QInput, useQuasar } from "quasar";

const $q = useQuasar();

import { useFileBrowser } from "@/composables/filebrowser";
import type { BreadcrumbSegment } from "@/types/filebrowser";

const props = defineProps<{
  currentPath: string;
  canGoBack: boolean;
}>();

const emit = defineEmits<{
  (e: "navigate", path: string): void;
  (e: "back"): void;
}>();

const { parsePathToBreadcrumbs, pathsEqual, normalizePathSlashes } =
  useFileBrowser();

const pathEditMode = ref(false);
const pathInput = ref(props.currentPath);
const pathEditInputRef = ref<InstanceType<typeof QInput> | null>(null);

const breadcrumbSegments = computed(() =>
  parsePathToBreadcrumbs(props.currentPath),
);

function isCurrentBreadcrumbSegment(seg: BreadcrumbSegment): boolean {
  return pathsEqual(seg.fullPath, props.currentPath);
}

function onBreadcrumbSegmentClick(seg: BreadcrumbSegment) {
  if (isCurrentBreadcrumbSegment(seg)) return;
  emit("navigate", seg.fullPath);
}

function onPathBarClick(ev: MouseEvent) {
  const el = ev.target as HTMLElement | null;
  if (el?.closest?.(".crumb-btn")) return;
  enterPathEditMode();
}

function onFolderPathIconClick() {
  if (!pathEditMode.value) enterPathEditMode();
}

function enterPathEditMode() {
  pathEditMode.value = true;
  pathInput.value = props.currentPath;
  nextTick(() => {
    const inp = pathEditInputRef.value;
    if (!inp) return;
    inp.focus();
    const root = inp.$el as HTMLElement | undefined;
    const native = root?.querySelector("input");
    if (native instanceof HTMLInputElement) native.select();
  });
}

function cancelPathEdit() {
  pathInput.value = props.currentPath;
  pathEditMode.value = false;
}

function onPathEditBlur() {
  window.setTimeout(() => {
    if (pathEditMode.value) cancelPathEdit();
  }, 0);
}

function submitPathEdit() {
  const nextPath = normalizePathSlashes(pathInput.value);
  if (!nextPath) {
    cancelPathEdit();
    return;
  }
  if (pathsEqual(nextPath, props.currentPath)) {
    pathInput.value = props.currentPath;
    pathEditMode.value = false;
    return;
  }
  emit("navigate", nextPath);
  pathEditMode.value = false;
}
</script>

<style scoped>
.folder-path.path-bar {
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: stretch;
  flex: 1;
  max-width: 720px;
  height: 40px;
  min-height: 40px;
  box-sizing: border-box;
  border: 1px solid #ccc;
  background: transparent;
  padding: 0 6px;
  border-radius: 8px;
  margin-bottom: 0;
  min-width: 0;
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: rgba(0, 0, 0, 0.75);
}

.min-width-0 {
  min-width: 0;
}

.crumb-folder-icon {
  flex-shrink: 0;
}

.crumb-path-hitbox {
  cursor: default;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}

.crumb-btn:not(:disabled) {
  cursor: pointer;
}

.crumb-bar {
  gap: 0;
}

.crumb-scroll {
  overflow-x: auto;
  overflow-y: hidden;
  flex: 1 1 auto;
  scrollbar-width: thin;
}

.crumb-separator {
  flex-shrink: 0;
  font-size: 0.75rem;
  line-height: 1.25rem;
  user-select: none;
  padding: 0 2px;
  margin: 0 2px;
  align-self: center;
  color: rgba(0, 0, 0, 0.45);
}

.crumb-btn {
  flex-shrink: 0;
  font-weight: 500;
  min-height: 0;
  min-width: unset;
  border-radius: 6px;
}

.crumb-btn :deep(.q-btn__wrapper) {
  padding: 0 3px;
  min-height: 0;
}

.crumb-btn :deep(.q-btn__content) {
  font-size: inherit;
  line-height: inherit;
}

.crumb-btn--current,
.crumb-btn:disabled {
  opacity: 1;
}

.crumb-fallback-path {
  padding-left: 4px;
  color: rgba(0, 0, 0, 0.65);
}

.path-edit-input {
  display: flex;
  align-items: stretch;
}

.path-edit-input :deep(.q-field) {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
}

.path-edit-input :deep(.q-field__inner) {
  height: 100%;
}

.path-edit-input :deep(.q-field__control) {
  height: 100%;
  min-height: 0 !important;
  align-items: center;
}

.path-edit-input :deep(input) {
  font-size: inherit;
  line-height: inherit;
  padding: 0;
}

.file-path-row {
  gap: 0;
}

.file-path-row :deep(.nav-btn) {
  width: 42px;
  height: 40px;
  border: 1px solid #ccc;
  border-radius: 0;
  background: transparent;
  color: rgba(0, 0, 0, 0.7);
}

.file-path-row :deep(.nav-btn:first-of-type) {
  border-radius: 8px 0 0 8px;
}

.file-path-row :deep(.nav-btn--forward) {
  border-radius: 0 8px 8px 0;
  margin-right: 12px;
}

.file-path-row :deep(.nav-btn.q-btn--disabled) {
  opacity: 0.4;
}

.file-path-row--dark .folder-path.path-bar {
  background: transparent;
  border-color: rgba(255, 255, 255, 0.16);
  color: rgba(255, 255, 255, 0.78);
}

.file-path-row--dark .crumb-separator {
  color: rgba(255, 255, 255, 0.45);
}

.file-path-row--dark .crumb-btn :deep(.q-btn__content) {
  color: rgba(255, 255, 255, 0.88);
}

.file-path-row--dark .crumb-btn--current :deep(.q-btn__content) {
  color: #fff;
  font-weight: 600;
}

.file-path-row--dark .crumb-fallback-path {
  color: rgba(255, 255, 255, 0.78);
}

.file-path-row--dark :deep(.nav-btn) {
  background: transparent;
  border-color: rgba(255, 255, 255, 0.16);
  color: rgba(255, 255, 255, 0.75);
}
</style>
