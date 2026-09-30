# 语言学习每日练习 — 跨平台构建入口
# 用法:
#   make build    校验数据 + 生成 web/data.js
#   make run      构建 + 启动本地服务 + 打开浏览器
#   make serve    仅启动本地服务（不重新构建）
#   make clean    清除构建产物

PYTHON ?= python
PORT ?= 8399

.PHONY: build run serve clean

build:
	$(PYTHON) build_data.py

run: build
	$(PYTHON) server.py --open $(PORT)

serve:
	$(PYTHON) server.py --open $(PORT)

clean:
	rm -f web/data.js
	rm -f daily/*.md
