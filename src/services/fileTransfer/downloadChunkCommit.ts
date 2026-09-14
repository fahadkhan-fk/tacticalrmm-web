export async function writeDownloadChunkThenAck(opts: {
  chunk: ArrayBuffer;
  writeChunk: (buf: ArrayBuffer) => Promise<void>;
  ack: () => Promise<void>;
  afterWrite?: () => void;
}): Promise<void> {
  await opts.writeChunk(opts.chunk);
  opts.afterWrite?.();
  await opts.ack();
}
