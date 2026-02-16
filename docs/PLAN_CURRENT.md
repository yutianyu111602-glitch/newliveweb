# PLAN_CURRENT（当前计划唯一入口）

最后更新：2026-02-17  
最后一次 verify:check 通过：待填充  
证据路径：`artifacts/verify-dev/latest/`

## 目标
建立文档单一真相源（SSOT），止住计划入口增殖，软下架重复文档。

## 里程碑
- [x] M0：扫描项目文档现状（228 个文档分类完成）
- [x] M1：建立 SSOT（MASTER_SPEC.zh.md）
- [x] M2：建立计划唯一入口（PLAN_CURRENT.md）
- [ ] M3：软下架 34 个 MERGE 文档（标注 DEPRECATED）
- [ ] M4：逐步替换散落命令为 SSOT 链接

## 本周执行清单
- [ ] 执行 `docs_apply_safe_v2.ps1` 标注重复文档
- [ ] 创建 `docs/_archive/` 目录结构
- [ ] 验证 verify:dev / verify:check 通过

## 门禁命令（链接到 SSOT）
- verify:dev：见 [SSOT 4.1](./MASTER_SPEC.zh.md#41-verifydev)
- verify:check：见 [SSOT 4.2](./MASTER_SPEC.zh.md#42-verifycheck)
- coupled pipeline：见 [SSOT 5](./MASTER_SPEC.zh.md#5-coupled-quality-pipeline)

## 风险与回滚

### 风险点
- SSOT 规则可能与旧文档冲突
- 34 个 MERGE 文档标注后可能出现断链

### 回滚策略
- 备份位置：`artifacts/backups/<timestamp>/`
- 恢复命令：从备份目录手动复制回原位
- 标注撤销：删除文件头部的 DEPRECATED 注释块
