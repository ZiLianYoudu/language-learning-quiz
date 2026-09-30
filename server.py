#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
server.py — 本地答题服务（仅 127.0.0.1，标准库实现，无需安装依赖）。

功能:
    GET  /api/progress   读取已保存的进度状态 (progress.json)
    POST /api/progress   保存进度状态 + 追加答题日志 (progress.log)
    其余路径             静态服务 web/ 目录（答题页面）

由 刷题.bat 启动；关闭其窗口即停止。每答一题客户端即提交一次，
因此随时关闭都不会丢失进度。
"""

import json
import os
import sys
import threading
import webbrowser
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
PORT = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 8399
OPEN_BROWSER = "--open" in sys.argv
PROGRESS = ROOT / "progress.json"
LOG = ROOT / "progress.log"

_lock = threading.Lock()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB), **kwargs)

    def log_message(self, fmt, *args):
        pass  # 不刷访问日志，保持控制台干净

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    # ---------- 工具 ----------

    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    # ---------- 路由 ----------

    def do_GET(self):
        if self.path.split("?")[0] == "/api/progress":
            with _lock:
                if PROGRESS.exists():
                    try:
                        return self._json(json.loads(PROGRESS.read_text(encoding="utf-8")))
                    except (json.JSONDecodeError, OSError):
                        pass
            return self._json({"days": {}})
        super().do_GET()  # 其余走静态文件

    def do_POST(self):
        if self.path.split("?")[0] != "/api/progress":
            return self._json({"ok": False, "error": "not found"}, 404)
        try:
            length = int(self.headers.get("Content-Length") or 0)
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, json.JSONDecodeError, UnicodeDecodeError):
            return self._json({"ok": False, "error": "bad request"}, 400)

        state = payload.get("state") or {"days": {}}
        events = payload.get("events") or []
        with _lock:
            tmp = PROGRESS.with_suffix(".json.tmp")
            tmp.write_text(json.dumps(state, ensure_ascii=False, indent=1), encoding="utf-8")
            os.replace(tmp, PROGRESS)  # 原子替换，避免写一半损坏
            if events:
                with open(LOG, "a", encoding="utf-8") as f:
                    for ev in events:
                        if not isinstance(ev, dict):
                            continue
                        ev.setdefault("ts", datetime.now().isoformat(timespec="seconds"))
                        f.write(json.dumps(ev, ensure_ascii=False) + "\n")
        return self._json({"ok": True})


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    try:
        srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    except OSError:
        print(f"Port {PORT} is already in use - the quiz server is likely already running.")
        print("Opening the app in your browser...")
        if OPEN_BROWSER:
            webbrowser.open(f"http://127.0.0.1:{PORT}/")
        return
    print(f"Quiz server running at http://127.0.0.1:{PORT}/")
    print("Progress is saved to progress.json / progress.log after every answer.")
    print("Close this window to stop the server - no data will be lost.")
    if OPEN_BROWSER:
        # bind 成功即已开始监听，浏览器连接会排队等待 serve_forever 处理
        webbrowser.open(f"http://127.0.0.1:{PORT}/")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
