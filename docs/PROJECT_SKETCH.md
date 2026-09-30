# 项目草图：从个人工具到 GitHub 项目

> 2026-09-29 — 基于"语言学习每日练习"现状的结构化改造方案

---

## 一、语言生成规则的分离

### 现状

- `.claude/skills/daily-english.md` — 英语（CET-6 / 中高级）
- `.claude/skills/daily-japanese.md` — 日语（五十音 → N5 → 阅读）
- `.claude/skills/daily-cet6.md` — CET-6 试卷格式

数据层已通过 `language: "en" / "ja"` 字段 + `-ja` 后缀文件名区分。

### 问题

三个 skill 文件都是 Claude Code 专属格式（frontmatter + 自然语言 prompt），只有 Claude Code 能加载。发到 GitHub 后，普通用户无法用同样方式生成新内容——生成规则与特定 AI 工具耦合。

### 目标

> 生成规则应该**工具无关**——Claude 能用，ChatGPT 能用，DeepSeek 能用，甚至人工编写也能参照同一份规范。

### 方案

把规则从 `.claude/skills/` 抽到项目根目录的 `prompts/` 和 `docs/`：

| 文件 | 作用 |
|------|------|
| `docs/SCHEMA.md` | quiz.json 的完整格式契约（字段、约束、示例），任何人和任何 AI 都遵守这一份 |
| `prompts/english.md` | 给 LLM 的英语生成 prompt（通用格式，不限于 Claude） |
| `prompts/japanese.md` | 给 LLM 的日语生成 prompt |
| `prompts/cet6.md` | 给 LLM 的 CET-6 生成 prompt |

Claude Code 的 skill 文件保留，但改为"读取 `prompts/xxx.md` 作为 prompt 传入 agent"——skill 变成调度器，规则存在外部。

---

## 二、项目化改造清单

### 🔴 必须改（项目跑不起来 / 别人看不懂）

| # | 问题 | 现状 | 应该改 |
|---|------|------|--------|
| 1 | 生成规则不可移植 | 藏在 `.claude/skills/` | 抽到 `prompts/` + `docs/SCHEMA.md` |
| 2 | 没有 LICENSE | 别人不知道能不能用 | 加 LICENSE（MIT 推荐） |
| 3 | README 耦合 Claude | "对 Claude 说生成今日内容" | README 面向通用用户，Claude 降级为"一种生成方式" |
| 4 | `.claude/` 不应提交 | 含个人 memory、配置 | 加 `.gitignore` |
| 5 | `刷题.bat` 仅 Windows | macOS/Linux 无法启动 | 加 `start.sh` 或 `Makefile` |

### 🟡 应该改（质量 / 可维护性）

| # | 问题 | 现状 | 应该改 |
|---|------|------|--------|
| 6 | `index.html` 1406 行 | CSS + JS + HTML 全在一起 | 拆成 `style.css` + `app.js` + `index.html` |
| 7 | `build_data.py` 校验 + 渲染混在一起 | 两个职责纠缠 | 拆成 `src/validate.py` + `src/build.py` + `src/render_md.py` |
| 8 | 前端硬编码语言文案 | `lang === "ja"` 散落各处 | 加 `js/i18n.js` 字典，按 `language` 字段切换 |
| 9 | 没有测试 | 全靠 `build_data.py` 手工校验 | 加 pytest |
| 10 | 没有贡献指南 | 别人不知道怎么出题、加语言 | 加 `CONTRIBUTING.md` |

### 🟢 锦上添花（项目成熟度）

| # | 改进 | 说明 |
|---|------|------|
| 11 | 示例数据 | 保留 1-2 个 quiz.json，新用户 clone 下来不生成也能体验 |
| 12 | GitHub Actions | push 时自动跑 `build_data.py` 校验 |
| 13 | `pyproject.toml` | 让 `pip install -e .` 可安装命令行入口 |
| 14 | 版本号 | 语义化版本，标记 release |

---

## 三、目标目录结构

```
languagelearning/
├── docs/
│   ├── PROJECT_SKETCH.md        ← 本文件（项目改造路线图）
│   ├── SCHEMA.md                ← quiz.json 格式契约（通用、工具无关）
│   └── CONTRIBUTING.md          ← 贡献指南（如何出题、如何加语言）
│
├── prompts/                     ← 给 LLM 的生成 prompt（任何 AI 都能用）
│   ├── english.md
│   ├── japanese.md
│   └── cet6.md
│
├── src/                         ← 构建工具（从 build_data.py 拆出）
│   ├── __init__.py
│   ├── validate.py              ← 校验逻辑
│   ├── build.py                 ← 汇总 + 生成 web/data.js
│   └── render_md.py             ← 归档 markdown 渲染
│
├── web/
│   ├── index.html               ← 变薄，只留结构
│   ├── css/style.css            ← 从 index.html 拆出
│   ├── js/app.js                ← 从 index.html 拆出
│   ├── js/i18n.js               ← 前端多语言文案字典
│   └── data.js                  ← 自动生成
│
├── daily/                       ← 每日内容数据
│   ├── 2026-09-28.quiz.json
│   └── 2026-09-28.md
│
├── tests/                       ← pytest
│   ├── test_validate.py
│   ├── test_build.py
│   └── fixtures/                ← 测试用 quiz.json
│
├── .claude/                     ← 个人 Claude 配置（gitignore）
│   ├── skills/                  ← 改为加载 prompts/ 中的通用文件
│   └── agents/
│
├── server.py                    ← 本地服务（保持不变）
├── pyproject.toml               ← 包元数据 + 命令行入口
├── Makefile                     ← make build / make run（跨平台）
├── .gitignore
├── LICENSE                      ← MIT
├── README.md                    ← 面向通用用户重写
└── 刷题.bat                     ← 保留，但不再是唯一入口
```

---

## 四、关键设计原则

### 1. Schema 是契约

`docs/SCHEMA.md` 是项目的核心文档。它定义：
- quiz.json 的完整字段结构
- 每种题型的必填 / 可选字段
- `optionsCn`、`sentenceCn`、`word` 等新字段的用途
- 校验规则（与 `src/validate.py` 保持一致）

AI 生成和人工编写都遵守这一份文档。前端渲染也按这份文档做防御性处理。

### 2. `language` 字段驱动一切

前端 UI 文案、语音选择（en-US vs ja-JP）、归档 md 标题、翻译方向提示——全部根据数据的 `language` 字段动态切换。加新语言只需：
1. 写 `prompts/xxx.md`
2. 前端 `i18n.js` 加一个条目
3. 无需改其他代码

### 3. 生成工具可替换

`.claude/skills/` 只是"用 Claude Code 生成内容"的便捷方式。项目不绑定它——用户可以用任何 LLM 加载 `prompts/english.md` 生成内容，只要输出符合 `docs/SCHEMA.md`，就能通过校验、进入网页答题。

---

## 五、建议执行顺序

```
Phase 1: 让项目先"像"一个开源项目
├── 加 .gitignore（忽略 .claude/、progress.json、*.log）
├── 加 LICENSE（MIT）
├── 写 docs/SCHEMA.md（从 skill 文件中提炼）
└── README 开头加一段面向通用用户的简介

Phase 2: 规则分离
├── 写 prompts/english.md / japanese.md / cet6.md
├── .claude/skills/ 改为加载 prompts/ 中的文件
└── 验证：用非 Claude 的 LLM 加载 prompts/english.md 能生成合法 quiz.json

Phase 3: 前端拆分
├── index.html → css/style.css + js/app.js
├── 提取语言相关文案到 js/i18n.js
└── 确保拆分后功能不变

Phase 4: 跨平台 + 测试
├── 加 Makefile（make build / make run）
├── 加 tests/ 基础测试
└── 加 pyproject.toml

Phase 5: CI + 发布
├── GitHub Actions：push 时跑校验 + 测试
├── 整理示例数据
└── 打第一个 release tag
```

---

## 六、不改的东西

以下设计已经足够好，项目化时**不需要重做**：

- `server.py` — 标准库、零依赖、120 行，无需改动
- `build_data.py` 整体流程 — 校验→汇总→生成→归档，逻辑正确
- 5 种题型的数据结构 — choice/fill/match/truefalse/translate 设计合理
- 进度存储方案 — progress.json（状态）+ progress.log（JSONL 事件）
- 前端答题交互 — 键盘快捷键、错题本、深色模式、语音朗读
- `optionsCn` / `sentenceCn` / `word` 新增字段 — 已实现且验证通过
