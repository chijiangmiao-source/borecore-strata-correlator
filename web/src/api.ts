/** 与 FastAPI 计算接口的通信层。默认走同源 /api（由 nginx 或 vite 代理转发）。 */

import type { ApiErrorItem, CorrelateResponse, LayerPayload } from "./types";

const BASE: string = import.meta.env.VITE_API_BASE ?? "";

export class ApiValidationError extends Error {
  constructor(public readonly errors: ApiErrorItem[]) {
    super(errors.map((item) => item.message).join("；"));
    this.name = "ApiValidationError";
  }
}

export async function correlate(
  left: LayerPayload[],
  right: LayerPayload[],
): Promise<CorrelateResponse> {
  let response: Response;
  try {
    response = await fetch(`${BASE}/api/correlate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ left, right }),
    });
  } catch {
    throw new Error("无法连接计算服务，请确认接口已启动");
  }
  if (response.status === 422) {
    const body = (await response.json()) as { detail?: ApiErrorItem[] };
    throw new ApiValidationError(body.detail ?? []);
  }
  if (!response.ok) {
    throw new Error(`计算服务返回异常（HTTP ${response.status}）`);
  }
  return (await response.json()) as CorrelateResponse;
}
