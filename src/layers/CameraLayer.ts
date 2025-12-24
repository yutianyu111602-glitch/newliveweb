import * as THREE from "three";
import type { Layer } from "./Layer";
import type { CameraFeatureConfig } from "../config/cameraSources";
import { LiDARClient } from "../camera/LiDARClient";

type CameraLayerState = "idle" | "connecting" | "streaming" | "error";

/**
 * Placeholder camera/depth layer:
 * - Uses getUserMedia video as a VideoTexture.
 * - Designed to be swapped with a real LiDAR/WebRTC source later.
 * - Layer interface compatible with existing SceneManager.
 */
export class CameraLayer implements Layer {
  private mesh: THREE.Mesh | null = null;
  private material: THREE.MeshBasicMaterial | null = null;
  private videoTexture: THREE.VideoTexture | null = null;
  private videoEl: HTMLVideoElement | null = null;
  private client: LiDARClient;
  private state: CameraLayerState = "idle";
  private lastErrorName: string | null = null;
  private lastErrorMessage: string | null = null;
  private opacity = 1;
  private overlayOpacityMultiplier = 1;
  private enabled = false;
  private deviceId: string | null = null;

  private viewportWidth = 1;
  private viewportHeight = 1;
  private lastVideoWidth = 0;
  private lastVideoHeight = 0;

  private startNonce = 0;

  private segmentPerson = false;
  private segmentQuality: "low" | "medium" | "high" = "medium";
  private segmentFps = 15;
  private segmentEdgeBlurPx = 8;
  private selfieSegmentation: any | null = null;
  private segmentationBusy = false;
  private lastSegmentationMs = 0;
  private processedCanvas: HTMLCanvasElement | null = null;
  private processedCtx: CanvasRenderingContext2D | null = null;
  private processedTexture: THREE.CanvasTexture | null = null;
  private maskCanvas: HTMLCanvasElement | null = null;
  private maskCtx: CanvasRenderingContext2D | null = null;
  private portraitEdge01 = 0;
  private portraitArea01 = 0;

  constructor(private readonly config: CameraFeatureConfig) {
    this.client = new LiDARClient({
      source: config.source,
      onStateChange: (s) => (this.state = mapState(s)),
    });
  }

  async init(scene: THREE.Scene) {
    // Geometry covers the normalized device coordinates; SceneManager will handle camera.
    const geometry = new THREE.PlaneGeometry(2, 2);
    this.material = new THREE.MeshBasicMaterial({
      color: 0x111111,
      transparent: true,
      opacity: this.opacity,
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    // Layer 0: backgrounds.
    this.mesh.layers.set(0);
    // Keep camera above LiquidMetal/Basic when used as a foreground overlay.
    this.mesh.renderOrder = 3;
    scene.add(this.mesh);

    // Start disabled by default to avoid triggering camera permissions
    // unless the user explicitly selects the camera background.
    this.setEnabled(false);
  }

  private updateFit() {
    if (!this.mesh) return;

    const vw = this.videoEl?.videoWidth ?? 0;
    const vh = this.videoEl?.videoHeight ?? 0;
    if (!vw || !vh) {
      this.mesh.scale.set(1, 1, 1);
      return;
    }

    const videoAspect = vw / vh;
    const viewAspect = this.viewportWidth / this.viewportHeight;

    // Always use "cover" for camera: fill the viewport without stretching.
    let scaleX = 1;
    let scaleY = 1;
    if (videoAspect > viewAspect) {
      // Video is wider: expand width.
      scaleX = videoAspect / viewAspect;
    } else {
      // Video is taller: expand height.
      scaleY = viewAspect / videoAspect;
    }

    this.mesh.scale.set(scaleX, scaleY, 1);
  }

  applyParams(params: Record<string, unknown>) {
    const rawDeviceId = (params as any)?.deviceId;
    const nextDeviceId =
      typeof rawDeviceId === "string" ? rawDeviceId.trim() : "";
    const normalizedDeviceId = nextDeviceId ? nextDeviceId : null;
    const deviceChanged = normalizedDeviceId !== this.deviceId;
    if (deviceChanged) {
      this.deviceId = normalizedDeviceId;
      this.updateClientConstraints();
      if (this.enabled) {
        // Restart stream to switch devices.
        this.client.stop();
        this.state = "idle";
        void this.startStream();
      }
    }

    const rawOpacity = (params as any)?.opacity;
    if (rawOpacity != null) {
      const next = Number(rawOpacity);
      if (Number.isFinite(next)) {
        this.opacity = Math.min(1, Math.max(0, next));
      }
    }

    const effectiveOpacity = Math.min(
      1,
      Math.max(0, this.opacity * this.overlayOpacityMultiplier)
    );

    if (this.material) {
      this.material.transparent =
        effectiveOpacity < 1 || Boolean(this.segmentPerson);
      this.material.opacity = effectiveOpacity;
      this.material.needsUpdate = true;
    }

    const segmentPerson = Boolean((params as any)?.segmentPerson);
    const segmentQualityRaw = String(
      (params as any)?.segmentQuality ?? ""
    ).trim();
    const segmentQuality =
      segmentQualityRaw === "low" || segmentQualityRaw === "high"
        ? segmentQualityRaw
        : "medium";
    const segFpsRaw = Number((params as any)?.segmentFps);
    const segmentFps = Number.isFinite(segFpsRaw)
      ? Math.min(30, Math.max(5, Math.round(segFpsRaw)))
      : 15;
    const blurRaw = Number((params as any)?.segmentEdgeBlurPx);
    const segmentEdgeBlurPx = Number.isFinite(blurRaw)
      ? Math.min(16, Math.max(0, Math.round(blurRaw)))
      : 8;

    const segChanged =
      segmentPerson !== this.segmentPerson ||
      segmentQuality !== this.segmentQuality ||
      segmentFps !== this.segmentFps ||
      segmentEdgeBlurPx !== this.segmentEdgeBlurPx;

    if (segChanged) {
      this.segmentPerson = segmentPerson;
      this.segmentQuality = segmentQuality as any;
      this.segmentFps = segmentFps;
      this.segmentEdgeBlurPx = segmentEdgeBlurPx;

      if (!this.segmentPerson) {
        this.teardownSegmentation();
        this.applyActiveTexture();
      } else {
        this.applyActiveTexture();
        void this.ensureSegmentationInitialized();
      }
    }
  }

  private async startStream() {
    const nonce = ++this.startNonce;
    try {
      this.state = "connecting";
      this.lastErrorName = null;
      this.lastErrorMessage = null;
      this.updateClientConstraints();
      const stream = await this.client.start();

      // If disabled or a new start has begun, discard.
      if (!this.enabled || nonce !== this.startNonce) {
        this.client.stop();
        return;
      }

      const videoTrack = stream?.getVideoTracks()[0];
      if (!videoTrack) {
        this.state = "error";
        this.lastErrorName = "NoVideoTrack";
        this.lastErrorMessage = "No video tracks available from camera source";
        return;
      }
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();

      if (!this.enabled || nonce !== this.startNonce) {
        try {
          video.pause();
        } catch {
          // ignore
        }
        try {
          video.srcObject = null;
        } catch {
          // ignore
        }
        this.client.stop();
        return;
      }

      this.videoEl = video;

      this.lastVideoWidth = video.videoWidth;
      this.lastVideoHeight = video.videoHeight;
      this.updateFit();

      this.videoTexture = new THREE.VideoTexture(video);
      this.videoTexture.colorSpace = THREE.SRGBColorSpace;
      this.applyActiveTexture();
      this.state = "streaming";
    } catch (error) {
      const e = error as any;
      // If we were disabled mid-start, treat it as a benign abort.
      if (
        !this.enabled &&
        (e?.name === "AbortError" || e instanceof DOMException)
      ) {
        return;
      }
      console.warn("CameraLayer: failed to start stream", error);
      this.state = "error";
      this.lastErrorName =
        typeof e?.name === "string" ? e.name : "UnknownError";
      this.lastErrorMessage = typeof e?.message === "string" ? e.message : null;
    }
  }

  private applyActiveTexture() {
    if (!this.material) return;
    const map =
      this.segmentPerson && this.processedTexture
        ? this.processedTexture
        : this.videoTexture;
    const effectiveOpacity = Math.min(
      1,
      Math.max(0, this.opacity * this.overlayOpacityMultiplier)
    );
    this.material.setValues({
      map,
      color: map ? 0xffffff : 0x111111,
      opacity: effectiveOpacity,
    });
    this.material.transparent =
      effectiveOpacity < 1 || Boolean(this.segmentPerson);
    this.material.needsUpdate = true;
  }

  // Runtime-only: compositor/overlay budget can fade the layer without mutating opacity.
  setOverlayOpacityMultiplier(value01: number) {
    const v = Number(value01);
    this.overlayOpacityMultiplier = Number.isFinite(v)
      ? Math.min(1, Math.max(0, v))
      : 1;
    // Re-apply material state.
    if (this.material) {
      this.applyActiveTexture();
    }
  }

  getOpacity() {
    return Math.min(
      1,
      Math.max(0, this.opacity * this.overlayOpacityMultiplier)
    );
  }

  private getSegmentationBlurPx(): number {
    // segmentEdgeBlurPx is user-controlled; quality nudges defaults.
    const base = this.segmentEdgeBlurPx;
    if (this.segmentQuality === "low") return Math.min(16, base + 4);
    if (this.segmentQuality === "high") return Math.max(0, base - 2);
    return base;
  }

  private ensureProcessedCanvas(targetW: number, targetH: number) {
    if (!this.processedCanvas) {
      this.processedCanvas = document.createElement("canvas");
      this.processedCtx = this.processedCanvas.getContext("2d", {
        alpha: true,
      });
      this.processedTexture = new THREE.CanvasTexture(this.processedCanvas);
      this.processedTexture.colorSpace = THREE.SRGBColorSpace;
    }
    if (!this.processedCanvas || !this.processedCtx) return;
    if (
      this.processedCanvas.width !== targetW ||
      this.processedCanvas.height !== targetH
    ) {
      this.processedCanvas.width = targetW;
      this.processedCanvas.height = targetH;
      this.processedTexture?.dispose();
      this.processedTexture = new THREE.CanvasTexture(this.processedCanvas);
      this.processedTexture.colorSpace = THREE.SRGBColorSpace;
      this.applyActiveTexture();
    }
  }

  private ensureMaskCanvas(targetW: number, targetH: number) {
    if (!this.maskCanvas) {
      this.maskCanvas = document.createElement("canvas");
      this.maskCtx = this.maskCanvas.getContext("2d", { alpha: true });
    }
    if (!this.maskCanvas || !this.maskCtx) return;
    if (
      this.maskCanvas.width !== targetW ||
      this.maskCanvas.height !== targetH
    ) {
      this.maskCanvas.width = targetW;
      this.maskCanvas.height = targetH;
    }
  }

  private async ensureSegmentationInitialized() {
    if (!this.segmentPerson) return;
    if (this.selfieSegmentation) return;

    try {
      const mod: any = await import("@mediapipe/selfie_segmentation");
      const SelfieSegmentation = mod.SelfieSegmentation ?? mod.default;
      if (!SelfieSegmentation) throw new Error("SelfieSegmentation not found");

      const locateFile = (file: string) =>
        `/vendor/mediapipe/selfie_segmentation/${file}`;

      const seg = new SelfieSegmentation({ locateFile });
      seg.setOptions({
        modelSelection: 1,
      });
      seg.onResults((results: any) => {
        try {
          this.handleSegmentationResults(results);
        } catch (err) {
          console.warn("CameraLayer: segmentation results error", err);
          this.segmentationBusy = false;
        }
      });
      this.selfieSegmentation = seg;
      this.lastSegmentationMs = 0;
    } catch (error) {
      console.warn(
        "CameraLayer: failed to init selfie segmentation. If you haven't synced MediaPipe assets, run: npm run sync:mediapipe",
        error
      );
      this.selfieSegmentation = null;
    }
  }

  private handleSegmentationResults(results: any) {
    this.segmentationBusy = false;
    if (!this.segmentPerson) return;
    if (!this.videoEl) return;
    if (!results?.segmentationMask) return;

    const vw = this.videoEl.videoWidth || 0;
    const vh = this.videoEl.videoHeight || 0;
    if (!vw || !vh) return;

    // Downscale for performance; preserve aspect ratio.
    const maxW = 640;
    const scale = Math.min(1, maxW / vw);
    const w = Math.max(2, Math.round(vw * scale));
    const h = Math.max(2, Math.round(vh * scale));

    // Compute portrait edge/area signals at lower resolution for stability/perf.
    try {
      const edgeW = 160;
      const edgeScale = Math.min(1, edgeW / vw);
      const ew = Math.max(2, Math.round(vw * edgeScale));
      const eh = Math.max(2, Math.round(vh * edgeScale));
      this.ensureMaskCanvas(ew, eh);
      const mctx = this.maskCtx;
      if (mctx && this.maskCanvas) {
        mctx.save();
        mctx.clearRect(0, 0, ew, eh);
        mctx.globalCompositeOperation = "source-over";
        // A touch of blur helps suppress single-pixel flicker without losing the outline.
        const blur = Math.max(
          0,
          Math.min(4, this.getSegmentationBlurPx() * 0.25)
        );
        mctx.filter = blur > 0 ? `blur(${blur}px)` : "none";
        mctx.drawImage(
          results.segmentationMask as CanvasImageSource,
          0,
          0,
          ew,
          eh
        );
        mctx.restore();

        const img = mctx.getImageData(0, 0, ew, eh).data;
        const stride = ew * 4;
        let areaCount = 0;
        let edgeCount = 0;
        for (let y = 1; y < eh - 1; y++) {
          const row = y * stride;
          for (let x = 1; x < ew - 1; x++) {
            const i = row + x * 4;
            const v = (img[i] ?? 0) / 255;
            if (v > 0.5) areaCount++;
            const vR = (img[i + 4] ?? 0) / 255;
            const vD = (img[i + stride] ?? 0) / 255;
            const d = Math.abs(v - vR) + Math.abs(v - vD);
            if (d > 0.55) edgeCount++;
          }
        }
        const total = Math.max(1, ew * eh);
        const area01 = Math.max(0, Math.min(1, areaCount / total));
        const edgeDensity = Math.max(0, Math.min(1, edgeCount / total));
        // Normalize by area so small figures can still produce meaningful edges.
        const edge01 = Math.max(
          0,
          Math.min(1, edgeDensity / Math.max(0.008, 0.02 + 0.12 * area01))
        );

        // Light smoothing to avoid jitter.
        const a = 0.25;
        this.portraitArea01 = (1 - a) * this.portraitArea01 + a * area01;
        this.portraitEdge01 = (1 - a) * this.portraitEdge01 + a * edge01;
      }
    } catch {
      // ignore
    }

    this.ensureProcessedCanvas(w, h);
    const ctx = this.processedCtx;
    if (!ctx || !this.processedCanvas) return;

    ctx.save();
    ctx.clearRect(0, 0, w, h);
    ctx.filter = "none";
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(this.videoEl, 0, 0, w, h);

    ctx.globalCompositeOperation = "destination-in";
    const blur = this.getSegmentationBlurPx();
    ctx.filter = blur > 0 ? `blur(${blur}px)` : "none";
    ctx.drawImage(results.segmentationMask as CanvasImageSource, 0, 0, w, h);

    ctx.restore();
    if (this.processedTexture) this.processedTexture.needsUpdate = true;
    this.applyActiveTexture();
  }

  private tickSegmentation() {
    if (!this.segmentPerson) return;
    if (!this.videoEl) return;
    if (!this.selfieSegmentation) {
      void this.ensureSegmentationInitialized();
      return;
    }
    const now =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const intervalMs = 1000 / Math.min(30, Math.max(5, this.segmentFps || 15));
    if (now - this.lastSegmentationMs < intervalMs) return;
    if (this.segmentationBusy) return;
    this.lastSegmentationMs = now;
    this.segmentationBusy = true;
    Promise.resolve()
      .then(() => this.selfieSegmentation.send({ image: this.videoEl }))
      .catch((err) => {
        this.segmentationBusy = false;
        console.warn("CameraLayer: segmentation send failed", err);
      });
  }

  private teardownSegmentation() {
    this.segmentationBusy = false;
    this.lastSegmentationMs = 0;
    this.portraitEdge01 = 0;
    this.portraitArea01 = 0;
    if (this.selfieSegmentation) {
      try {
        this.selfieSegmentation.close?.();
      } catch {
        // ignore
      }
      this.selfieSegmentation = null;
    }
    if (this.processedTexture) {
      this.processedTexture.dispose();
      this.processedTexture = null;
    }
    this.processedCtx = null;
    this.processedCanvas = null;
    this.maskCtx = null;
    this.maskCanvas = null;
  }

  getStatus() {
    return {
      state: this.state,
      lastErrorName: this.lastErrorName,
      lastErrorMessage: this.lastErrorMessage,
      segmentPerson: this.segmentPerson,
      portraitEdge01: this.portraitEdge01,
      portraitArea01: this.portraitArea01,
    };
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (this.mesh) this.mesh.visible = enabled;
    if (!enabled) {
      this.client.stop();
      this.teardownSegmentation();
      if (this.videoEl) {
        try {
          this.videoEl.pause();
        } catch {
          // ignore
        }
        try {
          this.videoEl.srcObject = null;
        } catch {
          // ignore
        }
        this.videoEl = null;
      }
      if (this.videoTexture) {
        this.videoTexture.dispose();
        this.videoTexture = null;
      }
      if (this.material) {
        this.material.setValues({
          map: null,
          color: 0x111111,
          opacity: this.opacity,
        });
        this.material.transparent = this.opacity < 1;
        this.material.needsUpdate = true;
      }
      this.state = "idle";
      return;
    }

    if (this.state !== "streaming") {
      void this.startStream();
    }
  }

  update(_deltaTime: number) {
    // Refresh fit when metadata becomes available.
    if (this.videoEl) {
      const w = this.videoEl.videoWidth ?? 0;
      const h = this.videoEl.videoHeight ?? 0;
      if (w !== this.lastVideoWidth || h !== this.lastVideoHeight) {
        this.lastVideoWidth = w;
        this.lastVideoHeight = h;
        this.updateFit();
      }
    }

    if (this.segmentPerson) {
      this.tickSegmentation();
      if (this.processedTexture) this.processedTexture.needsUpdate = true;
      else if (this.videoTexture) this.videoTexture.needsUpdate = true;
      return;
    }
    if (this.videoTexture) this.videoTexture.needsUpdate = true;
  }

  onResize(width: number, height: number) {
    this.viewportWidth = Math.max(1, width);
    this.viewportHeight = Math.max(1, height);
    this.updateFit();
  }

  dispose() {
    this.client.stop();
    this.teardownSegmentation();
    if (this.videoEl) {
      try {
        this.videoEl.pause();
      } catch {
        // ignore
      }
      try {
        this.videoEl.srcObject = null;
      } catch {
        // ignore
      }
      this.videoEl = null;
    }
    if (this.videoTexture) {
      this.videoTexture.dispose();
      this.videoTexture = null;
    }
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
    if (this.material) {
      this.material.dispose();
      this.material = null;
    }
  }

  private updateClientConstraints() {
    const base = this.config.source.constraints;
    const constraints: MediaStreamConstraints = base
      ? (structuredClone(base) as MediaStreamConstraints)
      : ({
          video: {
            width: { ideal: 640 },
            height: { ideal: 360 },
            frameRate: { ideal: 30 },
          },
          audio: false,
        } as MediaStreamConstraints);

    if (this.config.source.kind === "local") {
      if (this.deviceId) {
        const video = constraints.video;
        if (video && typeof video === "object") {
          (constraints as any).video = {
            ...(video as any),
            deviceId: { exact: this.deviceId },
          };
        } else {
          (constraints as any).video = { deviceId: { exact: this.deviceId } };
        }
      }
    }

    this.client.updateConstraints(constraints);
  }
}

function mapState(
  state: "idle" | "requesting" | "streaming" | "error" | "stopped"
): CameraLayerState {
  if (state === "requesting") return "connecting";
  if (state === "streaming") return "streaming";
  if (state === "error") return "error";
  return "idle";
}
