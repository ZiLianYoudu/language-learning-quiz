---
name: daily-english
description: 生成每日英语学习内容（单词/短语/语法/阅读 + 5 类练习），输出结构化 quiz.json 供网页答题使用，保存为 daily/YYYY-MM-DD.quiz.json。触发词：每日学习、每日练习、英语打卡、生成今日学习内容、daily english。
---

# 每日英语学习内容生成器（网页答题版）

当用户调用此 skill 时，按以下流程执行。

## 流程

1. **读取通用生成 Prompt**：用 Read 读取 `prompts/english.md`，将其作为生成规范。
2. **调用 language-tutor agent**，将 `prompts/english.md` 的内容作为 prompt 传递给它，让它生成
   `daily/YYYY-MM-DD.quiz.json`（用当天日期）。
   - 主题与词汇必须避开历史内容：先读取 `daily/` 下已有的 `.quiz.json` 检查已覆盖的主题和已讲过的单词。
   - JSON 必须能通过 `python -c "import json; json.load(open(...))"` 校验。
3. **主会话运行构建脚本**：`python build_data.py`（agent 没有 Bash 工具，这一步必须由主会话执行）。
   - 脚本会校验 schema 并生成 `web/data.js` 和归档用的 `daily/YYYY-MM-DD.md`。
   - 校验失败时按报错信息修复 json 后重跑。
4. **告知用户**：双击 `刷题.bat`（或重新运行它）即可在浏览器中开始今日答题。

## 利用学习记录做间隔复习（推荐）

用户每次答题都会自动记录到项目根目录 `progress.log`（JSONL，每行一个事件）。
生成新内容前，建议读取它统计近期错题，做针对性复习：

- `{"event": "answer", "day": "...", "idx": N, "correct": false, ...}` → 结合对应
  `daily/日期.quiz.json` 的 `exercises[N]` 定位到具体题目/知识点
- 在今日练习中自然融入 1-2 个此前做错的单词/语法点（如再次出现在选词填空或翻译题中），
  实现间隔重复，不必单独设"复习题"板块
- 也可参考 `day-complete` 事件了解用户实际完成的日期频率
