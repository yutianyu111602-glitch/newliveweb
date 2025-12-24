import * as THREE from "three";
import type { Layer } from "./Layer";

export class BasicBackgroundLayer implements Layer {
  private mesh: THREE.Mesh | null = null;
  private material: THREE.ShaderMaterial | null = null;

  private enabled = false;
  private speed = 0.2;
  private opacity = 1;
  private overlayOpacityMultiplier = 1;

  init(scene: THREE.Scene, _renderer: THREE.WebGLRenderer) {
    const geometry = new THREE.PlaneGeometry(2, 2);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        u_time: { value: 0 },
        u_opacity: { value: this.opacity },
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
        uniform float u_time;
        uniform float u_opacity;
        void main() {
          vec3 c1 = vec3(0.12, 0.13, 0.2);
          vec3 c2 = vec3(0.08, 0.08, 0.12);
          float t = 0.5 + 0.5 * sin(u_time * 0.2 + vUv.x * 2.0);
          gl_FragColor = vec4(mix(c1, c2, t), clamp(u_opacity, 0.0, 1.0));
        }
      `,
      depthTest: false,
      depthWrite: false,
      transparent: this.opacity < 1,
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    // Layer 0: backgrounds (default pass).
    this.mesh.layers.set(0);
    // Render above LiquidMetal (which is renderOrder=1) so Basic can act as a foreground overlay.
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);

    this.setEnabled(false);
  }

  update(deltaTime: number) {
    if (!this.material) return;
    if (!this.enabled) return;
    this.material.uniforms.u_time.value += deltaTime * Math.max(0, this.speed);
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (this.mesh) this.mesh.visible = enabled;
  }

  applyParams(params: Record<string, unknown>) {
    const rawSpeed = (params as any)?.speed;
    if (rawSpeed != null) {
      const next = Number(rawSpeed);
      if (Number.isFinite(next)) this.speed = Math.min(1, Math.max(0, next));
    }

    const rawOpacity = (params as any)?.opacity;
    if (rawOpacity != null) {
      const next = Number(rawOpacity);
      if (Number.isFinite(next)) this.opacity = Math.min(1, Math.max(0, next));
    }

    if (this.material) {
      const effective = Math.min(
        1,
        Math.max(0, this.opacity * this.overlayOpacityMultiplier)
      );
      this.material.uniforms.u_opacity.value = effective;
      this.material.transparent = effective < 1;
      this.material.needsUpdate = true;
    }
  }

  // Runtime-only: compositor/overlay budget can fade the layer without mutating opacity.
  setOverlayOpacityMultiplier(value01: number) {
    const v = Number(value01);
    this.overlayOpacityMultiplier = Number.isFinite(v)
      ? Math.min(1, Math.max(0, v))
      : 1;
    if (this.material) {
      const effective = Math.min(
        1,
        Math.max(0, this.opacity * this.overlayOpacityMultiplier)
      );
      this.material.uniforms.u_opacity.value = effective;
      this.material.transparent = effective < 1;
      this.material.needsUpdate = true;
    }
  }

  getOpacity() {
    return Math.min(
      1,
      Math.max(0, this.opacity * this.overlayOpacityMultiplier)
    );
  }

  dispose() {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
    if (this.material) {
      this.material.dispose();
      this.material = null;
    }
  }
}
