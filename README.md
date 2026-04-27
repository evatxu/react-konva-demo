# 海报智能生成台

一个基于 `Next.js 13`、`React 18`、`React Konva` 和 `PostgreSQL` 的 MVP 项目，目标是覆盖海报制作的核心流程：项目管理、素材上传、模板套用、编辑预览、导出和权益购买。

当前项目同时存在两类数据源：

- 部分接口已经接入 PostgreSQL
- 其余接口仍使用本地 mock 数据，便于前端继续联调

## 功能概览

- 首页展示产品能力和工作流说明
- `/studio` 提供海报编辑器、模板切换和导出流程
- 提供一套基于 Next.js App Router 的 API 路由
- 提供 PostgreSQL 连接池封装，支持后续逐步替换 mock 数据层

## 技术栈

- `Next.js 13.5`
- `React 18`
- `TypeScript`
- `Tailwind CSS`
- `React Query`
- `React Konva`
- `PostgreSQL`
- `pg`

## 快速开始

### 1. 安装依赖

建议使用 `Node.js 18+`。

```bash
yarn install
```

### 2. 配置环境变量

项目已提供示例文件 [`.env.local.example`](./.env.local.example)。

```bash
cp .env.local.example .env.local
```

默认数据库配置如下：

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=my_first_database
DB_USER=postgres

DB_POOL_MAX=10
DB_IDLE_TIMEOUT_MS=30000
DB_CONNECTION_TIMEOUT_MS=5000
```

### 3. 启动开发环境

```bash
yarn dev
```

启动后可访问：

- 首页：`http://localhost:3000/`
- 编辑器：`http://localhost:3000/studio`

### 4. 类型检查

```bash
yarn typecheck
```

## 数据库

PostgreSQL 连接封装位于 [`lib/db/postgres.ts`](./lib/db/postgres.ts)，提供以下能力：

- `getDb()`：获取连接池单例
- `query()`：执行普通 SQL
- `withDbClient()`：手动获取客户端连接
- `withTransaction()`：事务执行
- `checkDatabaseConnection()`：基础连通性检查

数据库健康检查接口：

- `GET /api/health/db`

## 当前接口数据源状态

### 已接入 PostgreSQL

- `GET /api/products`
  从 `products` 表读取启用中的商品，并映射为前端当前使用的 `ProductOption` 结构
- `GET /api/admin/users`
  从 `users` 表读取用户基础信息，部分项目/账户统计字段当前仍返回默认值
- `GET /api/health/db`
  执行数据库连通性检查

### 仍使用 mock 数据

- 认证相关：`/api/auth/*`
- 项目相关：`/api/projects/*`
- 模板相关：`/api/templates`
- 权益相关：`/api/account/entitlements`
- 订单相关：`/api/orders/*`
- 管理后台其余接口：`/api/admin/orders`、`/api/admin/templates`、`/api/admin/config`

接口清单可参考 [`docs/api.md`](./docs/api.md)。

## 目录结构

```text
app/
  api/                  Next.js API 路由
  studio/               编辑器页面
  page.tsx              首页

components/
  editor/               海报编辑器与画布相关组件
  home/                 首页展示组件
  ui/                   通用 UI 组件

lib/
  api/                  接口客户端、契约、HTTP 工具、mock 数据
  db/                   PostgreSQL 封装
  pigeon-studio.ts      领域模型和默认数据
  poster-renderer.ts    海报渲染逻辑
  poster-template.ts    模板定义
```

## NPM Scripts

```bash
yarn dev
yarn build
yarn start
yarn typecheck
```

## 已有表结构

当前你已经提供并接入过的数据库表包括：

- `products`
- `users`

后续如果继续把 `orders`、`projects`、`templates`、账户权益相关数据迁到数据库，建议按“先只读查询、后写入流程、最后移除 mock”的顺序逐步替换，风险更低。
