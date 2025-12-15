// 高级诊断 - 列出WASM模块的所有导出
console.log('🔬 深度诊断 WASM 模块...\n');

(async () => {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    
    console.log('📦 加载模块...');
    const module = await window.createProjectMModule({
      canvas: canvas,
      locateFile: (path) => `/projectm-runtime/${path}`
    });
    
    console.log('✅ 模块加载成功\n');
    
    // 列出所有属性
    console.log('📋 模块的所有属性:');
    const allKeys = Object.keys(module);
    console.log(`   总共 ${allKeys.length} 个属性\n`);
    
    // 分类显示
    const functions = allKeys.filter(k => typeof module[k] === 'function');
    const objects = allKeys.filter(k => typeof module[k] === 'object' && module[k] !== null);
    const numbers = allKeys.filter(k => typeof module[k] === 'number');
    const others = allKeys.filter(k => !functions.includes(k) && !objects.includes(k) && !numbers.includes(k));
    
    console.log(`🔧 函数 (${functions.length}):`);
    functions.slice(0, 50).forEach(k => console.log(`   - ${k}`));
    if (functions.length > 50) console.log(`   ... 还有 ${functions.length - 50} 个函数`);
    
    console.log(`\n📦 对象 (${objects.length}):`);
    objects.slice(0, 20).forEach(k => console.log(`   - ${k}: ${module[k].constructor?.name || 'Object'}`));
    if (objects.length > 20) console.log(`   ... 还有 ${objects.length - 20} 个对象`);
    
    console.log(`\n🔢 数字 (${numbers.length}):`);
    numbers.slice(0, 10).forEach(k => console.log(`   - ${k}: ${module[k]}`));
    
    // 搜索可能相关的函数
    console.log('\n🔍 搜索 ProjectM 相关函数:');
    const pmFunctions = allKeys.filter(k => 
      k.toLowerCase().includes('projectm') || 
      k.toLowerCase().includes('pm_') ||
      k.includes('create') ||
      k.includes('render') ||
      k.includes('preset')
    );
    
    if (pmFunctions.length > 0) {
      console.log('✅ 找到可能相关的函数:');
      pmFunctions.forEach(k => {
        console.log(`   - ${k}: ${typeof module[k]}`);
      });
    } else {
      console.log('❌ 没有找到明显的 ProjectM 函数');
    }
    
    // 检查cwrap
    console.log('\n🔧 检查 cwrap:');
    if (typeof module.cwrap === 'function') {
      console.log('✅ cwrap 可用');
      console.log('   可以尝试手动包装 C 函数');
    } else {
      console.log('❌ cwrap 不可用');
    }
    
    // 检查内存
    console.log('\n💾 检查内存对象:');
    ['HEAP8', 'HEAP16', 'HEAP32', 'HEAPF32', 'HEAPF64', 'HEAPU8', 'HEAPU16', 'HEAPU32'].forEach(heap => {
      if (module[heap]) {
        console.log(`✅ ${heap}: ${module[heap].constructor.name} (长度: ${module[heap].length})`);
      }
    });
    
  } catch (error) {
    console.error('❌ 错误:', error);
  }
})();
