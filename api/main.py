"""FastAPI 无状态计算接口：层序对应。

POST /api/correlate  计算两孔层序对应关系（纯函数式，无任何服务端状态）。
GET  /api/health     健康检查，供编排与验收探活。

所有校验错误都定位到具体层号（1 起），并一次性返回全部错误。
"""

from __future__ import annotations

import re

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from correlation import correlate

app = FastAPI(title="层序对应计算接口", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_CODE_RE = re.compile(r"[A-Z]")
MAX_LAYERS = 80
MIN_THICKNESS = 1
MAX_THICKNESS = 999

_SIDE_LABELS = (("left", "左列"), ("right", "右列"))


def _validate(body: object) -> tuple[list[dict], list[dict] | None, list[dict] | None]:
    """校验请求体，返回 (错误列表, 左列, 右列)。有错误时后两者为 None。"""
    errors: list[dict] = []
    if not isinstance(body, dict):
        errors.append({"loc": "body", "message": "请求体须为 JSON 对象，包含 left 与 right 两个层数组"})
        return errors, None, None

    columns: dict[str, list[dict]] = {}
    for side, label in _SIDE_LABELS:
        column = body.get(side)
        if not isinstance(column, list):
            errors.append({"loc": side, "message": f"{label}须为层数组"})
            continue
        if len(column) < 1 or len(column) > MAX_LAYERS:
            errors.append(
                {"loc": side, "message": f"{label}层数须为 1–{MAX_LAYERS}，当前为 {len(column)} 层"}
            )
        layers: list[dict] = []
        for index, layer in enumerate(column):
            number = index + 1
            if not isinstance(layer, dict):
                errors.append(
                    {
                        "loc": f"{side}[{index}]",
                        "message": f"{label}第{number}层：须为包含 code 与 thickness 的对象",
                    }
                )
                continue
            code = layer.get("code")
            if not isinstance(code, str) or not _CODE_RE.fullmatch(code):
                errors.append(
                    {
                        "loc": f"{side}[{index}].code",
                        "message": f"{label}第{number}层：岩性代码须为 A–Z 单个大写字母",
                    }
                )
                code = None
            thickness = layer.get("thickness")
            # bool 是 int 的子类，必须显式排除
            if (
                isinstance(thickness, bool)
                or not isinstance(thickness, int)
                or not (MIN_THICKNESS <= thickness <= MAX_THICKNESS)
            ):
                errors.append(
                    {
                        "loc": f"{side}[{index}].thickness",
                        "message": f"{label}第{number}层：厚度须为 {MIN_THICKNESS}–{MAX_THICKNESS} 毫米的整数",
                    }
                )
                thickness = None
            if code is not None and thickness is not None:
                layers.append({"code": code, "thickness": thickness})
        columns[side] = layers

    if errors:
        return errors, None, None
    return [], columns["left"], columns["right"]


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/api/correlate")
async def correlate_endpoint(request: Request) -> JSONResponse:
    try:
        body = await request.json()
    except Exception:
        return JSONResponse(
            status_code=422,
            content={"detail": [{"loc": "body", "message": "请求体不是合法的 JSON"}]},
        )

    errors, left, right = _validate(body)
    if errors:
        return JSONResponse(status_code=422, content={"detail": errors})

    result = correlate(left, right)  # type: ignore[arg-type]
    return JSONResponse(content=result)
