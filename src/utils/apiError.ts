import { AxiosError } from "axios";

const DEFAULT_DETAIL_KEYS = ["detail", "message", "error"] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer) &&
    !(typeof Blob !== "undefined" && value instanceof Blob)
  );
}

function firstStringFromUnknown(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry === "string" && entry.trim()) {
        return entry.trim();
      }
      if (isPlainObject(entry)) {
        for (const nested of Object.values(entry)) {
          if (typeof nested === "string" && nested.trim()) {
            return nested.trim();
          }
        }
      }
    }
  }
  return undefined;
}

export function getAxiosErrorDetail(
  err: unknown,
  options?: { keys?: readonly string[] },
): string | undefined {
  const keys = options?.keys ?? DEFAULT_DETAIL_KEYS;

  if (err instanceof AxiosError) {
    const data = err.response?.data;

    if (typeof data === "string" && data.trim()) {
      return data.trim();
    }

    if (isPlainObject(data)) {
      for (const key of keys) {
        const found = firstStringFromUnknown(data[key]);
        if (found) return found;
      }
    }

    if (
      err.message &&
      err.message.trim() &&
      !/^Request failed with status code \d+$/i.test(err.message)
    ) {
      return err.message.trim();
    }

    return undefined;
  }

  if (err instanceof Error && err.message.trim()) {
    return err.message.trim();
  }
  if (typeof err === "string" && err.trim()) {
    return err.trim();
  }
  return undefined;
}

export function getAxiosErrorMessage(
  err: unknown,
  fallback: string,
  options?: { keys?: readonly string[] },
): string {
  return getAxiosErrorDetail(err, options) ?? fallback;
}
