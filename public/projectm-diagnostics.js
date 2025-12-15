// ProjectM 诊断脚本
// 在浏览器控制台运行此代码来诊断ProjectM加载问题

console.log('🔍 ProjectM 诊断开始...\n');

// 1. 检查文件是否可访问
async function checkFiles() {
  console.log('📁 检查ProjectM文件...');
  
  const files = [
    '/projectm-runtime/projectm.js',
    '/projectm-runtime/projectm.wasm'
  ];
  
  for (const file of files) {
    try {
      const response = await fetch(file, { method: 'HEAD' });
      if (response.ok) {
        console.log(`✅ ${file}: ${response.status} (${response.headers.get('content-type')})`);
      } else {
        console.error(`❌ ${file}: ${response.status}`);
      }
    } catch (error) {
      console.error(`❌ ${file}: 无法访问`, error);
    }
  }
}

// 2. 检查window全局对象
function checkGlobals() {
  console.log('\n🌐 检查全局对象...');
  console.log('window.createProjectMModule:', typeof window.createProjectMModule);
  
  if (typeof window.createProjectMModule === 'function') {
    console.log('✅ createProjectMModule 已定义');
  } else {
    console.error('❌ createProjectMModule 未定义 - WASM脚本可能未加载');
  }
}

// 3. 尝试加载模块
async function testModuleLoad() {
  console.log('\n🧪 测试模块加载...');
  
  if (typeof window.createProjectMModule !== 'function') {
    console.error('❌ 跳过 - createProjectMModule 不可用');
    return;
  }
  
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    
    console.log('正在加载模块...');
    const module = await window.createProjectMModule({
      canvas: canvas,
      locateFile: (path) => `/projectm-runtime/${path}`
    });
    
    console.log('✅ 模块加载成功');
    console.log('模块导出:', Object.keys(module).filter(k => k.startsWith('_projectm')));
    
    // 检查函数是否存在
    const requiredFunctions = [
      '_projectm_create',
      '_projectm_destroy',
      '_projectm_set_window_size',
      '_projectm_load_preset_data',
      '_projectm_pcm_add_float',
      '_projectm_opengl_render_frame'
    ];
    
    console.log('\n🔍 检查必需函数:');
    requiredFunctions.forEach(fn => {
      const exists = typeof module[fn] === 'function';
      console.log(`${exists ? '✅' : '❌'} ${fn}:`, typeof module[fn]);
    });
    
  } catch (error) {
    console.error('❌ 模块加载失败:', error);
  }
}

// 4. 检查Canvas上下文
function checkWebGL() {
  console.log('\n🎨 检查WebGL支持...');
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  
  if (gl) {
    console.log('✅ WebGL 可用');
    console.log('   渲染器:', gl.getParameter(gl.RENDERER));
    console.log('   厂商:', gl.getParameter(gl.VENDOR));
  } else {
    console.error('❌ WebGL 不可用');
  }
}

// 运行所有检查
(async () => {
  await checkFiles();
  checkGlobals();
  checkWebGL();
  await testModuleLoad();
  console.log('\n✅ 诊断完成');
})();
