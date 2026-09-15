import { expect, test, type Page } from "@playwright/test";

const EXPECTED_STEP_TYPES = ["1:1", "1:0", "2:1", "1:1", "1:2", "1:1", "0:1"];

async function loadExampleAndSubmit(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "载入示例" }).click();
  await page.getByRole("button", { name: "开始对应" }).click();
  await expect(page.getByTestId("totals")).toContainText("总代价 725");
}

test("示例联调：页面证据与算法结果一致", async ({ page }) => {
  await loadExampleAndSubmit(page);

  await expect(page.getByTestId("totals")).toContainText("缺失步 2");
  await expect(page.getByTestId("totals")).toContainText("分组步 2");
  await expect(page.getByTestId("totals")).toContainText("共 7 步");
  await expect(page.getByTestId("step-type")).toHaveText(EXPECTED_STEP_TYPES);

  // 连带图与步骤卡：每一步的输入层、分项代价、累计值
  await expect(page.getByTestId("diagram")).toBeVisible();
  await expect(page.getByTestId("band-5")).toBeVisible();
  await expect(page.getByTestId("step-3")).toContainText("左孔第3–4层 ↔ 右孔第2层");
  await expect(page.getByTestId("step-3")).toContainText("厚度差 |100−95| = 5");
  await expect(page.getByTestId("step-3")).toContainText("累计：代价 335");
  await expect(page.getByTestId("step-2")).toContainText("缺失基准 200 + 厚度×2（2×25=50）");
  await expect(page.getByTestId("step-7")).toContainText("累计：代价 725 · 缺失 2 · 分组 2");

  // 缺层方向：左孔第2层在右孔缺失（1:0），右孔第7层在左孔缺失（0:1）
  await expect(page.getByTestId("step-2")).toContainText("左孔第2层 ↔ 右孔缺失");
  await expect(page.getByTestId("step-7")).toContainText("左孔缺失 ↔ 右孔第7层");
});

test("计算后修改任一孔层，旧连带图与旧代价立即失效", async ({ page }) => {
  await loadExampleAndSubmit(page);
  await expect(page.getByTestId("diagram")).toBeVisible();

  await page.getByTestId("layer-thickness-left-0").fill("55");
  await expect(page.getByTestId("diagram")).not.toBeVisible();
  await expect(page.getByTestId("totals")).not.toBeVisible();
  await expect(page.getByTestId("step-list")).not.toBeVisible();

  // 重新提交得到与新输入一致的证据
  await page.getByRole("button", { name: "开始对应" }).click();
  await expect(page.getByTestId("totals")).toBeVisible();
  await expect(page.getByTestId("totals")).not.toContainText("总代价 725");
});

test("同成本分叉、首尾缺层与分组交错：刷新与重复提交得到完全相同的对应证据", async ({
  page,
}) => {
  await loadExampleAndSubmit(page);
  const fingerprint = await page.getByTestId("fingerprint").textContent();
  const stepList = await page.getByTestId("step-list").innerText();
  expect(fingerprint).toMatch(/^[0-9a-f]{8}$/);

  // 重复提交
  await page.getByRole("button", { name: "开始对应" }).click();
  await expect(page.getByTestId("fingerprint")).toHaveText(fingerprint!);
  expect(await page.getByTestId("step-list").innerText()).toBe(stepList);

  // 刷新后重新载入并提交
  await page.reload();
  await page.getByRole("button", { name: "载入示例" }).click();
  await page.getByRole("button", { name: "开始对应" }).click();
  await expect(page.getByTestId("totals")).toContainText("总代价 725");
  await expect(page.getByTestId("fingerprint")).toHaveText(fingerprint!);
  expect(await page.getByTestId("step-list").innerText()).toBe(stepList);
});

test("连带图逐步展示替代裕量，点击最脆弱标记切换原图与替代图", async ({ page }) => {
  await loadExampleAndSubmit(page);

  // 逐步裕量与最脆弱步
  await expect(page.getByTestId("margin-1")).toHaveText("+25/−1/+1");
  await expect(page.getByTestId("margin-2")).toHaveText("+15/−1/+1");
  await expect(page.getByTestId("margin-5")).toHaveText("+100/0/0");
  await expect(page.getByTestId("fragile-summary")).toContainText("最脆弱步 第2步");
  await expect(page.getByTestId("diagram-mode")).toHaveText("原图");

  // 点击最脆弱标记 → 替代图（替代路径 6 步，总代价 740）
  await page.getByTestId("fragile-marker").click();
  await expect(page.getByTestId("diagram-mode")).toContainText(
    "替代图：第 2 步的最近替代（总代价 740 · 缺失 1 · 分组 3）",
  );
  await expect(page.getByTestId("band-6")).toBeVisible();
  await expect(page.getByTestId("margin-1")).not.toBeVisible();

  // 返回原图
  await page.getByTestId("toggle-alternative").click();
  await expect(page.getByTestId("diagram-mode")).toHaveText("原图");
  await expect(page.getByTestId("margin-1")).toHaveText("+25/−1/+1");
  await expect(page.getByTestId("band-7")).toBeVisible();
});

test("替代裕量、最脆弱步与替代图在刷新与重复提交后完全一致", async ({ page }) => {
  await loadExampleAndSubmit(page);
  const margins = await page.getByTestId("diagram").innerText();
  const summary = await page.getByTestId("fragile-summary").textContent();

  await page.getByTestId("fragile-marker").click();
  const alternative = await page.getByTestId("diagram").innerText();
  await page.getByTestId("toggle-alternative").click();

  // 重复提交：比较态被清除，裕量与替代图不变
  await page.getByRole("button", { name: "开始对应" }).click();
  await expect(page.getByTestId("diagram-mode")).toHaveText("原图");
  expect(await page.getByTestId("diagram").innerText()).toBe(margins);
  await page.getByTestId("fragile-marker").click();
  expect(await page.getByTestId("diagram").innerText()).toBe(alternative);

  // 刷新后重新提交：完全一致
  await page.reload();
  await page.getByRole("button", { name: "载入示例" }).click();
  await page.getByRole("button", { name: "开始对应" }).click();
  await expect(page.getByTestId("fragile-summary")).toHaveText(summary!);
  expect(await page.getByTestId("diagram").innerText()).toBe(margins);
  await page.getByTestId("fragile-marker").click();
  expect(await page.getByTestId("diagram").innerText()).toBe(alternative);
});

test("输入修改清除比较态", async ({ page }) => {
  await loadExampleAndSubmit(page);
  await page.getByTestId("fragile-marker").click();
  await expect(page.getByTestId("diagram-mode")).toContainText("替代图");

  await page.getByTestId("layer-thickness-left-0").fill("55");
  await expect(page.getByTestId("diagram")).not.toBeVisible();
  await expect(page.getByTestId("toggle-alternative")).not.toBeVisible();

  await page.getByRole("button", { name: "开始对应" }).click();
  await expect(page.getByTestId("diagram-mode")).toHaveText("原图");
});

test("校验错误定位到层号", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "载入示例" }).click();
  await page.getByTestId("layer-thickness-right-1").fill("0");
  await page.getByRole("button", { name: "开始对应" }).click();
  await expect(page.getByTestId("errors")).toContainText("右列第2层");
  await expect(page.getByTestId("errors")).toContainText("1–999");
});

test("列编辑：增删层并参与计算", async ({ page }) => {
  await page.goto("/");

  // 初始每列 3 层；删除右列一层后提交，结果消费全部剩余输入
  await expect(page.getByTestId("editor-left")).toContainText("3 层");
  await page.getByTestId("remove-right-2").click();
  await expect(page.getByTestId("editor-right")).toContainText("2 层");
  await page.getByRole("button", { name: "开始对应" }).click();
  await expect(page.getByTestId("totals")).toContainText("总代价");

  // 添加层可继续编辑
  await page.getByTestId("add-left").click();
  await expect(page.getByTestId("editor-left")).toContainText("4 层");
  await expect(page.getByTestId("layer-thickness-left-3")).toHaveValue("100");
});
