---
kind: upgrade-guide
description: "`SessionPersistence` 新增抽象方法 `remove`，已归档会话页可以彻底删除日志。"
---

# `SessionPersistence.remove` 与已归档日志的删除

[English](guide.md) | 中文

## 变更

`@deepseek-ai/dsh-session-persistence` 新增一个抽象成员：

```ts
abstract remove(id: SessionId, options?: SessionPersistenceRemoveOptions): Promise<SessionRemovalResult>
```

仓库之外的所有 `SessionPersistence` 子类都必须实现它，否则将无法编译；作为交换，该 seam 现在可以删除单个已存储会话的全部保留格式代产物，而不必再把剪枝留给带外维护（[细节](../../../subsystems/persistence.zh.md)）。

「已归档会话」页据此提供删除：当会话被归档满宿主保留期后，**删除**会不可逆地移除已存储日志。保留期由 `cordis.yml`（或 patch/overlay）中 `workspace-controller` 行的 `archivedRetentionDays` 决定，默认 `3`，设为 `0` 表示归档后即可删除。**不存在任何自动删除**：只有人在该页按下删除，或客户端调用 `workspace.deleteArchivedSession` / `workspace.deleteExpiredArchivedSessions`，才会删除日志。

## 迁移

1. 为每个 `SessionPersistence` 子类实现 `remove`：删除该会话的持久产物；只要本进程仍有句柄指向该 id，或另一进程仍持有其写租约，就以 `SessionPersistenceBusyError` 拒绝；会话不存在时返回 `{ removed: false, code: 'session_not_found' }`。切勿删除跨会话共享的产物，例如内容寻址的附件。
2. 只有当默认三天不适合该部署时，才调整窗口或对应 patch 行：
   ```yaml
   - id: workspace-controller
     config:
       archivedRetentionDays: 14
   ```
3. 确认：提供方包的 `pnpm run typecheck` 通过，且打开设置 → **已归档**时，**删除**恰好只在超过所配置窗口的行上可用。
