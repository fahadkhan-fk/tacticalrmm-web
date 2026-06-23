import { uid } from "quasar";

import type { QTreeFileNode } from "../types/filebrowser";
import type { BreadcrumbSegment } from "../types/filebrowser";

export function useFileBrowser() {
  function createFileNode(
    name: string,
    path: string,
    size = "0",
    asset_id?: string,
  ): QTreeFileNode {
    return {
      id: uid(),
      label: name,
      path: path,
      type: "file",
      icon: "description",
      asset_id: asset_id,
      size: `${size}b`,
    };
  }

  function createFolderNode(
    name: string,
    path: string,
    icon = "folder",
    color = "yellow-9",
  ): QTreeFileNode {
    return {
      id: uid(),
      label: name,
      path: path,
      type: "folder",
      icon: icon,
      iconColor: color,
      selectable: true,
      lazy: true,
    };
  }

  function getFile(path: string, separator: "/" | "\\" = "/"): string {
    const file = path.split(separator).pop();
    return file ? file : "";
  }

  function getPath(path: string, separator: "/" | "\\" = "/"): string {
    const pathArray = path.split(separator);
    pathArray.pop();
    return pathArray.join(separator);
  }

  function normalizePathSlashes(p: string): string {
    return p.trim().replace(/\//g, "\\");
  }

  function pathKeyForCompare(p: string): string {
    const s = normalizePathSlashes(p);
    const driveOnly = /^([A-Za-z]:)\\*$/.exec(s);
    if (driveOnly) return `${driveOnly[1].toLowerCase()}\\`;
    if (s.startsWith("\\\\")) {
      return s.replace(/\\+$/, "").toLowerCase();
    }
    return s.replace(/\\+$/, "").toLowerCase();
  }

  function pathsEqual(a: string, b: string): boolean {
    return pathKeyForCompare(a) === pathKeyForCompare(b);
  }

  function parsePathToBreadcrumbs(raw: string): BreadcrumbSegment[] {
    const normalized = normalizePathSlashes(raw);
    if (!normalized) return [];

    if (normalized.startsWith("\\\\")) {
      const noTrail = normalized.replace(/\\+$/, "");
      const inner = noTrail.slice(2).split("\\").filter(Boolean);
      if (inner.length === 0) {
        return [{ label: "\\\\", fullPath: "\\\\" }];
      }
      return inner.map((label, i) => ({
        label,
        fullPath: "\\\\" + inner.slice(0, i + 1).join("\\"),
      }));
    }

    const parts = normalized.split("\\").filter(Boolean);
    if (parts.length === 0) return [];

    const first = parts[0];
    if (/^[A-Za-z]:$/.test(first)) {
      const out: BreadcrumbSegment[] = [
        { label: first, fullPath: `${first}\\` },
      ];
      for (let i = 1; i < parts.length; i++) {
        const fullPath = `${first}\\${parts.slice(1, i + 1).join("\\")}`;
        out.push({ label: parts[i], fullPath });
      }
      return out;
    }

    return parts.map((label, i) => ({
      label,
      fullPath: parts.slice(0, i + 1).join("\\"),
    }));
  }

  function joinRemotePathSegment(basePath: string, segment: string): string {
    return `${basePath.replace(/\\+$/, "")}\\${segment}`;
  }

  function getParentRemotePath(fullPath: string): string {
    const trimmed = fullPath.trim().replace(/[/\\]+$/, "");
    const lastBack = trimmed.lastIndexOf("\\");
    const lastFwd = trimmed.lastIndexOf("/");
    const lastSep = Math.max(lastBack, lastFwd);
    if (lastSep <= 0) return trimmed;
    return trimmed.slice(0, lastSep);
  }

  function replacePathLastSegment(
    fullPath: string,
    newLastSegment: string,
  ): string {
    return joinRemotePathSegment(getParentRemotePath(fullPath), newLastSegment);
  }

  function normalizeNavPath(path: string): string {
    let normalized = normalizePathSlashes(path);
    const driveRoot = /^([A-Za-z]):\\*$/.exec(normalized);
    if (driveRoot) {
      normalized = `${driveRoot[1]}:\\`;
    } else if (normalized.startsWith("\\\\")) {
      normalized = normalized.replace(/\\+$/, "");
    }
    return normalized;
  }

  return {
    createFolderNode,
    createFileNode,
    getFile,
    getPath,
    normalizePathSlashes,
    pathKeyForCompare,
    pathsEqual,
    parsePathToBreadcrumbs,
    joinRemotePathSegment,
    getParentRemotePath,
    replacePathLastSegment,
    normalizeNavPath,
  };
}
