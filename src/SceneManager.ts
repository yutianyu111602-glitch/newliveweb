import * as THREE from 'three';
import type { Layer } from './layers/Layer';

// Use an orthographic camera with a fixed 2x2 view so a 2x2 quad covers the viewport.
export class SceneManager {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private animationFrameId: number | null = null;
  private lastFrameTime = 0;
  private layers: Layer[] = [];

  constructor(private canvas: HTMLCanvasElement) {
    const { width, height } = this.getViewportSize();

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    // Update the canvas drawingbuffer size to match CSS pixels.
    // (Leaving this false can result in a stretched / mismatched render target.)
    this.renderer.setSize(width, height, true);

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    this.camera.position.set(0, 0, 1);
    this.camera.lookAt(new THREE.Vector3(0, 0, 0));

    window.addEventListener('resize', this.handleResize);
  }

  getRendererInfo() {
    return {
      pixelRatio: this.renderer.getPixelRatio(),
      outputColorSpace: this.renderer.outputColorSpace,
      toneMapping: this.renderer.toneMapping
    };
  }

  async addLayer(layer: Layer) {
    this.layers.push(layer);
    await layer.init(this.scene, this.renderer);
    const { width, height } = this.getViewportSize();
    layer.onResize?.(width, height);
  }

  private handleResize = () => {
    const { width, height } = this.getViewportSize();

    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, true);

    this.layers.forEach((layer) => layer.onResize?.(width, height));
  };

  private getViewportSize() {
    const parent = this.canvas.parentElement;
    const rect = parent?.getBoundingClientRect();
    const width = rect?.width || this.canvas.clientWidth || window.innerWidth;
    const height = rect?.height || this.canvas.clientHeight || window.innerHeight;
    return { width, height };
  }

  start() {
    const renderLoop = (time: number) => {
      const deltaTime = this.lastFrameTime ? (time - this.lastFrameTime) / 1000 : 0;
      this.lastFrameTime = time;

      this.layers.forEach((layer) => layer.update(deltaTime));

      this.renderer.setClearColor(0x000000, 1);
      this.renderer.render(this.scene, this.camera);
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
    window.removeEventListener('resize', this.handleResize);
    this.layers.forEach((layer) => layer.dispose());
    this.layers = [];
    this.renderer.dispose();
  }
}
