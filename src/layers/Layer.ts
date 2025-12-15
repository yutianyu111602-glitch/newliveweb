import type * as THREE from 'three';

export interface Layer {
  init(scene: THREE.Scene, renderer: THREE.WebGLRenderer): void | Promise<void>;
  update(deltaTime: number): void;
  dispose(): void;
  onResize?(width: number, height: number): void;
}
