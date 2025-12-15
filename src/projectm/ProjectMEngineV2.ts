/**
 * ProjectM Engine V2 - Modern implementation based on official ProjectM v4.x C API
 * 
 * Key differences from V1:
 * - Uses official C API (projectm_create, projectm_destroy, etc.)
 * - Leverages Emscripten cwrap/ccall for function calls
 * - Dynamically loads WASM module from public directory (Vite compatible)
 * - Follows official integration guide from projectM wiki
 * 
 * References:
 * - https://github.com/projectM-visualizer/projectm/wiki/Integration-Quickstart-Guide
 * - https://github.com/projectM-visualizer/projectm/wiki/EMSCRIPTEN.md
 */

export interface ProjectMConfig {
  width: number;
  height: number;
  presetPath?: string;
  fps?: number;
  textureSize?: number;
  meshX?: number;
  meshY?: number;
}

// Emscripten Module interface (minimal subset we need)
interface EmscriptenModule {
  cwrap: (name: string, returnType: string | null, argTypes: string[]) => Function;
  ccall: (name: string, returnType: string | null, argTypes: string[], args: any[]) => any;
  _malloc: (size: number) => number;
  _free: (ptr: number) => void;
  HEAPF32: Float32Array;
  HEAP8: Int8Array;
  HEAPU8?: Uint8Array;
  getValue: (ptr: number, type: string) => any;
  setValue: (ptr: number, value: any, type: string) => void;
  FS?: any;
  GL?: any;
  canvas?: HTMLCanvasElement;
}

// ProjectM handle type (opaque pointer)
type ProjectMHandle = number;

export class ProjectMEngineV2 {
  private module: EmscriptenModule | null = null;
  private handle: ProjectMHandle | null = null;
  private canvas: HTMLCanvasElement;
  private config: ProjectMConfig;

  // Wrapped C API functions
  private projectm_create!: () => ProjectMHandle;
  private projectm_destroy!: (handle: ProjectMHandle) => void;
  private projectm_set_window_size!: (handle: ProjectMHandle, width: number, height: number) => void;
  private projectm_render_frame!: (handle: ProjectMHandle) => void;
  private projectm_pcm_add_float!: (handle: ProjectMHandle, samples: number, count: number, channels: number) => void;
  private projectm_load_preset_file!: (handle: ProjectMHandle, filename: number) => boolean;

  constructor(canvas: HTMLCanvasElement, config: ProjectMConfig) {
    this.canvas = canvas;
    this.config = {
      fps: 60,
      textureSize: 1024,
      meshX: 48,
      meshY: 32,
      ...config
    };
  }

  async initialize(): Promise<boolean> {
    try {
      console.log('🎨 ProjectM V2: Initializing...');

      // Step 1: Dynamically load Emscripten module from public directory
      // Vite要求使用动态加载而不是静态import
      const script = document.createElement('script');
      script.src = '/projectm-runtime/projectm.js';
      
      await new Promise<void>((resolve, reject) => {
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load projectm.js'));
        document.head.appendChild(script);
      });

      console.log('📦 ProjectM script loaded');

      // Step 2: Get the module factory from window
      const createModule = (window as any).createProjectMModule;
      if (typeof createModule !== 'function') {
        throw new Error('createProjectMModule not found on window');
      }

      // Step 3: Initialize WASM module with WebGL context
      this.module = await createModule({
        canvas: this.canvas,
        // Request WebGL2 context (required per EMSCRIPTEN.md)
        preinitializedWebGLContext: (() => {
          const gl = this.canvas.getContext('webgl2', {
            alpha: true,
            depth: true,
            stencil: true,
            antialias: false,
            premultipliedAlpha: true,
            preserveDrawingBuffer: false,
            powerPreference: 'high-performance'
          });
          
          if (!gl) {
            throw new Error('WebGL2 context creation failed');
          }
          
          console.log('✅ WebGL2 context created');
          return gl;
        })()
      }) as EmscriptenModule;

      console.log('✅ WASM module initialized');

      // Step 4: Wrap C API functions using cwrap
      this.wrapCApiFunctions();
      console.log('✅ C API functions wrapped');

      // Step 5: Create ProjectM instance
      this.handle = this.projectm_create();
      if (!this.handle) {
        throw new Error('projectm_create() returned null handle');
      }
      console.log(`✅ ProjectM instance created (handle: ${this.handle})`);

      // Step 6: Set window size
      this.projectm_set_window_size(this.handle, this.config.width, this.config.height);
      console.log(`✅ Window size set to ${this.config.width}x${this.config.height}`);

      // Step 7: Enable OES_texture_float extension (required per EMSCRIPTEN.md)
      if (this.module.GL) {
        try {
          const gl = this.canvas.getContext('webgl2');
          if (gl) {
            const ext = gl.getExtension('OES_texture_float');
            console.log(`✅ OES_texture_float extension: ${ext ? 'enabled' : 'not available'}`);
          }
        } catch (err) {
          console.warn('⚠️ Could not check WebGL extensions:', err);
        }
      }

      console.log('🎉 ProjectM V2 initialized successfully!');
      return true;

    } catch (error) {
      console.error('❌ ProjectM V2 initialization failed:', error);
      if (error instanceof Error) {
        console.error('Error details:', error.message);
        console.error('Stack:', error.stack);
      }
      return false;
    }
  }

  /**
   * Wrap C API functions using Emscripten's cwrap
   * Based on official ProjectM v4.x C API
   */
  private wrapCApiFunctions(): void {
    if (!this.module) {
      throw new Error('Module not loaded');
    }

    // Check if cwrap is available
    if (typeof this.module.cwrap !== 'function') {
      throw new Error('Emscripten cwrap not available - module may not be built correctly');
    }

    try {
      // projectm_handle projectm_create(void)
      this.projectm_create = this.module.cwrap('projectm_create', 'number', []) as () => ProjectMHandle;

      // void projectm_destroy(projectm_handle instance)
      this.projectm_destroy = this.module.cwrap('projectm_destroy', null, ['number']) as (handle: ProjectMHandle) => void;

      // void projectm_set_window_size(projectm_handle instance, size_t width, size_t height)
      this.projectm_set_window_size = this.module.cwrap('projectm_set_window_size', null, ['number', 'number', 'number']) as (handle: ProjectMHandle, width: number, height: number) => void;

      // void projectm_render_frame(projectm_handle instance)
      this.projectm_render_frame = this.module.cwrap('projectm_render_frame', null, ['number']) as (handle: ProjectMHandle) => void;

      // void projectm_pcm_add_float(projectm_handle instance, const float* samples, unsigned int count, int channels)
      this.projectm_pcm_add_float = this.module.cwrap('projectm_pcm_add_float', null, ['number', 'number', 'number', 'number']) as (handle: ProjectMHandle, samples: number, count: number, channels: number) => void;

      // bool projectm_load_preset_file(projectm_handle instance, const char* filename)
      this.projectm_load_preset_file = this.module.cwrap('projectm_load_preset_file', 'boolean', ['number', 'number']) as (handle: ProjectMHandle, filename: number) => boolean;

      console.log('✅ All C API functions wrapped successfully');

    } catch (error) {
      console.error('❌ Error wrapping C API functions:', error);
      throw new Error(`Failed to wrap ProjectM C API: ${error}`);
    }
  }

  /**
   * Add PCM audio data (stereo float format)
   * @param pcmData Stereo PCM samples [-1.0, 1.0]
   */
  addAudioData(pcmData: Float32Array): void {
    if (!this.module || !this.handle) {
      return;
    }

    try {
      // Allocate memory for PCM data in WASM heap
      const sampleCount = pcmData.length / 2; // 2 channels (L+R)
      const byteLength = pcmData.length * 4; // float32 = 4 bytes
      const ptr = this.module._malloc(byteLength);

      // Copy PCM data to WASM heap
      this.module.HEAPF32.set(pcmData, ptr / 4);

      // Call ProjectM C API
      this.projectm_pcm_add_float(this.handle, ptr, sampleCount, 2);

      // Free allocated memory
      this.module._free(ptr);

    } catch (error) {
      console.error('Error adding audio data:', error);
    }
  }

  /**
   * Render one frame to the canvas
   */
  render(): void {
    if (!this.handle) {
      return;
    }

    try {
      this.projectm_render_frame(this.handle);
    } catch (error) {
      console.error('Error rendering frame:', error);
    }
  }

  /**
   * Update canvas size (e.g., on window resize)
   */
  setSize(width: number, height: number): void {
    if (!this.handle) {
      return;
    }

    this.config.width = width;
    this.config.height = height;
    this.projectm_set_window_size(this.handle, width, height);
  }

  /**
   * Load a preset file (Milkdrop .milk format)
   */
  loadPreset(path: string): boolean {
    if (!this.module || !this.handle) {
      return false;
    }

    try {
      // Convert JS string to C string in WASM memory
      const encoder = new TextEncoder();
      const pathBytes = encoder.encode(path);
      const pathPtr = this.module._malloc(pathBytes.length + 1); // +1 for null terminator
      
      // 使用HEAP8（已导出）而不是HEAPU8
      this.module.HEAP8.set(Array.from(pathBytes).map(b => b as number), pathPtr);
      this.module.HEAP8[pathPtr + pathBytes.length] = 0; // null terminator

      const success = this.projectm_load_preset_file(this.handle, pathPtr);
      
      this.module._free(pathPtr);

      console.log(`Preset load ${success ? 'succeeded' : 'failed'}: ${path}`);
      return success;

    } catch (error) {
      console.error('Error loading preset:', error);
      return false;
    }
  }

  /**
   * Cleanup and destroy ProjectM instance
   */
  destroy(): void {
    if (this.handle && this.projectm_destroy) {
      this.projectm_destroy(this.handle);
      this.handle = null;
      console.log('🧹 ProjectM instance destroyed');
    }
  }
}
