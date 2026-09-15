import { defineConfig } from "@playwright/test";

// e2e 针对真实运行的服务（docker compose 或本地手动启动），
// 由 BASE_URL 指定入口，默认对应 compose 的 WEB_PORT 8080。
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:8080",
  },
});
