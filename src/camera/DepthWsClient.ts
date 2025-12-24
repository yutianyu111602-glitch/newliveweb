export type DepthWsStatus = {
  state: "idle" | "connecting" | "open" | "closed" | "error";
  url: string;
  framesReceived: number;
  lastError?: string;
};

export type DepthWsClientOptions = {
  url: string;
  onFrame: (frame: ImageBitmap) => void;
  onStatus?: (status: DepthWsStatus) => void;
  reconnect?: {
    enabled: boolean;
    minDelayMs: number;
    maxDelayMs: number;
  };
};

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export class DepthWsClient {
  private ws: WebSocket | null = null;
  private status: DepthWsStatus;
  private reconnectDelayMs: number;
  private reconnectTimer: number | null = null;

  // Backpressure: decode at most one frame at a time; keep latest pending payload.
  private decoding = false;
  private pendingData: unknown | null = null;
  // Session increments on (re)connect/close to drop stale frames.
  private session = 0;

  constructor(private opts: DepthWsClientOptions) {
    this.status = {
      state: "idle",
      url: opts.url,
      framesReceived: 0,
    };

    const minDelay = opts.reconnect?.minDelayMs ?? 250;
    this.reconnectDelayMs = clampInt(minDelay, 100, 5000);
  }

  getStatus(): DepthWsStatus {
    return { ...this.status };
  }

  connect() {
    this.clearReconnectTimer();
    this.close();

    // New websocket session; drop any in-flight frames from prior connections.
    this.session++;

    this.setStatus({ state: "connecting", lastError: undefined });

    try {
      const ws = new WebSocket(this.opts.url);
      ws.binaryType = "blob";
      this.ws = ws;

      ws.addEventListener("open", () => {
        this.setStatus({ state: "open", lastError: undefined });
      });

      ws.addEventListener("close", () => {
        this.setStatus({ state: "closed" });
        this.scheduleReconnect();
      });

      ws.addEventListener("error", () => {
        this.setStatus({ state: "error", lastError: "websocket error" });
        // Some browsers fire error then close; reconnect is scheduled on close.
      });

      ws.addEventListener("message", (ev) => {
        this.enqueueMessage(ev.data, this.session);
      });
    } catch (err) {
      this.setStatus({ state: "error", lastError: String(err) });
      this.scheduleReconnect();
    }
  }

  close() {
    this.clearReconnectTimer();
    // Advance session to invalidate any queued/in-flight decodes.
    this.session++;
    this.pendingData = null;
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      try {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
      } catch {
        // ignore
      }
      try {
        ws.close();
      } catch {
        // ignore
      }
    }
  }

  dispose() {
    this.close();
  }

  private enqueueMessage(data: unknown, session: number) {
    // Only one decode at a time; keep the most recent payload.
    if (this.decoding) {
      this.pendingData = data;
      return;
    }
    this.decoding = true;
    void this.drainMessages(data, session);
  }

  private async drainMessages(first: unknown, session: number) {
    try {
      let data: unknown | null = first;
      // Process the first payload and, if new ones arrive while decoding, only the latest pending.
      while (data != null) {
        // If we reconnected/closed, drop pending work.
        if (session !== this.session) return;
        await this.handleMessage(data, session);
        if (session !== this.session) return;
        data = this.pendingData;
        this.pendingData = null;
      }
    } finally {
      // If new data arrived after we cleared pendingData but before we flipped decoding,
      // let the next enqueueMessage start a new drain.
      this.decoding = false;
    }
  }

  private setStatus(patch: Partial<DepthWsStatus>) {
    this.status = { ...this.status, ...patch };
    this.opts.onStatus?.(this.getStatus());
  }

  private scheduleReconnect() {
    const cfg = this.opts.reconnect;
    if (!cfg?.enabled) return;
    if (this.reconnectTimer != null) return;

    const delay = clampInt(
      this.reconnectDelayMs,
      cfg.minDelayMs,
      cfg.maxDelayMs
    );

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);

    // Exponential-ish backoff.
    this.reconnectDelayMs = clampInt(this.reconnectDelayMs * 1.6, 100, 30_000);
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer != null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private async handleMessage(data: unknown, session: number) {
    // Supported payloads:
    // - Binary frames: Blob (preferred) / ArrayBuffer (wrapped to Blob)
    // - Data URL string: "data:image/png;base64,..."

    try {
      if (typeof data === "string") {
        const s = data.trim();
        if (s.startsWith("data:image/")) {
          const blob = await (await fetch(s)).blob();
          const bitmap = await createImageBitmap(blob);
          if (session !== this.session) {
            try {
              bitmap.close();
            } catch {
              // ignore
            }
            return;
          }
          this.status.framesReceived++;
          this.opts.onFrame(bitmap);
          this.opts.onStatus?.(this.getStatus());
          return;
        }
        // Ignore non-image strings (e.g. heartbeats / JSON).
        return;
      }

      if (data instanceof Blob) {
        const bitmap = await createImageBitmap(data);
        if (session !== this.session) {
          try {
            bitmap.close();
          } catch {
            // ignore
          }
          return;
        }
        this.status.framesReceived++;
        this.opts.onFrame(bitmap);
        this.opts.onStatus?.(this.getStatus());
        return;
      }

      if (data instanceof ArrayBuffer) {
        const blob = new Blob([data]);
        const bitmap = await createImageBitmap(blob);
        if (session !== this.session) {
          try {
            bitmap.close();
          } catch {
            // ignore
          }
          return;
        }
        this.status.framesReceived++;
        this.opts.onFrame(bitmap);
        this.opts.onStatus?.(this.getStatus());
        return;
      }

      // Unknown type: ignore.
    } catch (err) {
      this.setStatus({ state: "error", lastError: String(err) });
    }
  }
}
