# 参与贡献

感谢你参与改进互动短剧制作与播放平台。

## 开发流程

1. Fork 仓库并从 `main` 创建功能分支。
2. 使用 Node.js 22 和 pnpm 10 安装依赖：`pnpm install`。
3. 通过 `pnpm dev` 启动制作平台与 API。
4. 为行为变更补充或更新测试。
5. 提交前运行：

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm e2e
```

6. 提交 Pull Request，说明修改目的、验证方式及涉及的界面变化。

## 提交建议

- 保持改动聚焦，避免混入无关重构。
- 不要提交真实作品、视频素材、访问凭证或本地 `.data/` 数据。
- 界面修改请附截图或录屏。
- 安全问题请按照 [SECURITY.md](SECURITY.md) 私密报告。
