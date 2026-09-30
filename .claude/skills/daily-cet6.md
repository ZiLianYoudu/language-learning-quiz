---
name: daily-cet6
description: 生成全国大学生英语六级(CET-6)难度的每日单词背诵清单和模拟试题（20%-25%完整试卷量），保存为 YYYY-MM-DD_CET6.md
---

# CET-6 每日训练生成器

当用户调用此 skill 时，按以下流程执行。

## 流程

1. **读取通用生成 Prompt**：用 Read 读取 `prompts/cet6.md`，将其作为生成规范。
2. **调用 language-tutor agent**，将 `prompts/cet6.md` 的内容作为 prompt 传递给它，
   生成 `YYYY-MM-DD_CET6.quiz.json`（项目根目录）。
   JSON 结构必须符合 `docs/SCHEMA.md` 中定义的格式。
3. **主会话运行** `python build_data.py` 构建网页数据（校验失败按报错修复）。
4. **告知用户**：双击 `刷题.bat` 即可答题。

## 注意

- 听力部分的对话和短文原文必须完整写出
- 翻译题的参考译文中标注与单词清单呼应的词汇
