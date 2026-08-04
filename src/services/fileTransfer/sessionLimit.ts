import { AxiosError } from "axios";

import {
  FILE_TRANSFER_SLOT_RETRY_BASE_MS,
  FILE_TRANSFER_SLOT_RETRY_MAX_MS,
  TRANSFER_SLOT_WAIT_MESSAGE,
} from "@/constants/fileTransfer";

export { TRANSFER_SLOT_WAIT_MESSAGE };

export interface TransferSlotWaitInfo {
  attempt: number;
  delayMs: number;
}

export interface WithTransferSessionRetryOptions {
  signal?: AbortSignal;
  onWaitingForSlot?: (info: TransferSlotWaitInfo) => void;
}

export function isTransferSessionLimitError(err: unknown): boolean {
  if (!(err instanceof AxiosError)) return false;
  if (err.response?.status !== 429) return false;

  const data = err.response.data;
  if (typeof data === "string" && /too many concurrent/i.test(data)) {
    return true;
  }
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    for (const key of ["detail", "message", "error"]) {
      const value = record[key];
      if (typeof value === "string" && /too many concurrent/i.test(value)) {
        return true;
      }
    }
  }
  return true;
}

export function transferSlotRetryDelayMs(attempt: number): number {
  const n = Math.max(1, Math.floor(attempt));
  const delay = FILE_TRANSFER_SLOT_RETRY_BASE_MS * 2 ** (n - 1);
  return Math.min(FILE_TRANSFER_SLOT_RETRY_MAX_MS, delay);
}

function abortError(): DOMException {
  return new DOMException("Transfer aborted", "AbortError");
}

export function sleepAbortable(
  ms: number,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function withTransferSessionRetry<T>(
  operation: () => Promise<T>,
  options: WithTransferSessionRetryOptions = {},
): Promise<T> {
  const { signal, onWaitingForSlot } = options;
  let attempt = 0;

  for (;;) {
    if (signal?.aborted) {
      throw abortError();
    }
    try {
      return await operation();
    } catch (err) {
      if (!isTransferSessionLimitError(err)) {
        throw err;
      }
      if (signal?.aborted) {
        throw abortError();
      }
      attempt += 1;
      const delayMs = transferSlotRetryDelayMs(attempt);
      onWaitingForSlot?.({ attempt, delayMs });
      await sleepAbortable(delayMs, signal);
    }
  }
}
