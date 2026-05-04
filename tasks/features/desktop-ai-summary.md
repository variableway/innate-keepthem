# Feature: AI Video Summarization

## 概述
集成 AI 大模型 API，实现视频内容自动总结和关键点提取。

## 关联代码
- `vYtDL-desktop/src/components/VideoPlayer.tsx` (Summary tab)
- `vYtDL-desktop/src/components/SettingsPage.tsx` (AI settings)
- `vYtDL-desktop/src-tauri/src/commands.rs` (summarize_video)

## 子任务

### 4.1 AI Provider 集成
**优先级**: P1
**状态**: ⏳ 预留接口

支持的提供商:
- [ ] OpenAI (GPT-4, GPT-3.5)
- [ ] Anthropic (Claude 3)
- [ ] Google (Gemini Pro)
- [ ] 本地模型 (Ollama, LM Studio)

**配置结构**:
```typescript
interface Settings {
  ai_provider: "openai" | "anthropic" | "gemini" | null;
  ai_api_key: string | null;
  ai_model: string | null;
  ai_base_url?: string; // 用于自定义端点
}
```

### 4.2 字幕提取处理
**优先级**: P1
**状态**: ⏳ 待实现

- [ ] VTT/SRT 解析
- [ ] 字幕文本清洗
- [ ] 时间戳提取
- [ ] 多语言字幕合并
- [ ] 字幕分段 (按时间/字数)

**处理流程**:
```
Subtitle File -> Parse -> Clean -> Chunk -> LLM API -> Summary
```

### 4.3 提示词工程
**优先级**: P1
**状态**: ⏳ 待实现

**系统提示词**:
```
You are a video content summarizer. Given video subtitles, 
provide a concise summary and key points.

Requirements:
- Summary in 3-5 sentences
- 5-10 key bullet points
- Keep timestamps for important moments
- Output in Markdown format
```

**用户提示词模板**:
```
Video Title: {title}
Duration: {duration}
Language: {language}

Subtitles:
{subtitle_text}

Please summarize this video content.
```

### 4.4 总结展示
**优先级**: P1
**状态**: ⏳ 预留界面

- [x] 总结标签页
- [ ] Markdown 渲染
- [ ] 关键点列表
- [ ] 时间戳跳转
- [ ] 导出为文件 (Markdown/PDF)

**数据结构**:
```typescript
interface SummaryResult {
  markdown: string;
  key_points: Array<{
    text: string;
    timestamp?: number;
  }>;
  keywords: string[];
  duration: number;
  generated_at: string;
}
```

### 4.5 流式输出
**优先级**: P2
**状态**: ⏳ 待实现

- [ ] SSE (Server-Sent Events) 支持
- [ ] 打字机效果
- [ ] 取消生成
- [ ] 重试机制

### 4.6 本地缓存
**优先级**: P2
**状态**: ⏳ 待实现

- [ ] 总结结果缓存
- [ ] 避免重复调用 API
- [ ] 手动刷新功能

## API 调用实现

```rust
// src-tauri/src/commands.rs
#[tauri::command]
pub async fn summarize_video(
    video_id: String,
    settings: Settings,
) -> Result<ApiResponse<SummaryResult>, String> {
    // 1. 获取视频字幕
    let subtitles = load_subtitles(&video_id)?;
    
    // 2. 构建提示词
    let prompt = build_prompt(&subtitles);
    
    // 3. 调用 LLM API
    let response = match settings.ai_provider.as_str() {
        "openai" => call_openai(&prompt, &settings).await?,
        "anthropic" => call_claude(&prompt, &settings).await?,
        _ => return Err("Unsupported provider".to_string()),
    };
    
    // 4. 解析结果
    let summary = parse_response(&response)?;
    
    // 5. 缓存结果
    save_cache(&video_id, &summary).await?;
    
    Ok(ApiResponse::ok(summary))
}
```

## 成本估算

| 提供商 | 模型 | 输入价格 | 输出价格 | 估算/视频* |
|--------|------|----------|----------|------------|
| OpenAI | GPT-4o-mini | $0.15/M | $0.60/M | ~$0.01 |
| OpenAI | GPT-4o | $5.00/M | $15.00/M | ~$0.30 |
| Anthropic | Claude 3 Haiku | $0.25/M | $1.25/M | ~$0.02 |
| Google | Gemini Pro | $0.50/M | $1.50/M | ~$0.05 |

*基于 10K tokens 输入估算

## 隐私考虑

1. **字幕数据**: 发送给第三方 API
2. **本地模型**: 支持 Ollama 实现完全离线
3. **数据脱敏**: 可选自动移除敏感信息

## 测试要点

1. **不同长度视频**
   - 短视频 (< 5 min)
   - 中视频 (10-30 min)
   - 长视频 (> 1 hour)

2. **不同内容类型**
   - 教程/教学
   - 访谈/对话
   - 演讲/Presentation
   - 娱乐内容

3. **多语言测试**
   - 英文
   - 中文
   - 混合语言

## 改进建议

1. **多模态**: 结合视频帧分析 (GPT-4V)
2. **问答功能**: 基于视频内容的 Q&A
3. **章节生成**: 自动划分视频章节
4. **标签提取**: 自动生成视频标签
