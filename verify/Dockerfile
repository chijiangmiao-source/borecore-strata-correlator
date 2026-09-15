# 一次性验收容器：自带浏览器依赖，依次跑 pytest、Vitest、Playwright。
FROM mcr.microsoft.com/playwright:v1.49.1-noble

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 先装依赖，利用镜像层缓存
COPY api/requirements.txt api/requirements-dev.txt api/
RUN pip3 install --break-system-packages -r api/requirements-dev.txt

COPY web/package.json web/package-lock.json web/
# 浏览器已随基础镜像预装，跳过重复下载
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN cd web && npm ci

COPY . .

ENV CI=1
CMD ["bash", "verify/run.sh"]
