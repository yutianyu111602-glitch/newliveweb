# ProjectM WASM Integration Fix - Technical Analysis

## 问题诊断

### 原始问题
- ProjectM WASM模块加载成功，但初始化失败
- 错误: `module._projectm_create is not a function`
- 现有代码期望直接调用C++导出函数（如`_projectm_create`）

### 根本原因
经过查阅[ProjectM官方文档](https://github.com/projectM-visualizer/projectm/wiki/Integration-Quickstart-Guide)，发现：

1. **API不匹配**: ProjectM v4.x使用**C API**而非直接的C++函数导出
2. **调用方式错误**: 应该通过Emscripten的`cwrap`/`ccall`调用C API，而不是直接访问WASM导出
3. **架构过时**: 旧代码假设可以直接访问`_projectm_create`等函数，这是不符合官方API设计的

## 官方ProjectM v4.x API

根据官方文档，正确的集成方式是：

### 1. C API 函数签名
```c
// 创建和销毁
projectm_handle projectm_create(void);
void projectm_destroy(projectm_handle instance);

// 窗口控制
void projectm_set_window_size(projectm_handle instance, size_t width, size_t height);

// 渲染
void projectm_render_frame(projectm_handle instance);

// 音频输入
void projectm_pcm_add_float(projectm_handle instance, 
                           const float* samples, 
                           unsigned int count, 
                           int channels);

// 预设加载
bool projectm_load_preset_file(projectm_handle instance, const char* filename);
```

### 2. Emscripten集成要点
- 使用`cwrap`包装C API函数
- 不直接访问`_projectm_*`函数
- 通过`Module.cwrap('projectm_create', 'number', [])`包装
- 音频数据需要分配WASM堆内存，使用`_malloc`和`_free`

### 3. WebGL要求（来自EMSCRIPTEN.md）
- 必须使用WebGL 2（`majorVersion: 2`）
- 需要启用`OES_texture_float`扩展
- 编译标志需包含：
  - `-sUSE_SDL=2`
  - `-sMIN_WEBGL_VERSION=2 -sMAX_WEBGL_VERSION=2`
  - `-sFULL_ES3=1`
  - `-sALLOW_MEMORY_GROWTH=1`

## 解决方案: ProjectMEngineV2

### 核心改进

1. **使用Emscripten cwrap**
   ```typescript
   this.projectm_create = this.module.cwrap('projectm_create', 'number', []);
   this.projectm_render_frame = this.module.cwrap('projectm_render_frame', null, ['number']);
   ```

2. **WebGL2上下文初始化**
   ```typescript
   this.module = await moduleFactory.default({
     canvas: this.canvas,
     createContext: (canvas, attrs) => {
       return canvas.getContext('webgl2', {
         ...attrs,
         majorVersion: 2,
         minorVersion: 0
       });
     }
   });
   ```

3. **WASM内存管理**
   ```typescript
   // 为PCM数据分配内存
   const ptr = this.module._malloc(byteLength);
   this.module.HEAPF32.set(pcmData, ptr / 4);
   this.projectm_pcm_add_float(this.handle, ptr, sampleCount, 2);
   this.module._free(ptr);
   ```

4. **遵循官方初始化流程**
   ```typescript
   // 1. 加载Emscripten模块
   const moduleFactory = await import('/projectm-runtime/projectm.js');
   
   // 2. 初始化WASM模块（带WebGL上下文）
   this.module = await moduleFactory.default({ canvas: this.canvas });
   
   // 3. 包装C API函数
   this.wrapCApiFunctions();
   
   // 4. 创建ProjectM实例
   this.handle = this.projectm_create();
   
   // 5. 设置窗口尺寸
   this.projectm_set_window_size(this.handle, width, height);
   
   // 6. 开始渲染
   this.projectm_render_frame(this.handle);
   ```

### 关键差异对比

| 方面 | 旧实现 (V1) | 新实现 (V2) |
|------|------------|------------|
| API风格 | 直接C++导出 | C API + cwrap |
| 函数命名 | `_projectm_create` | `projectm_create` |
| 调用方式 | `this.module._projectm_create()` | `this.module.cwrap('projectm_create', ...)()` |
| 类型定义 | 假设导出在Module上 | 通过cwrap动态绑定 |
| 内存管理 | 假设自动 | 显式`_malloc`/`_free` |
| WebGL版本 | 未指定 | 强制WebGL 2 |

## 测试验证

创建了独立测试页面 `test-projectm-v2.html`：
- 独立测试环境，不影响主应用
- 实时日志显示初始化过程
- 测试音频生成（440Hz正弦波）
- 手动/自动渲染控制

### 测试步骤
1. 启动开发服务器: `npm run dev`
2. 访问: `http://127.0.0.1:5174/test-projectm-v2.html`
3. 点击"Initialize ProjectM"
4. 观察控制台输出，验证：
   - ✅ Module factory loaded
   - ✅ WASM module initialized
   - ✅ C API functions wrapped
   - ✅ ProjectM instance created
   - ✅ Window size set

## 可能的失败场景与对策

### 场景1: cwrap不存在
**症状**: `Emscripten cwrap not available`
**原因**: WASM模块编译时未包含Emscripten运行时
**对策**: 需要重新编译WASM，添加`-sEXPORTED_RUNTIME_METHODS=['cwrap','ccall']`

### 场景2: 函数名找不到
**症状**: `Aborted(TODO: function '_projectm_create' not found)`
**原因**: 函数名不匹配或未导出
**对策**: 检查WASM编译时的`-sEXPORTED_FUNCTIONS`列表

### 场景3: WebGL上下文失败
**症状**: `projectm_create() returned null handle`
**原因**: WebGL2不可用或上下文创建失败
**对策**: 检查浏览器WebGL2支持，降级到WebGL1（如果ProjectM支持）

### 场景4: WASM文件本身不兼容
**症状**: 所有API调用都失败
**原因**: 当前WASM文件可能是旧版本或不同构建
**对策**: 需要使用官方ProjectM v4.x源码重新编译Emscripten版本

## 下一步行动

### 如果V2初始化成功：
1. 集成到主应用`main.ts`
2. 替换`ProjectMEngine`为`ProjectMEngineV2`
3. 加载预设文件
4. 与LiquidMetal层混合渲染

### 如果V2仍然失败：
1. **选项A**: 检查现有WASM文件是否支持cwrap
   ```javascript
   console.log('cwrap available:', typeof module.cwrap);
   ```

2. **选项B**: 重新编译ProjectM WASM
   - 克隆官方仓库: `git clone https://github.com/projectM-visualizer/projectm.git`
   - 使用Emscripten工具链编译
   - 确保包含所需的编译标志

3. **选项C**: 使用替代方案
   - 如果ProjectM集成过于复杂，考虑其他音频可视化库
   - 例如: Butterchurn (纯JS实现的Milkdrop)

## 参考资料

- [ProjectM Integration Quickstart](https://github.com/projectM-visualizer/projectm/wiki/Integration-Quickstart-Guide)
- [ProjectM Emscripten Build Guide](https://github.com/projectM-visualizer/projectm/blob/master/EMSCRIPTEN.md)
- [ProjectM API Reference](https://github.com/projectM-visualizer/projectm/wiki/API-Reference)
- [Emscripten API Reference](https://emscripten.org/docs/api_reference/index.html)

---
**Created**: 2025年
**Author**: GitHub Copilot
**Status**: 待测试验证
