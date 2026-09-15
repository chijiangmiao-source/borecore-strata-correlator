#!/usr/bin/env bash
# 一次性验收：等待服务就绪后依次执行 pytest、Vitest、Playwright。
set -euo pipefail

API_URL="${API_BASE:-http://api:8000}"
WEB_URL="${BASE_URL:-http://web}"

echo "== 等待服务就绪（api: ${API_URL}, web: ${WEB_URL}）=="
python3 - "${API_URL}" "${WEB_URL}" <<'PY'
import sys
import time
import urllib.request

api_health, web = sys.argv[1] + "/api/health", sys.argv[2]
for url in (api_health, web):
    for _ in range(60):
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                if response.status < 500:
                    break
        except Exception:
            pass
        time.sleep(1)
    else:
        sys.exit(f"等待超时: {url}")
print("服务就绪")
PY

echo "== 1/3 pytest：核心算法与接口（含对运行中服务的真实 HTTP 联调）=="
cd /app/api
API_BASE="${API_URL}" python3 -m pytest tests -q

echo "== 2/3 Vitest：前端单元测试 =="
cd /app/web
npx vitest run

echo "== 3/3 Playwright：浏览器真实联调 =="
BASE_URL="${WEB_URL}" npx playwright test

echo "验收通过：pytest + Vitest + Playwright 全部绿"
