type CameraState = 'idle' | 'requesting' | 'streaming' | 'error' | 'stopped';

export interface LiDARClientOptions {
  source: {
    kind: 'local' | 'webrtc';
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
  private state: CameraState = 'idle';

  constructor(private options: LiDARClientOptions) {}

  get currentState() {
    return this.state;
  }

  get mediaStream(): MediaStream | null {
    return this.stream;
  }

  async start() {
    if (this.state === 'streaming') return this.stream;
    this.setState('requesting');

    if (this.options.source.kind === 'local') {
      try {
        const constraints =
          this.options.source.constraints ??
          ({
            video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 30 } },
            audio: false
          } as MediaStreamConstraints);

        this.stream = await navigator.mediaDevices.getUserMedia(constraints);
        this.setState('streaming');
        return this.stream;
      } catch (error) {
        this.setState('error', error);
        throw error;
      }
    }

    // WebRTC subscriber placeholder.
    this.setState('error', new Error('WebRTC LiDAR source not yet implemented'));
    throw new Error('WebRTC LiDAR source not yet implemented');
  }

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    this.setState('stopped');
  }

  private setState(next: CameraState, detail?: unknown) {
    this.state = next;
    this.options.onStateChange?.(next, detail);
  }
}
