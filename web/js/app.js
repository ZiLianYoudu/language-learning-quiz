"use strict";

/* ================= 基础工具 ================= */

const APP = document.getElementById("app");
const DATA = (typeof window.QUIZ_DATA !== "undefined" && window.QUIZ_DATA) || null;
const DAYS = (DATA && Array.isArray(DATA.days)) ? DATA.days : [];

/* 多语言支持：朗读语音与界面文案跟随当日 language（en / ja） */
function dayLang(day) { return (day && day.language) || "en"; }
function ttsLang(lang) { return lang === "ja" ? "ja-JP" : "en-US"; }
let currentLang = "en-US";   // 当前所在日的朗读语音，随 renderQuiz 更新

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function stripMd(s) { return String(s == null ? "" : s).replace(/\*\*/g, "").replace(/\*/g, "").replace(/`/g, ""); }
function inlineMd(s) {
  return esc(s)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}
function normAns(s) {
  return String(s == null ? "" : s)
    .trim().toLowerCase().replace(/\s+/g, " ")
    .replace(/^[.,!?;:。，！？；：]+|[.,!?;:。，！？；：]+$/g, "");
}
function speakText(text, lang) {
  if (!("speechSynthesis" in window) || !text) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(stripMd(text));
    u.lang = lang || "en-US";
    u.rate = 0.92;
    const vs = speechSynthesis.getVoices();
    const v = vs.find(v => v.lang === u.lang) || vs.find(v => v.lang && v.lang.startsWith(u.lang.split("-")[0]));
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  } catch (e) { /* 忽略 TTS 错误 */ }
}
if ("speechSynthesis" in window) { try { speechSynthesis.getVoices(); } catch (e) {} }
const TTS_OK = "speechSynthesis" in window;

/* ================= 轻量 Markdown 渲染 ================= */

function mdToHtml(md) {
  if (!md) return "";
  const blocks = String(md).replace(/\r\n/g, "\n").split(/\n{2,}/);
  const out = [];
  for (let raw of blocks) {
    const block = raw.trim();
    if (!block) continue;
    const lines = block.split("\n").map(l => l.trim()).filter(l => l !== "");

    // 表格
    if (lines.length >= 2 && lines.every(l => l.startsWith("|"))) {
      const rows = lines.filter(l => !/^\|[\s:|-]+\|?$/.test(l))
        .map(l => l.replace(/^\||\|$/g, "").split("|").map(c => c.trim()));
      if (rows.length) {
        let html = "<table><thead><tr>";
        for (const c of rows[0]) html += "<th>" + inlineMd(c) + "</th>";
        html += "</tr></thead><tbody>";
        for (let i = 1; i < rows.length; i++) {
          html += "<tr>";
          for (const c of rows[i]) html += "<td>" + inlineMd(c) + "</td>";
          html += "</tr>";
        }
        out.push(html + "</tbody></table>");
        continue;
      }
    }
    // 标题
    const hm = block.match(/^(#{1,4})\s+(.*)$/);
    if (hm && !block.includes("\n")) {
      const lv = hm[1].length;
      out.push(`<h${lv}>` + inlineMd(hm[2]) + `</h${lv}>`);
      continue;
    }
    // 引用块
    if (lines.every(l => l.startsWith(">"))) {
      const inner = lines.map(l => l.replace(/^>\s?/, "")).join("<br>");
      out.push("<blockquote>" + inlineMd(inner) + "</blockquote>");
      continue;
    }
    // 列表
    if (lines.every(l => /^[-*]\s+/.test(l))) {
      out.push("<ul>" + lines.map(l => "<li>" + inlineMd(l.replace(/^[-*]\s+/, "")) + "</li>").join("") + "</ul>");
      continue;
    }
    if (lines.every(l => /^\d+[.)]\s+/.test(l))) {
      out.push("<ol>" + lines.map(l => "<li>" + inlineMd(l.replace(/^\d+[.)]\s+/, "")) + "</li>").join("") + "</ol>");
      continue;
    }
    // 段落
    out.push("<p>" + inlineMd(lines.join("<br>")) + "</p>");
  }
  return out.join("\n");
}

/* ================= 进度存储 =================
   双通道：
   1. localStorage —— 始终写入（file:// 直开时的唯一存储）
   2. 本地服务（经 刷题.bat 打开时）—— 每次保存自动 POST 到
      server.py，落盘为 progress.json（状态）+ progress.log（日志）
*/

const STORE_KEY = "ll-quiz-progress-v1";
const SERVER_MODE = location.protocol === "http:" || location.protocol === "https:";
let pendingEvents = [];

function loadStore() {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY));
    return (v && typeof v === "object" && v.days) ? v : { days: {} };
  } catch (e) { return { days: {} }; }
}
function saveStore() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* 无痕/受限模式 */ }
  serverSave();
}
function logEvent(ev) {
  pendingEvents.push(ev);
}
function serverSave() {
  if (!SERVER_MODE) return;
  try {
    fetch("/api/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: { days: store.days }, events: pendingEvents })
    }).catch(() => {});
  } catch (e) { /* 服务未运行时静默降级为仅 localStorage */ }
  pendingEvents = [];
}
let store = loadStore();

/* 启动时从本地服务合并进度（换浏览器/清缓存后可恢复） */
async function syncFromServer() {
  if (!SERVER_MODE) return;
  try {
    const r = await fetch("/api/progress");
    if (!r.ok) return;
    const data = await r.json();
    const serverDays = (data && data.days) || {};
    let changed = false;
    for (const id in serverDays) {
      const s = serverDays[id];
      const local = store.days[id];
      if (!local) { store.days[id] = s; changed = true; continue; }
      const la = (local.answers || []).filter(Boolean).length;
      const sa = (s.answers || []).filter(Boolean).length;
      if (sa > la) { store.days[id] = s; changed = true; }
      else if (s.completed && !local.completed) { local.completed = true; changed = true; }
    }
    if (changed) {
      saveStore();
      if (view === "hub") renderHub();
    }
  } catch (e) { /* 服务未响应 */ }
}
function dayProgress(id) {
  if (!store.days[id]) store.days[id] = { answers: [], current: 0, completed: false };
  return store.days[id];
}

/* ================= 全局状态 ================= */

let view = "hub";          // hub | quiz | summary | wrongbook
let session = null;        // {mode:'day'|'review', dayId, title, questions:[{dayId, idx}], answers?, current?}
let panelOpen = false;
let panelTab = "vocab";
let matchTemp = null;

function findDay(id) { return DAYS.find(d => d.id === id) || null; }
function dayQuestions(day) { return (day && Array.isArray(day.exercises)) ? day.exercises : []; }

function sessionQuestions() {
  return session.questions.map(r => ({ ref: r, day: findDay(r.dayId), q: (findDay(r.dayId) || { exercises: [] }).exercises[r.idx] }))
    .filter(x => x.day && x.q);
}
function curIdx() { return session.mode === "day" ? dayProgress(session.dayId).current : session.current; }
function setCurIdx(i) {
  if (session.mode === "day") { dayProgress(session.dayId).current = i; saveStore(); }
  else session.current = i;
}
function getAnswer(i) {
  if (!session) return null;
  if (session.mode === "day") { const a = dayProgress(session.dayId).answers[i]; return a == null ? null : a; }
  return session.answers[i] == null ? null : session.answers[i];
}
function setAnswer(i, ans) {
  const ref = session.questions[i];
  logEvent({ event: "answer", day: ref ? ref.dayId : session.dayId, idx: i, correct: !!ans.c, mode: session.mode });
  if (session.mode === "day") {
    const p = dayProgress(session.dayId);
    const total = sessionQuestions().length;
    p.answers[i] = ans;
    if (!p.completed && p.answers.filter(Boolean).length >= total) {
      p.completed = true;
      logEvent({ event: "day-complete", day: session.dayId, correct: p.answers.filter(x => x && x.c).length, total });
    }
    saveStore();
  } else {
    session.answers[i] = ans;
  }
}
function answeredCount() {
  const n = sessionQuestions().length;
  let c = 0;
  for (let i = 0; i < n; i++) if (getAnswer(i)) c++;
  return c;
}

/* ================= 首页 ================= */

function renderHub() {
  view = "hub";
  panelClose();
  const _ = i18n("en");  // 首页用默认语言（en）的 UI 文案
  let totalAns = 0, totalOk = 0, doneDays = 0;
  for (const d of DAYS) {
    const p = store.days[d.id];
    const qs = dayQuestions(d);
    if (p) {
      let a = 0, ok = 0;
      p.answers.forEach(x => { if (x) { a++; if (x.c) ok++; } });
      totalAns += a; totalOk += ok;
      if (p.completed && qs.length) doneDays++;
    }
  }
  const acc = totalAns ? Math.round(totalOk / totalAns * 100) : 0;
  const wrongCount = countWrong();

  let html = `
    <h1>${_.appTitle}</h1>
    <p class="sub">${_.appSubtitle}: ${DATA ? esc(DATA.generatedAt || "—") : "—"}</p>
    <div class="stats-row">
      <div class="stat-card"><div class="num">${DAYS.length}</div><div class="lbl">${_.statDays}</div></div>
      <div class="stat-card"><div class="num">${doneDays}</div><div class="lbl">${_.statDone}</div></div>
      <div class="stat-card"><div class="num">${totalAns}</div><div class="lbl">${_.statAnswered}</div></div>
      <div class="stat-card"><div class="num">${totalAns ? acc + "%" : "—"}</div><div class="lbl">${_.statAccuracy}</div></div>
      <div class="stat-card"><div class="num" style="color:${wrongCount ? "var(--bad)" : "inherit"}">${wrongCount}</div><div class="lbl">${_.statWrong}</div></div>
    </div>`;

  if (wrongCount > 0) {
    html += `<div style="margin-bottom:14px"><button class="btn" id="btn-wrongbook">${_.wrongbookBtn}（${wrongCount}）</button></div>`;
  }

  if (!DAYS.length) {
    html += `<div class="empty">
      <p style="font-size:1.05rem;margin:0 0 8px"><b>${_.emptyTitle}</b></p>
      <p>${_.emptyHint1} <code>daily/日期.quiz.json</code>），<br>
      ${_.emptyHint2} <code>刷题.bat</code> ${_.emptyHint3}</p>
    </div>`;
  } else {
    html += DAYS.map(d => {
      const qs = dayQuestions(d);
      const p = store.days[d.id];
      let badge, cls;
      const langLabel = dayLang(d) === "ja" ? "日语" : "英语";
      if (!qs.length) { badge = _.badgeStudy; cls = "gray"; }
      else if (!p || !p.answers.filter(Boolean).length) { badge = _.badgeNotStarted + " · " + qs.length + " 题"; cls = "gray"; }
      else if (p.completed) {
        const ok = p.answers.filter(x => x && x.c).length;
        badge = "✓ " + ok + "/" + qs.length; cls = ok === qs.length ? "green" : "blue";
      } else {
        const a = p.answers.filter(Boolean).length;
        badge = _.badgeInProgress + " · " + a + "/" + qs.length; cls = "blue";
      }
      return `<div class="day-card" data-day="${esc(d.id)}">
        <div class="date">${esc(d.date)}<span class="wd">${esc(d.weekday || "")}</span></div>
        <div class="theme">${esc(d.theme || "")}</div>
        <div class="meta"><span class="badge gray">${langLabel}</span><span class="badge ${cls}">${badge}</span></div>
      </div>`;
    }).join("");
  }

  html += `<p class="footer-note">${_.kbdHint}: <kbd>Enter</kbd> ${_.enterNext} · <kbd>1-9</kbd>/<kbd>A-J</kbd> 选项 · <kbd>T</kbd>/<kbd>F</kbd> 判断 · <kbd>M</kbd> ${_.panelVocab} · <kbd>Esc</kbd> ${_.enterBack}<br>
  ${_.dataRefresh}: 双击项目根目录的 刷题.bat<br>
  ${SERVER_MODE ? _.serverOk : _.serverWarn}</p>`;

  APP.innerHTML = html;
  APP.querySelector("#btn-wrongbook")?.addEventListener("click", () => renderWrongbook());
  APP.querySelectorAll(".day-card").forEach(c =>
    c.addEventListener("click", () => startDay(c.dataset.day)));
}

function countWrong() {
  let n = 0;
  for (const id in store.days) {
    const day = findDay(id);
    if (!day) continue;
    store.days[id].answers.forEach((a, i) => {
      if (a && !a.c && dayQuestions(day)[i]) n++;
    });
  }
  return n;
}

/* ================= 进入某一天 ================= */

function startDay(id) {
  const day = findDay(id);
  if (!day) return;
  const p = dayProgress(id);
  const qs = dayQuestions(day);
  session = {
    mode: "day", dayId: id,
    title: day.date + " · " + (day.theme || ""),
    questions: qs.map((_, idx) => ({ dayId: id, idx }))
  };
  if (!qs.length) { renderQuiz(); return; }
  if (p.completed || (p.answers.filter(Boolean).length >= qs.length && qs.length)) {
    view = "summary"; renderSummary();
  } else {
    if (p.current >= qs.length || p.current < 0) p.current = 0;
    view = "quiz"; renderQuiz();
  }
}

function startReview(refs, title) {
  session = { mode: "review", dayId: refs.length ? refs[0].dayId : null, title, questions: refs, answers: [], current: 0 };
  view = "quiz";
  renderQuiz();
}

/* ================= 答题页 ================= */

function renderQuiz() {
  view = "quiz";
  panelClose();
  const qs = sessionQuestions();
  const day = findDay(session.mode === "day" ? session.dayId : (qs[curIdx()] ? qs[curIdx()].ref.dayId : session.dayId));
  const _ = i18n(dayLang(day));
  currentLang = ttsLang(dayLang(day));
  const hasStudy = day && day.study && Object.values(day.study).some(v => v && (Array.isArray(v) ? v.length : true));

  let html = `
    <div class="topbar">
      <button class="btn small" id="btn-back">${_.btnBack} <kbd>Esc</kbd></button>
      <div class="title">${esc(session.title)} ${day ? `<small>· ${esc(day.theme || "")}</small>` : ""}</div>
      <button class="btn small" id="btn-materials" ${hasStudy ? "" : "disabled"}>${_.btnMaterials} <kbd>M</kbd></button>
    </div>`;

  if (!qs.length) {
    const study = day && day.study;
    html += `<div class="q-card"><p>${_.noExercise}</p></div>`;
    APP.innerHTML = html + panelHtml(_);
    bindCommon(_);
    if (hasStudy) panelBind(day, _);
    return;
  }

  const i = Math.min(curIdx(), qs.length - 1);
  const done = answeredCount();
  const okCount = qs.reduce((n, _, j) => n + (getAnswer(j) && getAnswer(j).c ? 1 : 0), 0);
  const pct = Math.round(done / qs.length * 100);

  html += `
    <div class="pbar"><div style="width:${pct}%"></div></div>
    <div class="pnums"><span>第 ${i + 1} / ${qs.length} 题</span><span>已答 ${done} · 正确 ${okCount}</span></div>
    <div class="q-card" id="qcard"></div>
    <div class="dots">${qs.map((_, j) => {
      const a = getAnswer(j);
      const cls = a ? (a.c ? "ok" : "bad") : "";
      return `<button class="dot ${j === i ? "cur" : cls}" data-goto="${j}">${j + 1}</button>`;
    }).join("")}</div>
    <div class="nav-row">
      <button class="btn small" id="btn-prev" ${i === 0 ? "disabled" : ""}>${_.btnPrev}</button>
      <button class="btn small primary" id="btn-next" ${getAnswer(i) ? "" : "disabled"}>${i === qs.length - 1 ? _.btnSummary : _.btnNext}</button>
    </div>`;

  APP.innerHTML = html + panelHtml(_);
  bindCommon(_);
  renderQuestionInto(document.getElementById("qcard"), qs[i], i, _);
  if (hasStudy) panelBind(day, _);
}

function bindCommon(_) {
  APP.querySelector("#btn-back")?.addEventListener("click", backToHub);
  APP.querySelector("#btn-prev")?.addEventListener("click", () => nav(-1));
  APP.querySelector("#btn-next")?.addEventListener("click", () => nav(1));
  APP.querySelectorAll(".dot").forEach(d =>
    d.addEventListener("click", () => { setCurIdx(+d.dataset.goto); matchTemp = null; renderQuiz(); }));
}

function nav(dir) {
  const qs = sessionQuestions();
  const i = curIdx();
  const j = i + dir;
  if (j < 0) return;
  if (j >= qs.length) { view = "summary"; renderSummary(); return; }
  if (dir > 0 && !getAnswer(i)) return;
  setCurIdx(j);
  matchTemp = null;
  renderQuiz();
}

/* ---------- 题目渲染 ---------- */

function qPromptHtml(q, opts) {
  opts = opts || {};
  let p = inlineMd(q.prompt || q.statement || q.source || "");
  if (q.type === "choice" || q.type === "fill") {
    if (opts.fillWith !== undefined) {
      p = p.replace(/_{3}/g, `<span class="blank-slot">${esc(opts.fillWith)}</span>`);
    } else if (q.type === "choice") {
      p = p.replace(/_{3}/g, '<span class="blank-slot">&nbsp;</span>');
    }
  }
  const speakable = q.type === "choice" || q.type === "fill" || q.type === "truefalse";
  const sp = speakable && TTS_OK
    ? ` <button class="speak" data-speak="${esc(q.prompt || q.statement || "")}" title="朗读">🔊</button>` : "";
  return `<p class="q-prompt">${p}${sp}</p>`;
}

function renderQuestionInto(box, item, i, _) {
  const q = item.q;
  const ans = getAnswer(i);
  let h = `<div class="q-section">${esc(q.section || "")} · 第 ${i + 1} 题</div>`;

  if (q.type === "choice") h += renderChoice(q, ans, _);
  else if (q.type === "fill") h += renderFill(q, ans, _);
  else if (q.type === "match") h += renderMatch(q, ans, _);
  else if (q.type === "truefalse") h += renderTF(q, ans, _);
  else if (q.type === "translate") h += renderTranslate(q, ans, _);
  else h += `<p>未知题型: ${esc(q.type)}</p>`;

  box.innerHTML = h;

  // ---- 绑定交互 ----
  if (q.type === "choice" && !ans) {
    box.querySelectorAll(".opt").forEach(b =>
      b.addEventListener("click", () => submitChoice(i, +b.dataset.v)));
  }
  if (q.type === "fill" && !ans) {
    const inputs = [...box.querySelectorAll("input.blank-input")];
    inputs.forEach((inp, k) => inp.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (k < inputs.length - 1) inputs[k + 1].focus();
        else submitFill(i, inputs.map(x => x.value));
      }
    }));
    box.querySelector("#btn-fill-submit")?.addEventListener("click", () =>
      submitFill(i, inputs.map(x => x.value)));
    (inputs.find(x => !x.value.trim()) || inputs[0])?.focus();
  }
  if (q.type === "match" && !ans) {
    const t = matchTemp && matchTemp.length === (q.left || []).length ? matchTemp : (q.left || []).map(() => null);
    matchTemp = t;
    const repaint = () => {
      box.querySelectorAll(".match-item").forEach(el => {
        const side = el.dataset.side, k = +el.dataset.k;
        const paired = side === "L" ? t[k] : t.indexOf(k);
        el.classList.toggle("selected", false);
        el.querySelector(".tag")?.remove();
        if (paired !== null && paired !== -1 && paired !== undefined) {
          const tag = document.createElement("span");
          tag.className = "tag";
          tag.textContent = side === "L" ? String.fromCharCode(65 + t[k]) : String(paired + 1);
          el.appendChild(tag);
        }
      });
      box.querySelector("#btn-match-submit").disabled = t.some(v => v == null);
    };
    let selSide = null, selK = null;
    box.querySelectorAll(".match-item").forEach(el =>
      el.addEventListener("click", () => {
        const side = el.dataset.side, k = +el.dataset.k;
        if (side === "L") {
          if (selSide === "L" && selK === k) { selSide = selK = null; }
          else { selSide = "L"; selK = k; }
          el.classList.toggle("selected", selSide === "L");
          box.querySelectorAll(".match-item").forEach(o => {
            if (o !== el) o.classList.remove("selected");
          });
        } else if (selSide === "L") {
          const prev = t.indexOf(k);
          if (prev !== -1) t[prev] = null;
          t[selK] = k;
          selSide = selK = null;
          repaint();
        }
      }));
    box.querySelector("#btn-match-reset")?.addEventListener("click", () => {
      for (let k = 0; k < t.length; k++) t[k] = null;
      selSide = selK = null;
      box.querySelectorAll(".match-item").forEach(el => { el.classList.remove("selected"); });
      repaint();
    });
    box.querySelector("#btn-match-submit")?.addEventListener("click", () => submitMatch(i, t.slice()));
    repaint();
  }
  if (q.type === "truefalse" && !ans) {
    box.querySelectorAll(".tf-btn").forEach(b =>
      b.addEventListener("click", () => submitTF(i, b.dataset.v === "T")));
  }
  if (q.type === "translate" && !ans) {
    const ta = box.querySelector("textarea.ta");
    const btnReveal = box.querySelector("#btn-reveal");
    const onReveal = () => {
      btnReveal.disabled = true;
      box.querySelector("#ref-area").style.display = "";
      box.querySelector("#grade-area").style.display = "";
      ta.disabled = true;
      ta.focus();
    };
    btnReveal?.addEventListener("click", onReveal);
    ta.addEventListener("keydown", e => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onReveal(); }
    });
    box.querySelector("#btn-grade-ok")?.addEventListener("click", () => gradeTranslate(i, true));
    box.querySelector("#btn-grade-no")?.addEventListener("click", () => gradeTranslate(i, false));
    ta?.focus();
  }

  // 已作答：显示反馈
  if (ans) box.insertAdjacentHTML("beforeend", feedbackHtml(q, ans, i, _));
}

/* ---------- 各题型：渲染 + 判分 ---------- */

function renderChoice(q, ans, _) {
  let h = "";
  if (q.wordBank && q.wordBank.length) {
    h += `<div class="wordbank">${q.wordBank.map(w => `<span>${esc(w)}</span>`).join("")}</div>`;
  }
  h += qPromptHtml(q);
  h += `<div class="options">` + (q.options || []).map((o, k) => {
    let cls = "";
    if (ans) {
      if (k === q.answer) cls = "correct";
      else if (k === ans.a) cls = "wrong";
    }
    return `<button class="opt ${cls}" data-v="${k}" ${ans ? "disabled" : ""}>
      <span class="letter">${String.fromCharCode(65 + k)}</span><span>${inlineMd(o)}</span>
    </button>`;
  }).join("") + `</div>`;

  // 选词填空已作答：展示全选项释义 + 句子翻译
  if (ans) {
    if (q.optionsCn && q.optionsCn.length) {
      h += `<div class="opts-cn"><div class="opts-cn-title">选项释义</div><div class="opts-cn-list">`;
      (q.optionsCn || []).forEach((cn, k) => {
        const cls = k === q.answer ? "ok" : "";
        h += `<div class="opts-cn-item ${cls}"><span class="ocn-letter">${String.fromCharCode(65 + k)}</span> <span class="ocn-word">${esc((q.options || [])[k] || "")}</span> <span class="ocn-cn">${esc(cn || "")}</span></div>`;
      });
      h += `</div></div>`;
    }
    if (q.sentenceCn) {
      h += `<div class="sentence-cn"><div class="sentence-cn-title">句子翻译</div><div class="sentence-cn-text">${esc(q.sentenceCn)}</div></div>`;
    }
  }
  return h;
}
function submitChoice(i, v) {
  const q = sessionQuestions()[i].q;
  setAnswer(i, { a: v, c: v === q.answer });
  if (document.activeElement) document.activeElement.blur();
  renderQuiz();
}

function renderFill(q, ans, _) {
  const parts = String(q.prompt || "").split("___");
  let h = `<div class="fill-line">`;
  parts.forEach((seg, k) => {
    h += inlineMd(seg);
    if (k < parts.length - 1) {
      if (ans) {
        const mine = (ans.a && ans.a[k]) || "";
        const ok = ans.okBlanks ? ans.okBlanks[k] : false;
        const w = q.blanks[k].word || "";
        h += `<span class="blank-wrap">`;
        if (w) h += `<span class="blank-hint">原形: <span class="bh-mark">${esc(w)}</span></span>`;
        h += `<span class="fill-ans ${ok ? "ok" : "bad"}">${esc(mine || "—")}</span></span>`;
        if (!ok) h += `<span class="fill-correct">（${esc((q.blanks[k].accepted || [])[0] || "")}）</span>`;
      } else {
        const w = q.blanks[k].word || "";
        h += `<span class="blank-wrap">`;
        if (w) h += `<span class="blank-hint">原形: <span class="bh-mark">${esc(w)}</span></span>`;
        h += `<input class="blank-input" autocomplete="off" autocapitalize="off" spellcheck="false" style="min-width:${Math.max(5, ((q.blanks[k].accepted || [""])[0] || "").length + 2)}ch"></span>`;
      }
    }
  });
  h += `</div>`;
  if (!ans) h += `<div style="margin-top:16px"><button class="btn primary" id="btn-fill-submit">${_.btnFillSubmit} <kbd>Enter</kbd></button></div>`;
  return h;
}
function submitFill(i, values) {
  const q = sessionQuestions()[i].q;
  const okBlanks = (q.blanks || []).map((b, k) =>
    (b.accepted || []).some(a => normAns(a) === normAns(values[k])));
  setAnswer(i, { a: values, okBlanks, c: okBlanks.every(Boolean) });
  if (document.activeElement) document.activeElement.blur();
  renderQuiz();
}

function renderMatch(q, ans, _) {
  const L = q.left || [], R = q.right || [];
  let h = `<p class="q-prompt">${_.matchPrompt}</p><div class="match-grid">`;
  h += `<div class="match-col">` + L.map((t, k) => {
    let cls = "", tag = "";
    if (ans) {
      const mine = ans.a[k], right = q.pairs[k];
      cls = mine === right ? "correct" : "wrong";
      tag = `<span class="tag">${String.fromCharCode(65 + (ans.a[k] ?? 0))}</span>`;
    }
    return `<button class="match-item ${cls}" data-side="L" data-k="${k}" ${ans ? "disabled" : ""}>${tag}${inlineMd(t)}</button>`;
  }).join("") + `</div>`;
  h += `<div class="match-col">` + R.map((t, k) => `<button class="match-item" data-side="R" data-k="${k}" ${ans ? "disabled" : ""}>${inlineMd(t)}</button>`).join("") + `</div>`;
  h += `</div>`;
  if (!ans) h += `<div class="btn-row"><button class="btn" id="btn-match-reset">${_.btnMatchReset}</button><button class="btn primary" id="btn-match-submit" disabled>${_.btnMatchSubmit} <kbd>Enter</kbd></button></div>`;
  return h;
}
function submitMatch(i, picks) {
  const q = sessionQuestions()[i].q;
  const c = (q.pairs || []).every((v, k) => picks[k] === v);
  setAnswer(i, { a: picks, c });
  matchTemp = null;
  if (document.activeElement) document.activeElement.blur();
  renderQuiz();
}

function renderTF(q, ans, _) {
  let h = qPromptHtml(q);
  h += `<div class="tf-row">
    <button class="tf-btn ${ans ? (q.answer ? "correct" : (ans.a ? "wrong" : "")) : ""}" data-v="T" ${ans ? "disabled" : ""}>${_.tfCorrect} <kbd>T</kbd></button>
    <button class="tf-btn ${ans ? (!q.answer ? "correct" : (ans.a ? "" : "wrong")) : ""}" data-v="F" ${ans ? "disabled" : ""}>${_.tfWrong} <kbd>F</kbd></button>
  </div>`;
  return h;
}
function submitTF(i, v) {
  const q = sessionQuestions()[i].q;
  setAnswer(i, { a: v, c: v === !!q.answer });
  if (document.activeElement) document.activeElement.blur();
  renderQuiz();
}

function renderTranslate(q, ans, _) {
  const dir = q.direction || "zh2en";
  const target = dir.startsWith("zh2") ? dir.slice(3) : "zh";
  const targetName = target === "ja" ? "日文" : target === "en" ? "英文" : "中文";
  let h = `<p class="translate-src">${esc(q.source || "")}</p>`;
  const myAns = ans ? ans.a : "";
  h += `<textarea class="ta" placeholder="在此输入${targetName}${_.translatePlaceholder}…">${esc(myAns)}</textarea>`;
  h += `<div style="margin-top:12px" id="ref-wrap">
    <button class="btn primary" id="btn-reveal" ${ans ? "disabled" : ""}>${_.btnReveal} <kbd>Ctrl+Enter</kbd></button>
    <div id="ref-area" style="display:${ans ? "" : "none"}">
      <div class="ref-box">
        <div>${inlineMd(q.reference || "")}${TTS_OK ? ` <button class="speak" data-speak="${esc(q.reference || "")}">🔊</button>` : ""}</div>
        ${q.keyPoints && q.keyPoints.length ? `<div class="kp">要点: ${q.keyPoints.map(k => `<b>${esc(k)}</b>`).join(" · ")}</div>` : ""}
      </div>
    </div>
    <div id="grade-area" class="grade-row" style="display:${ans ? "" : "none"}">
      <button class="btn ok-btn" id="btn-grade-ok" ${ans ? "disabled" : ""}>${_.btnGradeOk} <kbd>Y</kbd></button>
      <button class="btn bad-btn" id="btn-grade-no" ${ans ? "disabled" : ""}>${_.btnGradeNo} <kbd>N</kbd></button>
    </div>
  </div>`;
  return h;
}
function gradeTranslate(i, ok) {
  const ta = APP.querySelector("textarea.ta");
  setAnswer(i, { a: ta ? ta.value : "", c: ok });
  renderQuiz();
}

/* ---------- 反馈块 ---------- */

function correctText(q) {
  if (q.type === "choice") return (q.options || [])[q.answer] ?? "";
  if (q.type === "fill") return (q.blanks || []).map(b => (b.accepted || ["?"])[0]).join(" / ");
  if (q.type === "match") return (q.left || []).map((_, k) =>
    `${k + 1} - ${String.fromCharCode(65 + q.pairs[k])}`).join("，");
  if (q.type === "truefalse") return q.answer ? "T（正确）" : "F（错误）";
  if (q.type === "translate") return q.reference || "";
  return "";
}
function feedbackHtml(q, ans, i, _) {
  const qs = sessionQuestions();
  const last = i === qs.length - 1;
  let h = `<div class="feedback ${ans.c ? "good" : "bad"}">
    <div class="verdict">${ans.c ? _.verdictCorrect : _.verdictWrong}</div>`;
  if (!ans.c && q.type !== "translate") {
    h += `<div class="detail"><p><b>${_.correctAnswer}:</b> ${esc(correctText(q))}</p></div>`;
  }
  if (q.explanation) {
    h += `<div class="detail"><p><b>${_.explanation}:</b> ${inlineMd(q.explanation)}</p></div>`;
  }
  h += `<p class="kbd-hint" style="margin:8px 0 0"><kbd>Enter</kbd> ${last ? _.enterSummary : _.enterNext}</p></div>`;
  return h;
}

/* ================= 结算 ================= */

function renderSummary() {
  view = "summary";
  panelClose();
  const qs = sessionQuestions();
  const isDay = session.mode === "day";
  const day = isDay ? findDay(session.dayId) : null;
  const _ = i18n(day ? dayLang(day) : "en");

  let ok = 0;
  const bySec = {};
  qs.forEach((item, j) => {
    const a = getAnswer(j);
    if (!a) return;
    const sec = item.q.section || "练习";
    bySec[sec] = bySec[sec] || { ok: 0, n: 0 };
    bySec[sec].n++;
    if (a.c) { bySec[sec].ok++; ok++; }
  });
  const total = qs.length;
  const pct = total ? Math.round(ok / total * 100) : 0;
  const cls = pct >= 80 ? "ok" : pct >= 60 ? "mid" : "low";

  let html = `
    <div class="topbar">
      <button class="btn small" id="btn-back">${_.btnBack} <kbd>Esc</kbd></button>
      <div class="title">${esc(session.title)} · ${_.summaryTitle}</div>
    </div>
    <div class="q-card">
      <div class="score-hero">
        <div class="big ${cls}">${ok} / ${total}</div>
        <div class="sub">正确率 ${pct}%${isDay ? "" : "（错题重练）"}</div>
      </div>
      <table class="sec-table">
        <tr><th>${_.summaryBySection}</th><th>${_.summaryCorrect}</th><th>${_.summaryAccuracy}</th></tr>
        ${Object.entries(bySec).map(([sec, s]) =>
          `<tr><td>${esc(sec)}</td><td>${s.ok}/${s.n}</td><td>${Math.round(s.ok / s.n * 100)}%</td></tr>`).join("")}
      </table>`;

  const wrongs = qs.map((item, j) => ({ item, j, a: getAnswer(j) })).filter(x => x.a && !x.a.c);
  if (wrongs.length) {
    html += `<h2>${_.summaryReview}（${wrongs.length}）</h2>`;
    html += wrongs.map(({ item, j, a }) => {
      const q = item.q;
      let mine = "";
      if (q.type === "choice") mine = (q.options || [])[a.a] ?? "";
      else if (q.type === "fill") mine = (a.a || []).join(" / ");
      else if (q.type === "match") mine = (a.a || []).map((v, k) => `${k + 1}-${String.fromCharCode(65 + v)}`).join("，");
      else if (q.type === "truefalse") mine = a.a ? "T" : "F";
      else if (q.type === "translate") mine = a.a || "";
      return `<div class="wrong-item">
        <div class="wi-sec">${esc(q.section || "")} · 第 ${j + 1} 题</div>
        <div>${inlineMd(q.prompt || q.statement || q.source || "")}</div>
        <div class="wi-ans">你的答案: <b class="mine">${esc(mine)}</b>　${_.correctAnswer}: <b class="good">${esc(correctText(q))}</b></div>
        ${q.explanation ? `<div class="wi-ans">💡 ${inlineMd(q.explanation)}</div>` : ""}
      </div>`;
    }).join("");
  }

  html += `<div class="btn-row">`;
  if (isDay) {
    if (wrongs.length) html += `<button class="btn primary" id="btn-redo-wrong">${_.btnRedoWrong}（${wrongs.length}）</button>`;
    html += `<button class="btn" id="btn-review-all">${_.btnReviewAll}</button>
             <button class="btn" id="btn-redo-all">${_.btnRedoAll}</button>`;
  } else {
    html += `<button class="btn primary" id="btn-again">${_.btnAgain}</button>`;
  }
  html += `</div><p class="kbd-hint"><kbd>Enter</kbd> ${_.enterBack}</p></div>`;

  APP.innerHTML = html;
  APP.querySelector("#btn-back").addEventListener("click", backToHub);
  APP.querySelector("#btn-redo-wrong")?.addEventListener("click", () => {
    const refs = wrongs.map(w => w.item.ref);
    startReview(refs, session.title + " · 错题重练");
  });
  APP.querySelector("#btn-review-all")?.addEventListener("click", () => {
    const p = dayProgress(session.dayId);
    p.current = 0;
    view = "quiz";
    renderQuiz();
  });
  APP.querySelector("#btn-redo-all")?.addEventListener("click", () => {
    logEvent({ event: "day-reset", day: session.dayId });
    store.days[session.dayId] = { answers: [], current: 0, completed: false };
    saveStore();
    startDay(session.dayId);
  });
  APP.querySelector("#btn-again")?.addEventListener("click", () => {
    startReview(session.questions, session.title);
  });
}

/* ================= 错题本 ================= */

function renderWrongbook() {
  view = "wrongbook";
  panelClose();
  const _ = i18n("en");
  const groups = [];
  for (const d of DAYS) {
    const p = store.days[d.id];
    if (!p) continue;
    const items = [];
    p.answers.forEach((a, i) => {
      const q = dayQuestions(d)[i];
      if (a && !a.c && q) items.push({ i, q });
    });
    if (items.length) groups.push({ day: d, items });
  }
  let html = `
    <div class="topbar">
      <button class="btn small" id="btn-back">${_.btnBack} <kbd>Esc</kbd></button>
      <div class="title">${_.wbTitle}</div>
    </div>`;
  if (!groups.length) {
    html += `<div class="empty"><p>${_.wbEmpty}</p></div>`;
  } else {
    const allRefs = [];
    html += `<div style="margin-bottom:16px"><button class="btn primary" id="btn-drill-all">${_.btnDrillAll}</button></div>`;
    groups.forEach(g => {
      html += `<div class="wb-group"><h3>${esc(g.day.date)} · ${esc(g.day.theme || "")}（${g.items.length} 题）</h3>`;
      g.items.forEach(({ i, q }) => {
        allRefs.push({ dayId: g.day.id, idx: i });
        html += `<div class="wrong-item">
          <div class="wi-sec">${esc(q.section || "")} · 第 ${i + 1} 题</div>
          <div>${inlineMd(q.prompt || q.statement || q.source || "")}</div>
          <div class="wi-ans">${_.correctAnswer}: <b class="good">${esc(correctText(q))}</b></div>
        </div>`;
      });
      html += `</div>`;
    });
    html += `<div class="btn-row"><button class="btn" id="btn-drill-all2">${_.btnDrillAll}（${allRefs.length}）</button></div>`;
    APP.innerHTML = html;
    const drill = () => startReview(allRefs, "错题本 · 集中重练");
    APP.querySelector("#btn-drill-all")?.addEventListener("click", drill);
    APP.querySelector("#btn-drill-all2")?.addEventListener("click", drill);
    APP.querySelector("#btn-back").addEventListener("click", renderHub);
    return;
  }
  APP.innerHTML = html;
  APP.querySelector("#btn-back").addEventListener("click", renderHub);
}

/* ================= 学习材料面板 ================= */

function panelHtml(_) {
  return `
  <div class="panel-overlay" id="panel-overlay"></div>
  <div class="panel" id="panel">
    <div class="panel-head">
      <div class="title">${_.panelTitle}</div>
      <button class="btn small" id="btn-panel-close">${_.panelClose} <kbd>Esc</kbd></button>
    </div>
    <div class="tabs" id="panel-tabs"></div>
    <div class="panel-body md" id="panel-body"></div>
  </div>`;
}

function panelBind(day, _) {
  const overlay = APP.querySelector("#panel-overlay");
  const panel = APP.querySelector("#panel");
  APP.querySelector("#btn-materials")?.addEventListener("click", panelToggle);
  APP.querySelector("#btn-panel-close")?.addEventListener("click", panelClose);
  overlay?.addEventListener("click", panelClose);

  const study = day.study || {};
  const tabs = [];
  if (study.vocabulary && study.vocabulary.length) tabs.push(["vocab", _.panelVocab]);
  if (study.phrases && study.phrases.length) tabs.push(["phrases", _.panelPhrases]);
  if (study.grammar && study.grammar.content) tabs.push(["grammar", _.panelGrammar]);
  if (study.reading && study.reading.passage) tabs.push(["reading", _.panelReading]);
  if (study.culture) tabs.push(["culture", _.panelCulture]);
  if (!tabs.length) return;
  if (!tabs.some(t => t[0] === panelTab)) panelTab = tabs[0][0];

  APP.querySelector("#panel-tabs").innerHTML = tabs.map(([k, label]) =>
    `<button class="tab ${k === panelTab ? "on" : ""}" data-tab="${k}">${label}</button>`).join("");
  APP.querySelectorAll("#panel-tabs .tab").forEach(b =>
    b.addEventListener("click", () => { panelTab = b.dataset.tab; panelRender(day, _); }));

  panelRender(day, _);
}

function panelRender(day, _) {
  const body = APP.querySelector("#panel-body");
  if (!body) return;
  const study = day.study || {};
  APP.querySelectorAll("#panel-tabs .tab").forEach(b =>
    b.classList.toggle("on", b.dataset.tab === panelTab));

  if (panelTab === "vocab") {
    body.innerHTML = (study.vocabulary || []).map(v => `
      <div class="vocab-card">
        <div class="w-line">
          <span class="w">${esc(v.word)}</span>
          ${TTS_OK ? `<button class="speak" data-speak="${esc(v.word)}" title="朗读单词">🔊</button>` : ""}
          <span class="ipa">${esc(v.ipa || "")}</span>
          <span class="pos">${esc(v.pos || "")}</span>
        </div>
        <div class="cn">${esc(v.meaningCn || "")}</div>
        ${v.meaningEn ? `<div class="en">${inlineMd(v.meaningEn)}</div>` : ""}
        ${(v.examples || []).length ? `<ul>${v.examples.map(ex =>
          `<li>${inlineMd(ex.ja || ex.en || "")}${ex.zh ? `<br><span class="zh-ex">${esc(ex.zh)}</span>` : ""}${TTS_OK ? ` <button class="speak" data-speak="${esc(ex.ja || ex.en || "")}" title="朗读">🔊</button>` : ""}</li>`).join("")}</ul>` : ""}
        ${v.notes ? `<div class="md">${mdToHtml(v.notes)}</div>` : ""}
      </div>`).join("");
  } else if (panelTab === "phrases") {
    body.innerHTML = (study.phrases || []).map(p => `
      <div class="vocab-card">
        <div class="w-line">
          <span class="w">${esc(p.phrase)}</span>
          ${TTS_OK ? `<button class="speak" data-speak="${esc(p.phrase)}" title="朗读">🔊</button>` : ""}
        </div>
        <div class="cn">${esc(p.meaningCn || "")}</div>
        ${(p.examples || []).length ? `<ul>${p.examples.map(ex =>
          `<li>${inlineMd(ex.ja || ex.en || "")}${ex.zh ? `<br><span class="zh-ex">${esc(ex.zh)}</span>` : ""}</li>`).join("")}</ul>` : ""}
      </div>`).join("");
  } else if (panelTab === "grammar") {
    const g = study.grammar || {};
    body.innerHTML = `<h2>${esc(g.title || "")}</h2>` + mdToHtml(g.content || "");
  } else if (panelTab === "reading") {
    const r = study.reading || {};
    body.innerHTML = `
      <h2>${esc(r.title || "")}</h2>
      ${TTS_OK && r.passage ? `<p><button class="btn small" data-speak="${esc(stripMd(r.passage).slice(0, 600))}">${_.readingSpeakAll}</button></p>` : ""}
      ${mdToHtml(r.passage || "")}
      ${r.translation ? `<details><summary>${_.readingTranslation}</summary><div>${mdToHtml(r.translation)}</div></details>` : ""}
      ${(r.vocab || []).length ? `<h3>${_.readingVocabTitle}</h3><table class="vocab-table">
        <tr><th>单词</th><th>音标</th><th>释义</th></tr>
        ${(r.vocab || []).map(v => `<tr><td>${esc(v.word)}</td><td>${esc(v.ipa || "")}</td><td>${esc(v.meaningCn || "")}</td></tr>`).join("")}
      </table>` : ""}`;
  } else if (panelTab === "culture") {
    body.innerHTML = mdToHtml(study.culture || "");
  }
}

function panelToggle() {
  const panel = APP.querySelector("#panel");
  if (!panel) return;
  if (panelOpen) panelClose(); else panelOpenNow();
}
function panelOpenNow() {
  panelOpen = true;
  APP.querySelector("#panel")?.classList.add("open");
  APP.querySelector("#panel-overlay")?.classList.add("open");
}
function panelClose() {
  panelOpen = false;
  APP.querySelector("#panel")?.classList.remove("open");
  APP.querySelector("#panel-overlay")?.classList.remove("open");
}

/* ================= 键盘 ================= */

function backToHub() { renderHub(); }

document.addEventListener("click", e => {
  const sp = e.target.closest("[data-speak]");
  if (sp) speakText(sp.dataset.speak, sp.dataset.speakLang || currentLang);
});

document.addEventListener("keydown", e => {
  if (view === "hub" || view === "wrongbook") {
    if (e.key === "Escape") renderHub();
    return;
  }
  if (panelOpen) {
    if (e.key === "Escape") { e.preventDefault(); panelClose(); }
    return;
  }
  if (e.key === "Escape") { e.preventDefault(); backToHub(); return; }
  if (view === "summary") {
    if (e.key === "Enter") { e.preventDefault(); backToHub(); }
    return;
  }
  if (view !== "quiz" || !session) return;

  if (e.key === "m" || e.key === "M") { e.preventDefault(); panelToggle(); return; }

  const qs = sessionQuestions();
  if (!qs.length) return;
  const i = curIdx();
  const q = qs[i].q;
  const ans = getAnswer(i);
  const inField = /^(INPUT|TEXTAREA)$/.test((e.target && e.target.tagName) || "");

  if (inField) {
    return;
  }

  if (ans) {
    if (e.key === "Enter") { e.preventDefault(); nav(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); nav(-1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); nav(1); }
    return;
  }

  // 未作答
  if (q.type === "choice") {
    let k = -1;
    if (/^[1-9]$/.test(e.key)) k = +e.key - 1;
    else if (/^[a-j]$/i.test(e.key)) k = e.key.toLowerCase().charCodeAt(0) - 97;
    if (k >= 0 && k < (q.options || []).length) { e.preventDefault(); submitChoice(i, k); }
    return;
  }
  if (q.type === "truefalse") {
    if (e.key === "t" || e.key === "T" || e.key === "ArrowRight") { e.preventDefault(); submitTF(i, true); }
    else if (e.key === "f" || e.key === "F" || e.key === "ArrowLeft") { e.preventDefault(); submitTF(i, false); }
    return;
  }
  if (q.type === "match" && e.key === "Enter") {
    const btn = APP.querySelector("#btn-match-submit");
    if (btn && !btn.disabled) { e.preventDefault(); btn.click(); }
    return;
  }
  if (q.type === "translate") {
    if (e.key === "Enter") {
      const rb = APP.querySelector("#btn-reveal");
      if (rb && !rb.disabled) { e.preventDefault(); rb.click(); }
    } else if (e.key === "y" || e.key === "Y") {
      const b = APP.querySelector("#btn-grade-ok");
      if (b && !b.disabled) { e.preventDefault(); b.click(); }
    } else if (e.key === "n" || e.key === "N") {
      const b = APP.querySelector("#btn-grade-no");
      if (b && !b.disabled) { e.preventDefault(); b.click(); }
    }
    return;
  }
});

/* ================= 启动 ================= */

if (!DATA) {
  const _ = i18n("en");
  APP.innerHTML = `<h1>${_.appTitle}</h1>
    <div class="empty">
      <p style="font-size:1.05rem"><b>${_.dataMissingTitle}</b></p>
      <p>${_.dataMissingHint1} <code>刷题.bat</code> —— ${_.dataMissingHint2}<br>
      ${_.dataMissingHint3} <code>python build_data.py</code> ${_.dataMissingHint4}</p>
    </div>`;
} else {
  renderHub();
  syncFromServer();
}
