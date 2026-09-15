"""真实联调测试：通过 HTTP 访问运行中的服务（verify 验收容器使用）。

本地默认跳过；设置 API_BASE 环境变量后生效，例如：
    API_BASE=http://localhost:8000 pytest tests/test_integration.py
"""

from __future__ import annotations

import os

import httpx
import pytest

API_BASE = os.environ.get("API_BASE", "").rstrip("/")

pytestmark = pytest.mark.skipif(not API_BASE, reason="未设置 API_BASE，跳过真实联调测试")

EXAMPLE = {
    "left": [
        {"code": "A", "thickness": 20},
        {"code": "C", "thickness": 25},
        {"code": "B", "thickness": 60},
        {"code": "B", "thickness": 40},
        {"code": "D", "thickness": 30},
        {"code": "E", "thickness": 200},
        {"code": "G", "thickness": 100},
    ],
    "right": [
        {"code": "A", "thickness": 100},
        {"code": "B", "thickness": 95},
        {"code": "D", "thickness": 90},
        {"code": "E", "thickness": 50},
        {"code": "E", "thickness": 150},
        {"code": "G", "thickness": 20},
        {"code": "H", "thickness": 25},
    ],
}


def test_health_over_http():
    response = httpx.get(f"{API_BASE}/api/health", timeout=10)
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_correlate_over_http_matches_documented_example():
    response = httpx.post(f"{API_BASE}/api/correlate", json=EXAMPLE, timeout=10)
    assert response.status_code == 200
    body = response.json()
    assert body["totals"] == {"cost": 725, "missing_steps": 2, "group_steps": 2, "step_count": 7}
    assert [step["type"] for step in body["steps"]] == [
        "1:1", "1:0", "2:1", "1:1", "1:2", "1:1", "0:1",
    ]


def test_repeated_submissions_over_http_are_identical():
    first = httpx.post(f"{API_BASE}/api/correlate", json=EXAMPLE, timeout=10)
    second = httpx.post(f"{API_BASE}/api/correlate", json=EXAMPLE, timeout=10)
    assert first.status_code == second.status_code == 200
    assert first.content == second.content


def test_validation_error_over_http_locates_layer():
    payload = {
        "left": [{"code": "A", "thickness": 10}, {"code": "B", "thickness": 0}],
        "right": [{"code": "A", "thickness": 10}],
    }
    response = httpx.post(f"{API_BASE}/api/correlate", json=payload, timeout=10)
    assert response.status_code == 422
    messages = [item["message"] for item in response.json()["detail"]]
    assert any("左列第2层" in message for message in messages)
