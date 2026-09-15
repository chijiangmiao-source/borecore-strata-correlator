"""相邻勘探孔层序对应的核心算法。

规则（与 README 一致）：
- 每列 1–80 层，岩性代码 A–Z，厚度 1–999 毫米整数（入参校验在 main.py）。
- 允许的步骤：1:1、1:2、2:1（匹配分组），1:0、0:1（缺失）。
- 匹配组代价 = 两侧总厚度差的绝对值；若两组代表岩性不同再加 300。
  代表岩性取组内累计厚度最大者，并列取字母较小者。
- 缺失一步代价 = 200 + 该组厚度 × 2。
- 决胜顺序：总代价最小 → 缺失步骤数最少 → 分组步骤数最少 →
  按 1:1、1:2、2:1、1:0、0:1 的顺序取字典序最小的完整路径。

算法：自底向上的动态规划。状态 (i, j) 表示左列已消耗 i 层、右列已消耗 j 层，
每个状态保存从该状态到终点的最优 (代价, 缺失数, 分组数, 路径)。比较键为
(cost, missing, groups, path) 的元组序，其中 path 是步骤序号元组，
因此结果完全确定，与请求次数、进程状态无关。
"""

from __future__ import annotations

# 步骤的字典序位次：1:1 < 1:2 < 2:1 < 1:0 < 0:1
STEP_ORDER = ("1:1", "1:2", "2:1", "1:0", "0:1")
RANK = {step: rank for rank, step in enumerate(STEP_ORDER)}

MISSING_BASE = 200
LITHOLOGY_PENALTY = 300

# 每种步骤消耗的 (左层数, 右层数)、是否缺失步、是否分组步
_STEP_META = {
    "1:1": (1, 1, False, False),
    "1:2": (1, 2, False, True),
    "2:1": (2, 1, False, True),
    "1:0": (1, 0, True, False),
    "0:1": (0, 1, True, False),
}


def representative(layers: list[tuple[str, int]]) -> str:
    """组内代表岩性：累计厚度最大者，并列取字母较小者。"""
    totals: dict[str, int] = {}
    for code, thickness in layers:
        totals[code] = totals.get(code, 0) + thickness
    return min(totals, key=lambda code: (-totals[code], code))


def match_group_cost(
    left_group: list[tuple[str, int]], right_group: list[tuple[str, int]]
) -> tuple[int, int, int, str, str, int, int]:
    """匹配组代价。返回 (代价, 厚度差, 岩性罚分, 左代表, 右代表, 左厚度和, 右厚度和)。"""
    left_sum = sum(thickness for _, thickness in left_group)
    right_sum = sum(thickness for _, thickness in right_group)
    rep_left = representative(left_group)
    rep_right = representative(right_group)
    thickness_diff = abs(left_sum - right_sum)
    penalty = LITHOLOGY_PENALTY if rep_left != rep_right else 0
    return thickness_diff + penalty, thickness_diff, penalty, rep_left, rep_right, left_sum, right_sum


def missing_cost(thickness: int) -> int:
    """缺失一步的代价：200 + 厚度 × 2。"""
    return MISSING_BASE + 2 * thickness


def _step_cost(
    left: list[tuple[str, int]],
    right: list[tuple[str, int]],
    i: int,
    j: int,
    step: str,
) -> int:
    """在状态 (i, j) 执行一步的代价（i、j 为已消耗层数）。"""
    dl, dr, _, _ = _STEP_META[step]
    if dl == 0:
        return missing_cost(right[j][1])
    if dr == 0:
        return missing_cost(left[i][1])
    cost, _, _, _, _, _, _ = match_group_cost(left[i : i + dl], right[j : j + dr])
    return cost


def correlate(left: list[dict], right: list[dict]) -> dict:
    """计算两孔层序的最优对应关系。

    入参为 [{"code": "A", "thickness": 120}, ...] 形式的列表（已校验）。
    返回可 JSON 序列化的 {"steps": [...], "totals": {...}}。
    """
    left_layers = [(layer["code"], layer["thickness"]) for layer in left]
    right_layers = [(layer["code"], layer["thickness"]) for layer in right]
    n, m = len(left_layers), len(right_layers)

    # dp[i][j] = (总代价, 缺失步数, 分组步数, 步骤位次元组)，从 (i, j) 到 (n, m)
    dp: list[list[tuple[int, int, int, tuple[int, ...]] | None]] = [
        [None] * (m + 1) for _ in range(n + 1)
    ]
    dp[n][m] = (0, 0, 0, ())

    for i in range(n, -1, -1):
        for j in range(m, -1, -1):
            if i == n and j == m:
                continue
            best: tuple[int, int, int, tuple[int, ...]] | None = None
            for rank, step in enumerate(STEP_ORDER):
                dl, dr, is_missing, is_group = _STEP_META[step]
                ni, nj = i + dl, j + dr
                if ni > n or nj > m:
                    continue
                sub = dp[ni][nj]
                if sub is None:  # 该方向无法消费完全部输入
                    continue
                candidate = (
                    sub[0] + _step_cost(left_layers, right_layers, i, j, step),
                    sub[1] + (1 if is_missing else 0),
                    sub[2] + (1 if is_group else 0),
                    (rank,) + sub[3],
                )
                if best is None or candidate < best:
                    best = candidate
            dp[i][j] = best

    final = dp[0][0]
    if final is None:  # 步长 1/2 的组合总能覆盖任意层数，此分支仅为防御
        raise ValueError("无法构造消费全部输入的对应路径")

    # 沿最优路径重建每一步的完整证据
    steps: list[dict] = []
    i = j = 0
    cumulative_cost = cumulative_missing = cumulative_groups = 0
    for rank in final[3]:
        step = STEP_ORDER[rank]
        dl, dr, is_missing, is_group = _STEP_META[step]
        record: dict = {
            "index": len(steps) + 1,
            "type": step,
            "left": [
                {"layer": i + k + 1, "code": left_layers[i + k][0], "thickness": left_layers[i + k][1]}
                for k in range(dl)
            ],
            "right": [
                {"layer": j + k + 1, "code": right_layers[j + k][0], "thickness": right_layers[j + k][1]}
                for k in range(dr)
            ],
            "left_sum": None,
            "right_sum": None,
            "rep_left": None,
            "rep_right": None,
            "thickness_diff": None,
            "lithology_penalty": None,
            "missing_base": None,
            "missing_thickness_double": None,
        }
        if is_missing:
            thickness = left_layers[i][1] if dl else right_layers[j][1]
            record["missing_base"] = MISSING_BASE
            record["missing_thickness_double"] = 2 * thickness
            record["cost"] = MISSING_BASE + 2 * thickness
        else:
            cost, diff, penalty, rep_left, rep_right, left_sum, right_sum = match_group_cost(
                left_layers[i : i + dl], right_layers[j : j + dr]
            )
            record.update(
                left_sum=left_sum,
                right_sum=right_sum,
                rep_left=rep_left,
                rep_right=rep_right,
                thickness_diff=diff,
                lithology_penalty=penalty,
                cost=cost,
            )
        cumulative_cost += record["cost"]
        cumulative_missing += 1 if is_missing else 0
        cumulative_groups += 1 if is_group else 0
        record["cumulative_cost"] = cumulative_cost
        record["cumulative_missing"] = cumulative_missing
        record["cumulative_groups"] = cumulative_groups
        steps.append(record)
        i, j = i + dl, j + dr

    return {
        "steps": steps,
        "totals": {
            "cost": final[0],
            "missing_steps": final[1],
            "group_steps": final[2],
            "step_count": len(steps),
        },
    }
