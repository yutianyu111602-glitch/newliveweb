import * as THREE from 'three';
import type { Layer } from './Layer';

export class BasicBackgroundLayer implements Layer {
  private mesh: THREE.Mesh | null = null;
  private material: THREE.ShaderMaterial | null = null;

  init(scene: THREE.Scene, _renderer: THREE.WebGLRenderer) {
    const geometry = new THREE.PlaneGeometry(2, 2);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        u_time: { value: 0 }
      },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        varying vec2 vUv;
        uniform float u_time;
        void main() {
          vec3 c1 = vec3(0.12, 0.13, 0.2);
          vec3 c2 = vec3(0.08, 0.08, 0.12);
          float t = 0.5 + 0.5 * sin(u_time * 0.2 + vUv.x * 2.0);
          gl_FragColor = vec4(mix(c1, c2, t), 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  update(deltaTime: number) {
    if (!this.material) return;
    this.material.uniforms.u_time.value += deltaTime;
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
