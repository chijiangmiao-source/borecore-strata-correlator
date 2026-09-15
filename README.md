# 相邻勘探孔层序对应

相邻勘探孔的同一岩层会分裂成多层，也可能因侵蚀在一侧完全缺失。本仓库提供：

- **React 双列编辑界面**：左右两孔各 1–80 层，岩性代码 A–Z，厚度 1–999 毫米整数；
  结果以连带图展示每一步的输入层、分项代价与累计值。
- **FastAPI 无状态计算接口**：纯函数式计算，不保存任何状态；
  相同输入永远得到唯一、可逐步复算的层序对应关系。
- **Docker Compose 编排**：`WEB_PORT`、`API_PORT` 覆盖宿主端口；
  名为 `verify` 的一次性验收服务依次运行 pytest、Vitest、Playwright。

## 快速开始

```bash
docker compose up --build api web   # 页面 http://localhost:8080 ，接口 http://localhost:8000
WEB_PORT=9000 API_PORT=9001 docker compose up --build api web   # 覆盖宿主端口
```

一次性验收（构建镜像、启动依赖、跑完全部测试后退出）：

```bash
docker compose run --rm verify
# 或：docker compose up --build --exit-code-from verify verify
# 裸 docker compose up 会连同 verify 一起启动，即启动即验收
```

## 算法规则

每步只允许五种消耗方式：`1:1`、`1:2`、`2:1`（匹配分组），`1:0`、`0:1`（缺失）。
路径必须消费全部输入层。

- **匹配组代价** = 两侧总厚度差的绝对值；若两组**代表岩性**不同，再加 **300**。
  代表岩性取组内累计厚度最大者，并列时取字母较小者。
- **缺失一步代价** = **200 + 该组厚度 × 2**。
- **决胜顺序**（依次比较，直到分出唯一结果）：
  1. 总代价最小；
  2. 缺失步骤数最少；
  3. 分组步骤数（`1:2` 与 `2:1` 的步数）最少；
  4. 按 `1:1`、`1:2`、`2:1`、`1:0`、`0:1` 的顺序，取字典序最小的完整路径。

实现为自底向上的动态规划（`api/correlation.py`），每个状态保存最优
`(总代价, 缺失数, 分组数, 路径)` 并整体比较，因此同成本分叉、首尾缺层、
分组交错等情形下，刷新或重复提交都会得到完全相同的对应证据。

## 接口契约

`POST /api/correlate`

```json
{
  "left":  [{"code": "A", "thickness": 20}, "…"],
  "right": [{"code": "A", "thickness": 100}, "…"]
}
```

- 每列 1–80 层；`code` 为 `A`–`Z` 单个大写字母；`thickness` 为 1–999 的整数。
- `200`：返回 `{"steps": [...], "totals": {...}}`。每个 step 含
  `index`、`type`、两侧输入层（`layer` 为 1 起层号）、`left_sum`/`right_sum`、
  `rep_left`/`rep_right`、`thickness_diff`、`lithology_penalty`
  （缺失步则为 `missing_base`/`missing_thickness_double`）、`cost`
  以及 `cumulative_cost`/`cumulative_missing`/`cumulative_groups`。
- `422`：`{"detail": [{"loc": "left[2].thickness", "message": "左列第3层：厚度须为 1–999 毫米的整数"}]}`，
  一次性返回全部错误，每条都定位到层号。
- `GET /api/health` → `{"status": "ok"}`。

## 固化示例

输入（页面“载入示例”按钮即载入此数据）：

| 层号 | 左孔 | 右孔 |
|---|---|---|
| 1 | A 20mm | A 100mm |
| 2 | C 25mm | B 95mm |
| 3 | B 60mm | D 90mm |
| 4 | B 40mm | E 50mm |
| 5 | D 30mm | E 150mm |
| 6 | E 200mm | G 20mm |
| 7 | G 100mm | H 25mm |

唯一最优对应（总代价 725，缺失 2 步，分组 2 步，共 7 步）：

| 步骤 | 类型 | 左孔层 | 右孔层 | 分项代价 | 步代价 | 累计代价 |
|---|---|---|---|---|---|---|
| 1 | 1:1 | 第1层（A 20mm） | 第1层（A 100mm） | \|20−100\| = 80，代表岩性相同（A）+0 | 80 | 80 |
| 2 | 1:0 | 第2层（C 25mm） | 缺失 | 缺失基准 200 + 厚度×2 = 200+50 | 250 | 330 |
| 3 | 2:1 | 第3层（B 60mm）、第4层（B 40mm） | 第2层（B 95mm） | \|100−95\| = 5，代表岩性相同（B）+0 | 5 | 335 |
| 4 | 1:1 | 第5层（D 30mm） | 第3层（D 90mm） | \|30−90\| = 60，代表岩性相同（D）+0 | 60 | 395 |
| 5 | 1:2 | 第6层（E 200mm） | 第4层（E 50mm）、第5层（E 150mm） | \|200−200\| = 0，代表岩性相同（E）+0 | 0 | 395 |
| 6 | 1:1 | 第7层（G 100mm） | 第6层（G 20mm） | \|100−20\| = 80，代表岩性相同（G）+0 | 80 | 475 |
| 7 | 0:1 | 缺失 | 第7层（H 25mm） | 缺失基准 200 + 厚度×2 = 200+50 | 250 | 725 |

该结果由 `api/tests/test_api.py`、`api/tests/test_integration.py` 与
`web/e2e/correlation.spec.ts` 共同锁定，任何行为变化都会使测试失败。

## 目录结构

```
api/                  FastAPI 接口与核心算法
  correlation.py      动态规划 + 多级决胜（纯函数）
  main.py             校验（错误定位到层号）与路由
  tests/              pytest：算法、接口、真实 HTTP 联调
web/                  React + Vite 前端
  src/components/     双列编辑器、连带图、步骤证据列表
  src/__tests__/      Vitest 单元测试
  e2e/                Playwright 真实联调（刷新/重复提交一致性）
verify/               一次性验收容器（pytest + Vitest + Playwright）
docker-compose.yml    api / web / verify 三服务，WEB_PORT、API_PORT 可覆盖
```

## 本地开发与测试

```bash
# 接口（http://localhost:8000）
cd api && pip install -r requirements-dev.txt
uvicorn main:app --reload
pytest tests -q                                   # 算法与接口测试
API_BASE=http://localhost:8000 pytest tests/test_integration.py -q   # 真实 HTTP 联调

# 前端（http://localhost:5173，/api 自动代理到 API_PORT，默认 8000）
cd web && npm ci
npm run dev
npm test                                          # Vitest
BASE_URL=http://localhost:5173 npx playwright test   # 需先安装浏览器：npx playwright install chromium
```

页面展示结果指纹（响应内容的 FNV-1a 散列）：同一份输入无论刷新还是重复提交，
指纹与逐步证据都完全相同，便于编录员核对复算。
