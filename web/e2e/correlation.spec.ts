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

test("统一撤销/重做：跨列增删与合并键入严格按实际发生顺序往返", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "载入示例" }).click();
  await expect(page.getByTestId("editor-left")).toContainText("7 层");

  // 左孔添加层（结构操作，独立成项）
  await page.getByTestId("add-left").click();
  await expect(page.getByTestId("editor-left")).toContainText("8 层");
  // 新层厚度连续键入合并为一项
  const added = page.getByTestId("layer-thickness-left-7");
  await added.fill("");
  await added.type("7");
  await added.type("7");
  await expect(added).toHaveValue("77");
  // 右孔删除一层（结构操作，独立成项）
  await page.getByTestId("remove-right-6").click();
  await expect(page.getByTestId("editor-right")).toContainText("6 层");

  const undo = page.getByTestId("undo");
  const redo = page.getByTestId("redo");
  await expect(redo).toBeDisabled();

  // 按发生顺序逐项撤销：删右孔层 → 合并键入 → 加左孔层 → 载入示例
  await undo.click();
  await expect(page.getByTestId("editor-right")).toContainText("7 层");
  await undo.click();
  await expect(page.getByTestId("layer-thickness-left-7")).toHaveValue("100");
  await undo.click();
  await expect(page.getByTestId("editor-left")).toContainText("7 层");
  await undo.click();
  await expect(page.getByTestId("editor-left")).toContainText("3 层");
  await expect(page.getByTestId("editor-right")).toContainText("3 层");
  await expect(undo).toBeDisabled();
  await expect(redo).toBeEnabled();

  // 按原顺序重做：连续键入仍是一项
  await redo.click();
  await expect(page.getByTestId("editor-left")).toContainText("7 层");
  await redo.click();
  await expect(page.getByTestId("editor-left")).toContainText("8 层");
  await expect(page.getByTestId("layer-thickness-left-7")).toHaveValue("100");
  await redo.click();
  await expect(page.getByTestId("layer-thickness-left-7")).toHaveValue("77");
  await redo.click();
  await expect(page.getByTestId("editor-right")).toContainText("6 层");
  await expect(redo).toBeDisabled();

  // 往返后可继续提交计算
  await page.getByRole("button", { name: "开始对应" }).click();
  await expect(page.getByTestId("totals")).toBeVisible();
});

test("回退后的任何新编辑都会清空重做分支", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "载入示例" }).click();
  await page.getByTestId("layer-thickness-left-0").fill("55");
  await page.getByTestId("undo").click();
  await expect(page.getByTestId("layer-thickness-left-0")).toHaveValue("20");
  await expect(page.getByTestId("redo")).toBeEnabled();

  // 在另一列做新编辑：重做分支被截断
  await page.getByTestId("layer-thickness-right-0").fill("77");
  await expect(page.getByTestId("redo")).toBeDisabled();

  // 撤销新编辑回到回退点，被截断的旧重做分支不会复活
  await page.getByTestId("undo").click();
  await expect(page.getByTestId("layer-thickness-right-0")).toHaveValue("100");
  await expect(page.getByTestId("layer-thickness-left-0")).toHaveValue("20");
  await expect(page.getByTestId("redo")).toBeEnabled();
  await page.getByTestId("redo").click();
  await expect(page.getByTestId("layer-thickness-right-0")).toHaveValue("77");
});

test("刷新恢复两列完整草稿与撤销栈", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "载入示例" }).click();
  await page.getByTestId("layer-thickness-left-0").fill("55");
  await page.getByTestId("add-right").click();
  await expect(page.getByTestId("editor-right")).toContainText("8 层");

  await page.reload();

  // 两列草稿完整恢复
  await expect(page.getByTestId("editor-left")).toContainText("7 层");
  await expect(page.getByTestId("editor-right")).toContainText("8 层");
  await expect(page.getByTestId("layer-thickness-left-0")).toHaveValue("55");
  await expect(page.getByTestId("layer-thickness-right-7")).toHaveValue("100");
  // 正常恢复不展示说明条
  await expect(page.getByTestId("history-note")).not.toBeAttached();

  // 撤销栈也随检查点恢复：撤销“添加层”→ 撤销“键入”→ 撤销“载入示例”
  await page.getByTestId("undo").click();
  await expect(page.getByTestId("editor-right")).toContainText("7 层");
  await page.getByTestId("undo").click();
  await expect(page.getByTestId("layer-thickness-left-0")).toHaveValue("20");
  await page.getByTestId("undo").click();
  await expect(page.getByTestId("editor-left")).toContainText("3 层");
});

test("最新检查点尾项损坏时，刷新回到最近完整代次并仍可撤销重算", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "载入示例" }).click();
  await page.getByRole("button", { name: "开始对应" }).click();
  await expect(page.getByTestId("totals")).toContainText("总代价 725");
  const fingerprint = await page.getByTestId("fingerprint").textContent();

  // 再制造两代编辑：键入（槽 b，第 2 代）→ 加层（槽 a，第 3 代，最新）
  await page.getByTestId("layer-thickness-left-0").fill("55");
  await page.getByTestId("add-left").click();
  await expect(page.getByTestId("editor-left")).toContainText("8 层");

  // 模拟最新一代写入中断：定位代次最新的槽并截断其尾项
  // （开发态 StrictMode 会多写一代，因此不写死槽位，按代次现场判定）
  const damaged = await page.evaluate(() => {
    const read = (slot: string) => {
      const raw = window.localStorage.getItem(`strata-correlation:cp:${slot}`);
      if (!raw) return null;
      try {
        return { slot, generation: (JSON.parse(raw) as { g: number }).g, raw };
      } catch {
        return { slot, generation: -1, raw };
      }
    };
    const slots = [read("a"), read("b")]
      .filter((value): value is { slot: string; generation: number; raw: string } => value !== null)
      .sort((x, y) => y.generation - x.generation);
    const newest = slots[0];
    if (!newest) return null;
    window.localStorage.setItem(
      `strata-correlation:cp:${newest.slot}`,
      newest.raw.slice(0, Math.floor(newest.raw.length / 2)),
    );
    return newest.slot;
  });
  expect(damaged).not.toBeNull();

  await page.reload();

  // 回到第 2 代完整检查点：7 层、厚度 55；操作区说明忽略了损坏尾项
  await expect(page.getByTestId("editor-left")).toContainText("7 层");
  await expect(page.getByTestId("layer-thickness-left-0")).toHaveValue("55");
  await expect(page.getByTestId("history-note")).toContainText("最近完整检查点");
  await expect(page.getByTestId("undo")).toBeEnabled();

  // 撤销到示例输入后重新计算，证据指纹与损坏前完全一致
  await page.getByTestId("undo").click();
  await expect(page.getByTestId("layer-thickness-left-0")).toHaveValue("20");
  await page.getByTestId("undo").click();
  await expect(page.getByTestId("editor-left")).toContainText("3 层");
  await page.getByTestId("redo").click();
  await expect(page.getByTestId("editor-left")).toContainText("7 层");
  await page.getByRole("button", { name: "开始对应" }).click();
  await expect(page.getByTestId("totals")).toContainText("总代价 725");
  await expect(page.getByTestId("fingerprint")).toHaveText(fingerprint!);
});

test("回退期间迟到的响应不再显示，重做后重新计算仍得到原有证据", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "载入示例" }).click();
  await page.getByRole("button", { name: "开始对应" }).click();
  await expect(page.getByTestId("totals")).toContainText("总代价 725");
  const fingerprint = await page.getByTestId("fingerprint").textContent();

  // 挂起下一次计算请求
  let heldRoute: { continue: () => Promise<void> } | null = null;
  await page.route("**/api/correlate", (route) => {
    heldRoute = route;
  });

  await page.getByRole("button", { name: "开始对应" }).click();
  // 在途期间撤销到初始数据：证据立即失效
  await page.getByTestId("undo").click();
  await expect(page.getByTestId("editor-left")).toContainText("3 层");
  await expect(page.getByTestId("totals")).not.toBeAttached();

  // 放行请求：迟到响应对应已撤销的输入，不得显示
  await heldRoute!.continue();
  await page.unroute("**/api/correlate");
  await expect(page.getByTestId("totals")).not.toBeAttached();
  await expect(page.getByTestId("diagram")).not.toBeAttached();

  // 重做回示例输入后重新计算，仍得到原有证据
  await page.getByTestId("redo").click();
  await expect(page.getByTestId("editor-left")).toContainText("7 层");
  await page.getByRole("button", { name: "开始对应" }).click();
  await expect(page.getByTestId("totals")).toContainText("总代价 725");
  await expect(page.getByTestId("fingerprint")).toHaveText(fingerprint!);
});

test("两个槽都不可用时保留当前初始数据、禁用恢复并在操作区说明原因", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("editor-left")).toContainText("3 层");

  // 同步写坏两个槽后立刻刷新：初始化加载只见损坏检查点
  await page.evaluate(() => {
    window.localStorage.setItem("strata-correlation:cp:a", "{ 写入中断");
    window.localStorage.setItem("strata-correlation:cp:b", '{"v":1,"g":2}');
  });
  await page.reload();

  // 保留初始数据，撤销不可用，并逐槽说明原因
  await expect(page.getByTestId("editor-left")).toContainText("3 层");
  await expect(page.getByTestId("editor-right")).toContainText("3 层");
  await expect(page.getByTestId("undo")).toBeDisabled();
  await expect(page.getByTestId("redo")).toBeDisabled();
  const note = page.getByTestId("history-note");
  await expect(note).toContainText("未能恢复上次草稿");
  await expect(note).toContainText("槽A");
  await expect(note).toContainText("槽B");

  // 仍然可以继续编辑与提交
  await page.getByRole("button", { name: "开始对应" }).click();
  await expect(page.getByTestId("totals")).toBeVisible();
});

test("回退后在分支点继续键入：撤销停在分支点而不跳过、不丢更早值", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "载入示例" }).click();

  // 左孔第 1 层 20 → 12（一项），右孔第 1 层 100 → 31（一项）
  await page.getByTestId("layer-thickness-left-0").fill("12");
  await page.getByTestId("layer-thickness-right-0").fill("31");

  // 撤销右孔厚度：分支点为 左 12 / 右 100，此时历史栈顶恰为左孔键入项
  await page.getByTestId("undo").click();
  await expect(page.getByTestId("layer-thickness-right-0")).toHaveValue("100");
  await expect(page.getByTestId("layer-thickness-left-0")).toHaveValue("12");
  await expect(page.getByTestId("redo")).toBeEnabled();

  // 再改左孔同一厚度框：旧实现会跨过分支点并入左孔旧项
  await page.getByTestId("layer-thickness-left-0").fill("15");

  // 第一次撤销必须停在分支点（左 12 / 右 100），而不是跳回左 20
  await page.getByTestId("undo").click();
  await expect(page.getByTestId("layer-thickness-left-0")).toHaveValue("12");
  await expect(page.getByTestId("layer-thickness-right-0")).toHaveValue("100");

  // 再撤销一次才回到示例的左 20
  await page.getByTestId("undo").click();
  await expect(page.getByTestId("layer-thickness-left-0")).toHaveValue("20");
  await expect(page.getByTestId("layer-thickness-right-0")).toHaveValue("100");
});

test("损坏槽代次为超大整数后连续编辑，刷新仍恢复最新一次修改", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "载入示例" }).click();
  // 第一次修改，确保两个槽都已存在完好检查点
  await page.getByTestId("layer-thickness-left-0").fill("21");

  // 把 A 槽伪造成代次 1e16（整数但超过安全范围，1e16+1 === 1e16）且结构损坏
  await page.evaluate(() => {
    const raw = window.localStorage.getItem("strata-correlation:cp:a");
    const envelope = raw ? JSON.parse(raw) : {};
    envelope.g = 1e16;
    envelope.present = null;
    window.localStorage.setItem("strata-correlation:cp:a", JSON.stringify(envelope));
  });

  // 连续两次新修改：旧实现会让两槽同代次（1e16），刷新时误取旧槽
  await page.getByTestId("layer-thickness-left-0").fill("22");
  await page.getByTestId("layer-thickness-left-0").fill("23");

  // 新代次必须只按完好槽递增：两槽代次为相邻的安全整数，且都不被污染为 1e16
  const slots = await page.evaluate(() => {
    const read = (name: string) => {
      const raw = window.localStorage.getItem(`strata-correlation:cp:${name}`);
      if (!raw) return null;
      const envelope = JSON.parse(raw) as {
        g: number;
        present: { left: { thickness: string }[] };
      };
      return { g: envelope.g, thickness: envelope.present.left[0].thickness };
    };
    return { a: read("a"), b: read("b") };
  });
  expect(slots.a).not.toBeNull();
  expect(slots.b).not.toBeNull();
  expect(Number.isSafeInteger(slots.a!.g)).toBe(true);
  expect(Number.isSafeInteger(slots.b!.g)).toBe(true);
  expect(Math.abs(slots.a!.g - slots.b!.g)).toBe(1);
  const newest = slots.a!.g > slots.b!.g ? slots.a! : slots.b!;
  expect(newest.thickness).toBe("23");

  await page.reload();
  // 必须恢复最新一次修改，而不是上一次（22）或更早（21）
  await expect(page.getByTestId("layer-thickness-left-0")).toHaveValue("23");
});

test("关闭存储权限时降级为当前会话内撤销/重做", async ({ page, context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("Storage disabled", "SecurityError");
      },
    });
  });
  await page.goto("/");
  await expect(page.getByTestId("history-note")).toContainText("当前会话内");

  // 会话内撤销/重做照常工作
  await page.getByRole("button", { name: "载入示例" }).click();
  await page.getByTestId("layer-thickness-left-0").fill("55");
  await page.getByTestId("undo").click();
  await expect(page.getByTestId("layer-thickness-left-0")).toHaveValue("20");
  await page.getByTestId("redo").click();
  await expect(page.getByTestId("layer-thickness-left-0")).toHaveValue("55");
});
