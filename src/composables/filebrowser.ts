import { computed, type MaybeRef, unref } from "vue";
import { uid } from "quasar";

import type { QTreeFileNode } from "../types/filebrowser";
import type { BreadcrumbSegment } from "../types/filebrowser";

function isWindowsPlatform(platform: string): boolean {
  return platform === "windows";
}

export function useFileBrowser(platform: MaybeRef<string> = "windows") {
  const isWindows = computed(() => isWindowsPlatform(unref(platform)));
  const pathSeparator = computed<"/" | "\\">(() =>
    isWindows.value ? "\\" : "/",
  );

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

  function getFile(path: string, separator?: "/" | "\\"): string {
    const sep = separator ?? pathSeparator.value;
    const file = path.split(sep).pop();
    return file ? file : "";
  }

  function getPath(path: string, separator?: "/" | "\\"): string {
    const sep = separator ?? pathSeparator.value;
    const pathArray = path.split(sep);
    pathArray.pop();
    return pathArray.join(sep);
  }

  function normalizePathSlashes(p: string): string {
    const trimmed = p.trim();
    if (isWindows.value) {
      return trimmed.replace(/\//g, "\\");
    }
    return trimmed.replace(/\\/g, "/");
  }

  function pathKeyForCompare(p: string): string {
    const s = normalizePathSlashes(p);
    if (isWindows.value) {
      const driveOnly = /^([A-Za-z]:)\\*$/.exec(s);
      if (driveOnly) return `${driveOnly[1].toLowerCase()}\\`;
      if (s.startsWith("\\\\")) {
        return s.replace(/\\+$/, "").toLowerCase();
      }
      return s.replace(/\\+$/, "").toLowerCase();
    }

    if (s === "/") return "/";
    return s.replace(/\/+$/, "").toLowerCase();
  }

  function pathsEqual(a: string, b: string): boolean {
    return pathKeyForCompare(a) === pathKeyForCompare(b);
  }

  function parseWindowsPathToBreadcrumbs(raw: string): BreadcrumbSegment[] {
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

  function parseUnixPathToBreadcrumbs(raw: string): BreadcrumbSegment[] {
    const normalized = normalizePathSlashes(raw);
    if (!normalized || normalized === "/") {
      return [{ label: "/", fullPath: "/" }];
    }

    const parts = normalized.split("/").filter(Boolean);
    return parts.map((label, i) => ({
      label,
      fullPath: "/" + parts.slice(0, i + 1).join("/"),
    }));
  }

  function parsePathToBreadcrumbs(raw: string): BreadcrumbSegment[] {
    if (isWindows.value) {
      return parseWindowsPathToBreadcrumbs(raw);
    }
    return parseUnixPathToBreadcrumbs(raw);
  }

  function joinRemotePathSegment(basePath: string, segment: string): string {
    const sep = pathSeparator.value;
    const base = basePath.replace(sep === "\\" ? /[\\/]+$/ : /[/\\]+$/, "");
    return `${base}${sep}${segment}`;
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
    if (isWindows.value) {
      const driveRoot = /^([A-Za-z]):\\*$/.exec(normalized);
      if (driveRoot) {
        normalized = `${driveRoot[1]}:\\`;
      } else if (normalized.startsWith("\\\\")) {
        normalized = normalized.replace(/\\+$/, "");
      }
      return normalized;
    }

    if (!normalized) return "/";
    if (normalized !== "/") {
      normalized = normalized.replace(/\/+$/, "");
    }
    return normalized || "/";
  }

  return {
    isWindows,
    pathSeparator,
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
