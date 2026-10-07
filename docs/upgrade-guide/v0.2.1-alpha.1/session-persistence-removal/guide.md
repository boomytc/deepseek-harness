---
kind: upgrade-guide
description: "`SessionPersistence` gains an abstract `remove`, and the Archived sessions page can delete a stored log for good."
---

# `SessionPersistence.remove` and archived-log deletion

English | [中文](guide.zh.md)

## Change

`@deepseek-ai/dsh-session-persistence` gains one abstract member:

```ts
abstract remove(id: SessionId, options?: SessionPersistenceRemoveOptions): Promise<SessionRemovalResult>
```

Every `SessionPersistence` subclass outside this repository must implement it, or it stops compiling. In exchange, the seam can now delete one stored session's artifacts — in every retained format generation — instead of leaving pruning to out-of-band maintenance ([details](../../../subsystems/persistence.md)).

The Archived sessions page uses it: **Delete** removes a stored log irreversibly once the session has been archived for the Host's retention window. `archivedRetentionDays` on the `workspace-controller` row of `cordis.yml` (or a patch/overlay) sets that window; the default is `3`, and `0` allows deletion the moment a session is archived. Nothing deletes automatically: only a person pressing Delete in that page, or a Client calling `workspace.deleteArchivedSession` / `workspace.deleteExpiredArchivedSessions`, deletes a log.

## Migration

1. Implement `remove` in every `SessionPersistence` subclass. Delete that session's durable artifacts, refuse with `SessionPersistenceBusyError` while any handle open in this process addresses the id or another process holds its write lease, and return `{ removed: false, code: 'session_not_found' }` for an absent session. Never delete artifacts shared across sessions, such as content-addressed attachments.
2. Change the window, or adjust the patch row, only if the default three days is wrong for the deployment:
   ```yaml
   - id: workspace-controller
     config:
       archivedRetentionDays: 14
   ```
3. Confirm: `pnpm run typecheck` passes for the provider package, and Open Settings → **Archived** shows **Delete** available exactly on the rows past the configured window.
