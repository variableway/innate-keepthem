# Refactor-1: 构建项目总体架构

> GitHub Issue: https://github.com/variableway/innate-keepthem/issues/12

分析当前文档结构，需要重构当前目录方式：

1. 整体的项目比如 standalone cli 这个作为后台服务保存
2. 项目结构采用 DSH plugin 模式
3. 也就是有前端项目，考虑到 Browser 可能会使用，放弃 tauri 方式，采用 electron
4. 先计划一下，整体项目需要如何重新开始，可以参考 docs/refactor 内容
5. 这个计划请记录到 docs/refactor/sprint-0 中
