type CameraState = "idle" | "requesting" | "streaming" | "error" | "stopped";

export interface LiDARClientOptions {
  source: {
    kind: "local" | "webrtc";
    constraints?: MediaStreamConstraints;
    signalingUrl?: string;
    token?: string;
  };
  onStateChange?: (state: CameraState, detail?: unknown) => void;
}

/**
 * Minimal placeholder client:
 * - Local camera via getUserMedia (for now).
 * - Future: WebRTC subscriber that receives depth/color/intrinsics.
 */
export class LiDARClient {
  private stream: MediaStream | null = null;
  private state: CameraState = "idle";
  private startPromise: Promise<MediaStream> | null = null;
  private generation = 0;

  constructor(private options: LiDARClientOptions) {}

  get currentState() {
    return this.state;
  }

  get mediaStream(): MediaStream | null {
    return this.stream;
  }

  updateConstraints(constraints: MediaStreamConstraints | undefined) {
    if (this.options.source.kind !== "local") return;
    this.options.source.constraints = constraints;
  }

  async start() {
    if (this.state === "streaming" && this.stream) return this.stream;
    if (this.startPromise) return this.startPromise;

    const startGen = this.generation;
    this.setState("requesting");

    this.startPromise = (async () => {
      if (this.options.source.kind === "local") {
        let stream: MediaStream | null = null;
        try {
          const constraints =
            this.options.source.constraints ??
            ({
              video: {
                width: { ideal: 640 },
                height: { ideal: 360 },
                frameRate: { ideal: 30 },
              },
              audio: false,
            } as MediaStreamConstraints);

          stream = await navigator.mediaDevices.getUserMedia(constraints);

          // If stop() was called while we were awaiting permissions, discard the stream.
          if (this.generation !== startGen) {
            for (const t of stream.getTracks()) {
              try {
                t.stop();
              } catch {
                // ignore
              }
            }
            throw new DOMException("LiDAR start aborted", "AbortError");
          }

          this.stream = stream;
          this.setState("streaming");
          return stream;
        } catch (error) {
          // If we already acquired a stream but hit an error later, ensure cleanup.
          if (stream) {
            for (const t of stream.getTracks()) {
              try {
                t.stop();
              } catch {
                // ignore
              }
            }
          }
          this.setState("error", error);
          throw error;
        }
      }

      // WebRTC subscriber placeholder.
      const err = new Error("WebRTC LiDAR source not yet implemented");
      this.setState("error", err);
      throw err;
    })();

    try {
      return await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  stop() {
    // Invalidate any in-flight start().
    this.generation++;
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    this.setState("stopped");
  }

  private setState(next: CameraState, detail?: unknown) {
    this.state = next;
    this.options.onStateChange?.(next, detail);
  }
}
