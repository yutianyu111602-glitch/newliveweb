# newliveweb

**开源实时视觉化平台** | Open-source Real-time Visualization Platform

> ⚠️ **项目正在开发中** - 预设包和音乐文件不包含在开源仓库中

## 📌 项目简介

newliveweb 是一个基于 Web 的实时音乐视觉化平台，支持：
- 音频分析与特征提取
- ProjectM 视觉渲染
- 预设管理与质量训练
- WebAssembly 性能优化

## 🎯 核心功能

| 模块 | 功能 | 技术栈 |
|------|------|--------|
| **视觉渲染** | ProjectM 实时渲染 | WebAssembly + WebGL |
| **音频分析** | 频谱、节奏检测 | Web Audio API |
| **预设系统** | 预设加载、管理 | TypeScript |
| **质量训练** | 机器学习质量评估 | Python + scikit-learn |
| **前端框架** | 响应式 UI | TypeScript + Vite |

## 📁 开源结构

```
newliveweb/
├── src/                    # TypeScript 核心源码
│   ├── audio/              # 音频分析模块
│   ├── features/           # 特征提取
│   ├── layers/             # 渲染层
│   ├── projectm/           # ProjectM 集成
│   ├── ui/                 # 用户界面
│   └── utils/              # 工具函数
├── python/                 # Python 训练程序
│   ├── preset_quality_trainer.py  # 质量训练
│   └── ...                 # 其他脚本
├── docs/                   # 项目文档
├── wasm/                   # WebAssembly 模块
├── public/                 # 静态资源
├── tests/                  # 测试文件
├── LICENSE                 # GPL-3.0 协议
└── README.md               # 本文件
```

## ⚠️ 不包含内容

- **预设包 (presets/)** - 版权内容，不开源
- **音乐文件** - 版权内容，不开源
- **第三方 API 密钥** - 安全考虑，不上传
- **node_modules/** - 依赖安装后不提交

## 🚀 快速开始

```bash
# 克隆仓库
git clone https://github.com/yourusername/newliveweb.git
cd newliveweb

# 安装依赖
npm install

# 开发模式
npm run dev

# 构建
npm run build

# 运行测试
npm run test
```

## 📦 开源依赖来源

本项目使用以下开源组件，感谢各位开发者：

### 核心依赖

| 组件 | 版本 | 用途 | 协议 |
|------|------|------|------|
| **ProjectM** | latest | 音乐视觉化渲染引擎 | GPL-2.0 |
| **Vite** | latest | 构建工具 | MIT |
| **TypeScript** | latest | 类型安全开发 | Apache-2.0 |
| **Node.js** | latest | 运行时环境 | MIT |

### 音频处理

| 组件 | 用途 | 协议 |
|------|------|------|
| **Web Audio API** | 浏览器音频分析 | W3C License |
| **Essentia.js** | 音频特征提取 | BSD-3-Clause |

### 测试工具

| 组件 | 用途 | 协议 |
|------|------|------|
| **Vitest** | 单元测试 | MIT |
| **Playwright** | E2E 测试 | Apache-2.0 |

## 🤝 贡献指南

欢迎贡献代码！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交变更 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📄 开源协议

本项目采用 **GPL-3.0** 开源协议：

```
This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
```

**协议要点**：
- ✅ 自由使用、修改、分发
- ✅ 商业使用允许
- ⚠️ 修改后必须开源
- ⚠️ 必须保留版权声明

## 📞 联系

- GitHub Issues: 功能建议、Bug 报告
- 邮箱: your-email@example.com

## 🙏 致谢

- [ProjectM](https://github.com/projectm/projectm) - 视觉化引擎
- [Vite](https://github.com/vitejs/vite) - 构建工具
- [TypeScript](https://github.com/microsoft/TypeScript) - 开发语言
- 所有开源社区贡献者

---

**注意**: 这是一个开发中的项目，API 可能会变更。
