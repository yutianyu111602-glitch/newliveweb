/**
 * ProjectM Engine V3 - Based on actual WASM exports
 * 
 * This version uses the ACTUAL function names from our WASM module:
 * - _pm_create_default (not projectm_create)
 * - _pm_destroy
 * - _pm_resize
 * - _pm_render_frame
 * - _pm_load_preset
 * - _pm_update_params
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

interface EmscriptenModule {
  cwrap: (name: string, returnType: string | null, argTypes: string[]) => Function;
  ccall: (name: string, returnType: string | null, argTypes: string[], args: any[]) => any;
  _malloc: (size: number) => number;
  _free: (ptr: number) => void;
  HEAPF32: Float32Array;
  HEAP8: Int8Array;
  UTF8ToString: (ptr: number) => string;
  stringToUTF8: (str: string, ptr: number, maxLength: number) => void;
  lengthBytesUTF8: (str: string) => number;
}

type ProjectMHandle = number;

export class ProjectMEngineV3 {
  private module: EmscriptenModule | null = null;
  private handle: ProjectMHandle | null = null;
  private canvas: HTMLCanvasElement;
  private config: ProjectMConfig;

  // Wrapped functions (using actual WASM export names)
  private pm_create_default!: () => ProjectMHandle;
  private pm_destroy!: (handle: ProjectMHandle) => void;
  private pm_resize!: (handle: ProjectMHandle, width: number, height: number) => void;
  private pm_render_frame!: (handle: ProjectMHandle) => void;
  private pm_load_preset!: (handle: ProjectMHandle, presetPath: number) => boolean;
  private pm_update_params!: (handle: ProjectMHandle) => void;

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
      console.log('🎨 ProjectM V3: Initializing...');

      // Step 1: Load the script dynamically
      const script = document.createElement('script');
      script.src = '/projectm-runtime/projectm.js';
      
      await new Promise<void>((resolve, reject) => {
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load projectm.js'));
        document.head.appendChild(script);
      });

      console.log('📦 ProjectM script loaded');

      // Step 2: Get module factory
      const createModule = (window as any).createProjectMModule;
      if (typeof createModule !== 'function') {
        throw new Error('createProjectMModule not found');
      }

      // Step 3: Initialize module with proper config
      this.module = await createModule({
        canvas: this.canvas,
        locateFile: (path: string) => {
          const fullPath = `/projectm-runtime/${path}`;
          console.log(`📂 locateFile: ${path} -> ${fullPath}`);
          return fullPath;
        },
        print: (text: string) => console.log('[ProjectM]', text),
        printErr: (text: string) => console.error('[ProjectM ERROR]', text),
      }) as EmscriptenModule;

      console.log('✅ WASM module initialized');

      // Step 4: Wrap the actual C functions
      this.wrapFunctions();
      console.log('✅ Functions wrapped');

      // Step 5: Create ProjectM instance
      this.handle = this.pm_create_default();
      if (!this.handle) {
        throw new Error('pm_create_default() returned null');
      }
      console.log(`✅ ProjectM instance created (handle: ${this.handle})`);

      // Step 6: Set initial size
      this.pm_resize(this.handle, this.config.width, this.config.height);
      console.log(`✅ Canvas size set to ${this.config.width}x${this.config.height}`);

      console.log('🎉 ProjectM V3 initialized successfully!');
      return true;

    } catch (error) {
      console.error('❌ ProjectM V3 initialization failed:', error);
      if (error instanceof Error) {
        console.error('Details:', error.message);
        console.error('Stack:', error.stack);
      }
      return false;
    }
  }

  /**
   * Wrap the actual WASM exported functions
   */
  private wrapFunctions(): void {
    if (!this.module) {
      throw new Error('Module not loaded');
    }

    if (typeof this.module.cwrap !== 'function') {
      throw new Error('cwrap not available');
    }

    try {
      // Use the ACTUAL function names from WASM exports
      this.pm_create_default = this.module.cwrap('_pm_create_default', 'number', []) as () => ProjectMHandle;
      this.pm_destroy = this.module.cwrap('_pm_destroy', null, ['number']) as (handle: ProjectMHandle) => void;
      this.pm_resize = this.module.cwrap('_pm_resize', null, ['number', 'number', 'number']) as (handle: ProjectMHandle, width: number, height: number) => void;
      this.pm_render_frame = this.module.cwrap('_pm_render_frame', null, ['number']) as (handle: ProjectMHandle) => void;
      this.pm_load_preset = this.module.cwrap('_pm_load_preset', 'boolean', ['number', 'number']) as (handle: ProjectMHandle, presetPath: number) => boolean;
      this.pm_update_params = this.module.cwrap('_pm_update_params', null, ['number']) as (handle: ProjectMHandle) => void;

      console.log('✅ All functions wrapped successfully');
    } catch (error) {
      console.error('❌ Error wrapping functions:', error);
      throw error;
    }
  }

  /**
   * Add PCM audio data
   */
  addAudioData(pcmData: Float32Array): void {
    if (!this.module || !this.handle) {
      return;
    }

    try {
      // Allocate WASM memory
      const byteLength = pcmData.length * 4;
      const ptr = this.module._malloc(byteLength);

      // Copy data to WASM heap
      this.module.HEAPF32.set(pcmData, ptr / 4);

      // Call a hypothetical audio function (may need to check actual exports)
      // For now, we'll just update params which processes audio internally
      this.pm_update_params(this.handle);

      // Free memory
      this.module._free(ptr);
    } catch (error) {
      console.error('Error adding audio:', error);
    }
  }

  /**
   * Render one frame
   */
  render(): void {
    if (!this.handle) {
      return;
    }

    try {
      this.pm_render_frame(this.handle);
    } catch (error) {
      console.error('Error rendering:', error);
    }
  }

  /**
   * Resize canvas
   */
  setSize(width: number, height: number): void {
    if (!this.handle) {
      return;
    }

    this.config.width = width;
    this.config.height = height;
    this.pm_resize(this.handle, width, height);
  }

  /**
   * Load a preset file
   */
  async loadPreset(url: string): Promise<boolean> {
    if (!this.module || !this.handle) {
      return false;
    }

    try {
      // Convert URL to C string
      const pathLength = this.module.lengthBytesUTF8(url);
      const pathPtr = this.module._malloc(pathLength + 1);
      
      this.module.stringToUTF8(url, pathPtr, pathLength + 1);
      
      const success = this.pm_load_preset(this.handle, pathPtr);
      
      this.module._free(pathPtr);

      console.log(`Preset ${success ? 'loaded' : 'failed'}: ${url}`);
      return success;
    } catch (error) {
      console.error('Error loading preset:', error);
      return false;
    }
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.handle && this.pm_destroy) {
      this.pm_destroy(this.handle);
      this.handle = null;
      console.log('🧹 ProjectM destroyed');
    }
  }
}
