"""相邻勘探孔层序对应的核心算法。

规则（与 README 一致）：
- 每列 1–80 层，岩性代码 A–Z，厚度 1–999 毫米整数（入参校验在 main.py）。
- 允许的步骤：1:1、1:2、2:1（匹配分组），1:0、0:1（缺失）。
- 匹配组代价 = 两侧总厚度差的绝对值；若两组代表岩性不同再加 300。
  代表岩性取组内累计厚度最大者，并列取字母较小者。
- 缺失一步代价 = 200 + 厚度 × 2。
- 决胜顺序：总代价最小 → 缺失步骤数最少 → 分组步骤数最少 →
  按 1:1、1:2、2:1、1:0、0:1 的顺序取字典序最小的完整路径。

最优对应：自底向上的动态规划。状态 (i, j) 表示左列已消耗 i 层、右列已消耗
j 层，每个状态保存从该状态到终点的最优 (代价, 缺失数, 分组数, 路径)。比较键
为元组序，其中路径是步骤位次元组，因此结果完全确定，与请求次数、进程状态无关。

逐步替代裕量：对原路径第 k 步（在已消费位置 p_{k-1} 采用步型 t_k），禁止其在
相同已消费层位置采用原步型，求全局最优替代。由于每个 (状态, 步型) 唯一对应
一条边，禁止 (p_{k-1}, t_k) 等价于禁止原路径的第 k 条边，即“替换路径”问题。
全部受约束最优替代共享一次计算（不按步骤重跑完整动态规划）：

1. 前向 DP 求起点到每个状态的最优键 f，后向 DP 求每个状态到终点的最优键 g；
2. 最优前缀路径经过的原路径顶点必为连续前缀（stay），最优后缀路径经过的
   原路径顶点必为连续后缀（leave）——若最优路径经过 p_x，则其到 p_x 的
   前缀（或自 p_x 的后缀）必为原路径对应段，否则可替换出更优键，矛盾；
3. 每条非原路径边 (u, v) 与最优前缀 f[u]、最优后缀 g[v] 拼接，得到一条完整
   候选路径，它避开第 k 条原路径边当且仅当 k ∈ (stay[u], leave[v]]；
   反过来，任意避开第 k 条边的路径都存在这样一条覆盖 k 的绕行边，其拼接键
   不差于该路径，故每个 k 的最优替代必被某条绕行边取到；
4. 扫描线 + 堆在总计 O(mn log(mn)) 时间、O(mn) 工作空间内求出每个 k 的
   最优候选（键比较与路径拼接沿用既有 DP 的元组操作）。

每项裕量 = 合法替代与原结果的 (总代价, 缺失步数, 分组步数) 之差；最脆弱步按
三项差值与步骤序号依次比较取最小；仅为该步重建完整替代证据。
"""

from __future__ import annotations

import heapq

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


def _build_steps(
    left_layers: list[tuple[str, int]],
    right_layers: list[tuple[str, int]],
    ranks: tuple[int, ...],
) -> list[dict]:
    """沿步骤位次序列重建每一步的完整证据（输入层、分项代价与累计值）。"""
    steps: list[dict] = []
    i = j = 0
    cumulative_cost = cumulative_missing = cumulative_groups = 0
    for rank in ranks:
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
    return steps


def correlate(left: list[dict], right: list[dict]) -> dict:
    """计算两孔层序的最优对应关系与逐步替代裕量。

    入参为 [{"code": "A", "thickness": 120}, ...] 形式的列表（已校验）。
    返回可 JSON 序列化的 {"steps": [...], "totals": {...}, "margins": {...}}。
    """
    left_layers = [(layer["code"], layer["thickness"]) for layer in left]
    right_layers = [(layer["code"], layer["thickness"]) for layer in right]
    n, m = len(left_layers), len(right_layers)

    # 后向 DP：g[i][j] = (总代价, 缺失步数, 分组步数, 路径位次元组)，从 (i, j) 到终点
    g: list[list[tuple[int, int, int, tuple[int, ...]] | None]] = [
        [None] * (m + 1) for _ in range(n + 1)
    ]
    g[n][m] = (0, 0, 0, ())
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
                sub = g[ni][nj]
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
            g[i][j] = best

    final = g[0][0]
    if final is None:  # 步长 1/2 的组合总能覆盖任意层数，此分支仅为防御
        raise ValueError("无法构造消费全部输入的对应路径")

    # 前向 DP：f[i][j] = 从起点到 (i, j) 的最优键；pred 记录取得最优键的前驱
    f: list[list[tuple[int, int, int, tuple[int, ...]] | None]] = [
        [None] * (m + 1) for _ in range(n + 1)
    ]
    pred: list[list[tuple[int, int] | None]] = [[None] * (m + 1) for _ in range(n + 1)]
    f[0][0] = (0, 0, 0, ())
    for i in range(n + 1):
        for j in range(m + 1):
            head = f[i][j]
            if head is None:
                continue
            for rank, step in enumerate(STEP_ORDER):
                dl, dr, is_missing, is_group = _STEP_META[step]
                ni, nj = i + dl, j + dr
                if ni > n or nj > m:
                    continue
                candidate = (
                    head[0] + _step_cost(left_layers, right_layers, i, j, step),
                    head[1] + (1 if is_missing else 0),
                    head[2] + (1 if is_group else 0),
                    head[3] + (rank,),
                )
                if f[ni][nj] is None or candidate < f[ni][nj]:
                    f[ni][nj] = candidate
                    pred[ni][nj] = (i, j)

    # 原路径顶点序列 p_0..p_T 及其位置索引
    optimal_ranks = final[3]
    path_vertices = [(0, 0)]
    for rank in optimal_ranks:
        dl, dr, _, _ = _STEP_META[STEP_ORDER[rank]]
        pi, pj = path_vertices[-1]
        path_vertices.append((pi + dl, pj + dr))
    pos_in_path = {vertex: index for index, vertex in enumerate(path_vertices)}
    step_total = len(optimal_ranks)

    # stay[i][j]：起点到 (i, j) 的最优路径经过的原路径顶点的最大下标（连续前缀）
    stay = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n + 1):
        for j in range(m + 1):
            vertex_pos = pos_in_path.get((i, j))
            if vertex_pos is not None:
                stay[i][j] = vertex_pos
            elif (i, j) != (0, 0):
                pi, pj = pred[i][j]  # type: ignore[misc]
                stay[i][j] = stay[pi][pj]

    # leave[i][j]：(i, j) 到终点的最优路径经过的原路径顶点的最小下标（连续后缀）
    leave = [[step_total] * (m + 1) for _ in range(n + 1)]
    for i in range(n, -1, -1):
        for j in range(m, -1, -1):
            vertex_pos = pos_in_path.get((i, j))
            if vertex_pos is not None:
                leave[i][j] = vertex_pos
            elif (i, j) != (n, m):
                first_rank = g[i][j][3][0]  # type: ignore[index]
                dl, dr, _, _ = _STEP_META[STEP_ORDER[first_rank]]
                leave[i][j] = leave[i + dl][j + dr]

    # 绕行边：非原路径边 (u, v) 拼接 f[u] 与 g[v]，覆盖步骤 k ∈ (stay[u], leave[v]]
    detours_by_start: list[list[tuple]] = [[] for _ in range(step_total + 2)]
    for i in range(n + 1):
        for j in range(m + 1):
            head = f[i][j]
            if head is None:
                continue
            a = stay[i][j]
            u_pos = pos_in_path.get((i, j))
            for rank, step in enumerate(STEP_ORDER):
                dl, dr, is_missing, is_group = _STEP_META[step]
                ni, nj = i + dl, j + dr
                if ni > n or nj > m:
                    continue
                # 原路径本身的边不构成替代
                if u_pos is not None and pos_in_path.get((ni, nj)) == u_pos + 1:
                    continue
                b = leave[ni][nj]
                if a >= b:
                    continue
                tail = g[ni][nj]
                key = (
                    head[0] + _step_cost(left_layers, right_layers, i, j, step) + tail[0],
                    head[1] + (1 if is_missing else 0) + tail[1],
                    head[2] + (1 if is_group else 0) + tail[2],
                    head[3] + (rank,) + tail[3],
                )
                detours_by_start[a + 1].append((key, b))

    # 扫描线：依次取出覆盖每个步骤 k 的最优绕行（堆内为 (键, 序号, 覆盖终点)）
    best_alternative: list[tuple[int, int, int, tuple[int, ...]] | None] = [None] * (
        step_total + 1
    )
    heap: list[tuple[tuple[int, int, int, tuple[int, ...]], int, int]] = []
    serial = 0
    for k in range(1, step_total + 1):
        for key, b in detours_by_start[k]:
            serial += 1
            heapq.heappush(heap, (key, serial, b))
        while heap and heap[0][2] < k:
            heapq.heappop(heap)
        if heap:
            best_alternative[k] = heap[0][0]

    # 每项裕量 = 合法替代与原结果的 (总代价, 缺失步数, 分组步数) 之差。
    # 原路径第 k-1 个顶点处必有 1:0 或 0:1 绕行覆盖 k，故每步都有合法替代。
    margins: list[dict] = []
    most_fragile = 1
    most_fragile_key: tuple[int, int, int, int] | None = None
    for k in range(1, step_total + 1):
        alternative_key = best_alternative[k]
        if alternative_key is None:  # 上文的覆盖性论证保证不会发生，仅为防御
            raise ValueError("无法构造避开原步骤的合法替代路径")
        margin = (
            alternative_key[0] - final[0],
            alternative_key[1] - final[1],
            alternative_key[2] - final[2],
        )
        margins.append(
            {"index": k, "cost": margin[0], "missing": margin[1], "groups": margin[2]}
        )
        fragile_key = (margin[0], margin[1], margin[2], k)
        if most_fragile_key is None or fragile_key < most_fragile_key:
            most_fragile_key = fragile_key
            most_fragile = k

    # 原路径证据与最脆弱步的完整替代证据（其余步骤只保留裕量，不重建路径）
    steps = _build_steps(left_layers, right_layers, optimal_ranks)
    alternative_ranks = best_alternative[most_fragile][3]  # type: ignore[index]
    alternative_steps = _build_steps(left_layers, right_layers, alternative_ranks)
    alternative_key = best_alternative[most_fragile]

    return {
        "steps": steps,
        "totals": {
            "cost": final[0],
            "missing_steps": final[1],
            "group_steps": final[2],
            "step_count": len(steps),
        },
        "margins": {
            "steps": margins,
            "most_fragile": most_fragile,
            "alternative": {
                "steps": alternative_steps,
                "totals": {
                    "cost": alternative_key[0],  # type: ignore[index]
                    "missing_steps": alternative_key[1],  # type: ignore[index]
                    "group_steps": alternative_key[2],  # type: ignore[index]
                    "step_count": len(alternative_steps),
                },
            },
        },
    }
