---
name: publishing-interactive-drama
description: Use when a user provides an interactive-drama Markdown script and asks to create or update a project in the interactive-drama studio, generate story nodes and branches, publish a version, or return player links.
---

# 发布互动短剧

把标准 Markdown 互动剧本确定性地导入制作平台。默认平台为本机服务 `http://127.0.0.1:6001`；用户明确指定其他环境时才覆盖。

## 输入约定

- 剧本应遵循 [互动剧本模板](assets/互动剧本模板.md)。
- 单一后续使用 `后续节点`，不写分支文案；只有两个及以上后续才使用 `选择标题` 和 `分支`。
- 未明确提供 `projectId` 时，一律创建新项目；重复执行也创建新项目。
- 仅当用户明确提供 `projectId` 时更新已有项目。更新会保留素材库，并按稳定节点 ID 保留仍可用的视频绑定。
- 若用户只要求生成或检查剧本，不调用平台写接口。

## 执行流程

1. 将用户剧本保存为 UTF-8 Markdown 文件。不要擅自改节点 ID、分支目标或剧情含义。
2. 使用本 Skill 的实际目录替换 `<skill-directory>`，先运行只读预检：

```bash
python3 <skill-directory>/scripts/import_interactive_drama.py 剧本.md \
  --base-url http://127.0.0.1:6001 \
  --format json
```

更新已有项目时追加 `--project-id <projectId>`。预检失败就展示完整错误并停止，不进入确认、不写平台。

3. 向用户展示一次确认清单：环境与模式、作品名、节点/分支数、起点、结局、多分支节点的选择标题、新增/修改/删除节点、保留或失效的视频绑定及警告。若“标题变化但保留视频”的节点非空，要求用户重点核对。更新期间请制作人员暂停在后台编辑。明确询问是否写入并发布。
4. 只有用户确认后才执行：

```bash
python3 <skill-directory>/scripts/import_interactive_drama.py 剧本.md \
  --base-url http://127.0.0.1:6001 \
  --expected-script-sha256 <scriptSha256> \
  --apply --yes --format json
```

更新模式还必须原样传入预检结果中的：

```bash
--project-id <projectId> --expected-updated-at <expectedUpdatedAt>
```

脚本发现确认后草稿有变化时会停止；重新预检并再次确认，不覆盖制作人员的新修改。

5. 成功后返回脚本输出的制作后台、当前版本 H5、固定版本 H5 和版本号。将 URL 渲染为可点击链接。

## 停止条件

- `create`、`save` 或 `publish` 请求超时后不要盲目重试；请求可能已经生效，报告状态不确定并先只读核查。
- 服务端校验失败时，说明草稿已保存但未发布，并返回具体问题。
- 若返回 `publishedResult`，表示发布已成功、仅固定版本回读未确认；把其中项目、版本和链接一并交付，不能重新发布。
- 不绕过本地校验，不直接手写完整草稿请求。接口排查时读取 [平台契约](references/platform-contract.md)。
