import {
  FILE_TRANSFER_TAB_SYNC_CHANNEL,
  FILE_TRANSFER_TAB_SYNC_HEARTBEAT_MS,
  FILE_TRANSFER_TAB_SYNC_STALE_MS,
} from "@/constants/fileTransfer";

export type TransferReleaseReason =
  | "pause"
  | "cancel"
  | "complete"
  | "fail"
  | "unmount";

export type TransferTabSyncEvent =
  | { type: "remote_claim"; key: string; tabId: string }
  | {
      type: "remote_release";
      key: string;
      tabId: string;
      reason: TransferReleaseReason;
    }
  | { type: "remote_change" };

type TabSyncMessage =
  | { type: "claim"; key: string; tabId: string; ts: number }
  | { type: "heartbeat"; key: string; tabId: string; ts: number }
  | {
      type: "release";
      key: string;
      tabId: string;
      reason: TransferReleaseReason;
      ts: number;
    }
  | { type: "query"; tabId: string; ts: number }
  | { type: "announce"; key: string; tabId: string; ts: number };

interface RemoteClaim {
  tabId: string;
  expiresAt: number;
}

export interface TransferTabSync {
  readonly tabId: string;
  tryClaim(key: string): boolean;
  rekeyClaim(oldKey: string, newKey: string): boolean;
  release(key: string, reason: TransferReleaseReason): void;
  releaseAll(reason?: TransferReleaseReason): void;
  isRemotelyOwned(key: string): boolean;
  query(): void;
  close(): void;
}

export function transferClaimKey(
  agentId: string,
  opts: { sessionId?: string | null; queueId: string },
): string {
  if (opts.sessionId) {
    return `${agentId}:${opts.sessionId}`;
  }
  return `${agentId}:local:${opts.queueId}`;
}

function newTabId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createTransferTabSync(
  onEvent?: (event: TransferTabSyncEvent) => void,
): TransferTabSync {
  const tabId = newTabId();
  const localClaims = new Set<string>();
  const remoteClaims = new Map<string, RemoteClaim>();
  let closed = false;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  const channel: BroadcastChannel | null =
    typeof BroadcastChannel !== "undefined"
      ? new BroadcastChannel(FILE_TRANSFER_TAB_SYNC_CHANNEL)
      : null;

  function emit(event: TransferTabSyncEvent): void {
    onEvent?.(event);
  }

  function pruneRemote(): void {
    const now = Date.now();
    let changed = false;
    for (const [key, claim] of remoteClaims) {
      if (claim.expiresAt <= now) {
        remoteClaims.delete(key);
        changed = true;
      }
    }
    if (changed) {
      emit({ type: "remote_change" });
    }
  }

  function post(msg: TabSyncMessage): void {
    if (!channel || closed) return;
    try {
      channel.postMessage(msg);
    } catch {
      // Channel may be closed concurrently.
    }
  }

  function ensureHeartbeat(): void {
    if (heartbeatTimer || !channel || closed) return;
    heartbeatTimer = setInterval(() => {
      if (closed || localClaims.size === 0) {
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
        return;
      }
      const ts = Date.now();
      for (const key of localClaims) {
        post({ type: "heartbeat", key, tabId, ts });
      }
    }, FILE_TRANSFER_TAB_SYNC_HEARTBEAT_MS);
  }

  function stopHeartbeatIfIdle(): void {
    if (localClaims.size > 0 || !heartbeatTimer) return;
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  function setRemoteClaim(key: string, ownerTabId: string, ts: number): void {
    if (ownerTabId === tabId) return;
    const prev = remoteClaims.get(key);
    remoteClaims.set(key, {
      tabId: ownerTabId,
      expiresAt: ts + FILE_TRANSFER_TAB_SYNC_STALE_MS,
    });
    if (!prev || prev.tabId !== ownerTabId) {
      emit({ type: "remote_claim", key, tabId: ownerTabId });
      emit({ type: "remote_change" });
    }
  }

  function clearRemoteClaim(
    key: string,
    ownerTabId: string,
    reason: TransferReleaseReason,
  ): void {
    const prev = remoteClaims.get(key);
    if (!prev) return;
    if (prev.tabId !== ownerTabId) return;
    remoteClaims.delete(key);
    emit({ type: "remote_release", key, tabId: ownerTabId, reason });
    emit({ type: "remote_change" });
  }

  function onMessage(event: MessageEvent<TabSyncMessage>): void {
    if (closed) return;
    const msg = event.data;
    if (!msg || typeof msg !== "object" || !("type" in msg)) return;
    if ("tabId" in msg && msg.tabId === tabId) return;

    switch (msg.type) {
      case "claim":
      case "heartbeat":
      case "announce":
        if (localClaims.has(msg.key)) {
          post({ type: "announce", key: msg.key, tabId, ts: Date.now() });
          break;
        }
        setRemoteClaim(msg.key, msg.tabId, msg.ts || Date.now());
        break;
      case "release":
        if (msg.reason === "cancel") {
          // Any tab may cancel a server session; notify so the owner aborts.
          remoteClaims.delete(msg.key);
          emit({
            type: "remote_release",
            key: msg.key,
            tabId: msg.tabId,
            reason: msg.reason,
          });
          emit({ type: "remote_change" });
        } else {
          clearRemoteClaim(msg.key, msg.tabId, msg.reason);
        }
        break;
      case "query": {
        const ts = Date.now();
        for (const key of localClaims) {
          post({ type: "announce", key, tabId, ts });
        }
        break;
      }
      default:
        break;
    }
  }

  if (channel) {
    channel.onmessage = onMessage;
  }

  function isRemotelyOwned(key: string): boolean {
    pruneRemote();
    const remote = remoteClaims.get(key);
    return !!remote && remote.expiresAt > Date.now();
  }

  function tryClaim(key: string): boolean {
    if (!channel) {
      localClaims.add(key);
      return true;
    }
    pruneRemote();
    if (isRemotelyOwned(key) && !localClaims.has(key)) {
      return false;
    }
    localClaims.add(key);
    remoteClaims.delete(key);
    post({ type: "claim", key, tabId, ts: Date.now() });
    ensureHeartbeat();
    return true;
  }

  function rekeyClaim(oldKey: string, newKey: string): boolean {
    if (oldKey === newKey) {
      return localClaims.has(newKey) || tryClaim(newKey);
    }
    if (!localClaims.has(oldKey)) {
      return tryClaim(newKey);
    }
    if (!channel) {
      localClaims.delete(oldKey);
      localClaims.add(newKey);
      return true;
    }
    pruneRemote();
    if (isRemotelyOwned(newKey) && !localClaims.has(newKey)) {
      return false;
    }
    localClaims.delete(oldKey);
    localClaims.add(newKey);
    remoteClaims.delete(newKey);
    const ts = Date.now();
    post({ type: "release", key: oldKey, tabId, reason: "pause", ts });
    post({ type: "claim", key: newKey, tabId, ts });
    ensureHeartbeat();
    return true;
  }

  function release(key: string, reason: TransferReleaseReason): void {
    const wasLocal = localClaims.delete(key);
    stopHeartbeatIfIdle();
    if (wasLocal || reason === "cancel") {
      post({ type: "release", key, tabId, reason, ts: Date.now() });
    }
  }

  function releaseAll(reason: TransferReleaseReason = "unmount"): void {
    const keys = [...localClaims];
    localClaims.clear();
    stopHeartbeatIfIdle();
    const ts = Date.now();
    for (const key of keys) {
      post({ type: "release", key, tabId, reason, ts });
    }
  }

  function query(): void {
    if (!channel) return;
    post({ type: "query", tabId, ts: Date.now() });
  }

  function close(): void {
    if (closed) return;
    closed = true;
    releaseAll("unmount");
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (channel) {
      channel.onmessage = null;
      try {
        channel.close();
      } catch {
        // ignore
      }
    }
  }

  return {
    tabId,
    tryClaim,
    rekeyClaim,
    release,
    releaseAll,
    isRemotelyOwned,
    query,
    close,
  };
}
