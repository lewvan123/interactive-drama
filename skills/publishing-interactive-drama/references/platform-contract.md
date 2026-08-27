# 制作平台接口契约

仅在排查脚本兼容性或平台接口变化时读取本文件。日常导入直接运行脚本。

## 接口

| 操作 | 方法与路径 | 关键结果 |
|---|---|---|
| 创建项目 | `POST /api/projects` | `{ project, draft }` |
| 读取草稿 | `GET /api/projects/:id/draft` | 完整 `ProjectDraft` |
| 保存草稿 | `PUT /api/projects/:id/draft` | 完整 `ProjectDraft` |
| 发布检查 | `POST /api/projects/:id/validate` | `{ valid, issues }` |
| 发布 | `POST /api/projects/:id/publish` | `{ version, publishedAt, manifestUrl }` |
| 回读固定版本 | `GET /api/public/projects/:id/manifest?version=vN` | `PublishedManifest` |

保存是整份覆盖，不是局部 patch。更新项目时必须保留原 `assets`；稳定节点 ID 匹配且素材状态为 `available` 时，保留该节点的 `videoAssetId`。

## 链接

- 制作后台：`/studio/projects/:projectId/edit`
- 当前版本 H5：`/play/:projectId`
- 固定版本 H5：`/play/:projectId?version=vN`

## 数据规则

- 起点在 `startNodeId` 标记，其节点 `type` 仍为 `normal`。
- 普通节点至少一个 `choice`，结局节点的 `choices` 必须为空。
- 模板中的单一 `后续节点` 会生成 `text` 为空的普通连接，播放时自动继续，制作平台不展示分支描述。
- 两个及以上后续才使用带文案的 `choice`，并展示选择按钮和 `choicePrompt`。
- `choicePrompt` 为空时播放端回退为“你会怎么选？”。
- 节点 ID 是更新时继承视频绑定的唯一依据，不按标题模糊匹配。
- 服务端没有事务、CAS 或发布幂等键。脚本用 `updatedAt` 做确认后的并发保护，但创建或发布超时仍需人工只读核查。
