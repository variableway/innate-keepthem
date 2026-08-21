# innate-keepthem 文档导航

本目录是项目的**唯一文档入口**，按 monorepo 方式组织：一份文档对应一个主题，避免多份重叠的历史文档。

## 文档组织方案

```
docs/
├── README.md        本文件：文档导航与组织规则
├── PURPOSE.md       ① 项目目的：解决什么问题、为谁解决
├── BUILD.md         ② 构建方式：所有模块的构建/运行/打包入口
├── CI.md            ③ CI 说明：流水线结构、各 job 职责、本地复现
├── STATUS.md        ④ 未完成清单：哪些功能/代码没完成、证据与建议
├── FEATURE-CHECKLIST.md  ⑤ 功能清单与验证矩阵：每个功能的验证步骤与预期
├── modules/         ⑤ 功能模块分解：每个模块一份文档（模块地图 + 模块页）
│   ├── OVERVIEW.md    模块地图：全仓库模块关系一览
│   └── <module>.md    单模块文档：用途、技术栈、接口、内部结构
├── specs/           ⑥ 规格（Spec）：跨模块的系统级设计（管线、数据流、插件机制等）
│   └── contentforge/  ContentForge 系列 Spec
└── archive/         历史文档归档（只读，不再维护）
```

### 组织规则

1. **一个主题一份文档**。新内容先找归属，找不到再新增目录，禁止在根目录散放分析报告。
2. **模块文档放 `modules/`，命名与仓库路径一致**（如 `modules/vytdl-cli.md` 对应 `vYtDL-standalone/`）。
3. **系统级设计放 `specs/`**。跨多个模块的机制（数据流、协议、插件系统）不属于任何单模块。
4. **状态类信息放 `STATUS.md`**，不分散在模块文档里；模块文档描述"是什么"，不描述"还差什么"。
6. **过时文档进 `archive/`，不删除**（git 历史可考，但工作区保持干净）。
7. **代码附近的小文档跟随代码**（如 `src-tauri/bin/README.md`），docs/ 里只放跨模块视角。
8. 根目录只保留 `README.md`（项目门面）与 `USAGE.md`（用户手册），其余全部归入 `docs/`。
9. 文档语言：中文叙述 + 英文技术名词；代码块、路径、命令保持原样。

## 阅读顺序建议

- **新成员**：PURPOSE -> modules/OVERVIEW -> BUILD
- **贡献者**：CI -> STATUS（挑未完成项）-> 对应 modules/<module>.md
- **运维/发布**：BUILD -> CI

## 文档入口速查

| 想了解 | 看这里 |
|---|---|
| 项目是什么、为什么做 | [PURPOSE.md](PURPOSE.md) |
| 怎么构建、运行、打包 | [BUILD.md](BUILD.md) |
| CI 怎么跑、怎么本地验证 | [CI.md](CI.md) |
| 还有哪些坑没填 | [STATUS.md](STATUS.md) |
| 有哪些功能、怎么验证 | [FEATURE-CHECKLIST.md](FEATURE-CHECKLIST.md) |
| 某个模块的细节 | [modules/](modules/) |
| 系统级设计 | [specs/](specs/) |
| 历史资料 | [archive/](archive/) |
