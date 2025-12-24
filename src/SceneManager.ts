import * as THREE from "three";
import type { Layer } from "./layers/Layer";

// Use an orthographic camera with a fixed 2x2 view so a 2x2 quad covers the viewport.
export class SceneManager {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private animationFrameId: number | null = null;
  private lastFrameTime = 0;
  private layers: Layer[] = [];
  private pixelRatioCap = 2;

  private viewportWidth = 0;
  private viewportHeight = 0;
  private resizeObserver: ResizeObserver | null = null;

  private compositorEnabled = false;
  private compositorBlendMode:
    | "normal"
    | "add"
    | "screen"
    | "multiply"
    | "overlay"
    | "difference"
    | "exclusion"
    | "color-dodge" = "add";

  private compositorTargetMode: "viewport" | "fixed" = "viewport";
  private compositorFixedWidth = 1280;
  private compositorFixedHeight = 720;
  private compositorBypassProjectM = false;

  private compositorShaderVersion = "v2-linearToOutputTexel" as const;
  private compositorRtColorSpace = "LinearSRGBColorSpace" as const;

  private lastCompositorCpuMs = 0;
  private lastCompositorPasses = 0;
  private lastCompositorBypass = false;
  private lastCompositorEnsureMs = 0;
  private lastCompositorBgMs = 0;
  private lastCompositorPmMs = 0;
  private lastCompositorCompositeMs = 0;
  private lastCompositorRtKey: string | null = null;
  private lastCompositorRtWidth = 0;
  private lastCompositorRtHeight = 0;
  private lastCompositorViewportWidth = 0;
  private lastCompositorViewportHeight = 0;

  private rtPool = new Map<
    string,
    {
      bg: THREE.WebGLRenderTarget;
      pm: THREE.WebGLRenderTarget;
      lastUsedMs: number;
    }
  >();
  private rtBackground: THREE.WebGLRenderTarget | null = null;
  private rtProjectM: THREE.WebGLRenderTarget | null = null;
  private lastRtReallocMs = 0;
  private rtAllocCount = 0;
  private rtEvictCount = 0;
  private lastRtAllocEvent: {
    timeMs: number;
    key: string;
    width: number;
    height: number;
    poolSize: number;
    evictedKey?: string | null;
  } | null = null;
  private compositeScene: THREE.Scene | null = null;
  private compositeCamera: THREE.OrthographicCamera | null = null;
  private compositeMaterial: THREE.ShaderMaterial | null = null;
  private compositeMesh: THREE.Mesh | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private hooks?: {
      onAfterRender?: (opts: {
        timeMs: number;
        deltaTimeSec: number;
        canvas: HTMLCanvasElement;
      }) => void;
    }
  ) {
    const { width, height } = this.measureViewportSize();
    this.viewportWidth = width;
    this.viewportHeight = height;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, this.pixelRatioCap)
    );
    // Update the canvas drawingbuffer size to match CSS pixels.
    // (Leaving this false can result in a stretched / mismatched render target.)
    this.renderer.setSize(width, height, true);
    this.renderer.setClearColor(0x000000, 1);

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    this.camera.position.set(0, 0, 1);
    this.camera.lookAt(new THREE.Vector3(0, 0, 0));
    // Render both background (layer 0) and ProjectM (layer 1) in the default path.
    this.camera.layers.enable(1);

    window.addEventListener("resize", this.handleResize);
    const parent = this.canvas.parentElement;
    if (parent && typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => {
        this.handleResize();
      });
      this.resizeObserver.observe(parent);
    }
  }

  getRendererInfo() {
    let premultipliedAlpha: boolean | null = null;
    try {
      const attrs = this.renderer.getContext()?.getContextAttributes?.();
      premultipliedAlpha = attrs ? Boolean(attrs.premultipliedAlpha) : null;
    } catch {
      premultipliedAlpha = null;
    }
    return {
      pixelRatio: this.renderer.getPixelRatio(),
      outputColorSpace: this.renderer.outputColorSpace,
      toneMapping: this.renderer.toneMapping,
      toneMappingExposure: Number(this.renderer.toneMappingExposure ?? 1),
      premultipliedAlpha,
    };
  }

  setPixelRatioCap(cap: number) {
    const v = Number(cap);
    if (!Number.isFinite(v) || v <= 0) return;
    const next = Math.max(0.5, Math.min(2, v));
    if (Math.abs(next - this.pixelRatioCap) < 1e-3) return;
    this.pixelRatioCap = next;
    const ratio = Math.min(window.devicePixelRatio || 1, this.pixelRatioCap);
    this.renderer.setPixelRatio(ratio);
    const { width, height } = this.getViewportSize();
    this.renderer.setSize(width, height, true);
    if (this.compositorEnabled) {
      this.ensureCompositorResources(width, height);
    }
  }

  async addLayer(layer: Layer) {
    this.layers.push(layer);
    await layer.init(this.scene, this.renderer);
    const { width, height } = this.getViewportSize();
    layer.onResize?.(width, height);
  }

  private handleResize = () => {
    const { width, height } = this.measureViewportSize();
    this.viewportWidth = width;
    this.viewportHeight = height;

    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, true);

    if (this.compositorEnabled) {
      this.ensureCompositorResources(width, height);
    }

    this.layers.forEach((layer) => layer.onResize?.(width, height));
  };

  private measureViewportSize() {
    const parent = this.canvas.parentElement;
    const rect = parent?.getBoundingClientRect();
    const width = rect?.width || this.canvas.clientWidth || window.innerWidth;
    const height =
      rect?.height || this.canvas.clientHeight || window.innerHeight;
    return { width, height };
  }

  private getViewportSize() {
    // Use cached values to avoid layout reads in the render loop.
    const width =
      this.viewportWidth || this.canvas.clientWidth || window.innerWidth;
    const height =
      this.viewportHeight || this.canvas.clientHeight || window.innerHeight;
    return { width, height };
  }

  start() {
    const renderLoop = (time: number) => {
      const deltaTime = this.lastFrameTime
        ? (time - this.lastFrameTime) / 1000
        : 0;
      this.lastFrameTime = time;

      this.layers.forEach((layer) => layer.update(deltaTime));

      if (this.compositorEnabled) {
        const { width, height } = this.getViewportSize();
        this.renderWithCompositor(width, height);
      } else {
        this.renderer.render(this.scene, this.camera);
      }

      try {
        this.hooks?.onAfterRender?.({
          timeMs: time,
          deltaTimeSec: deltaTime,
          canvas: this.canvas,
        });
      } catch {
        // Never break rendering due to diagnostics/hooks.
      }
      this.animationFrameId = requestAnimationFrame(renderLoop);
    };

    this.lastFrameTime = performance.now();
    this.animationFrameId = requestAnimationFrame(renderLoop);
  }

  stop() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  dispose() {
    this.stop();
    window.removeEventListener("resize", this.handleResize);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.layers.forEach((layer) => layer.dispose());
    this.layers = [];
    this.disposeCompositorResources();
    this.renderer.dispose();
  }

  setCompositorEnabled(enabled: boolean) {
    this.compositorEnabled = enabled;
    if (!enabled) {
      this.disposeCompositorResources();
      return;
    }
    const { width, height } = this.getViewportSize();
    this.ensureCompositorResources(width, height);
  }

  setCompositorTargetMode(mode: "viewport" | "fixed") {
    const next = mode === "fixed" ? "fixed" : "viewport";
    if (this.compositorTargetMode === next) return;
    this.compositorTargetMode = next;
    // Rebuild targets for new sizing mode.
    if (this.compositorEnabled) {
      const { width, height } = this.getViewportSize();
      this.ensureCompositorResources(width, height);
    }
  }

  setCompositorFixedSize(width: number, height: number) {
    const w = Math.max(1, Math.floor(Number(width)));
    const h = Math.max(1, Math.floor(Number(height)));
    if (!Number.isFinite(w) || !Number.isFinite(h)) return;
    if (this.compositorFixedWidth === w && this.compositorFixedHeight === h)
      return;
    this.compositorFixedWidth = w;
    this.compositorFixedHeight = h;
    if (this.compositorEnabled && this.compositorTargetMode === "fixed") {
      const { width: vw, height: vh } = this.getViewportSize();
      this.ensureCompositorResources(vw, vh);
    }
  }

  getCompositorConfig() {
    return {
      enabled: this.compositorEnabled,
      blendMode: this.compositorBlendMode,
      targetMode: this.compositorTargetMode,
      fixedWidth: this.compositorFixedWidth,
      fixedHeight: this.compositorFixedHeight,
      poolSize: this.rtPool.size,
      shaderVersion: this.compositorShaderVersion,
      rtColorSpace: this.compositorRtColorSpace,
    } as const;
  }

  getCompositorProfile() {
    const cfg = this.getCompositorConfig();
    return {
      ...cfg,
      bypassProjectM: this.lastCompositorBypass,
      passesLastFrame: this.lastCompositorPasses,
      cpuMsLastFrame: this.lastCompositorCpuMs,
      ensureMsLastFrame: this.lastCompositorEnsureMs,
      bgMsLastFrame: this.lastCompositorBgMs,
      pmMsLastFrame: this.lastCompositorPmMs,
      compositeMsLastFrame: this.lastCompositorCompositeMs,
      rtKey: this.lastCompositorRtKey,
      rtWidth: this.lastCompositorRtWidth,
      rtHeight: this.lastCompositorRtHeight,
      viewportWidth: this.lastCompositorViewportWidth,
      viewportHeight: this.lastCompositorViewportHeight,
      lastRtReallocMs: this.lastRtReallocMs,
      rtAllocCount: this.rtAllocCount,
      rtEvictCount: this.rtEvictCount,
      lastRtAllocEvent: this.lastRtAllocEvent,
    } as const;
  }

  setCompositorBypassProjectM(enabled: boolean) {
    const next = Boolean(enabled);
    if (this.compositorBypassProjectM === next) return;
    this.compositorBypassProjectM = next;
  }

  getLastRtReallocMs() {
    return this.lastRtReallocMs;
  }

  setCompositorBlendMode(
    mode:
      | "normal"
      | "add"
      | "screen"
      | "multiply"
      | "overlay"
      | "difference"
      | "exclusion"
      | "color-dodge"
  ) {
    this.compositorBlendMode = mode;
    if (this.compositeMaterial) {
      this.compositeMaterial.uniforms.u_mode.value = this.modeToInt(mode);
    }
  }

  private modeToInt(
    mode:
      | "normal"
      | "add"
      | "screen"
      | "multiply"
      | "overlay"
      | "difference"
      | "exclusion"
      | "color-dodge"
  ) {
    switch (mode) {
      case "normal":
        return 0;
      case "add":
        return 1;
      case "screen":
        return 2;
      case "multiply":
        return 3;
      case "overlay":
        return 4;
      case "difference":
        return 5;
      case "exclusion":
        return 6;
      case "color-dodge":
        return 7;
      default:
        return 1;
    }
  }

  private ensureCompositorResources(
    viewportWidth: number,
    viewportHeight: number
  ) {
    const nowMs =
      typeof performance !== "undefined" ? performance.now() : Date.now();

    this.lastCompositorViewportWidth = Math.floor(viewportWidth);
    this.lastCompositorViewportHeight = Math.floor(viewportHeight);

    const w =
      this.compositorTargetMode === "fixed"
        ? Math.max(1, Math.floor(this.compositorFixedWidth))
        : Math.max(1, Math.floor(viewportWidth));
    const h =
      this.compositorTargetMode === "fixed"
        ? Math.max(1, Math.floor(this.compositorFixedHeight))
        : Math.max(1, Math.floor(viewportHeight));

    const key = `${w}x${h}`;

    this.lastCompositorRtKey = key;
    this.lastCompositorRtWidth = w;
    this.lastCompositorRtHeight = h;

    const pooled = this.rtPool.get(key);
    if (pooled) {
      pooled.lastUsedMs = nowMs;
      this.rtBackground = pooled.bg;
      this.rtProjectM = pooled.pm;
    } else {
      const opts: THREE.RenderTargetOptions = {
        depthBuffer: false,
        stencilBuffer: false,
      };

      const bg = new THREE.WebGLRenderTarget(w, h, opts);
      // Keep compositor intermediate buffers linear so blending happens in linear space.
      // The final conversion to display space is handled by renderer.outputColorSpace.
      bg.texture.colorSpace = THREE.LinearSRGBColorSpace;
      bg.texture.minFilter = THREE.LinearFilter;
      bg.texture.magFilter = THREE.LinearFilter;

      const pm = new THREE.WebGLRenderTarget(w, h, opts);
      pm.texture.colorSpace = THREE.LinearSRGBColorSpace;
      pm.texture.minFilter = THREE.LinearFilter;
      pm.texture.magFilter = THREE.LinearFilter;

      this.rtPool.set(key, { bg, pm, lastUsedMs: nowMs });
      this.rtBackground = bg;
      this.rtProjectM = pm;
      this.lastRtReallocMs = nowMs;
      this.rtAllocCount += 1;
      this.lastRtAllocEvent = {
        timeMs: nowMs,
        key,
        width: w,
        height: h,
        poolSize: this.rtPool.size,
        evictedKey: null,
      };

      // Keep pool small but allow headroom for resolution changes + multi-layer.
      // Increased from 3 to 5: reduces RT thrashing during preset switches.
      const MAX_POOL = 5;
      if (this.rtPool.size > MAX_POOL) {
        let oldestKey: string | null = null;
        let oldestTime = Infinity;
        for (const [k, v] of this.rtPool.entries()) {
          if (k === key) continue;
          if (v.lastUsedMs < oldestTime) {
            oldestTime = v.lastUsedMs;
            oldestKey = k;
          }
        }
        if (oldestKey) {
          const victim = this.rtPool.get(oldestKey);
          this.rtPool.delete(oldestKey);
          victim?.bg.dispose();
          victim?.pm.dispose();
          this.rtEvictCount += 1;
          if (this.lastRtAllocEvent && this.lastRtAllocEvent.key === key) {
            this.lastRtAllocEvent = {
              ...this.lastRtAllocEvent,
              evictedKey: oldestKey,
            };
          }
        }
      }
    }

    if (
      !this.compositeScene ||
      !this.compositeCamera ||
      !this.compositeMaterial ||
      !this.compositeMesh
    ) {
      this.compositeScene = new THREE.Scene();
      this.compositeCamera = new THREE.OrthographicCamera(
        -1,
        1,
        1,
        -1,
        0.1,
        10
      );
      this.compositeCamera.position.set(0, 0, 1);
      this.compositeCamera.lookAt(new THREE.Vector3(0, 0, 0));

      this.compositeMaterial = new THREE.ShaderMaterial({
        uniforms: {
          t_bg: { value: null },
          t_pm: { value: null },
          u_mode: { value: this.modeToInt(this.compositorBlendMode) },
        },
        toneMapped: false,
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = vec4(position.xy, 0.0, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          varying vec2 vUv;
          uniform sampler2D t_bg;
          uniform sampler2D t_pm;
          uniform int u_mode;

          vec3 blendNormal(vec3 bg, vec3 pm, float a) {
            return mix(bg, pm, a);
          }

          vec3 blendAdd(vec3 bg, vec3 pm, float a) {
            return bg + pm * a;
          }

          vec3 blendScreen(vec3 bg, vec3 pm, float a) {
            vec3 pmEff = pm * a;
            return 1.0 - (1.0 - bg) * (1.0 - pmEff);
          }

          vec3 blendMultiply(vec3 bg, vec3 pm, float a) {
            return mix(bg, bg * pm, a);
          }

          vec3 blendOverlay(vec3 bg, vec3 pm, float a) {
            vec3 o = mix(
              2.0 * bg * pm,
              1.0 - 2.0 * (1.0 - bg) * (1.0 - pm),
              step(vec3(0.5), bg)
            );
            return mix(bg, o, a);
          }

          vec3 blendDifference(vec3 bg, vec3 pm, float a) {
            vec3 d = abs(bg - pm);
            return mix(bg, d, a);
          }

          vec3 blendExclusion(vec3 bg, vec3 pm, float a) {
            vec3 e = bg + pm - 2.0 * bg * pm;
            return mix(bg, e, a);
          }

          vec3 blendColorDodge(vec3 bg, vec3 pm, float a) {
            vec3 denom = max(vec3(1e-4), vec3(1.0) - pm);
            vec3 cd = clamp(bg / denom, 0.0, 1.0);
            return mix(bg, cd, a);
          }

          void main() {
            vec4 bg = texture2D(t_bg, vUv);
            vec4 pm = texture2D(t_pm, vUv);
            float a = clamp(pm.a, 0.0, 1.0);
            vec3 outRgb;
            if (u_mode == 0) {
              outRgb = blendNormal(bg.rgb, pm.rgb, a);
            } else if (u_mode == 1) {
              outRgb = blendAdd(bg.rgb, pm.rgb, a);
            } else if (u_mode == 2) {
              outRgb = blendScreen(bg.rgb, pm.rgb, a);
            } else if (u_mode == 3) {
              outRgb = blendMultiply(bg.rgb, pm.rgb, a);
            } else if (u_mode == 4) {
              outRgb = blendOverlay(bg.rgb, pm.rgb, a);
            } else if (u_mode == 5) {
              outRgb = blendDifference(bg.rgb, pm.rgb, a);
            } else if (u_mode == 6) {
              outRgb = blendExclusion(bg.rgb, pm.rgb, a);
            } else if (u_mode == 7) {
              outRgb = blendColorDodge(bg.rgb, pm.rgb, a);
            } else {
              outRgb = blendAdd(bg.rgb, pm.rgb, a);
            }

            // outRgb is assumed linear (RTs are LinearSRGBColorSpace); convert to renderer output.
            gl_FragColor = linearToOutputTexel(vec4(clamp(outRgb, 0.0, 1.0), 1.0));
          }
        `,
        depthTest: false,
        depthWrite: false,
      });

      this.compositeMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2),
        this.compositeMaterial
      );
      this.compositeMesh.frustumCulled = false;
      this.compositeScene.add(this.compositeMesh);
    }
  }

  private disposeCompositorResources() {
    for (const v of this.rtPool.values()) {
      v.bg.dispose();
      v.pm.dispose();
    }
    this.rtPool.clear();
    this.rtBackground = null;
    this.rtProjectM = null;

    if (this.compositeMesh) {
      this.compositeMesh.geometry.dispose();
      this.compositeMesh = null;
    }
    this.compositeMaterial?.dispose();
    this.compositeMaterial = null;
    this.compositeScene = null;
    this.compositeCamera = null;
  }

  private renderWithCompositor(width: number, height: number) {
    const t0 =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    this.lastCompositorCpuMs = 0;
    this.lastCompositorPasses = 0;
    this.lastCompositorBypass = Boolean(this.compositorBypassProjectM);
    this.lastCompositorEnsureMs = 0;
    this.lastCompositorBgMs = 0;
    this.lastCompositorPmMs = 0;
    this.lastCompositorCompositeMs = 0;

    if (this.compositorBypassProjectM) {
      // Fast path: render background directly when ProjectM is effectively invisible.
      this.camera.layers.set(0);
      this.renderer.setRenderTarget(null);
      this.renderer.setClearColor(0x000000, 1);
      const tBg0 =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      this.renderer.render(this.scene, this.camera);
      const tBg1 =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      this.lastCompositorBgMs = Math.max(0, tBg1 - tBg0);
      this.camera.layers.enable(0);
      this.camera.layers.enable(1);

      this.lastCompositorPasses = 1;
      const t1 =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      this.lastCompositorCpuMs = Math.max(0, t1 - t0);
      return;
    }

    const tEnsure0 =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    this.ensureCompositorResources(width, height);
    const tEnsure1 =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    this.lastCompositorEnsureMs = Math.max(0, tEnsure1 - tEnsure0);
    if (
      !this.rtBackground ||
      !this.rtProjectM ||
      !this.compositeScene ||
      !this.compositeCamera ||
      !this.compositeMaterial
    ) {
      const t1 =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      this.lastCompositorCpuMs = Math.max(0, t1 - t0);
      return;
    }

    // Background pass (layer 0).
    const tBg0 =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    this.camera.layers.set(0);
    this.renderer.setRenderTarget(this.rtBackground);
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.clear(true, true, true);
    this.renderer.render(this.scene, this.camera);
    const tBg1 =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    this.lastCompositorBgMs = Math.max(0, tBg1 - tBg0);

    // ProjectM pass (layer 1). Clear alpha to 0 so we can use pm.a for blending.
    const tPm0 =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    this.camera.layers.set(1);
    this.renderer.setRenderTarget(this.rtProjectM);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear(true, true, true);
    this.renderer.render(this.scene, this.camera);
    const tPm1 =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    this.lastCompositorPmMs = Math.max(0, tPm1 - tPm0);

    // Composite to screen.
    const tComp0 =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    this.compositeMaterial.uniforms.t_bg.value = this.rtBackground.texture;
    this.compositeMaterial.uniforms.t_pm.value = this.rtProjectM.texture;
    this.renderer.setRenderTarget(null);
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.render(this.compositeScene, this.compositeCamera);
    const tComp1 =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    this.lastCompositorCompositeMs = Math.max(0, tComp1 - tComp0);

    // Restore default camera layers for any external render paths.
    this.camera.layers.enable(0);
    this.camera.layers.enable(1);

    this.lastCompositorPasses = 3;
    const t1 =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    this.lastCompositorCpuMs = Math.max(0, t1 - t0);
  }
}
