# AI 商品搬运工具 — 服务器部署手册

> 首次部署:2026-07-03。服务器 120.76.157.51(阿里云 ECS,CentOS 7,4C/7.4G/40G,Docker 26 + Compose v2.27)。
> 与 6 月的旧原型部署(`/opt/app/nocobase`,库 `nocobase`,插件 `@nocobase/plugin-ai-listing-workbench`)**并存互不影响**;
> 本项目(v2,插件 `@crossborder/plugin-ai-listing`)使用独立的 compose 项目、数据库与端口。

## 架构

```
Cloudflare(app.xuanwu.space, 橙云代理)
  → 服务器 nginx2 容器(nginx:alpine,80/443,CF Origin 泛域名证书 *.xuanwu.space)
    → docker 网络 nginx_nginx-network,别名 nocobase-v2
      → nocobase-ai-listing-v2 compose 项目(宿主回环 127.0.0.1:13010 → 容器 13000)
        → PostgreSQL 容器(宿主 192.168.0.61:5432,库 nocobaseV2 —— 与本地开发共用同一库,
          所有页面/块/数据在库里,天然一致)
```

## 关键文件(服务器)

| 路径 | 用途 |
|---|---|
| `/opt/build/nocobase-src/` | 构建上下文(rsync 自本地仓库,不含 node_modules/.git/storage/docs/.env) |
| `/opt/build/nocobase-src/Dockerfile.aliyun` | 生产镜像:node:22-bookworm + npmmirror 源 + `yarn install` + `yarn build`,CMD `yarn start` |
| `/opt/app/nocobase-v2/docker-compose.yml` | compose 项目 `nocobase-ai-listing-v2` |
| `/opt/app/nocobase-v2/.env` | 环境变量(600 权限;APP_KEY/AI_LISTING_TOKEN_SECRET 与本地一致——DB 里的加密令牌才解得开) |
| `/data/nginx/conf/conf.d/servers/app-xuanwu-space.conf` | app 子域 vhost(变量 + docker DNS resolver,容器未启动不阻塞 nginx) |

## 发布新版本

```bash
# 本地
rsync -az --delete \
  --exclude node_modules --exclude '**/node_modules' --exclude .git \
  --exclude storage --exclude docs --exclude '.env' --exclude '.env.*' \
  --exclude '**/.umi' --exclude '**/.umi-production' \
  ./ root@120.76.157.51:/opt/build/nocobase-src/

# 服务器
cd /opt/build/nocobase-src
docker build -f Dockerfile.aliyun -t registry.cn-shenzhen.aliyuncs.com/wuzhixuan/nocobase:v2-<YYYYMMDD-NNN> .
docker push registry.cn-shenzhen.aliyuncs.com/wuzhixuan/nocobase:v2-<YYYYMMDD-NNN>   # 备份(可选)
sed -i 's|^NOCOBASE_IMAGE=.*|NOCOBASE_IMAGE=registry.cn-shenzhen.aliyuncs.com/wuzhixuan/nocobase:v2-<YYYYMMDD-NNN>|' /opt/app/nocobase-v2/.env
cd /opt/app/nocobase-v2 && docker compose up -d
docker compose logs -f nocobase   # 观察启动
```

集合结构有变时在容器里跑一次:`docker compose exec nocobase yarn nocobase db:sync`。

## 环境变量要点

- `APP_KEY` / `AI_LISTING_TOKEN_SECRET`:**必须与本地开发一致**(共库,令牌是本地授权时加密写入的)。
- `DB_HOST=192.168.0.61`(ECS 内网 IP,postgres 容器发布在 0.0.0.0:5432)、`DB_DATABASE=nocobaseV2`。
- `ALIBABA_OAUTH_CALLBACK_URL=https://app.xuanwu.space/api/aiListingOpenApi:oauthCallback`。
- `AI_LISTING_REAL_ALIBABA_ICBU=true`(真实平台接入开关)。
- 密钥只存服务器 `/opt/app/nocobase-v2/.env`(600),Dockerfile 构建上下文已用 `.dockerignore` 排除 `.env`,镜像内无密钥。

## 上线前的外部配置(人工,一次性)

1. **Cloudflare DNS**:`app.xuanwu.space` → A 记录 `120.76.157.51`,开橙云代理(SSL 模式 Full,源站用已有 CF Origin 证书)。
2. **阿里开放平台控制台**(两项都在应用设置里):
   - 回调地址增加 `https://app.xuanwu.space/api/aiListingOpenApi:oauthCallback`;
   - **IP 白名单增加服务器公网 IP `120.76.157.51`**——不加的话服务器发起的一切 OpenAPI 调用都会报 `AppWhiteIpLimit`。
3. 旧回调 `dev.xuanwu.space` 可保留给本地开发(cloudflared 隧道)。

## 已知注意事项

- 服务器磁盘 40G 较紧(构建期镜像+缓存约需 10G+),构建失败先查 `df -h`;swap 已加至 6G(2G+4G)。
- 本地 `yarn dev` 与线上共库:同版本代码无碍;改集合结构后先在一边跑 `db:sync`,另一边重启即可。
- 旧部署(13000 端口、库 nocobase)确认不再需要后可 `docker compose -p nocobase-ai-listing down` 下线回收 1.7G 镜像。

## 增量发版(日常,2-5 分钟)

只改了 `@crossborder/plugin-ai-listing` 时用 `Dockerfile.incremental`(基于上一版全量镜像只重编插件):

```bash
docker build -f Dockerfile.incremental \
  --build-arg BASE_IMAGE=registry.cn-shenzhen.aliyuncs.com/wuzhixuan/nocobase:<上一版tag> \
  -t registry.cn-shenzhen.aliyuncs.com/wuzhixuan/nocobase:<新tag> .
```

页面/块改动(jsBlock)存数据库,推库即生效,连镜像都不用动。

## 品牌(懂店 ShopMind)

平台品牌为「懂店 ShopMind — 更懂商家的电商工具服务商」,AI 商品搬运工具是其下第一个模块。品牌落点(2026-07-03):

- **系统 logo + 标题**:存数据库 `systemSettings`(logo 附件 `/storage/uploads/ai-listing-logo-r0h6ml.svg`,标题 `懂店 ShopMind`),线上本地共库同款;换 logo 走「系统设置 → Logo 上传」即可,无需发版。
  注意共库不共文件:一边上传的 logo 文件要手动复制到另一边的 `storage/uploads/`(同名)。
- **favicon**:nginx 直接供,文件 `/data/nginx/html/shopmind-favicon.png`,vhost `app-xuanwu-space.conf` 里 `location = /favicon.ico { alias /usr/share/nginx/html/shopmind-favicon.png; }`。Cloudflare 对 .ico 默认缓存 4 小时,换图后想立即生效需在 CF 控制台 Purge Cache。
- **源文件**:`docs/ai-listing/brand/shopmind-logo.svg`(横版字标,深色底用)、`shopmind-favicon.png`(64×64 方形图标)。

## 构建资源经验(2026-07-03 实测)

- **ACR 个人版云构建做不了全量构建**:构建机约 2C4G,`yarn build` 的 tsc 声明编译阶段直接 OOM(rpc EOF,恰好 30 分钟被杀)。全量构建只能在服务器(7.4G+swap,~10 分钟编译)或本地(Intel Mac 16C/16G 更快)。增量构建资源占用小,ACR 理论可行(未验证)。
- 首成镜像:`v2-20260703-001`(11GB,含完整 node_modules;后续可优化裁剪)。
- 踩坑:`.dockerignore` 排除 `.env.*` 会误伤 `.env.e2e.example`——cli-v1 的 p-test.js 模块加载时必读它,导致 yarn install 的 postinstall 失败;须放行 `!.env.*.example`。
