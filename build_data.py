#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_data.py — 汇总每日 quiz JSON，校验后生成 web/data.js 与归档 markdown。

用法:
    python build_data.py

扫描:
    daily/*.quiz.json          （daily-english 流程，agent 只写 json）
    *_CET6.quiz.json（根目录） （daily-cet6 流程）

输出:
    web/data.js                window.QUIZ_DATA = {...}（网页答题应用的数据源）
    daily/<id>.md              仅当同名 md 不存在时，从 JSON 渲染归档文档

校验失败时打印所有错误（带文件名与字段路径）并以非零码退出。
"""

import json
import re
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DAILY_DIR = ROOT / "daily"
WEB_DIR = ROOT / "web"
DATA_JS = WEB_DIR / "data.js"

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
VALID_TYPES = ("choice", "fill", "match", "truefalse", "translate")

# 各题型在归档 md 中的固定说明
SECTION_INSTRUCTIONS = {
    "choice": "选出正确答案。",
    "fill": "用所给词的正确形式填空，完成句子。",
    "match": "将左侧内容与右侧的含义匹配。",
    "truefalse": "根据今日阅读文章判断正误（T / F）。",
    "translate": "将以下句子翻译成英文。",
}


def is_str(x):
    return isinstance(x, str)


# ---------------------------------------------------------------------------
# 校验
# ---------------------------------------------------------------------------

def validate_day(day, fname):
    """校验单个 day 对象，返回错误列表（空列表 = 通过）。"""
    errors = []

    def check(cond, path, msg):
        if not cond:
            errors.append(f"{fname}: {path} {msg}")

    # --- 顶层元数据 ---
    for field in ("id", "date", "weekday", "level", "theme"):
        check(field in day and is_str(day.get(field)) and day[field].strip(),
              field, "必须是非空字符串")
    if errors:
        return errors  # 元数据缺失时后续校验无意义

    stem = fname[:-len(".quiz.json")]
    check(day["id"] == stem, "id", f"必须与文件名一致（应为 {stem!r}）")
    check(bool(DATE_RE.match(day["date"])), "date", "格式必须为 YYYY-MM-DD")
    if DATE_RE.match(day["date"]):
        try:
            datetime.strptime(day["date"], "%Y-%m-%d")
        except ValueError:
            errors.append(f"{fname}: date 不是合法日期")
    check(isinstance(day.get("language", "en"), str), "language", "必须是字符串")

    # --- 学习材料（宽松校验：应用端做了防御性渲染）---
    study = day.get("study")
    check(isinstance(study, dict), "study", "必须是对象")
    if isinstance(study, dict):
        vocab = study.get("vocabulary", [])
        if not isinstance(vocab, list):
            errors.append(f"{fname}: study.vocabulary 必须是数组")
        else:
            for i, w in enumerate(vocab):
                if not (isinstance(w, dict) and is_str(w.get("word")) and w["word"].strip()):
                    errors.append(f"{fname}: study.vocabulary[{i}].word 必须是非空字符串")
        for key in ("phrases", "grammar", "reading", "culture"):
            if key in study and study[key] is not None and not isinstance(study[key], (dict, list, str)):
                errors.append(f"{fname}: study.{key} 类型非法")

    # --- 练习题（严格校验：渲染逻辑依赖结构）---
    exercises = day.get("exercises")
    if not isinstance(exercises, list):
        errors.append(f"{fname}: exercises 必须是数组")
        return errors
    if not exercises:
        errors.append(f"{fname}: exercises 为空（纯学习材料日请确认是有意为之）")

    for i, q in enumerate(exercises):
        p = f"exercises[{i}]"
        if not isinstance(q, dict):
            errors.append(f"{fname}: {p} 必须是对象")
            continue
        qtype = q.get("type")
        check(qtype in VALID_TYPES, f"{p}.type", f"必须是 {VALID_TYPES} 之一，实际为 {qtype!r}")
        check(is_str(q.get("section")) and q["section"].strip(), f"{p}.section", "必须是非空字符串")
        if qtype not in VALID_TYPES:
            continue

        if qtype == "choice":
            options = q.get("options")
            check(isinstance(options, list) and len(options) >= 2, f"{p}.options", "必须是不少于 2 项的数组")
            if isinstance(options, list):
                check(all(is_str(o) and o.strip() for o in options), f"{p}.options", "每项必须是非空字符串")
                answer = q.get("answer")
                check(isinstance(answer, int) and not isinstance(answer, bool) and 0 <= answer < len(options),
                      f"{p}.answer", f"必须是 options 的合法下标，实际为 {answer!r}")
            check(is_str(q.get("prompt")) and q["prompt"].strip(), f"{p}.prompt", "必须是非空字符串")
            # 可选字段：选项释义（optionsCn）和句子翻译（sentenceCn）
            optionsCn = q.get("optionsCn")
            if optionsCn is not None:
                if not (isinstance(optionsCn, list) and len(optionsCn) == len(options) and
                        all(is_str(c) and c.strip() for c in optionsCn)):
                    errors.append(f"{fname}: {p}.optionsCn 必须是与 options 等长的非空字符串数组")
            sentenceCn = q.get("sentenceCn")
            if sentenceCn is not None:
                check(is_str(sentenceCn) and sentenceCn.strip(), f"{p}.sentenceCn", "必须是非空字符串")

        elif qtype == "fill":
            prompt = q.get("prompt", "")
            blanks = q.get("blanks")
            check(is_str(prompt) and prompt.strip(), f"{p}.prompt", "必须是非空字符串")
            check(isinstance(blanks, list) and len(blanks) >= 1, f"{p}.blanks", "必须是非空数组")
            if isinstance(prompt, str) and isinstance(blanks, list):
                n_slots = prompt.count("___")
                check(n_slots == len(blanks), f"{p}.prompt",
                      f"中 ___ 占位符数量（{n_slots}）必须等于 blanks 数量（{len(blanks)}）")
            if isinstance(blanks, list):
                for j, b in enumerate(blanks):
                    if not isinstance(b, dict):
                        errors.append(f"{fname}: {p}.blanks[{j}] 必须是对象")
                        continue
                    accepted = b.get("accepted")
                    check(isinstance(accepted, list) and accepted
                          and all(is_str(a) and a.strip() for a in accepted),
                          f"{p}.blanks[{j}].accepted", "必须是非空字符串数组")
                    # 可选字段：所填词原形（word）—— 用于前端显示提示
                    word = b.get("word")
                    if word is not None:
                        check(is_str(word) and word.strip(), f"{p}.blanks[{j}].word", "必须是非空字符串")

        elif qtype == "match":
            left, right, pairs = q.get("left"), q.get("right"), q.get("pairs")
            check(isinstance(left, list) and len(left) >= 2, f"{p}.left", "必须是不少于 2 项的数组")
            check(isinstance(right, list) and len(right) >= 2, f"{p}.right", "必须是不少于 2 项的数组")
            check(isinstance(pairs, list), f"{p}.pairs", "必须是数组")
            if isinstance(left, list) and isinstance(right, list) and isinstance(pairs, list):
                check(len(pairs) == len(left), f"{p}.pairs", f"长度必须等于 left（{len(left)}）")
                for j, v in enumerate(pairs):
                    check(isinstance(v, int) and not isinstance(v, bool) and 0 <= v < len(right),
                          f"{p}.pairs[{j}]", f"必须是 right 的合法下标，实际为 {v!r}")
                check(len(set(x for x in pairs if isinstance(x, int))) == len(pairs),
                      f"{p}.pairs", "下标必须互不相同（一对一配对）")

        elif qtype == "truefalse":
            check(isinstance(q.get("answer"), bool), f"{p}.answer", "必须是布尔值 true/false")

        elif qtype == "translate":
            check(is_str(q.get("source")) and q["source"].strip(), f"{p}.source", "必须是非空字符串")
            check(is_str(q.get("reference")) and q["reference"].strip(), f"{p}.reference", "必须是非空字符串")

        if qtype != "match":
            check(is_str(q.get("explanation")) and q["explanation"].strip(),
                  f"{p}.explanation", "必须是非空字符串（match 题可选）")

    return errors


# ---------------------------------------------------------------------------
# 归档 markdown 渲染（仅 daily/ 目录的 json；md 已存在则跳过）
# ---------------------------------------------------------------------------

def _examples_md(examples, indent="  "):
    lines = []
    for n, ex in enumerate(examples, 1):
        lines.append(f"{indent}{n}. {ex.get('ja') or ex.get('en', '')}")
        zh = ex.get("zh")
        if zh:
            lines.append(f"{indent}   （{zh}）")
    return "\n".join(lines)


def render_markdown(day):
    """从 day 对象渲染归档 markdown（沿用既有每日打卡文档结构，按 language 切换文案）。"""
    study = day.get("study", {}) or {}
    lang = day.get("language") or "en"
    lines = []
    add = lines.append

    if lang == "ja":
        add("# Japanese Learning Daily ｜ 日语学习每日打卡\n")
    else:
        add("# English Learning Daily ｜ 英语学习每日打卡\n")
    add(f"**Date**: {day['date']} ({day.get('weekday', '')})")
    add(f"**Level**: {day.get('level', '')}")
    add(f"**Theme**: {day.get('theme', '')}\n")
    add("---\n")

    # 1. 单词
    vocab = study.get("vocabulary") or []
    if vocab:
        add("## 1. 今日单词\n")
        for i, w in enumerate(vocab, 1):
            add(f"### {i}. {w.get('word', '')} {w.get('ipa', '')}")
            add(f"- **词性**: {w.get('pos', '')} {w.get('meaningCn', '')}")
            if w.get("meaningEn"):
                add(f"- **释义**: {w['meaningEn']}")
            examples = w.get("examples") or []
            if examples:
                add("- **例句**:")
                add(_examples_md(examples))
            if w.get("notes"):
                add(f"- **用法点睛**: {w['notes']}")
            add("")

    # 2. 短语
    phrases = study.get("phrases") or []
    if phrases:
        add("## 2. 今日短语\n")
        for i, ph in enumerate(phrases, 1):
            add(f"### {i}. {ph.get('phrase', '')}")
            add(f"- **释义**: {ph.get('meaningCn', '')}")
            examples = ph.get("examples") or []
            if examples:
                add("- **例句**:")
                add(_examples_md(examples, indent="  - "))
            add("")

    # 3. 语法
    grammar = study.get("grammar")
    if isinstance(grammar, dict) and grammar.get("content"):
        add("## 3. 今日语法点\n")
        add(f"### {grammar.get('title', '')}\n")
        add(grammar["content"].strip())
        add("")

    # 4. 阅读
    reading = study.get("reading")
    if isinstance(reading, dict) and reading.get("passage"):
        add("## 4. 今日阅读\n")
        add(f"### {reading.get('title', '')}\n")
        for para in reading["passage"].split("\n\n"):
            if para.strip():
                add("> " + para.strip().replace("\n", "\n> "))
                add(">\n")
        if reading.get("translation"):
            add("### 中文翻译\n")
            add(reading["translation"].strip())
            add("")
        rvocab = reading.get("vocab") or []
        if rvocab:
            add("#### 生词解析\n")
            add("| 单词 | 音标 | 释义 |")
            add("|------|------|------|")
            for v in rvocab:
                add(f"| {v.get('word', '')} | {v.get('ipa', '')} | {v.get('meaningCn', '')} |")
            add("")

    # 5. 文化（可选）
    sec_no = 5
    if study.get("culture"):
        add(f"## {sec_no}. 文化小知识\n")
        add(study["culture"].strip())
        add("")
        sec_no += 1

    # 练习 + 参考答案
    exercises = day.get("exercises") or []
    if exercises:
        # 按 section 分组（保持原顺序）
        groups, order = {}, []
        for q in exercises:
            key = q.get("section", "练习")
            if key not in groups:
                groups[key] = []
                order.append((key, q.get("type")))
            groups[key].append(q)

        instructions = dict(SECTION_INSTRUCTIONS)
        instructions["translate"] = "将以下句子翻译成日文。" if lang == "ja" else "将以下句子翻译成英文。"

        add(f"## {sec_no}. 今日练习\n")
        for gi, key in enumerate(order, 1):
            section, first_type = key
            add(f"### Exercise {gi}: {section}")
            instruction = instructions.get(first_type, "")
            if instruction:
                add(instruction)
            for qi, q in enumerate(groups[section], 1):
                add("")
                if q["type"] == "choice":
                    add(f"{qi}. {q.get('prompt', '')}")
                    for oi, opt in enumerate(q.get("options", [])):
                        add(f"   {chr(65 + oi)}. {opt}")
                elif q["type"] == "fill":
                    add(f"{qi}. {q.get('prompt', '')}")
                elif q["type"] == "match":
                    add(f"{qi}.")
                    add("")
                    add("| 左侧 | 右侧 |")
                    add("|------|------|")
                    for li, ltext in enumerate(q.get("left", []), 1):
                        rtext = q.get("right", [])
                        add(f"| {li}. {ltext} | {chr(64 + li)}. {rtext[li - 1] if li <= len(rtext) else ''} |")
                elif q["type"] == "truefalse":
                    add(f"{qi}. ( ) {q.get('statement', '')}")
                elif q["type"] == "translate":
                    add(f"{qi}. {q.get('source', '')}")
            add("")

        add("## 参考答案\n")
        for gi, key in enumerate(order, 1):
            section = key[0]
            add(f"### Exercise {gi}")
            for qi, q in enumerate(groups[section], 1):
                if q["type"] == "choice":
                    opts = q.get("options", [])
                    ans = q.get("answer")
                    text = opts[ans] if isinstance(ans, int) and 0 <= ans < len(opts) else "?"
                    add(f"{qi}. {text}")
                elif q["type"] == "fill":
                    parts = [" / ".join(b.get("accepted", ["?"])) for b in q.get("blanks", [])]
                    add(f"{qi}. {' / '.join(parts)}")
                elif q["type"] == "match":
                    pairs = q.get("pairs", [])
                    add(", ".join(f"{li + 1} - {chr(65 + v)}" for li, v in enumerate(pairs)))
                elif q["type"] == "truefalse":
                    verdict = "T" if q.get("answer") else "F"
                    add(f"{qi}. {verdict}（{q.get('explanation', '')}）")
                elif q["type"] == "translate":
                    kp = q.get("keyPoints") or []
                    kp_md = "（要点: " + "、".join(f"**{k}**" for k in kp) + "）" if kp else ""
                    add(f"{qi}. {q.get('reference', '')} {kp_md}")
            add("")

    quote = study.get("quote")
    if quote:
        add("---\n")
        add(f"> 💡 **Today's Quote**: {quote}")
        add(">")
        add("> Keep learning, one day at a time. Small steps lead to big results!\n")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------

def collect_files():
    files = []
    if DAILY_DIR.is_dir():
        files.extend(sorted(DAILY_DIR.glob("*.quiz.json")))
    files.extend(sorted(ROOT.glob("*_CET6.quiz.json")))
    return files


def main():
    # Windows 控制台中文输出保护
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    files = collect_files()
    if not files:
        print("警告: 未找到任何 .quiz.json 文件（daily/*.quiz.json 或 *_CET6.quiz.json）")

    days, all_errors, seen_ids = [], [], {}
    for path in files:
        rel = path.relative_to(ROOT).as_posix()
        try:
            day = json.loads(path.read_text(encoding="utf-8-sig"))
        except (json.JSONDecodeError, OSError) as e:
            all_errors.append(f"{rel}: JSON 解析失败 — {e}")
            continue

        errors = validate_day(day, path.name)
        if errors:
            all_errors.extend(errors)
            continue

        if day["id"] in seen_ids:
            all_errors.append(f"{rel}: id {day['id']!r} 与 {seen_ids[day['id']]} 重复")
            continue
        seen_ids[day["id"]] = rel

        # 渲染归档 md（仅 daily/ 目录，且 md 不存在时）
        if path.parent == DAILY_DIR:
            md_path = path.with_suffix("").with_suffix(".md")  # xxx.quiz.json -> xxx.md
            if not md_path.exists():
                try:
                    md_path.write_text(render_markdown(day), encoding="utf-8")
                    print(f"[md ] 已生成归档文档 {md_path.relative_to(ROOT).as_posix()}")
                except OSError as e:
                    all_errors.append(f"{rel}: 归档 md 写入失败 — {e}")

        n_q = len(day.get("exercises") or [])
        print(f"[OK ] {rel} — {day['theme']} — {n_q} 题")
        days.append(day)

    if all_errors:
        print("\n校验失败:", file=sys.stderr)
        for e in all_errors:
            print(f"  ✗ {e}", file=sys.stderr)
        sys.exit(1)

    # 按日期倒序（同日按 id 倒序）
    days.sort(key=lambda d: (d["date"], d["id"]), reverse=True)

    WEB_DIR.mkdir(exist_ok=True)
    payload = {
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "days": days,
    }
    text = ("// 本文件由 build_data.py 自动生成，请勿手工编辑\n"
            "// 数据源: daily/*.quiz.json 与 *_CET6.quiz.json\n"
            "window.QUIZ_DATA = "
            + json.dumps(payload, ensure_ascii=False, indent=2) + ";\n")
    DATA_JS.write_text(text, encoding="utf-8")

    total_q = sum(len(d.get("exercises") or []) for d in days)
    print(f"\n完成: {len(days)} 天 / {total_q} 题 → {DATA_JS.relative_to(ROOT).as_posix()}")


if __name__ == "__main__":
    main()
