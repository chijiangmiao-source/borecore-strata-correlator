"""核心算法测试：代价规则、多级决胜、暴力枚举对照、确定性。"""

from __future__ import annotations

import json
import random
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from correlation import (  # noqa: E402
    LITHOLOGY_PENALTY,
    MISSING_BASE,
    RANK,
    correlate,
    match_group_cost,
    missing_cost,
    representative,
)


def layers(spec: str) -> list[dict]:
    """"A20 C25" -> [{"code": "A", "thickness": 20}, ...]"""
    return [{"code": token[0], "thickness": int(token[1:])} for token in spec.split()]


def step_types(result: dict) -> list[str]:
    return [step["type"] for step in result["steps"]]


# ---------------------------------------------------------------- 代价规则


def test_representative_prefers_max_cumulative_thickness():
    assert representative([("A", 10), ("B", 25), ("A", 5)]) == "B"


def test_representative_tie_breaks_to_smaller_letter():
    assert representative([("B", 10), ("A", 10)]) == "A"
    assert representative([("C", 7), ("A", 7), ("B", 3)]) == "A"


def test_match_group_cost_same_lithology_is_pure_thickness_diff():
    cost, diff, penalty, rep_left, rep_right, left_sum, right_sum = match_group_cost(
        [("A", 60), ("A", 40)], [("A", 95)]
    )
    assert (cost, diff, penalty) == (5, 5, 0)
    assert (rep_left, rep_right, left_sum, right_sum) == ("A", "A", 100, 95)


def test_match_group_cost_adds_penalty_when_representatives_differ():
    cost, diff, penalty, rep_left, rep_right, _, _ = match_group_cost(
        [("A", 100)], [("B", 100)]
    )
    assert (cost, diff, penalty, rep_left, rep_right) == (300, 0, 300, "A", "B")
    assert LITHOLOGY_PENALTY == 300


def test_missing_cost_is_base_plus_double_thickness():
    assert MISSING_BASE == 200
    assert missing_cost(1) == 202
    assert missing_cost(25) == 250
    assert missing_cost(999) == 200 + 2 * 999


# ---------------------------------------------------------------- 多级决胜


def test_tie_on_cost_prefers_fewer_missing_steps():
    # "2:1" 代价 400（缺失 0）；“1:0,1:1” 代价同为 400（缺失 1）
    result = correlate(layers("A100 B50"), layers("B50"))
    assert step_types(result) == ["2:1"]
    assert result["totals"] == {"cost": 400, "missing_steps": 0, "group_steps": 1, "step_count": 1}


def test_tie_on_cost_and_missing_prefers_fewer_group_steps():
    # "1:1,1:1" 代价 40（分组 0）；“1:2,1:1” 代价同为 40（分组 1）
    result = correlate(layers("A60 B40"), layers("A40 B60"))
    assert step_types(result) == ["1:1", "1:1"]
    assert result["totals"]["cost"] == 40
    assert result["totals"]["group_steps"] == 0


def test_tie_on_all_counts_prefers_lexicographically_smallest_path():
    # "1:2,1:0" 与 "1:0,1:2" 的 (代价 520, 缺失 1, 分组 1) 完全相同，
    # 按 1:1 < 1:2 < 2:1 < 1:0 < 0:1 的顺序，"1:2,1:0" 字典序更小
    result = correlate(layers("A10 A10"), layers("B5 B5"))
    assert step_types(result) == ["1:2", "1:0"]
    assert result["totals"] == {"cost": 520, "missing_steps": 1, "group_steps": 1, "step_count": 2}


def test_step_rank_order_is_fixed():
    assert RANK == {"1:1": 0, "1:2": 1, "2:1": 2, "1:0": 3, "0:1": 4}


# ---------------------------------------------------------------- 结构性质


def test_result_consumes_every_layer_exactly_once():
    result = correlate(layers("A20 C25 B60 B40 D30 E200 G100"), layers("A100 B95 D90 E50 E150 G20 H25"))
    left_seen = [entry["layer"] for step in result["steps"] for entry in step["left"]]
    right_seen = [entry["layer"] for step in result["steps"] for entry in step["right"]]
    assert left_seen == [1, 2, 3, 4, 5, 6, 7]
    assert right_seen == [1, 2, 3, 4, 5, 6, 7]


def test_cumulative_values_are_consistent():
    result = correlate(layers("A20 C25 B60 B40 D30 E200 G100"), layers("A100 B95 D90 E50 E150 G20 H25"))
    cost = missing = groups = 0
    for step in result["steps"]:
        cost += step["cost"]
        missing += 1 if step["type"] in ("1:0", "0:1") else 0
        groups += 1 if step["type"] in ("1:2", "2:1") else 0
        assert step["cumulative_cost"] == cost
        assert step["cumulative_missing"] == missing
        assert step["cumulative_groups"] == groups
    assert result["totals"]["cost"] == cost
    assert result["totals"]["missing_steps"] == missing
    assert result["totals"]["group_steps"] == groups


def test_step_cost_breakdown_matches_definition():
    result = correlate(layers("A20 C25 B60 B40 D30 E200 G100"), layers("A100 B95 D90 E50 E150 G20 H25"))
    for step in result["steps"]:
        if step["type"] in ("1:0", "0:1"):
            thickness = (step["left"] or step["right"])[0]["thickness"]
            assert step["missing_base"] == 200
            assert step["missing_thickness_double"] == 2 * thickness
            assert step["cost"] == 200 + 2 * thickness
        else:
            left_sum = sum(entry["thickness"] for entry in step["left"])
            right_sum = sum(entry["thickness"] for entry in step["right"])
            assert step["left_sum"] == left_sum
            assert step["right_sum"] == right_sum
            assert step["thickness_diff"] == abs(left_sum - right_sum)
            expected_penalty = 300 if step["rep_left"] != step["rep_right"] else 0
            assert step["lithology_penalty"] == expected_penalty
            assert step["cost"] == step["thickness_diff"] + expected_penalty


def test_determinism_repeated_calls_are_identical():
    left = layers("A20 C25 B60 B40 D30 E200 G100")
    right = layers("A100 B95 D90 E50 E150 G20 H25")
    first = correlate(left, right)
    second = correlate(left, right)
    assert json.dumps(first, sort_keys=True) == json.dumps(second, sort_keys=True)


def test_maximum_size_input_runs():
    rng = random.Random(20260915)
    left = [{"code": rng.choice("ABCDE"), "thickness": rng.randint(1, 999)} for _ in range(80)]
    right = [{"code": rng.choice("ABCDE"), "thickness": rng.randint(1, 999)} for _ in range(80)]
    result = correlate(left, right)
    consumed_left = sum(len(step["left"]) for step in result["steps"])
    consumed_right = sum(len(step["right"]) for step in result["steps"])
    assert (consumed_left, consumed_right) == (80, 80)


# ---------------------------------------------------------------- 暴力枚举对照


def _brute_force_reference(left: list[dict], right: list[dict]):
    """独立实现的暴力枚举：遍历全部合法路径，取同一决胜序的最优者。"""
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

    # (消耗左, 消耗右, 缺失?, 分组?, 位次)
    moves = [(1, 1, 0, 0, 0), (1, 2, 0, 1, 1), (2, 1, 0, 1, 2), (1, 0, 1, 0, 3), (0, 1, 1, 0, 4)]
    best = None

    def walk(i, j, cost, missing, groups, path):
        nonlocal best
        if i == n and j == m:
            key = (cost, missing, groups, tuple(path))
            if best is None or key < best:
                best = key
            return
        for dl, dr, is_missing, is_group, rank in moves:
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
    return best


@pytest.mark.parametrize("seed", range(60))
def test_matches_brute_force_on_random_small_inputs(seed: int):
    rng = random.Random(seed)
    left = [
        {"code": rng.choice("ABCD"), "thickness": rng.randint(1, 120)}
        for _ in range(rng.randint(1, 5))
    ]
    right = [
        {"code": rng.choice("ABCD"), "thickness": rng.randint(1, 120)}
        for _ in range(rng.randint(1, 5))
    ]
    result = correlate(left, right)
    expected = _brute_force_reference(left, right)
    actual_path = tuple(RANK[step["type"]] for step in result["steps"])
    assert (
        result["totals"]["cost"],
        result["totals"]["missing_steps"],
        result["totals"]["group_steps"],
        actual_path,
    ) == expected
