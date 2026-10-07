---
description: "Archived-session management in the dsh web client's Settings dialog: list every archived Session, open its conversation, or restore it."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-archived

English | [中文](README.zh.md)

## Summary

The **Archived sessions** page in Settings lists every Session the profile archived, newest update first, with the Workspace that groups each one. **Open** returns to that conversation — an archived Session stays readable — and **Restore** drops it from the archive set so it groups and continues as an ordinary Session. The page exists because the sidebar's archived filter hides rows by default: a Session archived there can be read only after it is found again, and this is the one surface that lists the whole set.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Open Settings and select **Archived** between **General** and **Models**; the page titles itself **Archived sessions**. Each row names the Session, its Workspace (or **Ungrouped**), and its last update in the active language. **Open** selects that Session in the main view and closes Settings; the conversation renders its full history, while its composer states that the Session is archived instead of accepting input. **Restore** removes the row from the list, and the Session appears in the sidebar again under its Workspace. One restore runs at a time: every row's button is disabled while one is in flight, and a refused restore keeps its row with the reason beside it. An empty set states that nothing is archived.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The Host half is an empty `apply`, present only so the package holds a Loader row the client module system serves the browser half for. The browser half registers one row in `settings.section` (`id: archived-sessions`, `order: 5` — after General and before Models) and one row source behind it.

`createArchivedSessionsSource` follows two independent snapshots: the Workspace controller's archive set and grouping, and the Session list that carries each session's title and update time. It re-projects on either change, skips archive-set members the list has not delivered, sorts newest update first, and republishes nothing when the projected rows are equal — so an unrelated Session status or a rename elsewhere re-renders no row. The page component owns no read: it receives that observable through its inject face, renders the list and its two states, and raises `openSession` (the `uiWorkspace` service) and `restoreSession` (`uiWorkspace.unarchiveSession`) back through the same face.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [ui-workspace](../ui-workspace/README.md) — the sidebar that owns archiving, the archived filter, and the unarchive command this page calls.
- [ui-settings](../ui-settings/README.md) — the settings shell whose `settings.section` list this page fills.
- [api-workspace-controller](../../api/workspace-controller/README.md) — the registry-global archive set and its `archived` increment.
- [api-session-controller](../../api/session-controller/README.md) — the Session list whose rows name the archived Sessions.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package is a browser-side settings surface that registers no model surface.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **One profile's archive set** — the page lists the registry-global set the connected Host serves, so it shows no other profile's archived Sessions.
- **No deletion** — Sessions are archived and restored, never deleted; the page therefore offers no destructive action, and its rows stay recoverable.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
