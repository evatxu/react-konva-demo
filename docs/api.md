# API 清单

基于 `功能清单.md`，当前项目已补充一套可运行的 Next.js mock API，覆盖账号、项目、模板、上传、记录处理、导出、权益支付和管理后台。

所有接口统一返回：

```json
{
  "success": true,
  "data": {}
}
```

失败时返回：

```json
{
  "success": false,
  "error": {
    "code": "error_code",
    "message": "错误信息"
  }
}
```

## 1. 账号与权限

`POST /api/auth/login`
- 用户登录，自动写入 `pigeon_demo_session` Cookie

`GET /api/auth/session`
- 获取当前用户会话、账户状态、项目数

`POST /api/auth/logout`
- 退出登录

`POST /api/admin/auth/login`
- 管理员登录，自动写入 `pigeon_demo_admin_session` Cookie

## 2. 模板、权益与商品

`GET /api/templates`
- 模板列表
- 已登录用户会按当前权益返回 `locked`

`GET /api/products`
- 商品列表，包含次卡和月付商品

`GET /api/account/entitlements`
- 当前权益快照
- 返回剩余导出次数、免费额度、下次重置时间、可用模板、水印状态

## 3. 项目管理

`GET /api/projects`
- 项目列表

`POST /api/projects`
- 创建项目

请求示例：

```json
{
  "name": "春季赛绩项目",
  "description": "演示项目",
  "templateId": "classic-free",
  "fields": {
    "title": "2026 春季竞翔专场"
  }
}
```

`GET /api/projects/:projectId`
- 获取项目详情

`PATCH /api/projects/:projectId`
- 更新项目名称、描述、公共字段、当前激活记录

`DELETE /api/projects/:projectId`
- 删除项目并清理处理任务/导出记录

`POST /api/projects/:projectId/template`
- 更换项目模板

## 4. 素材上传与 Excel 导入

`POST /api/projects/:projectId/uploads`
- 统一上传入口
- 支持 `append | replace | supplement | delete`
- 支持图片、压缩包、Excel 元数据登记

请求示例：

```json
{
  "action": "append",
  "assets": [
    {
      "name": "2026-0008_eye.jpg",
      "dataUrl": "data:image/jpeg;base64,..."
    },
    {
      "name": "2026-0008_body.jpg",
      "dataUrl": "data:image/jpeg;base64,..."
    }
  ]
}
```

`POST /api/projects/:projectId/excel`
- Excel 解析结果回填
- 按 `ringNumber` 匹配，不存在则自动建记录

## 5. 记录、处理状态与异常重试

`GET /api/projects/:projectId/items`
- 记录列表
- 支持 `status`、`keyword` 查询

`PATCH /api/projects/:projectId/items/:itemId`
- 编辑记录字段
- 支持 `applyFieldsToAll` 和 `sharedFields`

`POST /api/projects/:projectId/items/:itemId/retry`
- 异常记录重试

`GET /api/projects/:projectId/jobs`
- 查看项目级处理任务状态

## 6. 导出与下载

`POST /api/projects/:projectId/exports`
- 单条或批量导出
- 自动校验权益、扣减次数、标记水印状态

请求示例：

```json
{
  "itemIds": ["item-1", "item-2"],
  "format": "zip"
}
```

返回字段里包含：
- `ticket.downloadUrl`
- `ticket.watermarked`
- 更新后的 `entitlement`

## 7. 订单与支付

`GET /api/orders`
- 当前用户订单列表

`POST /api/orders`
- 创建订单

`GET /api/orders/:orderId`
- 查询订单详情

`POST /api/orders/:orderId/pay`
- 模拟支付成功并回写权益

## 8. 管理后台

`GET /api/admin/users`
- 用户列表、项目数、当前权益

`GET /api/admin/orders`
- 全量订单列表

`GET /api/admin/templates`
- 模板管理列表

`PATCH /api/admin/templates/:templateId`
- 更新模板上下架、排序、说明、付费等级

`GET /api/admin/config`
- 系统配置

`PATCH /api/admin/config`
- 修改免费额度、水印规则、上传命名规则和提示

## 9. 前端调用

已提供封装文件：

- `lib/api/client.ts`

可直接这样调用：

```ts
import { apiClient } from "@/lib/api/client";

await apiClient.auth.login({ phone: "13800138000" });
const projects = await apiClient.projects.list();
const detail = await apiClient.projects.detail(projects[0].id);
```
