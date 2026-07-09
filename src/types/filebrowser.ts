// type imports
import { type QTreeNode } from "quasar";

export interface LazyLoadCallbackParams {
  path: string;
  isDone(nodes: QTreeFileNode[]): void;
  isFail(): void;
}

export interface FileSystemNodeTable {
  id: string;
  name: string;
  path: string;
  type: "folder" | "file";
  asset_id?: string;
  size?: string;
}

export interface QTreeFileNode extends QTreeNode<unknown> {
  id: string;
  path: string;
  type: "folder" | "file";
  size?: string;
  asset_id?: string;
  children?: QTreeFileNode[];
}

export type FileBrowserItemType = "folder" | "file";

export interface FileBrowserItem {
  id: string;
  name: string;
  path: string;
  type: FileBrowserItemType;
  extension?: string;
  size?: string;
  modified?: string;
  created?: string;
  accessed?: string;
  hidden?: boolean;
  system?: boolean;
  readonly?: boolean;
}

export interface FileBrowserApiItem {
  id: string;
  name: string;
  path: string;
  type: FileBrowserItemType;
  extension?: string;
  size: string;
  modified: string;
  created: string;
  accessed: string;
  hidden?: boolean;
  system?: boolean;
  readonly?: boolean;
}

export interface FileBrowserDirectoryResponse {
  path: string;
  items: FileBrowserApiItem[];
  has_more: boolean;
  page: number;
  page_size: number;
  total: number;
}

export interface FileBrowserMutationResponse {
  status: "success";
  item: FileBrowserApiItem;
}

export interface FileBrowserDeleteResult {
  path: string;
  success: boolean;
  error?: string;
}

export interface FileBrowserDeleteResponse {
  status: "success";
  results: FileBrowserDeleteResult[];
}

export interface BreadcrumbSegment {
  label: string;
  fullPath: string;
}

export type UploadQueueStatus =
  | "queued"
  | "uploading"
  | "completed"
  | "failed"
  | "cancelled";

export interface UploadQueueItem {
  id: string;
  file: File;
  name: string;
  sizeLabel: string;
  sizeBytes: number;
  destinationPath: string;
  status: UploadQueueStatus;
  progress: number;
  acceptedOffset?: number;
  committedOffset?: number;
  errorMessage?: string;
}
