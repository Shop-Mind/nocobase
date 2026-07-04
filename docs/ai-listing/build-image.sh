#!/usr/bin/env bash
# 用仓库根目录的标准 Dockerfile 构建本 fork 的瘦身生产镜像（复刻 NocoBase 官方发布链路）。
#
# 原理：标准 Dockerfile 不从源码构建，而是 `yarn create nocobase-app` 从 npm registry 安装
# 已发布的包（只装生产依赖 + cleanup + slim 运行层，产物约 2GB；对比源码全量构建的 11GB）。
# 本脚本在构建前把 monorepo 全部包（构建产物）发布到一个「构建期临时 verdaccio 私服」，
# 让 Dockerfile 装到的就是本 fork 的代码（含 @crossborder/plugin-ai-listing 与上游未发版改动）。
#
# 用法：
#   bash docs/ai-listing/build-image.sh v2-20260704-008           # 构建 registry.../nocobase:<tag>
#   PUSH=1 bash docs/ai-listing/build-image.sh v2-20260704-008    # 构建完自动 docker push
#   SKIP_BUILD=1 bash ...   # 跳过 yarn build（源码构建产物已是最新时，节省 ~20 分钟）
#   REGISTRY_URL=...        # 换用远程 npm 私服（如云效 Packages，用于 ACR 云构建场景）；默认本地 verdaccio
#
# 每个发布版本号形如 <当前版本>-sm.<时间戳>：先临时 commit（lerna publish 强制要求工作区全干净），
# 发布完成后 `git reset --hard HEAD~1` 精确回退，不进最终历史，与 npmjs 官方版本号永不冲突。
# ⚠️ 因此脚本要求启动时 git 工作区完全干净（含未跟踪文件），否则拒绝运行。

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

TAG="${1:?用法: build-image.sh <镜像tag>（如 v2-20260704-008）}"
IMAGE="registry.cn-shenzhen.aliyuncs.com/wuzhixuan/nocobase:${TAG}"
VERDACCIO_PORT="${VERDACCIO_PORT:-4873}"
REGISTRY_URL="${REGISTRY_URL:-http://localhost:${VERDACCIO_PORT}}"
# Docker 构建容器内访问宿主机私服的地址（本地 verdaccio 时）。
REGISTRY_URL_IN_DOCKER="${REGISTRY_URL_IN_DOCKER:-http://host.docker.internal:${VERDACCIO_PORT}/}"
VERDACCIO_NAME=ai-listing-verdaccio
NPMRC_FILE="$(mktemp -t ai-listing-npmrc)"
VERSION_COMMITTED=0

log() { printf '\n\033[1;36m[build-image] %s\033[0m\n' "$*"; }

# ── 前置检查：工作区必须完全干净（lerna publish 的硬性要求；也保证临时版本 commit 可被精确回退）──
if [ -n "$(git status --porcelain)" ]; then
  echo "❌ git 工作区不干净（含未跟踪文件），请先提交或清理：" >&2
  git status --short >&2
  exit 1
fi

cleanup() {
  log "清理：回退临时版本提交 / 停私服 / 删除临时 npmrc"
  if [ "$VERSION_COMMITTED" = "1" ]; then
    git reset --hard HEAD~1 >/dev/null
  else
    git diff --name-only -- lerna.json ':(glob)**/package.json' | xargs -r git checkout -- || true
  fi
  rm -f "$NPMRC_FILE"
  if [ -z "${REGISTRY_URL_EXTERNAL:-}" ]; then docker rm -f "$VERDACCIO_NAME" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT

# ── 1. 起构建期 verdaccio（REGISTRY_URL 指向外部私服时跳过）──
if [ "$REGISTRY_URL" = "http://localhost:${VERDACCIO_PORT}" ]; then
  log "启动构建期 verdaccio（localhost:${VERDACCIO_PORT}，构建完自动销毁）"
  docker rm -f "$VERDACCIO_NAME" >/dev/null 2>&1 || true
  docker run -d --name "$VERDACCIO_NAME" -p "${VERDACCIO_PORT}:4873" \
    -v "$PWD/docs/ai-listing/verdaccio.yaml:/verdaccio/conf/config.yaml:ro" \
    verdaccio/verdaccio:6 >/dev/null
  for i in $(seq 1 30); do
    curl -sf "http://localhost:${VERDACCIO_PORT}/-/ping" >/dev/null && break
    sleep 1
    [ "$i" = 30 ] && { echo '❌ verdaccio 启动超时' >&2; exit 1; }
  done
else
  REGISTRY_URL_EXTERNAL=1
  log "使用外部 npm 私服：$REGISTRY_URL"
fi

# ── 2. 注册/登录拿发布 token（写入仓库外的临时 npmrc，发布时经 NPM_CONFIG_USERCONFIG 使用）──
log "登录私服（test/test）"
NPM_TOKEN=$(curl -s -X PUT "${REGISTRY_URL}/-/user/org.couchdb.user:test" \
  -H 'content-type: application/json' \
  -d '{"name":"test","password":"test"}' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).token||""))')
[ -n "$NPM_TOKEN" ] || { echo '❌ 私服登录失败' >&2; exit 1; }
REG_HOSTPATH=$(echo "$REGISTRY_URL" | sed -E 's|^https?:||')
printf '%s/:_authToken=%s\n' "$REG_HOSTPATH" "$NPM_TOKEN" > "$NPMRC_FILE"

# ── 3. 全量构建（SKIP_BUILD=1 跳过）──
if [ "${SKIP_BUILD:-0}" != "1" ]; then
  log "yarn build 全量构建（约 20~40 分钟）"
  NODE_OPTIONS=--max-old-space-size=8192 yarn build
else
  log "SKIP_BUILD=1：跳过 yarn build，使用现有构建产物"
fi

# ── 4. 临时版本号 + 发布全部包到私服 ──
# lerna publish 强制要求工作区全干净，所以版本号先临时 commit，发布后 reset --hard 精确回退。
BASE_VERSION=$(node -p 'require("./lerna.json").version')
SM_VERSION="${BASE_VERSION}-sm.$(date +%Y%m%d%H%M)"
log "临时版本 ${SM_VERSION}（临时 commit，发布后自动回退，不进历史）"
yarn lerna version "$SM_VERSION" --no-git-tag-version --force-publish='*' --yes >/dev/null
git add -A
git commit -q -m "chore: temp version ${SM_VERSION} for image build (auto-reverted)" --no-verify
VERSION_COMMITTED=1

log "发布全部 workspace 包到私服（约 3~8 分钟）"
NPM_CONFIG_USERCONFIG="$NPMRC_FILE" \
  yarn lerna publish from-package --yes --no-git-tag-version --no-verify-access --no-git-reset \
  --registry "$REGISTRY_URL" --loglevel warn

log "回退临时版本提交"
git reset --hard HEAD~1 >/dev/null
VERSION_COMMITTED=0

# ── 5. docker build（标准 Dockerfile 是两段式：先导出 app-artifact 的 nocobase.tar.gz 到上下文，
#      最终 runtime 阶段 `ADD nocobase.tar.gz` 从上下文取；docs 归档不需要，给空占位）──
[ -f dist.tar.gz ] || tar -czf dist.tar.gz --files-from /dev/null
BUILD_ARGS=(
  --add-host host.docker.internal:host-gateway
  --build-arg VERDACCIO_URL="$REGISTRY_URL_IN_DOCKER"
  --build-arg APPEND_PRESET_LOCAL_PLUGINS=@crossborder/plugin-ai-listing
  --build-arg INCLUDE_DOCS_ARCHIVE=0
  --build-arg USE_ALIYUN_MIRROR=1
  --build-arg COMMIT_HASH="$(git rev-parse HEAD)"
)
log "第 1 段：从私服装应用并导出 nocobase.tar.gz（约 5~15 分钟）"
docker build -f Dockerfile --target app-artifact --output type=local,dest=. "${BUILD_ARGS[@]}" .
[ -f nocobase.tar.gz ] || { echo '❌ 未导出 nocobase.tar.gz' >&2; exit 1; }

log "第 2 段：组装运行镜像 → ${IMAGE}"
docker build -f Dockerfile "${BUILD_ARGS[@]}" -t "$IMAGE" .

log "镜像构建完成："
docker images "$IMAGE" --format '  {{.Repository}}:{{.Tag}}  {{.Size}}'

if [ "${PUSH:-0}" = "1" ]; then
  log "docker push ${IMAGE}"
  docker push "$IMAGE"
fi
log "完成 ✅"
