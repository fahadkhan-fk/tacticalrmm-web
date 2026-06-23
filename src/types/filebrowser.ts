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
}

export interface BreadcrumbSegment {
  label: string;
  fullPath: string;
}

export type UploadQueueStatus = "ready" | "mock_uploaded";

export interface UploadQueueItem {
  id: string;
  file: File;
  name: string;
  sizeLabel: string;
  destinationPath: string;
  status: UploadQueueStatus;
  /** 0–1 progress; mock uses a quick ramp then full */
  progress: number;
}
