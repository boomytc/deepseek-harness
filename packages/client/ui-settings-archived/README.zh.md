---
description: "dsh Web 客户端设置弹窗中的归档会话管理页：列出全部已归档会话、打开其对话，或将其恢复。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-archived

[English](README.md) | 中文

## 概述

设置中的**已归档会话**页按最近更新时间从新到旧列出本 profile 归档的全部会话，并标明每个会话所属的工作区。**打开**会回到该对话——已归档会话依然可读——**恢复**则把该会话移出归档集合，使它重新参与分组并可继续对话。这一页之所以存在，是因为侧栏的归档筛选默认隐藏这些行：在那里归档的会话只能先被重新找到才能读，而这里是唯一列出完整集合的界面。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

打开设置，在**通用**与**模型**之间选择**已归档**；页面自身标题为**已归档会话**。每一行给出会话名称、所属工作区（或**未分组**）以及按当前语言显示的最近更新时间。**打开**会在主区域选中该会话并关闭设置；对话会渲染完整历史，其 composer 则说明该会话已归档，而不接受输入。**恢复**会让该行从列表消失，会话重新出现在侧栏其工作区之下。同一时刻只执行一次恢复：有一个在进行时，所有行的按钮都会被禁用；被拒绝的恢复会保留该行并在旁边给出原因。集合为空时说明没有任何已归档会话。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

宿主半侧是一个空的 `apply`，只为让本包占一条 Loader 行，客户端模块系统据此送出浏览器半侧。浏览器半侧在 `settings.section` 注册一行（`id: archived`，`order: 5`——排在「通用」之后、「模型」之前），并在其背后注册一个行 source。

`createArchivedSessionsSource` 同时跟随两个彼此独立的快照：Workspace 控制器的归档集合与分组，以及携带各会话标题和更新时间的 Session 列表。任一变化都会重新投影：归档集合中列表尚未送达的成员会被跳过，结果按更新时间从新到旧排序，投影结果相等时不发布任何内容——因此无关的 Session 状态变化或别处的一次重命名不会重渲染任何行。页面组件自己不做读取：它通过自己的 inject face 接收该 observable，渲染列表与两种状态，并通过同一个 face 回传 `openSession`（`uiWorkspace` 服务）与 `restoreSession`（`uiWorkspace.unarchiveSession`）。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [ui-workspace](../ui-workspace/README.zh.md)——拥有归档、归档筛选以及本页调用的取消归档命令的侧栏。
- [ui-settings](../ui-settings/README.zh.md)——本页填入其 `settings.section` 列表的设置外壳。
- [api-workspace-controller](../../api/workspace-controller/README.zh.md)——注册表全局的归档集合及其 `archived` 增量。
- [api-session-controller](../../api/session-controller/README.zh.md)——为已归档会话提供名称的 Session 列表。

-----

<a id="model-experience"></a>
## 模型体验

无，本包是浏览器侧的设置界面，不注册任何模型面。

#### KV 缓存影响

无；本包既不组装也不发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **单一 profile 的归档集合**——本页列出所连 Host 提供的注册表全局集合，因此不会显示其他 profile 的已归档会话。
- **没有删除**——会话只能归档与恢复，永不删除；因此本页不提供任何破坏性操作，其行也始终可恢复。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
