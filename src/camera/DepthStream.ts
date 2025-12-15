export interface DepthFrame {
  // Placeholder for future depth payloads (e.g., Uint16Array / Float32Array).
  width: number;
  height: number;
  // Raw depth buffer; optional until real LiDAR feed is wired.
  buffer?: ArrayBufferView;
  // Intrinsics placeholder.
  intrinsics?: { fx: number; fy: number; cx: number; cy: number };
}

/**
 * Minimal placeholder to align future depth/color ingestion.
 * For now, only color (MediaStream) is used; depth frames can be fed when available.
 */
export class DepthStream {
  private depthFrame: DepthFrame | null = null;

  setDepthFrame(frame: DepthFrame) {
    this.depthFrame = frame;
  }

  get currentDepthFrame(): DepthFrame | null {
    return this.depthFrame;
  }
}
