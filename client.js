/**
 * Session Toolkit — browser half.
 *
 * Three entry points:
 *  - a Session-row menu action that hard-deletes that Session through the
 *    plugin's Host command;
 *  - per-answer actions that regenerate, edit the prompt, or drop the turn by
 *    forking the Session before it and reopening the child;
 *  - one overlay that owns the confirmation/edit dialogs and the result toast.
 */
window.__ModuleLoader__.load({
  id: 'dsh-session-toolkit',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'sessionToolkit'
    const inject = [
      'slots',
      'locale',
      'sessions',
      'remote',
      'remote.commands',
      'remote.session',
      'uiWorkspace',
    ]

    const CSS = `
.stk-actions{display:inline-flex;align-items:center;gap:2px;margin:0 2px}
.stk-icon{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);opacity:.85;cursor:pointer;transition:background .12s ease,color .12s ease,opacity .12s ease}
.stk-icon:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);opacity:1}
.stk-icon:disabled{opacity:.35;cursor:default}
.stk-icon:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.stk-menu{display:flex;align-items:center;gap:8px;width:100%;min-height:32px;padding:0 10px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-state-error-primary);font:inherit;font-size:13px;line-height:20px;text-align:left;cursor:pointer}
.stk-menu:hover{background:var(--dsw-alias-bg-layer-2)}
.stk-menu:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.stk-backdrop{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(16,18,22,.42);pointer-events:auto}
.stk-dialog{width:min(540px,100%);max-height:min(80vh,720px);overflow:auto;border-radius:14px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);box-shadow:0 18px 50px rgba(0,0,0,.28);padding:20px 22px 18px}
.stk-title{margin:0 0 10px;font-size:15px;font-weight:600;line-height:22px}
.stk-text{margin:0 0 10px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}
.stk-warning{margin:0 0 12px;padding:8px 10px;border-radius:8px;font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1)}
.stk-code{font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:12px;color:var(--dsw-alias-label-primary);word-break:break-all}
.stk-textarea{box-sizing:border-box;width:100%;min-height:140px;max-height:40vh;resize:vertical;padding:10px 12px;border-radius:10px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px}
.stk-textarea:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.stk-error{margin:10px 0 0;font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary);word-break:break-word}
.stk-footer{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:16px}
.stk-btn{height:32px;padding:0 14px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;cursor:pointer}
.stk-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}
.stk-btn:disabled{opacity:.55;cursor:default}
.stk-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.stk-btn[data-kind=primary]{background:var(--dsw-alias-brand-primary);border-color:transparent;color:#fff}
.stk-btn[data-kind=danger]{background:var(--dsw-alias-state-error-primary);border-color:transparent;color:#fff}
.stk-toast{position:fixed;left:50%;bottom:32px;transform:translateX(-50%);z-index:2147483001;display:flex;align-items:center;gap:10px;max-width:min(560px,90vw);padding:10px 16px;border-radius:10px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);box-shadow:0 10px 30px rgba(0,0,0,.2);font-size:13px;line-height:20px;pointer-events:auto}
.stk-toast[data-kind=error]{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}
.stk-user-row{display:flex;flex-direction:column;align-items:flex-end;gap:6px;min-width:0}
.stk-user-fallback{padding:10px 16px;border-radius:18px;background:var(--dsw-alias-bg-layer-2);white-space:pre-wrap;word-break:break-word;font:inherit}
.stk-user-actions{display:inline-flex;align-items:center;gap:2px;opacity:0;transition:opacity .12s ease}
.stk-user-row:hover .stk-user-actions,.stk-user-actions:focus-within{opacity:1}
@media (hover:none){.stk-user-actions{opacity:1}}
`

    const zh = {
      'action.regenerate': '重新生成（替换原会话）',
      'action.edit': '编辑提问并重发（替换原会话）',
      'action.deleteTurn': '删除此轮及之后（直接删除）',
      'action.editUser': '编辑我的输入',
      'action.copy': '复制',
      'toast.copied': '已复制',
      'menu.deleteSession': '删除会话…',
      'dialog.deleteSession.title': '删除会话',
      'dialog.deleteSession.body': '将永久删除会话「{title}」在本机的全部记录。',
      'dialog.deleteSession.warning': '会话日志会从磁盘移除，无法恢复；进行中的回答会先被停止。',
      'dialog.edit.title': '编辑提问并重发',
      'dialog.edit.body': '保存后会用新的提问重新生成，并删除原会话；只保留修改后的对话。',
      'dialog.edit.submit': '保存并替换原会话',
      'dialog.deleteTurn.title': '删除此轮及之后',
      'dialog.deleteTurn.body': '确认后会删除该轮及之后的全部对话，并删除原会话；只保留之前的对话。',
      'dialog.deleteTurn.submit': '删除并替换原会话',
      'dialog.deleteTurn.turn': '第 {turn} 轮对话',
      'dialog.regenerate.title': '重新生成',
      'dialog.regenerate.body': '将重新生成这一轮的回答，并删除原会话；只保留重新生成的对话。',
      'dialog.regenerate.submit': '重新生成并替换原会话',
      'common.cancel': '取消',
      'common.delete': '删除',
      'common.close': '关闭',
      'toast.deleted': '会话已删除',
      'error.noSession': '请先打开任意一个会话，再执行这个操作',
      'error.active': '不能删除当前正在查看的会话；请先切换到另一个会话再删除它',
      'error.empty': '提问内容不能为空',
      'error.fork': '无法创建分支：{message}',
      'error.prompt': '分支已创建，但重新发送失败：{message}',
      'error.command': '删除命令执行失败：{message}',
      'error.commandShape': '删除命令返回了意外结果；请重启 DSH 后再试',
      'error.deleteSource': '新对话已创建，但删除原会话失败：{message}',
      'error.unknown': '找不到删除命令，请确认“会话工具箱”插件的 Host 部分已启用',
      'error.generic': '操作失败：{message}',
    }

    const en = {
      'action.regenerate': 'Regenerate (replaces the session)',
      'action.edit': 'Edit prompt and resend (replaces the session)',
      'action.deleteTurn': 'Delete this turn and later ones (delete directly)',
      'action.editUser': 'Edit my input',
      'action.copy': 'Copy',
      'toast.copied': 'Copied',
      'menu.deleteSession': 'Delete session…',
      'dialog.deleteSession.title': 'Delete session',
      'dialog.deleteSession.body': 'Permanently delete every local record of “{title}”.',
      'dialog.deleteSession.warning': 'The session log is removed from disk and cannot be restored; running work is stopped first.',
      'dialog.edit.title': 'Edit prompt and resend',
      'dialog.edit.body': 'Saving asks again with the edited prompt and deletes the original session, keeping only the edited conversation.',
      'dialog.edit.submit': 'Save and replace the session',
      'dialog.deleteTurn.title': 'Delete this turn and later ones',
      'dialog.deleteTurn.body': 'This deletes this turn and everything after it, deletes the original session, and keeps only the earlier conversation.',
      'dialog.deleteTurn.submit': 'Delete and replace the session',
      'dialog.deleteTurn.turn': 'Turn {turn}',
      'dialog.regenerate.title': 'Regenerate',
      'dialog.regenerate.body': 'This regenerates this turn’s answer and deletes the original session, keeping only the regenerated conversation.',
      'dialog.regenerate.submit': 'Regenerate and replace the session',
      'common.cancel': 'Cancel',
      'common.delete': 'Delete',
      'common.close': 'Close',
      'toast.deleted': 'Session deleted',
      'error.noSession': 'Open any session first, then run this action',
      'error.active': 'The session you are viewing cannot delete itself; switch to another session first',
      'error.empty': 'The prompt cannot be empty',
      'error.fork': 'Could not create a branch: {message}',
      'error.prompt': 'The branch was created, but resending failed: {message}',
      'error.command': 'The delete command failed: {message}',
      'error.commandShape': 'The delete command returned an unexpected result; restart DSH and try again',
      'error.deleteSource': 'The new conversation was created, but deleting the original session failed: {message}',
      'error.unknown': 'The delete command is missing; check that the Session Toolkit Host half is enabled',
      'error.generic': 'The action failed: {message}',
    }

    /**
     * Tiny observable store shared by the slot entries of one plugin instance.
     * @returns the store.
     */
    function createStore() {
      let snapshot = { dialog: null, toast: null }
      const listeners = new Set()
      return {
        getSnapshot: () => snapshot,
        subscribe: (listener) => {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
        patch(patch) {
          snapshot = { ...snapshot, ...patch }
          for (const listener of listeners) listener()
        },
      }
    }

    /** Monotonic token for dialogs so the body component resets its local draft. */
    let tokenCounter = 0

    /**
     * Build a stroked 16px icon.
     * @param paths - SVG path data.
     * @param size - rendered px.
     * @returns the SVG element.
     */
    function icon(paths, size) {
      return h(
        'svg',
        {
          viewBox: '0 0 16 16',
          width: size === undefined ? 14 : size,
          height: size === undefined ? 14 : size,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
        },
        paths.map((d, index) => h('path', { key: index, d })),
      )
    }

    const RegenerateIcon = () =>
      icon(['M13.4 6.2A5.5 5.5 0 1 0 13.5 9', 'M13.4 2.6v3.6H9.8'])
    const EditIcon = () => icon(['M10.8 2.9l2.3 2.3', 'M2.9 10.8l-.6 2.9 2.9-.6 7.6-7.6a1.6 1.6 0 0 0-2.3-2.3z'])
    const DeleteIcon = () =>
      icon(['M2.8 4.2h10.4', 'M6 2.6h4', 'M4.1 4.2l.6 8.3a1.1 1.1 0 0 0 1.1 1h4.4a1.1 1.1 0 0 0 1.1-1l.6-8.3', 'M6.7 6.7v4.4', 'M9.3 6.7v4.4'])
    const CopyIcon = () =>
      icon(['M5.6 5.6h6.8a1 1 0 0 1 1 1v6.8a1 1 0 0 1-1 1H5.6a1 1 0 0 1-1-1V6.6a1 1 0 0 1 1-1z', 'M3.6 10.6h-.9a1 1 0 0 1-1-1V2.9a1 1 0 0 1 1-1h6.7a1 1 0 0 1 1 1v.9'])

    /**
     * Concatenate the text blocks of one recorded message.
     * @param content - recorded content blocks.
     * @returns concatenated text.
     */
    function textOf(content) {
      if (!Array.isArray(content)) return ''
      let text = ''
      for (const block of content) {
        if (block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string') {
          text += block.text
        }
      }
      return text
    }

    /**
     * Split one recorded user message into the shape the shipped
     * `conversation.chat.user.content` Factory expects.
     * @param content - recorded content blocks.
     * @returns text, ordered attachments, and extra blocks.
     */
    function prepareUserContent(content) {
      const parts = { text: '', attachments: [], extraBlocks: [] }
      if (!Array.isArray(content)) return parts
      const texts = []
      for (const block of content) {
        if (block === null || typeof block !== 'object') continue
        if (block.type === 'text' && typeof block.text === 'string') {
          texts.push(block.text)
        } else if (block.type === 'image' && block.attachment !== undefined) {
          parts.attachments.push({ type: 'image', image: { attachment: block.attachment } })
        } else if (block.type === 'file' && block.attachment !== undefined) {
          parts.attachments.push({ type: 'file', file: block.attachment })
        } else {
          parts.extraBlocks.push(block)
        }
      }
      parts.text = texts.join('')
      return parts
    }

    /**
     * Fork boundary for one user message: just before its step begins, so the
     * inherited inbox insert and claim splices both stay intact.
     * @param node - user Chat node.
     * @returns boundary seq, or null when it cannot be resolved.
     */
    function userForkBoundary(node) {
      const stepStart = node?.location?.step?.start?.seq
      if (typeof stepStart === 'number' && stepStart > 0) return stepStart - 1
      const seq = node?.seq
      if (typeof seq === 'number' && seq > 0) return seq - 1
      return null
    }

    /**
     * Resolve the completed turn that produced one finalized answer.
     * @param snapshot - live Chat snapshot.
     * @param messageId - durable id of that answer.
     * @returns turn number, fork boundary, prompt text, or null.
     */
    function findTurn(snapshot, messageId) {
      const turns = snapshot?.timeline?.turns
      if (turns === undefined || turns === null || typeof turns.values !== 'function') return null
      for (const turn of turns.values()) {
        if (turn?.status !== 'closed') continue
        const closing = turn.data?.get?.('turn-tail')?.closing
        if (closing === undefined || closing === null) continue
        if (closing.finalNode?.messageId !== messageId) continue
        const keys = snapshot.locations?.getTurn?.(turn.turn) ?? []
        let prompt = ''
        let boundary = null
        for (const key of keys) {
          const node = snapshot.nodes?.get?.(key)
          if (node?.kind !== 'user') continue
          const text = textOf(node.data?.content)
          if (text.trim() === '') continue
          // The durable inbox insert precedes turn/start and its claim removal
          // follows it, so cutting before the step keeps both splices intact
          // while leaving the prompt out of the child's history.
          const stepStart = node.location?.step?.start?.seq
          const cut = typeof stepStart === 'number' ? stepStart : node.seq
          if (typeof cut !== 'number' || cut <= 0) return null
          prompt = text
          boundary = cut - 1
          break
        }
        if (boundary === null) return null
        return { turn: turn.turn, boundary, prompt }
      }
      return null
    }

    /**
     * Normalize an unknown thrown value.
     * @param error - thrown value.
     * @returns a short message.
     */
    function describe(error) {
      return error instanceof Error ? error.message : String(error)
    }

    /** A fresh request id for one submitted prompt. */
    function newRequestId() {
      const cryptoApi = typeof crypto !== 'undefined' ? crypto : undefined
      if (cryptoApi?.randomUUID !== undefined) return cryptoApi.randomUUID()
      return `stk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    }

    /**
     * Client plugin body.
     * @param ctx - client root context.
     */
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'session-toolkit: dictionaries')
      ctx.effect(() => {
        const style = document.createElement('style')
        style.dataset.plugin = 'dsh-session-toolkit'
        style.textContent = CSS
        document.head.appendChild(style)
        return () => style.remove()
      }, 'session-toolkit: styles')

      const t = ctx.locale.bind(NS)
      const store = createStore()

      const closeDialog = () => store.patch({ dialog: null })
      const showToast = (kind, text) => {
        store.patch({ toast: { kind, text, token: `${Date.now()}-${Math.random()}` } })
      }
      const openDialog = (dialog) => {
        tokenCounter += 1
        store.patch({ dialog: { ...dialog, token: tokenCounter, busy: false, error: null } })
      }
      const fail = (error) => {
        showToast('error', t('error.generic', { message: describe(error) }))
      }

      /**
       * Fork before one turn and optionally ask again in the child branch.
       * @param kind - action family.
       * @param job - source Session, fork boundary, and prompt text.
       */
      async function runTurnAction(kind, job) {
        let childId
        try {
          childId = await ctx.sessions.fork({
            sessionId: job.sessionId,
            atSeq: job.boundary,
            increaseTitle: false,
          })
        } catch (error) {
          throw new Error(t('error.fork', { message: describe(error) }))
        }
        if (kind !== 'delete-turn' && job.text !== undefined) {
          try {
            await ctx.remote.session.prompt({
              requestId: newRequestId(),
              sessionId: childId,
              mode: 'queue',
              content: [{ type: 'text', text: job.text }],
            })
          } catch (error) {
            ctx.uiWorkspace.openSession(childId)
            throw new Error(t('error.prompt', { message: describe(error) }))
          }
        }
        ctx.uiWorkspace.openSession(childId)
        await discardSource(job.sessionId)
      }

      /**
       * Delete the source Session once its replacement branch is open. The
       * command runs on the source itself, so the Host defers the artifact
       * removal until its own command lifecycle appends have settled.
       * @param sessionId - Session the replacement replaces.
       */
      async function discardSource(sessionId) {
        let failure
        try {
          const response = await ctx.remote.commands.execute(
            sessionId,
            `/session-toolkit delete ${sessionId}`,
            [],
          )
          if (response === undefined) throw new Error(t('error.unknown'))
          if (!response.ok) throw new Error(`${response.error.code}: ${response.error.message}`)
          const execution = response.value
          if (execution === undefined) throw new Error(t('error.unknown'))
          const result = execution.result
          if (result === undefined) throw new Error(t('error.commandShape'))
          if (result.kind === 'error') throw new Error(result.text)
          return
        } catch (error) {
          failure = error
        }
        // A command that runs inside the Session it deletes can report a late
        // settlement error after the artifact is already gone. Only warn when
        // the Session is still listed once the removal has had time to settle.
        console.warn('session-toolkit: delete source reported an error', failure)
        await new Promise((resolve) => setTimeout(resolve, 600))
        let known = false
        let listed = true
        try {
          const list = ctx.sessions.list
          const snapshot = list !== undefined && typeof list.getSnapshot === 'function' ? list.getSnapshot() : undefined
          if (snapshot !== undefined && snapshot.byId !== undefined) {
            known = true
            listed = snapshot.byId[sessionId] !== undefined
          }
        } catch {
          // A missing list surface keeps the warning rather than hiding a failure.
        }
        if (!known || listed) showToast('error', t('error.deleteSource', { message: describe(failure) }))
      }

      /**
       * Run the Host delete command on an already-open Session.
       * @param dialog - delete dialog state.
       * @returns the Host outcome text.
       */
      async function deleteSession(dialog) {
        if (dialog.runnerId === undefined || dialog.runnerId === null) throw new Error(t('error.noSession'))
        let response
        try {
          response = await ctx.remote.commands.execute(
            dialog.runnerId,
            `/session-toolkit delete ${dialog.sessionId}`,
            [],
          )
        } catch (error) {
          throw new Error(t('error.command', { message: describe(error) }))
        }
        if (response === undefined) throw new Error(t('error.unknown'))
        if (!response.ok) throw new Error(t('error.command', { message: `${response.error.code}: ${response.error.message}` }))
        const execution = response.value
        if (execution === undefined) throw new Error(t('error.unknown'))
        const result = execution.result
        if (result === undefined) throw new Error(t('error.commandShape'))
        if (result.kind === 'error') throw new Error(result.text)
        return result.text === undefined ? t('toast.deleted') : result.text
      }

      /**
       * Apply the active dialog.
       * @param dialog - dialog state, with the edited text when applicable.
       */
      async function submitDialog(dialog) {
        store.patch({ dialog: { ...dialog, busy: true, error: null } })
        try {
          if (dialog.kind === 'delete-session') {
            const text = await deleteSession(dialog)
            closeDialog()
            showToast('success', text)
            return
          }
          if (dialog.kind === 'edit-message') {
            const text = dialog.text === undefined ? '' : dialog.text
            if (text.trim() === '') {
              store.patch({ dialog: { ...dialog, busy: false, error: t('error.empty') } })
              return
            }
            await runTurnAction('edit', { sessionId: dialog.sessionId, boundary: dialog.boundary, text })
            closeDialog()
            return
          }
          if (dialog.kind === 'regenerate') {
            await runTurnAction('regenerate', {
              sessionId: dialog.sessionId,
              boundary: dialog.boundary,
              text: dialog.prompt,
            })
            closeDialog()
            return
          }
          await runTurnAction('delete-turn', { sessionId: dialog.sessionId, boundary: dialog.boundary })
          closeDialog()
        } catch (error) {
          const current = store.getSnapshot().dialog ?? dialog
          store.patch({ dialog: { ...current, busy: false, error: describe(error) } })
        }
      }

      /**
       * User-message renderer: the shipped bubble Factory plus copy and
       * "edit my input" controls on the row.
       * @param props - keyed Chat node renderer props.
       */
      function UserNodeView(props) {
        const node = props.node
        const tr = typeof props.t === 'function' ? props.t : (key) => key
        const data = node === undefined || node === null ? undefined : node.data
        const text = textOf(data?.content)
        const boundary = userForkBoundary(node)
        const sessionId = props.sessionId
        const parts = prepareUserContent(data?.content)
        const referenceLabels = Array.isArray(data?.referenceLabels) ? data.referenceLabels : undefined
        const skillNames = Array.isArray(data?.skillNames) ? data.skillNames : undefined
        const content = referenceLabels === undefined ? parts : { ...parts, referenceLabels }
        const facts = {}
        if (referenceLabels !== undefined) facts.sessionLabels = referenceLabels
        if (skillNames !== undefined) facts.skillNames = skillNames
        const bubble =
          typeof props.renderFactorySlot === 'function'
            ? props.renderFactorySlot('conversation.chat.user.content', {
                content,
                loadImage: props.loadImage,
                facts,
                interactive: true,
              })
            : h('div', { className: 'stk-user-fallback' }, text)
        const editable = sessionId !== undefined && boundary !== null && text.trim() !== ''
        return h(
          'div',
          { className: 'stk-user-row' },
          bubble,
          h(
            'div',
            { className: 'stk-user-actions' },
            h(
              'button',
              {
                type: 'button',
                className: 'stk-icon',
                title: tr('action.copy'),
                'aria-label': tr('action.copy'),
                onClick: () => {
                  const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard
                  if (clipboard !== undefined && clipboard !== null && typeof clipboard.writeText === 'function') {
                    clipboard.writeText(text).then(
                      () => showToast('success', tr('toast.copied')),
                      () => {},
                    )
                  }
                },
              },
              h(CopyIcon),
            ),
            editable
              ? h(
                  'button',
                  {
                    type: 'button',
                    className: 'stk-icon',
                    title: tr('action.editUser'),
                    'aria-label': tr('action.editUser'),
                    onClick: () => {
                      openDialog({ kind: 'edit-message', sessionId, boundary, text })
                    },
                  },
                  h(EditIcon),
                )
              : null,
          ),
        )
      }

      /** One Session-row menu action. */
      function DeleteSessionMenuItem(props) {
        const sessionId = props.sessionId
        const displayTitle = props.displayTitle
        const [, setMenuOpen] = props.useMenuOpenState()
        const runnerId = props.useSessions((state) => {
          const ids = state?.ids ?? []
          for (const id of ids) {
            if ((state.byId?.[id]?.retainedBy?.mainView ?? 0) > 0) return id
          }
          return null
        })
        return h(
          'button',
          {
            type: 'button',
            role: 'menuitem',
            className: 'stk-menu',
            onClick: () => {
              setMenuOpen(false)
              if (runnerId === null) {
                showToast('error', t('error.noSession'))
                return
              }
              if (runnerId === sessionId) {
                showToast('error', t('error.active'))
                return
              }
              openDialog({
                kind: 'delete-session',
                sessionId,
                title: displayTitle === '' ? sessionId : displayTitle,
                runnerId,
              })
            },
          },
          h(DeleteIcon),
          h('span', null, props.t('menu.deleteSession')),
        )
      }

      /** Ordered actions for one finalized answer. */
      function AssistantActions(props) {
        const messageId = props.messageId
        const sessionId = props.sessionId
        const snapshot = props.useChat((state) => state)
        const info = React.useMemo(() => findTurn(snapshot, messageId), [snapshot, messageId])
        if (info === null || sessionId === undefined) return null
        const label = (key) => props.t(key)
        return h(
          'span',
          { className: 'stk-actions' },
          h(
            'button',
            {
              type: 'button',
              className: 'stk-icon',
              title: label('action.regenerate'),
              'aria-label': label('action.regenerate'),
              onClick: () => {
                openDialog({ kind: 'regenerate', sessionId, boundary: info.boundary, prompt: info.prompt, turn: info.turn })
              },
            },
            h(RegenerateIcon),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'stk-icon',
              title: label('action.edit'),
              'aria-label': label('action.edit'),
              onClick: () => {
                openDialog({
                  kind: 'edit-message',
                  sessionId,
                  boundary: info.boundary,
                  text: info.prompt,
                })
              },
            },
            h(EditIcon),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'stk-icon',
              title: label('action.deleteTurn'),
              'aria-label': label('action.deleteTurn'),
              onClick: () => {
                openDialog({ kind: 'delete-turn', sessionId, boundary: info.boundary, turn: info.turn })
              },
            },
            h(DeleteIcon),
          ),
        )
      }

      /** Dialog body; mounted with a per-dialog key so its draft resets. */
      function DialogView(props) {
        const dialog = props.dialog
        const [text, setText] = React.useState(dialog.text === undefined ? '' : dialog.text)
        const busy = dialog.busy === true
        const editing = dialog.kind === 'edit-message'
        let body
        if (dialog.kind === 'delete-session') {
          body = [
            h('p', { key: 'body', className: 'stk-text' }, props.t('dialog.deleteSession.body', { title: dialog.title })),
            h('div', { key: 'id', className: 'stk-text' }, h('span', { className: 'stk-code' }, dialog.sessionId)),
            h('p', { key: 'warn', className: 'stk-warning' }, props.t('dialog.deleteSession.warning')),
          ]
        } else if (dialog.kind === 'edit-message') {
          body = [
            h('p', { key: 'body', className: 'stk-text' }, props.t('dialog.edit.body')),
            h('textarea', {
              key: 'edit',
              className: 'stk-textarea',
              value: text,
              disabled: busy,
              autoFocus: true,
              'aria-label': props.t('action.edit'),
              onChange: (event) => setText(event.target.value),
              onKeyDown: (event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault()
                  submitDialog({ ...dialog, text })
                }
              },
            }),
          ]
        } else if (dialog.kind === 'regenerate') {
          body = [
            h('p', { key: 'body', className: 'stk-text' }, props.t('dialog.regenerate.body')),
            h(
              'div',
              { key: 'turn', className: 'stk-text' },
              h('span', { className: 'stk-code' }, props.t('dialog.deleteTurn.turn', { turn: dialog.turn })),
            ),
          ]
        } else {
          body = [
            h('p', { key: 'body', className: 'stk-text' }, props.t('dialog.deleteTurn.body')),
            h(
              'div',
              { key: 'turn', className: 'stk-text' },
              h('span', { className: 'stk-code' }, props.t('dialog.deleteTurn.turn', { turn: dialog.turn })),
            ),
          ]
        }
        const title =
          dialog.kind === 'delete-session'
            ? props.t('dialog.deleteSession.title')
            : dialog.kind === 'edit-message'
              ? props.t('dialog.edit.title')
              : dialog.kind === 'regenerate'
                ? props.t('dialog.regenerate.title')
                : props.t('dialog.deleteTurn.title')
        const submitLabel =
          dialog.kind === 'delete-session'
            ? props.t('common.delete')
            : dialog.kind === 'edit-message'
              ? props.t('dialog.edit.submit')
              : dialog.kind === 'regenerate'
                ? props.t('dialog.regenerate.submit')
                : props.t('dialog.deleteTurn.submit')
        return h(
          'div',
          {
            className: 'stk-dialog',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-label': title,
            onClick: (event) => event.stopPropagation(),
          },
          h('h2', { className: 'stk-title' }, title),
          ...body,
          dialog.error === null || dialog.error === undefined
            ? null
            : h('p', { className: 'stk-error', role: 'alert' }, dialog.error),
          h(
            'div',
            { className: 'stk-footer' },
            h(
              'button',
              {
                type: 'button',
                className: 'stk-btn',
                disabled: busy,
                autoFocus: !editing,
                onClick: closeDialog,
              },
              props.t('common.cancel'),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'stk-btn',
                'data-kind': dialog.kind === 'edit-message' ? 'primary' : 'danger',
                disabled: busy,
                onClick: () => submitDialog(editing ? { ...dialog, text } : dialog),
              },
              busy ? '…' : submitLabel,
            ),
          ),
        )
      }

      /** Overlay host for dialogs and toasts. */
      function Overlay(props) {
        const state = React.useSyncExternalStore(store.subscribe, store.getSnapshot)
        const dialog = state.dialog
        const toast = state.toast

        React.useEffect(() => {
          if (dialog === null || dialog === undefined) return undefined
          const onKey = (event) => {
            if (event.key === 'Escape' && dialog.busy !== true) closeDialog()
          }
          window.addEventListener('keydown', onKey)
          return () => window.removeEventListener('keydown', onKey)
        }, [dialog])

        React.useEffect(() => {
          if (toast === null || toast === undefined) return undefined
          const timer = window.setTimeout(() => store.patch({ toast: null }), 4200)
          return () => window.clearTimeout(timer)
        }, [toast])

        const dialogEl =
          dialog === null || dialog === undefined
            ? null
            : h(
                'div',
                {
                  className: 'stk-backdrop',
                  onMouseDown: (event) => {
                    if (event.target === event.currentTarget && dialog.busy !== true) closeDialog()
                  },
                },
                h(DialogView, { key: dialog.token, dialog, t: props.t }),
              )
        const toastEl =
          toast === null || toast === undefined
            ? null
            : h(
                'div',
                { className: 'stk-toast', 'data-kind': toast.kind, role: 'status' },
                h('span', null, toast.text),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'stk-icon',
                    'aria-label': props.t('common.close'),
                    title: props.t('common.close'),
                    onClick: () => store.patch({ toast: null }),
                  },
                  icon(['M4 4l8 8', 'M12 4l-8 8'], 12),
                ),
              )
        if (dialogEl === null && toastEl === null) return null
        return h(React.Fragment, null, dialogEl, toastEl)
      }

      ctx.slots.inject('sidebar.workspaces.session.menu.item', () =>
        ctx.slots.register(
          {
            name: 'sidebar.workspaces.session.menu.item',
            id: 'session-toolkit-delete',
            order: 410,
            locale: NS,
          },
          DeleteSessionMenuItem,
        ),
      )

      ctx.slots.inject('conversation.chat.assistant-actions', () =>
        ctx.slots.register(
          {
            name: 'conversation.chat.assistant-actions',
            id: 'session-toolkit-actions',
            order: 20,
            locale: NS,
            inject: (sessionId) => ({ sessionId }),
          },
          AssistantActions,
        ),
      )

      ctx.slots.inject('conversation.chat.node', () =>
        ctx.slots.register(
          {
            name: 'conversation.chat.node',
            key: 'user',
            locale: NS,
          },
          UserNodeView,
        ),
      )

      ctx.slots.inject('shell.overlay', () =>
        ctx.slots.register(
          {
            name: 'shell.overlay',
            id: 'session-toolkit-dialog',
            order: 60,
            locale: NS,
          },
          Overlay,
        ),
      )
    }

    return { inject, apply }
  },
})
