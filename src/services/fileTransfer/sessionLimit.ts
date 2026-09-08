import { AxiosError } from "axios";

import {
  FILE_TRANSFER_SLOT_RETRY_BASE_MS,
  FILE_TRANSFER_SLOT_RETRY_MAX_MS,
  FILE_TRANSFER_TRANSIENT_RETRY_ATTEMPTS,
  FILE_TRANSFER_TRANSIENT_RETRY_BASE_MS,
  FILE_TRANSFER_TRANSIENT_RETRY_HARD_CAP,
  FILE_TRANSFER_TRANSIENT_RETRY_MAX_DURATION_MS,
  FILE_TRANSFER_TRANSIENT_RETRY_MAX_MS,
} from "@/constants/fileTransfer";
import { getAxiosErrorDetail } from "@/utils/apiError";

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

  const detail = getAxiosErrorDetail(err);
  if (detail && /too many concurrent/i.test(detail)) {
    return true;
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

export class RetryableTransferError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryableTransferError";
  }
}

function isAbortLikeError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (err instanceof AxiosError) {
    return err.code === "ERR_CANCELED" || err.name === "CanceledError";
  }
  return false;
}

const TRANSIENT_NETWORK_MESSAGE =
  /network error|failed to fetch|err_internet_disconnected|err_network_changed|load failed/i;

export function isRetryableTransferError(err: unknown): boolean {
  if (isAbortLikeError(err)) return false;
  if (err instanceof RetryableTransferError) return true;

  const detail = getAxiosErrorDetail(err);
  if (detail && /timed out waiting for agent to /i.test(detail)) {
    return true;
  }

  const message = err instanceof Error ? err.message : String(err ?? "");
  if (TRANSIENT_NETWORK_MESSAGE.test(message)) {
    return true;
  }

  if (err instanceof AxiosError) {
    if (
      err.code === "ERR_NETWORK" ||
      err.code === "ECONNABORTED" ||
      err.code === "ETIMEDOUT"
    ) {
      return true;
    }
    const status = err.response?.status;
    if (typeof status === "number") {
      if (status >= 500 && status < 600) return true;
      if (status === 408 || status === 425) return true;
    }
    return false;
  }
  return false;
}

export interface TransientRetryInfo {
  attempt: number;
  delayMs: number;
  error: unknown;
}

export interface WithTransientRetryOptions {
  signal?: AbortSignal;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  maxDurationMs?: number;
  isRetryable?: (err: unknown) => boolean;
  onRetry?: (info: TransientRetryInfo) => void;
}

export async function withTransientRetry<T>(
  operation: () => Promise<T>,
  options: WithTransientRetryOptions = {},
): Promise<T> {
  const {
    signal,
    maxAttempts = FILE_TRANSFER_TRANSIENT_RETRY_ATTEMPTS,
    baseDelayMs = FILE_TRANSFER_TRANSIENT_RETRY_BASE_MS,
    maxDelayMs = FILE_TRANSFER_TRANSIENT_RETRY_MAX_MS,
    maxDurationMs = FILE_TRANSFER_TRANSIENT_RETRY_MAX_DURATION_MS,
    isRetryable = isRetryableTransferError,
    onRetry,
  } = options;
  let attempt = 0;
  let firstFailureAt: number | null = null;

  for (;;) {
    if (signal?.aborted) {
      throw abortError();
    }
    try {
      return await operation();
    } catch (err) {
      attempt += 1;
      if (!isRetryable(err)) {
        throw err;
      }
      if (firstFailureAt === null) {
        firstFailureAt = Date.now();
      }
      const retryWindowExpired = Date.now() - firstFailureAt >= maxDurationMs;
      if (
        attempt >= FILE_TRANSFER_TRANSIENT_RETRY_HARD_CAP ||
        (attempt >= maxAttempts && retryWindowExpired)
      ) {
        throw err;
      }
      if (signal?.aborted) {
        throw abortError();
      }

      const capped = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const delayMs = Math.round(capped / 2 + Math.random() * (capped / 2));
      onRetry?.({ attempt, delayMs, error: err });
      await sleepAbortable(delayMs, signal);
    }
  }
}
