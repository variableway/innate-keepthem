---
name: vtt-analyze
description: |
  Analyzes VTT (WebVTT) subtitle files with AI — generates Markdown transcripts, summaries, key points with timestamps.
  Use when: user provides a .vtt file and wants AI-powered analysis (summary, key points, insights); or asks to analyze/understand/break down video subtitles.
---

# VTT Subtitle Analyzer

Analyzes WebVTT subtitle files using the vYtDL CLI + AI reasoning.

## Workflow

### Step 1 — Convert VTT to Markdown

Use the vYtDL CLI's built-in `analyze` command to extract a clean Markdown transcript:

```bash
cd vYtDL
./vYtDL analyze --mode markdown <file.vtt> > transcript.md
```

Supported modes:
- `--mode text` — plain text (no timestamps)
- `--mode markdown` — Markdown with timestamps (recommended for analysis)

### Step 2 — AI Analysis

Read the generated `transcript.md` and provide:

1. **Summary** (2-4 sentences): What the content is about
2. **Key Points** (3-10 items): Core takeaways with timestamp references
3. **Structure**: Main sections/topics covered
4. **Insights** (optional): Notable quotes, patterns, or observations

### Step 3 — Output Format

Present results in clean Markdown:

```markdown
## Summary

[2-4 sentence summary]

## Key Points

- [00:05:32] Point 1 with timestamp
- [00:12:45] Point 2 with timestamp
...

## Structure

- Section 1: [00:00] → [00:05]
- Section 2: [00:05] → [00:15]
...

## Insights

[Any notable observations]
```

## Examples

**Basic analysis:**
```
User: analyze this subtitles file
→ Run: ./vYtDL analyze --mode markdown video.zh.vtt > transcript.md
→ Read transcript.md and provide summary, key points, structure
```

**Quick key points:**
```
User: what are the main takeaways from this video
→ Extract markdown → Identify top 5-8 key points with timestamps
→ Format as bullet list with [HH:MM:SS] references
```

## Tips

- Always include timestamps when referencing specific content
- For long transcripts (>30 min), focus on top 5-10 key points
- Note language: Chinese transcripts may need different analysis density
- If VTT has `<c>` word-timing tags, the parser handles them automatically
