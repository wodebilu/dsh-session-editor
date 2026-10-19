# 会话编辑器（Session Editor for DSH）

**非官方** DeepSeek Harness（DSH）插件，与 DeepSeek 官方无关。

给 DSH 网页端加上会话删除，以及类似 SillyTavern 的“直接改、直接删”对话编辑。

> **删除是破坏性的，但七天内可恢复。** 删除会话不会立刻抹掉数据，而是把会话目录移动到同级回收站；超过七天的回收站条目会被自动清理。编辑/删除某一轮会用新会话替换，并把原会话移入回收站。

[English](README.md)

## 功能

| 操作 | 位置 | 行为 |
|---|---|---|
| 删除会话 | 会话行 `…` 菜单 →「删除会话…」 | 先解析并校验磁盘路径、归档会话、停止进行中的工作，再把目录移入回收站。 |
| 重新生成 | 已完成回答的操作行 | 确认 → 在该轮之前 fork 新会话 → 重发同一提问 → 打开新会话 → 原会话移入回收站。 |
| 编辑提问并重发 | 同一操作行 | 确认 + 编辑框 → 用新提问创建新会话 → 原会话移入回收站。 |
| 删除此轮及之后 | 同一操作行 | 生成截止到该轮之前的新会话 → 原会话移入回收站。 |
| 编辑我的输入 | 悬停在用户消息气泡上 | 复制 / 编辑自己的消息；同样走替换并移入回收站的流程。 |

## “直接改 / 直接删”是怎么实现的

DSH 的会话日志是 append-only 的，不支持原地改写。所以每次编辑会：

1. 在目标轮之前 fork 一个子会话（标题保持不变）；
2. 需要重发时把提问发进子会话；
3. 打开子会话；
4. 把源会话移入回收站。

你看到的对话立刻变成修改后的内容，原会话从侧边栏消失。

代价：

- 会话 id 会变，侧边栏那一行被替换（标题保留）；
- 没有可回退的分支历史；
- 只能“从这一轮起”截断，不能“只删中间一条、保留后面”；
- 改文字会重新生成回答，不是纯文本替换。

## 删除的安全性

插件**不会**猜一个路径然后直接删。任何状态改变之前，它会：

1. 用 `sessionPersistence.stat` 读会话头，拒绝子代理会话；
2. 如果还有**子代理**引用它则拒绝删除（fork 出来的子会话允许存在）；
3. 依次尝试解析磁盘路径：
   - harness 若提供后端 `locate(header)`，先用它；
   - 再用 JSONL 后端的 `listArtifacts()`（带校验的 header → path）；
   - 最后在候选根目录（`sessionPersistence.root`、其 `config.root`、`$DSH_HOME/sessions`）下扫描 `<root>/<project>/<sessionId>`；
4. 校验目录恰好位于某个根目录下一层、不是符号链接、且内部有 `session*.jsonl[.zstd]`；
5. 通过 `workspaceRegistry` 归档；若会话在运行，先取消并等待空闲（最多 15 秒，超时则什么都不删）；
6. `sessionPersistence.flush()` 之后，把目录**重命名**到 sessions 根目录同级的
   `dsh-session-editor-trash` 中（同一卷，因此是原子移动）。

任何一步失败都会把会话从归档状态恢复，并返回具体原因；路径解析失败发生在归档**之前**，所以找不到路径时原会话完全不受影响。

回收站布局：

```text
<sessions 根>/../dsh-session-editor-trash/
  1760000000000-session-<uuid>/
    session.v4.jsonl.zstd
    session-editor-trash.json   # id、cwd、deletedAt、originalPath
```

七天内想撤销：把目录移回 `<sessions 根>/<project>/<session-id>/`，再在 DSH 里取消归档。想立刻回收空间：直接删除回收站目录。

## 环境要求

- 在 DSH `0.2.1-rc.2` 上测试。
- Host 半使用公开服务（`commands`、`agents`、`sessionPersistence`、`workspaceRegistry`），另用两个后端细节定位路径：JSONL 后端的 `listArtifacts()` 与其 `root` 字段。两者都做了特性检测；未来 harness 移除它们时会回落到 `$DSH_HOME/sessions`；全都拿不到时**安全失败**，不删。
- Client 半使用内部 slot key 与 `conversation.chat.user.content` 工厂，DSH 升级可能导致失效。
- 无第三方运行时依赖、无网络请求、无遥测。

## 安装

### 从 GitHub 安装

1. DSH 左侧 **插件** → **添加插件**。
2. 粘贴仓库地址：

   ```text
   https://github.com/wodebilu/dsh-session-toolkit
   ```

   或 `github:wodebilu/dsh-session-toolkit`。
   包名取自 `package.json`（`dsh-session-editor`），所以仓库虽然叫
   `dsh-session-toolkit`，装出来的 bundle 是 `dsh-session-editor`。
3. 安装后重启一次 DSH。

**不要**从 npm 安装 `dsh-session-toolkit`：那个名字属于另一个插件。

### 从本地文件夹 / ZIP 安装

1. 下载仓库 ZIP，解压到一个以后不会移动的位置。
2. 在 **添加插件** 里粘贴解压后文件夹的绝对路径（包含 `package.json` 的那一层）。
3. 安装并重启 DSH。

> 文件夹安装是 `link:` 依赖，装完不能移动或删除该文件夹；Git/tarball 安装会把包复制进 profile，移动安全。

### 先移除旧的本地版本

早期版本使用过 `@local/dsh-session-toolkit` 或 `dsh-session-toolkit` 包名。安装本版本前，先在 **插件 → Installed plugins** 里移除旧的 bundle，否则两个客户端模块会注册同一批 slot。

## 使用

- 删除会话：会话行 `…` →「删除会话…」→ 确认。
- 编辑/删除某一轮：悬停在已完成回答下的操作行 → 铅笔 / 垃圾桶 / 循环箭头 → 确认。
- 编辑自己的消息：悬停在用户气泡上 → 复制 / 铅笔。
- 手动删除（在任意其他会话里）：`/session-editor delete <sessionId>`。菜单和替换流程走的也是这条命令。

删除命令会作为普通命令行记录。会话删除自己时（替换流程），Host 会等命令生命周期落盘后再移动目录。

## 配置

不需要配置。两个常量刻意固定、不开放：

- 回收站保留七天；
- 等待运行中会话停止的上限 15 秒。

## 兼容性与风险

- **替换了用户消息渲染器**：插件注册 `conversation.chat.node` 的 `user` 键来加悬停操作，并复用官方 `conversation.chat.user.content` 工厂。DSH 一旦改动该节点契约，用户消息渲染可能受影响，直到插件跟进。
- **依赖内部 API**：见“环境要求”。这是社区插件，不是稳定的公开扩展点。
- **无担保**：请保留备份。

## 开发

无需构建，纯 ESM Host 代码 + 浏览器 bundle。

```bash
npm test
# 等价于：
node test/host.test.mjs
node test/client.test.mjs
```

Host 测试使用临时目录，不会触碰真实会话；它**故意不提供** `locate()`，并断言路径解析失败时不会归档会话。

## 许可证

MIT，见 [LICENSE](LICENSE)。
