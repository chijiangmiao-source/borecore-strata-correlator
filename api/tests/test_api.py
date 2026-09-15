"""接口测试：健康检查、正常计算、校验错误定位到层号、重复提交一致性。"""

from __future__ import annotations

import sys
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from main import app  # noqa: E402

client = TestClient(app)

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


def test_health():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_correlate_example_matches_documented_result():
    response = client.post("/api/correlate", json=EXAMPLE)
    assert response.status_code == 200
    body = response.json()
    assert [step["type"] for step in body["steps"]] == [
        "1:1", "1:0", "2:1", "1:1", "1:2", "1:1", "0:1",
    ]
    assert body["totals"] == {"cost": 725, "missing_steps": 2, "group_steps": 2, "step_count": 7}
    left_seen = [e["layer"] for s in body["steps"] for e in s["left"]]
    right_seen = [e["layer"] for s in body["steps"] for e in s["right"]]
    assert left_seen == list(range(1, 8))
    assert right_seen == list(range(1, 8))


def test_correlate_is_stateless_and_deterministic():
    first = client.post("/api/correlate", json=EXAMPLE)
    second = client.post("/api/correlate", json=EXAMPLE)
    assert first.status_code == second.status_code == 200
    assert first.content == second.content


def test_correlate_returns_stepwise_substitution_margins():
    response = client.post("/api/correlate", json=EXAMPLE)
    assert response.status_code == 200
    body = response.json()
    margins = body["margins"]
    assert margins["steps"] == [
        {"index": 1, "cost": 25, "missing": -1, "groups": 1},
        {"index": 2, "cost": 15, "missing": -1, "groups": 1},
        {"index": 3, "cost": 15, "missing": -1, "groups": 1},
        {"index": 4, "cost": 15, "missing": -1, "groups": 1},
        {"index": 5, "cost": 100, "missing": 0, "groups": 0},
        {"index": 6, "cost": 25, "missing": -1, "groups": 1},
        {"index": 7, "cost": 25, "missing": -1, "groups": 1},
    ]
    assert margins["most_fragile"] == 2
    alternative = margins["alternative"]
    assert [step["type"] for step in alternative["steps"]] == [
        "1:1", "2:1", "2:1", "1:2", "1:1", "0:1",
    ]
    assert alternative["totals"] == {
        "cost": 740, "missing_steps": 1, "group_steps": 3, "step_count": 6,
    }
    # 替代证据同样逐步消费全部输入层
    left_seen = [e["layer"] for s in alternative["steps"] for e in s["left"]]
    right_seen = [e["layer"] for s in alternative["steps"] for e in s["right"]]
    assert left_seen == list(range(1, 8))
    assert right_seen == list(range(1, 8))
    # 扩展字段不影响原结果：原路径与累计证据保持不变
    assert body["totals"] == {"cost": 725, "missing_steps": 2, "group_steps": 2, "step_count": 7}
    assert [step["type"] for step in body["steps"]] == [
        "1:1", "1:0", "2:1", "1:1", "1:2", "1:1", "0:1",
    ]


def _messages(response) -> list[str]:
    assert response.status_code == 422
    return [item["message"] for item in response.json()["detail"]]


def test_thickness_out_of_range_locates_layer_number():
    payload = {
        "left": [{"code": "A", "thickness": 10}, {"code": "B", "thickness": 20}, {"code": "C", "thickness": 0}],
        "right": [{"code": "A", "thickness": 10}],
    }
    messages = _messages(client.post("/api/correlate", json=payload))
    assert any("左列第3层" in message and "厚度" in message for message in messages)


def test_thickness_above_max_locates_layer_number():
    payload = {
        "left": [{"code": "A", "thickness": 10}],
        "right": [{"code": "A", "thickness": 1000}],
    }
    messages = _messages(client.post("/api/correlate", json=payload))
    assert any("右列第1层" in message and "1–999" in message for message in messages)


def test_non_integer_thickness_is_rejected():
    for bad in (1.5, "100", True, None):
        payload = {
            "left": [{"code": "A", "thickness": bad}],
            "right": [{"code": "A", "thickness": 10}],
        }
        messages = _messages(client.post("/api/correlate", json=payload))
        assert any("左列第1层" in message for message in messages), bad


def test_invalid_lithology_code_locates_layer_number():
    for bad in ("a", "AB", "1", "", 5):
        payload = {
            "left": [{"code": "A", "thickness": 10}],
            "right": [{"code": "A", "thickness": 10}, {"code": bad, "thickness": 10}],
        }
        messages = _messages(client.post("/api/correlate", json=payload))
        assert any("右列第2层" in message and "岩性代码" in message for message in messages), bad


def test_column_size_limits_are_enforced():
    empty = {"left": [], "right": [{"code": "A", "thickness": 10}]}
    assert any("左列层数须为 1–80" in m for m in _messages(client.post("/api/correlate", json=empty)))

    too_many = {
        "left": [{"code": "A", "thickness": 10}] * 81,
        "right": [{"code": "A", "thickness": 10}],
    }
    assert any("左列层数须为 1–80" in m for m in _messages(client.post("/api/correlate", json=too_many)))

    boundary = {
        "left": [{"code": "A", "thickness": 10}] * 80,
        "right": [{"code": "A", "thickness": 10}] * 80,
    }
    assert client.post("/api/correlate", json=boundary).status_code == 200


def test_missing_column_and_malformed_layers():
    messages = _messages(client.post("/api/correlate", json={"left": [{"code": "A", "thickness": 10}]}))
    assert any("右列须为层数组" in message for message in messages)

    messages = _messages(client.post("/api/correlate", json={"left": ["X"], "right": []}))
    assert any("左列第1层" in message for message in messages)
    assert any("右列层数须为 1–80" in message for message in messages)


def test_all_errors_are_returned_together():
    payload = {
        "left": [{"code": "a", "thickness": 0}, {"code": "B", "thickness": 10}],
        "right": [{"code": "C", "thickness": 5000}],
    }
    detail = client.post("/api/correlate", json=payload).json()["detail"]
    assert len(detail) == 3
    assert {item["loc"] for item in detail} == {
        "left[0].code",
        "left[0].thickness",
        "right[0].thickness",
    }


def test_non_object_body_is_rejected():
    response = client.post("/api/correlate", json=[1, 2, 3])
    assert response.status_code == 422
    assert "请求体" in response.json()["detail"][0]["message"]

    response = client.post(
        "/api/correlate", content="not json", headers={"Content-Type": "application/json"}
    )
    assert response.status_code == 422
