// 检查ProjectM WASM模块的实际API
import('./public/projectm-runtime/projectm.js').then(async (module) => {
  console.log('=== ProjectM Module Loaded ===');
  console.log('Module exports:', Object.keys(module));
  
  if (typeof module.default === 'function') {
    console.log('\n=== Initializing Module ===');
    const wasmModule = await module.default();
    console.log('WASM Module type:', typeof wasmModule);
    console.log('WASM Module keys:', Object.keys(wasmModule).filter(k => !k.startsWith('_')).slice(0, 30));
    
    // Check for C API functions
    const cApiFunctions = [
      'projectm_create',
      'projectm_destroy',
      'projectm_set_window_size',
      'projectm_render_frame',
      'projectm_pcm_add_float',
      'projectm_load_preset_file'
    ];
    
    console.log('\n=== Checking C API Functions ===');
    cApiFunctions.forEach(fn => {
      const exists = typeof wasmModule[fn] === 'function';
      console.log(`${fn}: ${exists ? '✅ EXISTS' : '❌ MISSING'}`);
    });
    
    // Check for C++ style exports
    const cppFunctions = [
      '_projectm_create',
      '_projectm_destroy',
      '_Z14projectm_createv'  // mangled name
    ];
    
    console.log('\n=== Checking C++ Exports ===');
    cppFunctions.forEach(fn => {
      const exists = typeof wasmModule[fn] === 'function';
      console.log(`${fn}: ${exists ? '✅ EXISTS' : '❌ MISSING'}`);
    });
    
    // Check cwrap/ccall availability
    console.log('\n=== Emscripten Runtime Functions ===');
    console.log('cwrap:', typeof wasmModule.cwrap);
    console.log('ccall:', typeof wasmModule.ccall);
    console.log('FS:', typeof wasmModule.FS);
    console.log('GL:', typeof wasmModule.GL);
    
  } else {
    console.log('Module.default is not a function');
  }
}).catch(err => {
  console.error('Error loading module:', err);
});
