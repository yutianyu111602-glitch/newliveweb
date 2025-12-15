export type CameraSourceKind = 'local' | 'webrtc';

export interface CameraSource {
  id: string;
  label: string;
  kind: CameraSourceKind;
  // For local camera fallback.
  constraints?: MediaStreamConstraints;
  // For future WebRTC/ARKit publisher.
  signalingUrl?: string;
  token?: string;
  preferredResolution?: { width: number; height: number; frameRate?: number };
}

export interface CameraFeatureConfig {
  enabled: boolean;
  source: CameraSource;
}

export const DEFAULT_CAMERA_SOURCE: CameraSource = {
  id: 'local-camera',
  label: 'Local camera',
  kind: 'local',
  constraints: {
    video: {
      width: { ideal: 640 },
      height: { ideal: 360 },
      frameRate: { ideal: 30 }
    },
    audio: false
  }
};

export const CAMERA_FEATURE: CameraFeatureConfig = {
  enabled: false, // Set true to mount the CameraLayer placeholder.
  source: DEFAULT_CAMERA_SOURCE
};
