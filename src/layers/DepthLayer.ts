import * as THREE from "three";
import type { Layer } from "./Layer";

type DepthLayerSource = "webcam" | "ws" | "idepth";
type DepthLayerState = "idle" | "connecting" | "streaming" | "error";

export type DepthLayerStatus = {
  enabled: boolean;
  source: DepthLayerSource;
  state: DepthLayerState;
  deviceId: string | null;
  lastErrorName: string | null;
  lastErrorMessage: string | null;
  framesIn: number;
  framesProcessed: number;
  sourceSize: { w: number; h: number };
  procSize: { w: number; h: number };
  fpsIn: number;
  fpsProc: number;
  procIntervalMs: number;
  procMaxSide: number;
  perfTier: number;
  procCostMs: number;
  procCostAvgMs: number;
  procBlurPx: number;
};

/**
 * Depth fog/contours overlay (Effect C).
 *
 * Inputs:
 * - Webcam depth: `getUserMedia({ video })` via `deviceId`
 * - WebSocket frames: external bridge pushing ImageBitmap via `setFrame()`
 *
 * Output:
 * - Fog/contour alpha texture composited additively over the final output.
 */
export class DepthLayer implements Layer {
  private mesh: THREE.Mesh | null = null;
  private material: THREE.ShaderMaterial | null = null;

  // Raw depth input.
  private depthCanvas: HTMLCanvasElement | null = null;
  private depthCtx: CanvasRenderingContext2D | null = null;
  private depthTex: THREE.CanvasTexture | null = null;

  // Fog output.
  private fogRawCanvas: HTMLCanvasElement | null = null;
  private fogRawCtx: CanvasRenderingContext2D | null = null;
  private fogCanvas: HTMLCanvasElement | null = null;
  private fogCtx: CanvasRenderingContext2D | null = null;
  private fogTex: THREE.CanvasTexture | null = null;
  private fogImageData: ImageData | null = null;

  // Webcam capture.
  private videoEl: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;

  // Params.
  private enabled = false;
  private opacity = 1;
  private overlayOpacityMultiplier = 1;
  private source: DepthLayerSource = "webcam";
  private deviceId: string | null = null;
  private near = 0.2;
  private far = 0.85;
  private invert = false;
  private showDepth = false;
  private layers = 12;
  private bw = 0.1;
  private fog = 1.1;
  private fall = 1.2;
  private edge = 1.3;
  private blur = 10;
  private noise = 0.18;
  private scale = 1;
  private fps = 15;

  // Status/telemetry.
  private state: DepthLayerState = "idle";
  private lastErrorName: string | null = null;
  private lastErrorMessage: string | null = null;
  private framesIn = 0;
  private framesProcessed = 0;
  private lastInMs = 0;
  private lastProcMs = 0;
  private fpsIn = 0;
  private fpsProc = 0;
  private sourceW = 0;
  private sourceH = 0;
  private procW = 0;
  private procH = 0;
  private viewportW = 1;
  private viewportH = 1;

  // Loop.
  private rafId = 0;
  private lastCaptureMs = 0;
  private lastProcessMs = 0;
  private procIntervalMs = 0;
  private procMaxSide = 0;
  private perfTier: 0 | 1 | 2 = 0;
  private perfTierHoldUntilMs = 0;
  private procCostMs = 0;
  private procCostAvgMs = 0;
  private procBlurPx = 0;
  private needsProcess = false;

  init(scene: THREE.Scene, _renderer: THREE.WebGLRenderer) {
    const geometry = new THREE.PlaneGeometry(2, 2);

    this.depthCanvas = document.createElement("canvas");
    this.depthCanvas.width = 2;
    this.depthCanvas.height = 2;
    this.depthCtx = this.depthCanvas.getContext("2d", {
      alpha: false,
      willReadFrequently: true,
    });
    this.depthTex = new THREE.CanvasTexture(this.depthCanvas);
    this.depthTex.minFilter = THREE.LinearFilter;
    this.depthTex.magFilter = THREE.LinearFilter;
    this.depthTex.wrapS = THREE.ClampToEdgeWrapping;
    this.depthTex.wrapT = THREE.ClampToEdgeWrapping;

    this.fogRawCanvas = document.createElement("canvas");
    this.fogRawCanvas.width = 2;
    this.fogRawCanvas.height = 2;
    this.fogRawCtx = this.fogRawCanvas.getContext("2d", {
      alpha: true,
      willReadFrequently: true,
    });

    this.fogCanvas = document.createElement("canvas");
    this.fogCanvas.width = 2;
    this.fogCanvas.height = 2;
    this.fogCtx = this.fogCanvas.getContext("2d", {
      alpha: true,
      willReadFrequently: false,
    });
    this.fogTex = new THREE.CanvasTexture(this.fogCanvas);
    this.fogTex.minFilter = THREE.LinearFilter;
    this.fogTex.magFilter = THREE.LinearFilter;
    this.fogTex.wrapS = THREE.ClampToEdgeWrapping;
    this.fogTex.wrapT = THREE.ClampToEdgeWrapping;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        u_opacity: { value: this.opacity },
        u_hasDepth: { value: 0 },
        u_showDepth: { value: this.showDepth ? 1 : 0 },
        u_viewAspect: { value: 1 },
        u_texAspect: { value: 1 },
        u_depthTex: { value: this.depthTex },
        u_fogTex: { value: this.fogTex },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform float u_opacity;
        uniform float u_hasDepth;
        uniform float u_showDepth;
        uniform float u_viewAspect;
        uniform float u_texAspect;
        uniform sampler2D u_depthTex;
        uniform sampler2D u_fogTex;

        vec2 coverUv(vec2 uv, float texAspect, float viewAspect) {
          if (texAspect <= 0.0 || viewAspect <= 0.0) return uv;
          float scaleX = 1.0;
          float scaleY = 1.0;
          if (texAspect > viewAspect) {
            scaleX = texAspect / viewAspect;
          } else {
            scaleY = viewAspect / texAspect;
          }
          vec2 centered = uv - 0.5;
          centered.x *= scaleX;
          centered.y *= scaleY;
          return centered + 0.5;
        }

        void main() {
          if (u_hasDepth < 0.5) {
            gl_FragColor = vec4(0.0);
            return;
          }

          vec2 uv = coverUv(vUv, u_texAspect, u_viewAspect);

          // Optional debug preview: draw raw depth in the bottom-left corner.
          if (u_showDepth > 0.5) {
            float px = 0.26;
            float py = 0.26;
            if (vUv.x < px && vUv.y < py) {
              vec2 uvD = vec2(vUv.x / px, vUv.y / py);
              vec2 uvDCover = coverUv(uvD, u_texAspect, u_viewAspect);
              vec4 d = texture2D(u_depthTex, uvDCover);
              float g = dot(d.rgb, vec3(0.2126, 0.7152, 0.0722));
              gl_FragColor = vec4(vec3(g), 0.92);
              return;
            }
          }

          vec4 fog = texture2D(u_fogTex, uv);
          gl_FragColor = vec4(fog.rgb, fog.a * clamp(u_opacity, 0.0, 1.0));
        }
      `,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneFactor,
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.layers.set(0);
    // Foreground overlay (below ProjectM, above backgrounds).
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);

    this.setEnabled(false);
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
      this.material.uniforms.u_opacity.value = effectiveOpacity;
      this.material.needsUpdate = true;
    }
    this.needsProcess = true;
    if (this.enabled) this.ensureLoopRunning();
  }

  getOpacity() {
    return Math.min(
      1,
      Math.max(0, this.opacity * this.overlayOpacityMultiplier)
    );
  }

  update(deltaTime: number) {
    // Keep viewport info updated for cover fitting.
    // SceneManager updates camera/renderer sizes, but we only need the DOM viewport ratio.
    // deltaTime is not used here.
    void deltaTime;

    this.viewportW = Math.max(1, Math.floor(window.innerWidth || 1));
    this.viewportH = Math.max(1, Math.floor(window.innerHeight || 1));
    if (this.material) {
      this.material.uniforms.u_viewAspect.value =
        this.viewportW / this.viewportH;
    }
  }

  getStatus(): DepthLayerStatus {
    return {
      enabled: this.enabled,
      source: this.source,
      state: this.state,
      deviceId: this.deviceId,
      lastErrorName: this.lastErrorName,
      lastErrorMessage: this.lastErrorMessage,
      framesIn: this.framesIn,
      framesProcessed: this.framesProcessed,
      sourceSize: { w: this.sourceW, h: this.sourceH },
      procSize: { w: this.procW, h: this.procH },
      fpsIn: this.fpsIn,
      fpsProc: this.fpsProc,
      procIntervalMs: this.procIntervalMs,
      procMaxSide: this.procMaxSide,
      perfTier: this.perfTier,
      procCostMs: this.procCostMs,
      procCostAvgMs: this.procCostAvgMs,
      procBlurPx: this.procBlurPx,
    };
  }

  /** WebSocket path: external code pushes frames here. */
  setFrame(frame: ImageBitmap) {
    if (this.source !== "ws" && this.source !== "idepth") {
      try {
        frame.close();
      } catch {
        // ignore
      }
      return;
    }

    const ctx = this.depthCtx;
    const canvas = this.depthCanvas;
    const tex = this.depthTex;
    if (!ctx || !canvas || !tex) {
      try {
        frame.close();
      } catch {
        // ignore
      }
      return;
    }

    const w = Math.max(1, Math.floor(frame.width));
    const h = Math.max(1, Math.floor(frame.height));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(frame, 0, 0, w, h);
    try {
      frame.close();
    } catch {
      // ignore
    }
    tex.needsUpdate = true;

    this.sourceW = w;
    this.sourceH = h;
    this.framesIn++;
    this.bumpInFps();

    this.needsProcess = true;
    this.ensureLoopRunning();
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (this.mesh) this.mesh.visible = enabled;

    if (!enabled) {
      this.stopWebcam();
      this.stopLoop();
      this.state = "idle";
      return;
    }

    if (this.source === "webcam") {
      void this.startWebcam();
    } else {
      // ws/idepth: rely on external frames.
      this.ensureLoopRunning();
    }
  }

  applyParams(params: Record<string, unknown>) {
    const p = params as any;

    const rawSource = String(p?.source ?? "").trim();
    const nextSource: DepthLayerSource =
      rawSource === "idepth" ? "idepth" : rawSource === "ws" ? "ws" : "webcam";
    const sourceChanged = nextSource !== this.source;
    if (sourceChanged) {
      this.source = nextSource;
      // Switching sources: stop webcam capture.
      this.stopWebcam();
      this.state = this.enabled
        ? this.source === "webcam"
          ? "connecting"
          : "idle"
        : "idle";
      if (this.enabled && this.source === "webcam") {
        void this.startWebcam();
      }
    }

    const rawDeviceId =
      typeof p?.deviceId === "string" ? p.deviceId.trim() : "";
    const nextDeviceId = rawDeviceId ? rawDeviceId : null;
    const deviceChanged = nextDeviceId !== this.deviceId;
    if (deviceChanged) {
      this.deviceId = nextDeviceId;
      if (this.enabled && this.source === "webcam") {
        this.stopWebcam();
        void this.startWebcam();
      }
    }

    const rawOpacity = p?.opacity;
    if (rawOpacity != null) {
      const next = Number(rawOpacity);
      if (Number.isFinite(next)) this.opacity = Math.min(1, Math.max(0, next));
    }

    const near = Number(p?.near);
    if (Number.isFinite(near)) this.near = Math.min(1, Math.max(0, near));
    const far = Number(p?.far);
    if (Number.isFinite(far)) this.far = Math.min(1, Math.max(0, far));
    this.invert = Boolean(p?.invert);
    this.showDepth = Boolean(p?.showDepth);

    const layers = Number(p?.layers);
    if (Number.isFinite(layers))
      this.layers = Math.min(28, Math.max(3, Math.round(layers)));
    const bw = Number(p?.bw);
    if (Number.isFinite(bw)) this.bw = Math.min(0.35, Math.max(0.01, bw));
    const fog = Number(p?.fog);
    if (Number.isFinite(fog)) this.fog = Math.min(2.5, Math.max(0, fog));
    const fall = Number(p?.fall);
    if (Number.isFinite(fall)) this.fall = Math.min(3, Math.max(0, fall));
    const edge = Number(p?.edge);
    if (Number.isFinite(edge)) this.edge = Math.min(4, Math.max(0, edge));
    const blur = Number(p?.blur);
    if (Number.isFinite(blur))
      this.blur = Math.min(30, Math.max(0, Math.round(blur)));
    const noise = Number(p?.noise);
    if (Number.isFinite(noise)) this.noise = Math.min(1, Math.max(0, noise));
    const scale = Number(p?.scale);
    if (Number.isFinite(scale)) this.scale = Math.min(2, Math.max(0.5, scale));
    const fps = Number(p?.fps);
    if (Number.isFinite(fps))
      this.fps = Math.min(30, Math.max(5, Math.round(fps)));

    if (this.material) {
      const effectiveOpacity = Math.min(
        1,
        Math.max(0, this.opacity * this.overlayOpacityMultiplier)
      );
      this.material.uniforms.u_opacity.value = effectiveOpacity;
      this.material.uniforms.u_showDepth.value = this.showDepth ? 1 : 0;
      this.material.needsUpdate = true;
    }

    // Any parameter change can affect processing.
    this.needsProcess = true;
    if (this.enabled) this.ensureLoopRunning();
  }

  dispose() {
    this.stopWebcam();
    this.stopLoop();

    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
    if (this.material) {
      this.material.dispose();
      this.material = null;
    }
    if (this.depthTex) {
      this.depthTex.dispose();
      this.depthTex = null;
    }
    if (this.fogTex) {
      this.fogTex.dispose();
      this.fogTex = null;
    }
    this.depthCtx = null;
    this.depthCanvas = null;
    this.fogRawCtx = null;
    this.fogRawCanvas = null;
    this.fogCtx = null;
    this.fogCanvas = null;
    this.fogImageData = null;
  }

  private stopLoop() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  private ensureLoopRunning() {
    if (!this.enabled) return;
    if (this.rafId) return;
    this.rafId = requestAnimationFrame((t) => this.loop(t));
  }

  private loop(nowMs: number) {
    this.rafId = 0;
    if (!this.enabled) return;

    // Webcam: pull a frame at a fixed fps.
    if (
      this.source === "webcam" &&
      this.videoEl &&
      this.state === "streaming"
    ) {
      const intervalMs = 1000 / Math.max(5, this.fps);
      if (nowMs - this.lastCaptureMs >= intervalMs) {
        this.lastCaptureMs = nowMs;
        this.captureDepthFromVideo();
      }
    }

    // Process if we have new input or params changed, but throttle when low impact.
    if (this.needsProcess) {
      const effectiveOpacity = Math.min(
        1,
        Math.max(0, this.opacity * this.overlayOpacityMultiplier)
      );
      const intervalMs = this.computeProcIntervalMs(effectiveOpacity);
      if (!this.lastProcessMs || nowMs - this.lastProcessMs >= intervalMs) {
        const srcW = this.depthCanvas?.width ?? 0;
        const srcH = this.depthCanvas?.height ?? 0;
        this.procIntervalMs = intervalMs;
        this.procMaxSide = this.computeMaxProcSide(
          srcW,
          srcH,
          effectiveOpacity
        );
        this.lastProcessMs = nowMs;
        this.needsProcess = false;
        if (effectiveOpacity >= 0.02 || this.showDepth) {
          this.buildFogFromDepth(nowMs, this.procMaxSide, effectiveOpacity);
        }
      }
    }

    this.rafId = requestAnimationFrame((t) => this.loop(t));
  }

  private bumpInFps() {
    const now = performance.now();
    if (!this.lastInMs) {
      this.lastInMs = now;
      return;
    }
    const dt = now - this.lastInMs;
    this.lastInMs = now;
    if (dt > 0) this.fpsIn = 0.9 * this.fpsIn + 0.1 * (1000 / dt);
  }

  private bumpProcFps() {
    const now = performance.now();
    if (!this.lastProcMs) {
      this.lastProcMs = now;
      return;
    }
    const dt = now - this.lastProcMs;
    this.lastProcMs = now;
    if (dt > 0) this.fpsProc = 0.9 * this.fpsProc + 0.1 * (1000 / dt);
  }

  private stopWebcam() {
    const s = this.stream;
    this.stream = null;
    if (s) {
      for (const t of s.getTracks()) {
        try {
          t.stop();
        } catch {
          // ignore
        }
      }
    }
    if (this.videoEl) {
      try {
        this.videoEl.pause();
      } catch {
        // ignore
      }
      this.videoEl.srcObject = null;
      this.videoEl = null;
    }
  }

  private async startWebcam() {
    if (!this.enabled) return;
    if (this.source !== "webcam") return;

    this.stopWebcam();
    this.state = "connecting";
    this.lastErrorName = null;
    this.lastErrorMessage = null;

    let stream: MediaStream | null = null;
    try {
      const constraints: MediaStreamConstraints = {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 60 },
          ...(this.deviceId ? { deviceId: { exact: this.deviceId } } : {}),
        },
        audio: false,
      };
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();

      // Guard against async races: stop the stream if the layer was disabled or source switched.
      if (!this.enabled || this.source !== "webcam") {
        for (const t of stream.getTracks()) {
          try {
            t.stop();
          } catch {
            // ignore
          }
        }
        return;
      }

      this.stream = stream;
      this.videoEl = video;
      this.state = "streaming";

      // Update texture aspect for cover.
      const vw = video.videoWidth || 0;
      const vh = video.videoHeight || 0;
      this.sourceW = vw;
      this.sourceH = vh;
      if (this.material) {
        this.material.uniforms.u_texAspect.value = vw && vh ? vw / vh : 1;
      }

      this.ensureLoopRunning();
    } catch (err) {
      if (stream) {
        for (const t of stream.getTracks()) {
          try {
            t.stop();
          } catch {
            // ignore
          }
        }
      }
      this.state = "error";
      const e = err as any;
      this.lastErrorName =
        typeof e?.name === "string" ? e.name : "UnknownError";
      this.lastErrorMessage =
        typeof e?.message === "string" ? e.message : String(err);
    }
  }

  private captureDepthFromVideo() {
    const video = this.videoEl;
    const ctx = this.depthCtx;
    const canvas = this.depthCanvas;
    const tex = this.depthTex;
    if (!video || !ctx || !canvas || !tex) return;
    const vw = video.videoWidth || 0;
    const vh = video.videoHeight || 0;
    if (!vw || !vh) return;

    // Keep a full-res raw depth buffer for debug preview.
    if (canvas.width !== vw) canvas.width = vw;
    if (canvas.height !== vh) canvas.height = vh;
    ctx.drawImage(video, 0, 0, vw, vh);
    tex.needsUpdate = true;

    this.sourceW = vw;
    this.sourceH = vh;
    this.framesIn++;
    this.bumpInFps();
    this.needsProcess = true;

    if (this.material) {
      this.material.uniforms.u_hasDepth.value = 1;
      this.material.uniforms.u_texAspect.value = vw / vh;
    }
  }

  private clamp01(x: number) {
    return Math.max(0, Math.min(1, x));
  }

  private hash(x: number, y: number, t: number) {
    const s = Math.sin(x * 12.9898 + y * 78.233 + t * 0.8) * 43758.5453;
    return s - Math.floor(s);
  }

  private computeProcIntervalMs(effectiveOpacity: number) {
    const base = 1000 / Math.max(5, this.fps);
    let interval = base;
    if (!this.showDepth) {
      if (effectiveOpacity < 0.25) interval = Math.max(interval, 1000 / 10);
      if (effectiveOpacity < 0.12) interval = Math.max(interval, 1000 / 8);
    }
    if (this.perfTier >= 1) interval = Math.max(interval, 1000 / 9);
    if (this.perfTier >= 2) interval = Math.max(interval, 1000 / 6);
    return interval;
  }

  private computeMaxProcSide(
    srcW: number,
    srcH: number,
    effectiveOpacity: number
  ) {
    const pixels = Math.max(1, Math.floor(srcW * srcH));
    let maxSide = 1024;
    if (pixels >= 2560 * 1440) maxSide = 640;
    else if (pixels >= 1920 * 1080) maxSide = 768;
    if (!this.showDepth) {
      if (effectiveOpacity < 0.2) maxSide = Math.min(maxSide, 640);
      if (effectiveOpacity < 0.1) maxSide = Math.min(maxSide, 512);
    }
    if (this.perfTier === 1) maxSide = Math.floor(maxSide * 0.85);
    if (this.perfTier === 2) maxSide = Math.floor(maxSide * 0.7);
    return Math.max(320, maxSide);
  }

  private computeBlurPx(effectiveOpacity: number) {
    let blur = Math.max(0, Number(this.blur) || 0);
    if (this.perfTier === 1) blur *= 0.7;
    if (this.perfTier === 2) blur *= 0.45;
    if (!this.showDepth) {
      if (effectiveOpacity < 0.12) blur *= 0.7;
      else if (effectiveOpacity < 0.2) blur *= 0.85;
    }
    return Math.max(0, Math.round(blur));
  }

  private updatePerfTier(costMs: number, intervalMs: number, nowMs: number) {
    const clamped = Math.max(0, Math.min(200, costMs));
    this.procCostMs = clamped;
    this.procCostAvgMs = this.procCostAvgMs
      ? this.procCostAvgMs * 0.85 + clamped * 0.15
      : clamped;

    if (nowMs < this.perfTierHoldUntilMs) return;

    const budgetMs = Math.min(14, Math.max(6, intervalMs * 0.35));
    const promote = budgetMs * 1.2;
    const recover = budgetMs * 0.7;
    let next = this.perfTier;
    if (this.procCostAvgMs > promote && this.perfTier < 2) {
      next = (this.perfTier + 1) as 0 | 1 | 2;
    } else if (this.procCostAvgMs < recover && this.perfTier > 0) {
      next = (this.perfTier - 1) as 0 | 1 | 2;
    }
    if (next !== this.perfTier) {
      this.perfTier = next;
      this.perfTierHoldUntilMs = nowMs + 1500;
    }
  }

  private buildFogFromDepth(
    nowMs: number,
    maxSideInput: number,
    effectiveOpacity: number
  ) {
    const tStart =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const depthCtx = this.depthCtx;
    const depthCanvas = this.depthCanvas;
    const fogRawCtx = this.fogRawCtx;
    const fogRawCanvas = this.fogRawCanvas;
    const fogCtx = this.fogCtx;
    const fogCanvas = this.fogCanvas;
    const fogTex = this.fogTex;
    if (
      !depthCtx ||
      !depthCanvas ||
      !fogRawCtx ||
      !fogRawCanvas ||
      !fogCtx ||
      !fogCanvas ||
      !fogTex ||
      !this.material
    )
      return;

    const srcW = depthCanvas.width;
    const srcH = depthCanvas.height;
    if (srcW < 2 || srcH < 2) {
      this.material.uniforms.u_hasDepth.value = 0;
      return;
    }

    // Processing size (downsample for performance).
    const qualityScale =
      this.perfTier === 2 ? 0.7 : this.perfTier === 1 ? 0.85 : 1;
    const targetScale = Math.max(0.25, this.scale * qualityScale);
    const targetW = Math.max(2, Math.floor(srcW * targetScale));
    const targetH = Math.max(2, Math.floor(srcH * targetScale));
    const maxSideRaw = Math.floor(Number(maxSideInput));
    const maxSide =
      Number.isFinite(maxSideRaw) && maxSideRaw > 0 ? maxSideRaw : 1024;
    const down = Math.max(1, Math.max(targetW, targetH) / maxSide);
    const w = Math.max(2, Math.floor(targetW / down));
    const h = Math.max(2, Math.floor(targetH / down));

    if (fogRawCanvas.width !== w) fogRawCanvas.width = w;
    if (fogRawCanvas.height !== h) fogRawCanvas.height = h;
    if (fogCanvas.width !== w) fogCanvas.width = w;
    if (fogCanvas.height !== h) fogCanvas.height = h;

    // Draw depth into fogRawCanvas at processing resolution.
    fogRawCtx.setTransform(1, 0, 0, 1, 0, 0);
    fogRawCtx.clearRect(0, 0, w, h);
    fogRawCtx.drawImage(depthCanvas, 0, 0, w, h);

    const img = fogRawCtx.getImageData(0, 0, w, h);
    const data = img.data;

    if (
      !this.fogImageData ||
      this.fogImageData.width !== w ||
      this.fogImageData.height !== h
    ) {
      this.fogImageData = fogRawCtx.createImageData(w, h);
    }
    const outImg = this.fogImageData;
    const out = outImg.data;

    const near = this.near;
    const far = this.far;
    const inv = this.invert;
    const layers = this.layers;
    const bw = Math.max(1e-6, this.bw);
    const fog = this.fog;
    const fall = Math.max(0, this.fall);
    const edgeK = this.edge;
    const noiseK = this.noise;
    const t = nowMs * 0.001;

    const getZ = (ix: number, iy: number) => {
      const i = (iy * w + ix) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const z0 = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      const z1 = inv ? 1 - z0 : z0;
      const denom = Math.max(1e-6, far - near);
      return this.clamp01((z1 - near) / denom);
    };

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const z = getZ(x, y);

        const p = z * layers;
        const frac = p - Math.floor(p);
        const d = Math.abs(frac - 0.5) * 2;
        let band = 1 - d / bw;
        band = this.clamp01(band);

        const zx = x < w - 1 ? getZ(x + 1, y) : z;
        const zy = y < h - 1 ? getZ(x, y + 1) : z;
        const grad = Math.abs(zx - z) + Math.abs(zy - z);
        const edge = this.clamp01(grad * 8) * edgeK;

        const falloff = Math.pow(1 - z, fall);
        const n = (this.hash(x * 0.7, y * 0.7, t) - 0.5) * 2;
        const n2 = 1 + n * noiseK * 0.25;

        let a = (band * 0.65 + edge * 0.35) * fog * falloff * n2;
        a = this.clamp01(a);

        const i = (y * w + x) * 4;
        out[i] = 255;
        out[i + 1] = 255;
        out[i + 2] = 255;
        out[i + 3] = Math.floor(a * 255);
      }
    }

    // Put raw fog.
    fogRawCtx.putImageData(outImg, 0, 0);

    // Optional blur.
    const blurPx = this.computeBlurPx(effectiveOpacity);
    this.procBlurPx = blurPx;
    fogCtx.setTransform(1, 0, 0, 1, 0, 0);
    fogCtx.clearRect(0, 0, w, h);
    if (blurPx > 0) {
      fogCtx.filter = `blur(${blurPx}px)`;
      fogCtx.drawImage(fogRawCanvas, 0, 0, w, h);
      fogCtx.filter = "none";
    } else {
      fogCtx.drawImage(fogRawCanvas, 0, 0, w, h);
    }

    fogTex.needsUpdate = true;
    this.material.uniforms.u_hasDepth.value = 1;

    this.procW = w;
    this.procH = h;
    this.framesProcessed++;
    this.bumpProcFps();
    const tEnd =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    this.updatePerfTier(tEnd - tStart, this.procIntervalMs, nowMs);
  }
}
