---
name: daily-japanese
description: 生成零基础日语每日学习内容（五十音 → N5 词汇语法 → 短文阅读 + 练习），输出结构化 quiz.json 供网页答题使用，保存为 daily/日期-ja.quiz.json。触发词：日语学习、日语练习、生成日语内容、五十音、daily japanese。
---

# 零基础日语每日内容生成器（网页答题版）

当用户调用此 skill（或要求生成日语学习/练习内容）时，按以下流程执行。

## 流程

1. **读取通用生成 Prompt**：用 Read 读取 `prompts/japanese.md`，将其作为生成规范。
2. **确定当前进度**：用 Glob/Read 检查 `daily/*-ja.quiz.json` 历史文件，判断用户学到哪了
   （五十音进行到哪一行 / 词汇语法进行到哪个主题）。没有历史则从第一课开始。
3. **调用 language-tutor agent**，将 `prompts/japanese.md` 的内容作为 prompt 传递给它，
   生成 `daily/YYYY-MM-DD-ja.quiz.json`（用当天日期）。
   JSON 结构必须符合 `docs/SCHEMA.md` 中定义的格式。
4. **主会话运行** `python build_data.py`（校验 + 生成 web/data.js + 归档 md）。
5. **告知用户**：双击 `刷题.bat` 开始答题（英语和日语内容都在首页，各自独立进度）。

## 利用学习记录

可读取 `progress.log` 统计日语错题（`day` 以 `-ja` 结尾的记录），
在新课中安排 1-2 个复习点。
