import * as THREE from 'three';
import type { Layer } from './Layer';
import type { CameraFeatureConfig } from '../config/cameraSources';
import { LiDARClient } from '../camera/LiDARClient';

type CameraLayerState = 'idle' | 'connecting' | 'streaming' | 'error';

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
  private client: LiDARClient;
  private state: CameraLayerState = 'idle';

  constructor(private readonly config: CameraFeatureConfig) {
    this.client = new LiDARClient({
      source: config.source,
      onStateChange: (s) => this.state = mapState(s)
    });
  }

  async init(scene: THREE.Scene) {
    // Geometry covers the normalized device coordinates; SceneManager will handle camera.
    const geometry = new THREE.PlaneGeometry(2, 2);
    this.material = new THREE.MeshBasicMaterial({
      color: 0x111111,
      transparent: true,
      opacity: 0.9
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    await this.startStream();
  }

  private async startStream() {
    try {
      this.state = 'connecting';
      const stream = await this.client.start();
      const videoTrack = stream?.getVideoTracks()[0];
      if (!videoTrack) {
        this.state = 'error';
        return;
      }
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();

      this.videoTexture = new THREE.VideoTexture(video);
      this.videoTexture.colorSpace = THREE.SRGBColorSpace;
      this.material?.setValues({
        map: this.videoTexture,
        color: undefined,
        opacity: 1
      });
      this.state = 'streaming';
    } catch (error) {
      console.warn('CameraLayer: failed to start stream', error);
      this.state = 'error';
    }
  }

  update(_deltaTime: number) {
    if (this.videoTexture) {
      this.videoTexture.needsUpdate = true;
    }
  }

  onResize(_width: number, _height: number) {
    // PlaneGeometry in NDC space; no-op here.
  }

  dispose() {
    this.client.stop();
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
}

function mapState(state: 'idle' | 'requesting' | 'streaming' | 'error' | 'stopped'): CameraLayerState {
  if (state === 'requesting') return 'connecting';
  if (state === 'streaming') return 'streaming';
  if (state === 'error') return 'error';
  return 'idle';
}
