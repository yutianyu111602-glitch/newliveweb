import * as THREE from "three";
import type { Layer } from "./Layer";

export type VideoFitMode = "cover" | "contain" | "stretch";

type VideoLayerState = "idle" | "loading" | "playing" | "error";

export class VideoLayer implements Layer {
  private mesh: THREE.Mesh | null = null;
  private material: THREE.MeshBasicMaterial | null = null;
  private videoTexture: THREE.VideoTexture | null = null;
  private videoEl: HTMLVideoElement | null = null;

  private readonly onVideoError = () => {
    const video = this.videoEl;
    if (!video) return;
    this.state = "error";
    const err = video.error;
    const code = err?.code ?? null;
    this.lastErrorName = "MediaError";
    this.lastErrorMessage = code != null ? `code=${code}` : null;
  };

  private readonly onVideoLoadedMetadata = () => {
    const video = this.videoEl;
    if (!video) return;
    this.lastVideoWidth = video.videoWidth;
    this.lastVideoHeight = video.videoHeight;
    this.updateFit();
  };

  private enabled = false;
  private state: VideoLayerState = "idle";
  private lastErrorName: string | null = null;
  private lastErrorMessage: string | null = null;

  private src: string | null = null;
  private opacity = 1;
  private overlayOpacityMultiplier = 1;
  private loop = true;
  private muted = true;
  private playbackRate = 1;
  private fitMode: VideoFitMode = "cover";

  private viewportWidth = 1;
  private viewportHeight = 1;
  private lastVideoWidth = 0;
  private lastVideoHeight = 0;

  init(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    const geometry = new THREE.PlaneGeometry(2, 2);
    this.material = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: this.opacity,
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    // Layer 0: backgrounds.
    this.mesh.layers.set(0);
    // Keep video above LiquidMetal/Basic when used as a foreground overlay.
    this.mesh.renderOrder = 3;
    scene.add(this.mesh);

    const size = new THREE.Vector2();
    renderer.getSize(size);
    this.viewportWidth = Math.max(1, size.x);
    this.viewportHeight = Math.max(1, size.y);

    this.setEnabled(false);
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (this.mesh) this.mesh.visible = enabled;

    if (!enabled) {
      this.pauseAndResetPlayback();
      return;
    }

    // When enabled, try to play if we have a source.
    void this.ensurePlaying();
    this.updateFit();
  }

  applyParams(params: Record<string, unknown>) {
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

    const rawLoop = (params as any)?.loop;
    if (typeof rawLoop === "boolean") this.loop = rawLoop;

    const rawMuted = (params as any)?.muted;
    if (typeof rawMuted === "boolean") this.muted = rawMuted;

    const rawPlaybackRate = (params as any)?.playbackRate;
    if (rawPlaybackRate != null) {
      const next = Number(rawPlaybackRate);
      if (Number.isFinite(next) && next > 0) {
        this.playbackRate = Math.min(4, Math.max(0.25, next));
      }
    }

    const rawFitMode = (params as any)?.fitMode;
    if (
      rawFitMode === "cover" ||
      rawFitMode === "contain" ||
      rawFitMode === "stretch"
    ) {
      this.fitMode = rawFitMode;
    }

    const rawSrc = (params as any)?.src;
    const nextSrc = typeof rawSrc === "string" ? rawSrc.trim() : "";
    const normalizedSrc = nextSrc ? nextSrc : null;
    const srcChanged = normalizedSrc !== this.src;
    if (srcChanged) {
      this.src = normalizedSrc;
      this.resetVideoSource();
    }

    if (this.material) {
      this.material.transparent = effectiveOpacity < 1;
      this.material.opacity = effectiveOpacity;
      this.material.needsUpdate = true;
    }

    if (this.videoEl) {
      this.videoEl.loop = this.loop;
      this.videoEl.muted = this.muted;
      try {
        this.videoEl.playbackRate = this.playbackRate;
      } catch {
        // ignore
      }
    }

    if (this.enabled) {
      void this.ensurePlaying();
    }

    this.updateFit();
  }

  // Runtime-only: compositor/overlay budget can fade the layer without mutating opacity.
  setOverlayOpacityMultiplier(value01: number) {
    const v = Number(value01);
    this.overlayOpacityMultiplier = Number.isFinite(v)
      ? Math.min(1, Math.max(0, v))
      : 1;
    if (this.material) {
      const effectiveOpacity = Math.min(
        1,
        Math.max(0, this.opacity * this.overlayOpacityMultiplier)
      );
      this.material.transparent = effectiveOpacity < 1;
      this.material.opacity = effectiveOpacity;
      this.material.needsUpdate = true;
    }
  }

  getOpacity() {
    return Math.min(
      1,
      Math.max(0, this.opacity * this.overlayOpacityMultiplier)
    );
  }

  update(_deltaTime: number) {
    if (!this.enabled) return;

    if (this.videoTexture) {
      this.videoTexture.needsUpdate = true;
    }

    // Refresh fit when metadata becomes available.
    const w = this.videoEl?.videoWidth ?? 0;
    const h = this.videoEl?.videoHeight ?? 0;
    if (w !== this.lastVideoWidth || h !== this.lastVideoHeight) {
      this.lastVideoWidth = w;
      this.lastVideoHeight = h;
      this.updateFit();
    }
  }

  onResize(width: number, height: number) {
    this.viewportWidth = Math.max(1, width);
    this.viewportHeight = Math.max(1, height);
    this.updateFit();
  }

  dispose() {
    this.pauseAndResetPlayback();

    if (this.videoEl) {
      try {
        this.videoEl.removeEventListener("error", this.onVideoError);
        this.videoEl.removeEventListener(
          "loadedmetadata",
          this.onVideoLoadedMetadata
        );
      } catch {
        // ignore
      }

      try {
        this.videoEl.removeAttribute("src");
        this.videoEl.load();
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
      this.material.setValues({ map: null });
      this.material.needsUpdate = true;
    }

    if (this.mesh) {
      try {
        this.mesh.parent?.remove(this.mesh);
      } catch {
        // ignore
      }
      this.mesh.geometry.dispose();
      this.mesh = null;
    }

    if (this.material) {
      this.material.dispose();
      this.material = null;
    }
  }

  private ensureVideoElement(): HTMLVideoElement {
    if (this.videoEl) return this.videoEl;

    const video = document.createElement("video");
    video.playsInline = true;
    video.loop = this.loop;
    video.muted = this.muted;
    video.preload = "auto";

    video.addEventListener("error", this.onVideoError);
    video.addEventListener("loadedmetadata", this.onVideoLoadedMetadata);

    this.videoEl = video;
    return video;
  }

  private resetVideoSource() {
    // Clearing and re-setting src avoids odd browser state when switching sources.
    const video = this.ensureVideoElement();

    try {
      video.pause();
    } catch {
      // ignore
    }

    if (!this.src) {
      // No source: show fallback color and drop texture.
      try {
        video.removeAttribute("src");
        video.load();
      } catch {
        // ignore
      }

      if (this.videoTexture) {
        this.videoTexture.dispose();
        this.videoTexture = null;
      }

      if (this.material) {
        const effectiveOpacity = Math.min(
          1,
          Math.max(0, this.opacity * this.overlayOpacityMultiplier)
        );
        this.material.setValues({
          map: null,
          color: 0x000000,
          opacity: effectiveOpacity,
        });
        this.material.transparent = effectiveOpacity < 1;
        this.material.needsUpdate = true;
      }

      this.state = "idle";
      this.lastErrorName = null;
      this.lastErrorMessage = null;
      return;
    }

    this.state = "loading";
    this.lastErrorName = null;
    this.lastErrorMessage = null;

    try {
      video.src = this.src;
      video.load();
    } catch (error) {
      console.warn("VideoLayer: failed to set src", error);
      this.state = "error";
      const e = error as any;
      this.lastErrorName = typeof e?.name === "string" ? e.name : "Error";
      this.lastErrorMessage = typeof e?.message === "string" ? e.message : null;
    }

    // Texture will be created on-demand when enabled.
  }

  private pauseAndResetPlayback() {
    if (this.videoEl) {
      try {
        this.videoEl.pause();
      } catch {
        // ignore
      }
    }

    if (this.videoTexture) {
      this.videoTexture.needsUpdate = false;
    }

    // Keep src; disabling should not wipe user config.
    this.state = this.src ? "loading" : "idle";
  }

  private ensureTexture() {
    if (!this.material) return;
    if (!this.videoEl) return;

    const effectiveOpacity = Math.min(
      1,
      Math.max(0, this.opacity * this.overlayOpacityMultiplier)
    );

    if (!this.videoTexture) {
      this.videoTexture = new THREE.VideoTexture(this.videoEl);
      this.videoTexture.colorSpace = THREE.SRGBColorSpace;
    }

    this.material.setValues({
      map: this.videoTexture,
      color: undefined,
      opacity: effectiveOpacity,
    });
    this.material.transparent = effectiveOpacity < 1;
    this.material.needsUpdate = true;
  }

  private async ensurePlaying() {
    if (!this.enabled) return;
    if (!this.src) return;

    const video = this.ensureVideoElement();
    this.ensureTexture();

    try {
      video.loop = this.loop;
      video.muted = this.muted;
      video.playsInline = true;
      video.preload = "auto";
      try {
        video.playbackRate = this.playbackRate;
      } catch {
        // ignore
      }

      // Autoplay may be blocked (esp. headless). Must never throw.
      await video.play();
      this.state = "playing";
      this.lastErrorName = null;
      this.lastErrorMessage = null;
    } catch (error) {
      // Keep going; video background is optional.
      // This commonly fails without a user gesture.
      console.warn("VideoLayer: video.play() was rejected", error);
      this.state = "error";
      const e = error as any;
      this.lastErrorName =
        typeof e?.name === "string" ? e.name : "NotAllowedError";
      this.lastErrorMessage = typeof e?.message === "string" ? e.message : null;
    }
  }

  getStatus() {
    return {
      enabled: this.enabled,
      state: this.state,
      src: this.src,
      lastErrorName: this.lastErrorName,
      lastErrorMessage: this.lastErrorMessage,
    };
  }

  private updateFit() {
    if (!this.mesh) return;

    if (this.fitMode === "stretch") {
      this.mesh.scale.set(1, 1, 1);
      return;
    }

    const vw = this.videoEl?.videoWidth ?? 0;
    const vh = this.videoEl?.videoHeight ?? 0;
    if (!vw || !vh) {
      this.mesh.scale.set(1, 1, 1);
      return;
    }

    const videoAspect = vw / vh;
    const viewAspect = this.viewportWidth / this.viewportHeight;

    let scaleX = 1;
    let scaleY = 1;

    if (this.fitMode === "contain") {
      if (videoAspect > viewAspect) {
        // Video is wider: reduce height.
        scaleY = viewAspect / videoAspect;
      } else {
        // Video is taller: reduce width.
        scaleX = videoAspect / viewAspect;
      }
    } else {
      // cover
      if (videoAspect > viewAspect) {
        // Video is wider: expand width.
        scaleX = videoAspect / viewAspect;
      } else {
        // Video is taller: expand height.
        scaleY = viewAspect / videoAspect;
      }
    }

    this.mesh.scale.set(scaleX, scaleY, 1);
  }

  // User-gesture triggered retry for autoplay-rejected playback.
  async retryPlayback(): Promise<boolean> {
    if (!this.enabled) return false;
    if (!this.src) return false;
    try {
      await this.ensurePlaying();
      return this.state === "playing";
    } catch {
      return false;
    }
  }
}
