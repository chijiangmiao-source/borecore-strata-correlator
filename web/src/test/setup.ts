import "@testing-library/jest-dom/vitest";
import { beforeEach } from "vitest";

// 每个用例从空的内置存储开始，避免双槽检查点在用例之间串扰。
beforeEach(() => {
  window.localStorage.clear();
});
