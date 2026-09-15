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
