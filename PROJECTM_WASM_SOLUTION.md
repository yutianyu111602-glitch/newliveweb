# ProjectM WASM 完整解决方案

## 📋 问题分析总结

### 1. 原始错误
```
expected magic word 00 61 73 6d, found 3c 21 64 6f @+0
```
- `00 61 73 6d` = WASM魔术字节
- `3c 21 64 6f` = `<!do` (HTML文档开头)
- **结论**: 服务器返回了HTML 404页面，而不是WASM文件

### 2. 根本原因
- WASM文件的`locateFile`配置不正确
- Emscripten默认查找路径与实际文件位置不匹配
- Vite的public目录处理方式导致路径解析问题

### 3. 官方文档要求（来自EMSCRIPTEN.md）

**必需的编译标志**:
```bash
-sUSE_SDL=2                              # SDL2支持
-sMIN_WEBGL_VERSION=2 -sMAX_WEBGL_VERSION=2  # WebGL 2
-sFULL_ES2=1 -sFULL_ES3=1               # OpenGL ES支持
-sALLOW_MEMORY_GROWTH=1                 # 内存增长
```

**必须的运行时初始化**:
```c
// 启用OES_texture_float扩展（用于运动向量网格）
auto webGlContext = emscripten_webgl_get_current_context();
emscripten_webgl_enable_extension(webGlContext, "OES_texture_float");
```

## 🔧 解决方案

### 方案A: 修复locateFile路径

更新ProjectMEngineV2以正确配置locateFile:

```typescript
const module = await window.createProjectMModule({
  canvas: this.canvas,
  locateFile: (path) => {
    // 确保WASM文件路径正确
    if (path.endsWith('.wasm')) {
      return `/projectm-runtime/${path}`;
    }
    return path;
  },
  print: (text) => console.log('[ProjectM]', text),
  printErr: (text) => console.error('[ProjectM ERROR]', text),
});
```

### 方案B: 将WASM移到正确位置

如果locateFile不工作，确保文件在Emscripten期望的默认路径:

```bash
# 检查projectm.js中的默认路径
grep "\.wasm" /path/to/projectm.js

# 确保projectm.wasm在相同目录
ls -la public/projectm-runtime/
# 应该看到:
# projectm.js
# projectm.wasm
```

### 方案C: 使用Vite的asset处理

如果以上都不行，将WASM视为asset导入:

```typescript
import wasmUrl from '/projectm-runtime/projectm.wasm?url';

const module = await window.createProjectMModule({
  locateFile: (path) => {
    if (path.endsWith('.wasm')) {
      return wasmUrl;
    }
    return path;
  }
});
```

## 🎯 预设文件处理

### 预设库信息
- **位置**: `/Users/masher/code/MilkDrop 130k+ Presets MegaPack 2025 2/`
- **数量**: 119,757 个 `.milk` 文件
- **许可**: CC-BY-NC-SA 3.0 (非商业使用)

### 预设加载策略

**1. 复制常用预设到项目**:
```bash
# 创建预设目录
mkdir -p /Users/masher/code/newliveweb/public/presets

# 复制精选预设（避免复制全部119k个）
cp "/Users/masher/code/MilkDrop 130k+ Presets MegaPack 2025 2/presets/"*.milk \
   /Users/masher/code/newliveweb/public/presets/ | head -100
```

**2. 或者使用符号链接**:
```bash
ln -s "/Users/masher/code/MilkDrop 130k+ Presets MegaPack 2025 2/presets" \
      /Users/masher/code/newliveweb/public/milkdrop-presets
```

**3. 预设加载代码**:
```typescript
// 加载预设文件
async loadPresetFromUrl(url: string): Promise<void> {
  const response = await fetch(url);
  const presetData = await response.text();
  
  // 使用ProjectM API加载
  this.loadPresetData(presetData);
}

// 使用示例
await engine.loadPresetFromUrl('/presets/some-preset.milk');
```

## 📝 下一步行动

### 立即执行
1. ✅ 打开诊断页面: `http://127.0.0.1:5174/diagnose-wasm.html`
2. ✅ 查看WASM文件是否正确加载
3. ✅ 检查`locateFile`是否被调用
4. ✅ 验证WASM魔术字节

### 如果诊断成功
1. 更新ProjectMEngineV2.ts添加正确的locateFile
2. 复制一些测试预设到public/presets/
3. 测试预设加载功能
4. 集成到主应用

### 如果诊断失败
1. 检查WASM文件是否损坏: `xxd /path/to/projectm.wasm | head`
2. 尝试重新下载/编译ProjectM WASM
3. 考虑使用替代方案 (Butterchurn)

## 🌐 参考资源

- [ProjectM官方文档](https://github.com/projectM-visualizer/projectm/wiki)
- [Emscripten编译指南](https://github.com/projectM-visualizer/projectm/blob/master/EMSCRIPTEN.md)
- [MilkDrop预设格式](https://www.geisswerks.com/milkdrop/milkdrop_preset_authoring.html)
- [Emscripten API文档](https://emscripten.org/docs/api_reference/index.html)

---
**创建时间**: 2025-12-11
**状态**: 等待WASM诊断结果
