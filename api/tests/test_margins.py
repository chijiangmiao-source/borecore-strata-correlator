"""逐步替代裕量测试：暴力枚举对照、决胜规则、结构性质、确定性。"""

from __future__ import annotations

import json
import random
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from correlation import RANK, correlate  # noqa: E402

# (消耗左, 消耗右, 缺失?, 分组?, 位次)，与 test_correlation.py 的暴力参考一致
_MOVES = [(1, 1, 0, 0, 0), (1, 2, 0, 1, 1), (2, 1, 0, 1, 2), (1, 0, 1, 0, 3), (0, 1, 1, 0, 4)]

EXAMPLE_LEFT = "A20 C25 B60 B40 D30 E200 G100"
EXAMPLE_RIGHT = "A100 B95 D90 E50 E150 G20 H25"


def layers(spec: str) -> list[dict]:
    """"A20 C25" -> [{"code": "A", "thickness": 20}, ...]"""
    return [{"code": token[0], "thickness": int(token[1:])} for token in spec.split()]


def _consumed_vertices(ranks: tuple[int, ...]) -> tuple[tuple[int, int], ...]:
    """路径经过的已消费层位置序列（含起点 (0,0)）。"""
    vertices = [(0, 0)]
    for rank in ranks:
        dl, dr, _, _, _ = _MOVES[rank]
        i, j = vertices[-1]
        vertices.append((i + dl, j + dr))
    return tuple(vertices)


def _brute_force_margins(left: list[dict], right: list[dict]):
    """独立实现的暴力枚举：对原路径每一步，枚举全部避开该 (位置, 步型) 的合法路径。

    返回 (最优键, 原路径位次, [每步最优替代键])。
    """
    left_pairs = [(layer["code"], layer["thickness"]) for layer in left]
    right_pairs = [(layer["code"], layer["thickness"]) for layer in right]
    n, m = len(left_pairs), len(right_pairs)

    def rep(group):
        totals = {}
        for code, thickness in group:
            totals[code] = totals.get(code, 0) + thickness
        return min(totals, key=lambda code: (-totals[code], code))

    def match_cost(i, j, dl, dr):
        lg, rg = left_pairs[i : i + dl], right_pairs[j : j + dr]
        cost = abs(sum(t for _, t in lg) - sum(t for _, t in rg))
        if rep(lg) != rep(rg):
            cost += 300
        return cost

    paths: list[tuple[int, int, int, tuple[int, ...]]] = []

    def walk(i, j, cost, missing, groups, path):
        if i == n and j == m:
            paths.append((cost, missing, groups, tuple(path)))
            return
        for dl, dr, is_missing, is_group, rank in _MOVES:
            ni, nj = i + dl, j + dr
            if ni > n or nj > m:
                continue
            if dl == 0:
                step_cost = 200 + 2 * right_pairs[j][1]
            elif dr == 0:
                step_cost = 200 + 2 * left_pairs[i][1]
            else:
                step_cost = match_cost(i, j, dl, dr)
            walk(ni, nj, cost + step_cost, missing + is_missing, groups + is_group, path + [rank])

    walk(0, 0, 0, 0, 0, [])
    best = min(paths)
    optimal_ranks = best[3]
    vertices = _consumed_vertices(optimal_ranks)

    alternatives = []
    for k in range(1, len(optimal_ranks) + 1):
        forbid_vertex, forbid_rank = vertices[k - 1], optimal_ranks[k - 1]
        candidates = []
        for key in paths:
            ranks = key[3]
            used = any(
                _consumed_vertices(ranks)[index] == forbid_vertex and rank == forbid_rank
                for index, rank in enumerate(ranks)
            )
            if not used:
                candidates.append(key)
        alternatives.append(min(candidates))
    return best, optimal_ranks, alternatives


def _assert_matches_brute_force(left: list[dict], right: list[dict]) -> None:
    result = correlate(left, right)
    final = (
        result["totals"]["cost"],
        result["totals"]["missing_steps"],
        result["totals"]["group_steps"],
    )
    best, _, alternatives = _brute_force_margins(left, right)
    assert best[:3] == final

    margins = result["margins"]["steps"]
    assert len(margins) == result["totals"]["step_count"] == len(alternatives)
    for k, alternative_key in enumerate(alternatives, start=1):
        assert margins[k - 1] == {
            "index": k,
            "cost": alternative_key[0] - final[0],
            "missing": alternative_key[1] - final[1],
            "groups": alternative_key[2] - final[2],
        }, f"步骤 {k} 裕量不符"

    # 最脆弱步：三项差值与步骤序号依次比较
    expected_fragile = min(
        range(1, len(alternatives) + 1),
        key=lambda k: (
            margins[k - 1]["cost"],
            margins[k - 1]["missing"],
            margins[k - 1]["groups"],
            k,
        ),
    )
    assert result["margins"]["most_fragile"] == expected_fragile

    # 最脆弱步的完整替代证据与暴力最优避开路径完全一致
    alternative = result["margins"]["alternative"]
    alternative_ranks = tuple(RANK[step["type"]] for step in alternative["steps"])
    expected_key = alternatives[expected_fragile - 1]
    assert (
        alternative["totals"]["cost"],
        alternative["totals"]["missing_steps"],
        alternative["totals"]["group_steps"],
        alternative_ranks,
    ) == expected_key


# ---------------------------------------------------------------- 暴力枚举对照


@pytest.mark.parametrize("seed", range(60))
def test_margins_match_brute_force_on_random_small_inputs(seed: int):
    rng = random.Random(seed)
    left = [
        {"code": rng.choice("ABCD"), "thickness": rng.randint(1, 120)}
        for _ in range(rng.randint(1, 5))
    ]
    right = [
        {"code": rng.choice("ABCD"), "thickness": rng.randint(1, 120)}
        for _ in range(rng.randint(1, 5))
    ]
    _assert_matches_brute_force(left, right)


def test_margins_match_brute_force_on_documented_example():
    _assert_matches_brute_force(layers(EXAMPLE_LEFT), layers(EXAMPLE_RIGHT))


# ---------------------------------------------------------------- 固化示例


def test_example_margins_are_locked():
    result = correlate(layers(EXAMPLE_LEFT), layers(EXAMPLE_RIGHT))
    assert result["margins"]["steps"] == [
        {"index": 1, "cost": 25, "missing": -1, "groups": 1},
        {"index": 2, "cost": 15, "missing": -1, "groups": 1},
        {"index": 3, "cost": 15, "missing": -1, "groups": 1},
        {"index": 4, "cost": 15, "missing": -1, "groups": 1},
        {"index": 5, "cost": 100, "missing": 0, "groups": 0},
        {"index": 6, "cost": 25, "missing": -1, "groups": 1},
        {"index": 7, "cost": 25, "missing": -1, "groups": 1},
    ]
    assert result["margins"]["most_fragile"] == 2
    alternative = result["margins"]["alternative"]
    assert [step["type"] for step in alternative["steps"]] == [
        "1:1", "2:1", "2:1", "1:2", "1:1", "0:1",
    ]
    assert alternative["totals"] == {
        "cost": 740, "missing_steps": 1, "group_steps": 3, "step_count": 6,
    }


def test_zero_margin_when_step_wins_only_by_tie_break():
    # "1:2,1:0" 与 "1:0,1:2" 的 (代价, 缺失, 分组) 完全相同，仅靠字典序决胜：
    # 两步的替代裕量都为 (0, 0, 0)，最脆弱步取序号较小者
    result = correlate(layers("A10 A10"), layers("B5 B5"))
    assert result["margins"]["steps"] == [
        {"index": 1, "cost": 0, "missing": 0, "groups": 0},
        {"index": 2, "cost": 0, "missing": 0, "groups": 0},
    ]
    assert result["margins"]["most_fragile"] == 1
    alternative = result["margins"]["alternative"]
    assert [step["type"] for step in alternative["steps"]] == ["1:0", "1:2"]
    assert alternative["totals"]["cost"] == result["totals"]["cost"]


def test_margin_can_trade_fewer_missing_for_higher_cost():
    # 最优为 "2:1"（代价 400，缺失 0，分组 1）；禁止它后的最近替代是
    # "1:0,1:1"（代价 400，缺失 1，分组 0），裕量 (0, +1, -1) 逐项可正可负
    result = correlate(layers("A100 B50"), layers("B50"))
    assert result["margins"]["steps"] == [{"index": 1, "cost": 0, "missing": 1, "groups": -1}]
    assert result["margins"]["most_fragile"] == 1
    assert [step["type"] for step in result["margins"]["alternative"]["steps"]] == ["1:0", "1:1"]


# ---------------------------------------------------------------- 结构性质


def test_alternative_consumes_every_layer_exactly_once():
    result = correlate(layers(EXAMPLE_LEFT), layers(EXAMPLE_RIGHT))
    alternative = result["margins"]["alternative"]
    left_seen = [entry["layer"] for step in alternative["steps"] for entry in step["left"]]
    right_seen = [entry["layer"] for step in alternative["steps"] for entry in step["right"]]
    assert left_seen == list(range(1, 8))
    assert right_seen == list(range(1, 8))


def test_alternative_avoids_the_forbidden_step_type_at_the_same_position():
    result = correlate(layers(EXAMPLE_LEFT), layers(EXAMPLE_RIGHT))
    fragile = result["margins"]["most_fragile"]
    # 原路径第 fragile 步的已消费层位置与步型
    i = j = 0
    for index, step in enumerate(result["steps"], start=1):
        if index == fragile:
            forbid = (i, j, step["type"])
            break
        i += len(step["left"])
        j += len(step["right"])
    # 替代路径不得在同一已消费层位置采用原步型
    i = j = 0
    for step in result["margins"]["alternative"]["steps"]:
        assert (i, j, step["type"]) != forbid
        i += len(step["left"])
        j += len(step["right"])


def test_alternative_cumulative_values_and_totals_are_consistent():
    result = correlate(layers(EXAMPLE_LEFT), layers(EXAMPLE_RIGHT))
    alternative = result["margins"]["alternative"]
    cost = missing = groups = 0
    for step in alternative["steps"]:
        cost += step["cost"]
        missing += 1 if step["type"] in ("1:0", "0:1") else 0
        groups += 1 if step["type"] in ("1:2", "2:1") else 0
        assert step["cumulative_cost"] == cost
        assert step["cumulative_missing"] == missing
        assert step["cumulative_groups"] == groups
    assert alternative["totals"] == {
        "cost": cost,
        "missing_steps": missing,
        "group_steps": groups,
        "step_count": len(alternative["steps"]),
    }
    # 替代总计 = 原结果 + 最脆弱步裕量
    margin = result["margins"]["steps"][result["margins"]["most_fragile"] - 1]
    assert alternative["totals"]["cost"] == result["totals"]["cost"] + margin["cost"]
    assert alternative["totals"]["missing_steps"] == result["totals"]["missing_steps"] + margin["missing"]
    assert alternative["totals"]["group_steps"] == result["totals"]["group_steps"] + margin["groups"]


def test_margins_are_deterministic_across_repeated_calls():
    left = layers(EXAMPLE_LEFT)
    right = layers(EXAMPLE_RIGHT)
    first = correlate(left, right)
    second = correlate(left, right)
    assert json.dumps(first["margins"], sort_keys=True) == json.dumps(
        second["margins"], sort_keys=True
    )


def test_maximum_size_input_margins_run():
    rng = random.Random(20260915)
    left = [{"code": rng.choice("ABCDE"), "thickness": rng.randint(1, 999)} for _ in range(80)]
    right = [{"code": rng.choice("ABCDE"), "thickness": rng.randint(1, 999)} for _ in range(80)]
    result = correlate(left, right)
    assert len(result["margins"]["steps"]) == result["totals"]["step_count"]
    alternative = result["margins"]["alternative"]
    consumed_left = sum(len(step["left"]) for step in alternative["steps"])
    consumed_right = sum(len(step["right"]) for step in alternative["steps"])
    assert (consumed_left, consumed_right) == (80, 80)
