# AI 商品搬运工具 — 服务器部署手册

> 首次部署:2026-07-03。服务器 120.76.157.51(阿里云 ECS,CentOS 7,4C/7.4G/40G,Docker 26 + Compose v2.27)。
> 与 6 月的旧原型部署(`/opt/app/nocobase`,库 `nocobase`,插件 `@nocobase/plugin-ai-listing-workbench`)**并存互不影响**;
> 本项目(v2,插件 `@crossborder/plugin-ai-listing`)使用独立的 compose 项目、数据库与端口。
>
> **2026-07-04 起改用标准 Dockerfile 瘦身镜像**(约 1.1GB,对比旧源码全量镜像 11GB)。旧的
> Dockerfile.aliyun / Dockerfile.incremental 流程降级为附录备选。

## 架构

```
Cloudflare(app.xuanwu.space, 橙云代理)
  → 服务器 nginx2 容器(nginx:alpine,80/443,CF Origin 泛域名证书 *.xuanwu.space)
    → docker 网络 nginx_nginx-network,别名 nocobase-v2
      → nocobase-ai-listing-v2 compose 项目
        ├─ 瘦身镜像(标准 Dockerfile):容器内 nginx 监听 80(entrypoint 自动起 nginx 反代应用并服务静态资源)
        └─ 旧全量镜像(v2-2026070x-00x 系列):node 直接监听 13000
      → PostgreSQL 容器(宿主 192.168.0.61:5432,库 nocobaseV2 —— 与本地开发共用同一库,
        所有页面/块/数据在库里,天然一致)
```

⚠️ **切换到瘦身镜像时端口目标变化**:旧镜像上游端口是 `13000`(node 直连),瘦身镜像是 `80`(容器内 nginx)。
compose 的端口映射 / nginx2 vhost 的 `proxy_pass` 指到容器的端口要对应改一次(见「首次切换到瘦身镜像」)。

## 关键文件

| 路径 | 用途 |
|---|---|
| 仓库根 `Dockerfile` | **标准生产镜像**(官方多阶段:npm 私服装生产依赖 + cleanup + slim 运行层,约 1.1GB) |
| `docs/ai-listing/build-image.sh` | **一键构建脚本**(起构建期 verdaccio → 临时版本发布全部包 → 两段式 docker build) |
| `docs/ai-listing/verdaccio.yaml` | 构建期 npm 私服配置(第三方依赖代理 npmmirror,uplink 熔断已放宽) |
| 仓库根 `Dockerfile.aliyun` | 附录备选:源码全量构建(11GB,依赖异常时的兜底) |
| 仓库根 `Dockerfile.incremental` | 附录备选:基于旧全量镜像只重编插件 |
| `/opt/app/nocobase-v2/docker-compose.yml` | compose 项目 `nocobase-ai-listing-v2` |
| `/opt/app/nocobase-v2/.env` | 环境变量(600 权限;APP_KEY/AI_LISTING_TOKEN_SECRET 与本地一致——共库解密令牌) |
| `/data/nginx/conf/conf.d/servers/app-xuanwu-space.conf` | app 子域 vhost |

## 发布新版本(标准流程:本地构建瘦身镜像 → 推 ACR → 服务器拉取)

镜像仓库:`registry.cn-shenzhen.aliyuncs.com/wuzhixuan/nocobase`,tag 约定 `v2-slim-<NNN>` 或 `v2-<YYYYMMDD>-<NNN>`。

### 第 1 步:本地构建(Mac,OrbStack)

```bash
open -a OrbStack                       # docker info 报错时先启动
cd /Users/wuzhixuan/code/project/nocobase

# 前提:git 工作区完全干净(脚本要临时提交版本号再精确回退,脏了会拒绝运行)

# A. 常规发版(源码有改动):全量 yarn build + 发布 + 构建,约 40~60 分钟
bash docs/ai-listing/build-image.sh v2-slim-002

# B. 构建产物已是最新时(如刚手动跑过 yarn build):跳过构建,约 15~25 分钟
#    只改了插件时更快:先 `yarn build @crossborder/plugin-ai-listing`(约 20 秒)再:
SKIP_BUILD=1 bash docs/ai-listing/build-image.sh v2-slim-002

# 加 PUSH=1 构建完自动推送 ACR
PUSH=1 SKIP_BUILD=1 bash docs/ai-listing/build-image.sh v2-slim-002
```

脚本内部流程(全自动,失败自动清理/回退):

1. 起构建期 verdaccio 私服(`docker run`,storage 挂持久卷复用第三方包缓存,构建完销毁容器)
2. 临时版本号 `<版本>-sm.<时间戳>` 提交(lerna publish 要求工作区干净;发布后 `git reset --hard` 精确回退,不进历史)
3. `lerna publish` 把 monorepo 全部包(构建产物)发布到私服
4. 标准 Dockerfile 两段式构建:先 `--target app-artifact` 从私服装生产依赖并导出 `nocobase.tar.gz`,
   再组装 slim 运行镜像(nginx + postgres/mysql 客户端 + 应用)
5. 附加插件经 `BEFORE_PACK_NOCOBASE="yarn add @crossborder/plugin-ai-listing -W --production"` 安装(官方 pro 镜像同款)

### 第 2 步:推送 ACR(脚本没加 PUSH=1 时手动)

```bash
# 登录态失效时才需要
docker login --username=<ACR用户名> registry.cn-shenzhen.aliyuncs.com
docker push registry.cn-shenzhen.aliyuncs.com/wuzhixuan/nocobase:v2-slim-002
```

> 瘦身镜像压缩后约 300~400MB 上传;每版基础层(debian/nginx/pg 客户端)与上一版复用,应用层全新。

### 第 3 步:服务器拉取并切换

```bash
ssh root@120.76.157.51
cd /opt/app/nocobase-v2
sed -i 's|^NOCOBASE_IMAGE=.*|NOCOBASE_IMAGE=registry.cn-shenzhen.aliyuncs.com/wuzhixuan/nocobase:<新tag>|' .env
docker compose pull nocobase
docker compose up -d
docker compose logs -f nocobase   # 看到 nginx started + app 启动完成即成功
```

### 首次切换到瘦身镜像(一次性,从旧全量镜像迁移时)

瘦身镜像容器内由 nginx 监听 **80**(旧镜像是 node 直接监听 13000),两处端口要对应调整:

```bash
# 1) compose 里 nocobase 服务的端口映射:容器端口 13000 → 80
#    例如原来  - "127.0.0.1:13010:13000"  改为  - "127.0.0.1:13010:80"
vi /opt/app/nocobase-v2/docker-compose.yml

# 2) nginx2 vhost 若直接 proxy_pass 到容器别名端口,同样把 13000 改 80:
#    proxy_pass http://nocobase-v2:13000; → proxy_pass http://nocobase-v2:80;
vi /data/nginx/conf/conf.d/servers/app-xuanwu-space.conf
docker exec nginx2 nginx -s reload
```

其余环境变量(`.env`)不变:APP_PORT=13000 仍是容器内 node 的监听口,镜像内 nginx 会反代它。

### 第 4 步:验证与回滚

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://app.xuanwu.space/api/app:getLang   # 期望 200
```

- 回滚:`.env` 的 `NOCOBASE_IMAGE` 改回上一版 tag → `docker compose up -d`(注意新旧镜像端口不同,
  跨"瘦身↔全量"回滚时 compose 端口映射也要一起改回)。
- 服务器磁盘 40G:确认新版稳定后删旧 tag(保留上一版用于回滚);旧 11GB 全量链(001~007)全部弃用后可整体清理,
  释放约 11GB(层共享,删最后一个引用才真正释放)。

## 附录:旧构建方式(备选)

**仅在瘦身管线不可用时使用**(例如 verdaccio/私服链路异常需要紧急发版):

```bash
# 全量(11GB):源码直接构建,15-25 分钟
docker build -f Dockerfile.aliyun -t $IMG .

# 增量(只改了插件,且本地有旧全量镜像):2-5 分钟
docker build -f Dockerfile.incremental \
  --build-arg BASE_IMAGE=registry.cn-shenzhen.aliyuncs.com/wuzhixuan/nocobase:<上一版全量tag> -t $IMG .
```

注意旧镜像 node 监听 13000,compose 端口映射需与镜像形态匹配(见上文「首次切换」反向操作)。

## 环境变量要点

- `APP_KEY` / `AI_LISTING_TOKEN_SECRET`:**必须与本地开发一致**(共库,令牌是本地授权时加密写入的)。
- `DB_HOST=192.168.0.61`(ECS 内网 IP)、`DB_DATABASE=nocobaseV2`。
- `ALIBABA_OAUTH_CALLBACK_URL=https://app.xuanwu.space/api/aiListingOpenApi:oauthCallback`。
- `AI_LISTING_REAL_ALIBABA_ICBU=true`(真实平台接入开关)。
- 密钥只存服务器 `/opt/app/nocobase-v2/.env`(600);`.dockerignore` 排除 `.env`,镜像内无密钥。

## 上线前的外部配置(人工,一次性)

1. **Cloudflare DNS**:`app.xuanwu.space` → A 记录 `120.76.157.51`,开橙云代理(SSL 模式 Full)。
2. **阿里开放平台控制台**:回调地址加 `https://app.xuanwu.space/api/aiListingOpenApi:oauthCallback`;
   **IP 白名单加服务器公网 IP `120.76.157.51`**(不加则一切 OpenAPI 调用报 `AppWhiteIpLimit`)。
3. 旧回调 `dev.xuanwu.space` 保留给本地开发(cloudflared 隧道)。

## 不需要发镜像的改动

页面/块改动(jsBlock)存数据库,推库即生效;系统 logo/标题同理。只有 server/client 插件代码、核心框架、
依赖变化才需要走镜像发布。

## 品牌(懂店 ShopMind)

平台品牌为「懂店 ShopMind — 更懂商家的电商工具服务商」。品牌落点(2026-07-03):

- **系统 logo + 标题**:存数据库 `systemSettings`(logo 附件 `/storage/uploads/ai-listing-logo-r0h6ml.svg`,
  标题 `懂店 ShopMind`);共库不共文件,一边上传的 logo 要手动复制到另一边 `storage/uploads/`。
- **favicon**:nginx 直供 `/data/nginx/html/shopmind-favicon.png`;CF 对 .ico 缓存 4 小时,换图需 Purge。
- **源文件**:`docs/ai-listing/brand/shopmind-logo.svg`、`shopmind-favicon.png`。

## 构建经验存档

- **瘦身管线踩坑(2026-07-04,均已在脚本/配置修复)**:lerna publish 强制工作区全干净(临时 commit+reset 解决);
  verdaccio uplink 默认熔断(max_fails=2)在批量安装时误报「包不存在」;`@nocobase/*` 作用域必须代理上游
  (license-kit 等不是 workspace 包);htpasswd 持久化后登录要带 Basic Auth;标准 Dockerfile 是两段式
  (先 `--target app-artifact --output` 导出 tar);附加插件靠 `BEFORE_PACK_NOCOBASE` 安装。
- **Docker Hub 基础镜像**(node:22-bookworm / node:22-bookworm-slim / mysql:8.0.39):阿里云个人加速器与公共
  代理均不稳,直连 Docker Hub 慢速可拉成;已在本地留存,勿随意清理(`docker image rm`)。
- **ACR 个人版云构建做不了全量构建**(2C4G,tsc OOM);瘦身管线如需上云,`REGISTRY_URL` 指到云效 npm 私服即可。
- 踩坑:`.dockerignore` 排除 `.env.*` 会误伤 `.env.e2e.example`(cli-v1 必读),须放行 `!.env.*.example`。
