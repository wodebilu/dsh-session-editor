/**
 * Session Editor — browser half.
 *
 * Three entry points:
 *  - a Session-row menu action that permanently deletes that Session through
 *    the Host command (no trash; archiving is the undoable alternative);
 *  - per-answer actions that regenerate, edit the prompt, or drop the turn by
 *    forking the Session before it and reopening the child;
 *  - one overlay that owns the confirmation/edit dialogs and the result toast.
 */
window.__ModuleLoader__.load({
  id: 'dsh-session-editor',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'sessionEditor'
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
.sed-actions{display:inline-flex;align-items:center;gap:2px;margin:0 2px}
.sed-icon{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);opacity:.85;cursor:pointer;transition:background .12s ease,color .12s ease,opacity .12s ease}
.sed-icon:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);opacity:1}
.sed-icon:disabled{opacity:.35;cursor:default}
.sed-icon:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.sed-menu{display:flex;align-items:center;gap:8px;width:100%;min-height:32px;padding:0 10px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-state-error-primary);font:inherit;font-size:13px;line-height:20px;text-align:left;cursor:pointer}
.sed-menu:hover{background:var(--dsw-alias-bg-layer-2)}
.sed-menu:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.sed-backdrop{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(16,18,22,.42);pointer-events:auto}
.sed-dialog{width:min(540px,100%);max-height:min(80vh,720px);overflow:auto;border-radius:14px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);box-shadow:0 18px 50px rgba(0,0,0,.28);padding:20px 22px 18px}
.sed-title{margin:0 0 10px;font-size:15px;font-weight:600;line-height:22px}
.sed-text{margin:0 0 10px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}
.sed-warning{margin:0 0 12px;padding:8px 10px;border-radius:8px;font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1)}
.sed-code{font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:12px;color:var(--dsw-alias-label-primary);word-break:break-all}
.sed-textarea{box-sizing:border-box;width:100%;min-height:140px;max-height:40vh;resize:vertical;padding:10px 12px;border-radius:10px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px}
.sed-textarea:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.sed-error{margin:10px 0 0;font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary);word-break:break-word}
.sed-ack{display:flex;align-items:flex-start;gap:8px;margin:12px 0 0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary);cursor:pointer;user-select:none}
.sed-ack input{margin:3px 0 0;accent-color:var(--dsw-alias-state-error-primary);cursor:pointer}
.sed-ack input:disabled{cursor:default}
.sed-footer{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:16px}
.sed-btn{height:32px;padding:0 14px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;cursor:pointer}
.sed-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}
.sed-btn:disabled{opacity:.55;cursor:default}
.sed-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.sed-btn[data-kind=primary]{background:var(--dsw-alias-brand-primary);border-color:transparent;color:#fff}
.sed-btn[data-kind=danger]{background:var(--dsw-alias-state-error-primary);border-color:transparent;color:#fff}
.sed-toast{position:fixed;left:50%;bottom:32px;transform:translateX(-50%);z-index:2147483001;display:flex;align-items:center;gap:10px;max-width:min(560px,90vw);padding:10px 16px;border-radius:10px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);box-shadow:0 10px 30px rgba(0,0,0,.2);font-size:13px;line-height:20px;pointer-events:auto}
.sed-toast[data-kind=error]{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}
.sed-user-row{display:flex;flex-direction:column;align-items:flex-end;gap:6px;min-width:0}
.sed-user-fallback{padding:10px 16px;border-radius:18px;background:var(--dsw-alias-bg-layer-2);white-space:pre-wrap;word-break:break-word;font:inherit}
.sed-user-actions{display:inline-flex;align-items:center;gap:2px;opacity:0;transition:opacity .12s ease}
.sed-user-row:hover .sed-user-actions,.sed-user-actions:focus-within{opacity:1}
@media (hover:none){.sed-user-actions{opacity:1}}
`

    const zh = {
      'action.regenerate': '重新生成（替换原会话）',
      'action.edit': '编辑提问并重发（替换原会话）',
      'action.deleteTurn': '删除此轮及之后（替换原会话）',
      'action.editUser': '编辑我的输入',
      'action.copy': '复制',
      'toast.copied': '已复制',
      'menu.deleteSession': '永久删除会话…',
      'dialog.deleteSession.title': '永久删除会话',
      'dialog.deleteSession.body': '将永久删除会话「{title}」在本机的全部记录，此操作不可恢复。',
      'dialog.deleteSession.warning': '会话日志会从磁盘直接移除，没有回收站。进行中的回答会先被停止。',
      'dialog.deleteSession.advice': '如果只是想让这个会话从列表里消失，请先取消，改用会话行「…」菜单里的「归档」：归档只把会话移出列表，数据仍然保留，可以随时恢复。',
      'dialog.deleteSession.ack': '我已了解，删除后无法恢复',
      'dialog.edit.title': '编辑提问并重发',
      'dialog.edit.body': '保存后会用新的提问重新生成，原会话将被永久删除；只保留修改后的对话。',
      'dialog.edit.attachments': '这条消息带 {count} 个附件。重发只会带上文字，附件不会跟随。',
      'dialog.edit.attachmentsAck': '我知道附件会丢失，仍然重发',
      'dialog.edit.submit': '保存并替换原会话',
      'dialog.deleteTurn.title': '删除此轮及之后',
      'dialog.deleteTurn.body': '确认后会删除该轮及之后的全部对话，原会话将被永久删除；只保留之前的对话。',
      'dialog.deleteTurn.submit': '删除并替换原会话',
      'dialog.deleteTurn.turn': '第 {turn} 轮对话',
      'dialog.regenerate.title': '重新生成',
      'dialog.regenerate.body': '将重新生成这一轮的回答，原会话将被永久删除；只保留重新生成的对话。',
      'dialog.regenerate.submit': '重新生成并替换原会话',
      'common.cancel': '取消',
      'common.delete': '删除',
      'common.close': '关闭',
      'common.working': '处理中…',
      'toast.deleted': '会话已删除',
      'error.noSession': '请先打开任意一个会话，再执行这个操作',
      'error.active': '不能删除当前正在查看的会话；请先切换到另一个会话再删除它',
      'error.empty': '提问内容不能为空',
      'error.fork': '无法创建分支：{message}',
      'error.prompt': '分支已创建，但重新发送失败：{message}',
      'error.command': '删除命令执行失败：{message}',
      'error.commandShape': '删除命令返回了意外结果；请重启 DSH 后再试',
      'error.deleteSource': '新对话已创建，但删除原会话失败：{message}',
      'error.unknown': '找不到删除命令，请确认“会话编辑器”插件的 Host 部分已启用',
      'error.generic': '操作失败：{message}',
    }

    const en = {
      'action.regenerate': 'Regenerate (replaces the session)',
      'action.edit': 'Edit prompt and resend (replaces the session)',
      'action.deleteTurn': 'Delete this turn and later ones (replaces the session)',
      'action.editUser': 'Edit my input',
      'action.copy': 'Copy',
      'toast.copied': 'Copied',
      'menu.deleteSession': 'Delete session permanently…',
      'dialog.deleteSession.title': 'Permanently delete session',
      'dialog.deleteSession.body': 'Permanently delete every local record of “{title}”. This cannot be undone.',
      'dialog.deleteSession.warning': 'The session log is removed from disk directly; there is no trash. Running work is stopped first.',
      'dialog.deleteSession.advice': 'If you only want this conversation gone from the sidebar, cancel and use “Archive” in the session row “…” menu instead: archiving hides the session but keeps its data, and it can be restored at any time.',
      'dialog.deleteSession.ack': 'I understand this cannot be undone',
      'dialog.edit.title': 'Edit prompt and resend',
      'dialog.edit.body': 'Saving asks again with the edited prompt and permanently deletes the original session, keeping only the edited conversation.',
      'dialog.edit.attachments': 'This message carries {count} attachment(s). Resending keeps the text only; the attachments are dropped.',
      'dialog.edit.attachmentsAck': 'I know the attachments will be lost — resend anyway',
      'dialog.edit.submit': 'Save and replace the session',
      'dialog.deleteTurn.title': 'Delete this turn and later ones',
      'dialog.deleteTurn.body': 'This deletes this turn and everything after it, permanently deletes the original session, and keeps only the earlier conversation.',
      'dialog.deleteTurn.submit': 'Delete and replace the session',
      'dialog.deleteTurn.turn': 'Turn {turn}',
      'dialog.regenerate.title': 'Regenerate',
      'dialog.regenerate.body': 'This regenerates this turn’s answer and permanently deletes the original session, keeping only the regenerated conversation.',
      'dialog.regenerate.submit': 'Regenerate and replace the session',
      'common.cancel': 'Cancel',
      'common.delete': 'Delete',
      'common.close': 'Close',
      'common.working': 'Working…',
      'toast.deleted': 'Session deleted',
      'error.noSession': 'Open any session first, then run this action',
      'error.active': 'The session you are viewing cannot delete itself; switch to another session first',
      'error.empty': 'The prompt cannot be empty',
      'error.fork': 'Could not create a branch: {message}',
      'error.prompt': 'The branch was created, but resending failed: {message}',
      'error.command': 'The delete command failed: {message}',
      'error.commandShape': 'The delete command returned an unexpected result; restart DSH and try again',
      'error.deleteSource': 'The new conversation was created, but deleting the original session failed: {message}',
      'error.unknown': 'The delete command is missing; check that the Session Editor Host half is enabled',
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
    const EditIcon = () =>
      icon(['M10.8 2.9l2.3 2.3', 'M2.9 10.8l-.6 2.9 2.9-.6 7.6-7.6a1.6 1.6 0 0 0-2.3-2.3z'])
    const DeleteIcon = () =>
      icon([
        'M2.8 4.2h10.4',
        'M6 2.6h4',
        'M4.1 4.2l.6 8.3a1.1 1.1 0 0 0 1.1 1h4.4a1.1 1.1 0 0 0 1.1-1l.6-8.3',
        'M6.7 6.7v4.4',
        'M9.3 6.7v4.4',
      ])
    const CopyIcon = () =>
      icon([
        'M5.6 5.6h6.8a1 1 0 0 1 1 1v6.8a1 1 0 0 1-1 1H5.6a1 1 0 0 1-1-1V6.6a1 1 0 0 1 1-1z',
        'M3.6 10.6h-.9a1 1 0 0 1-1-1V2.9a1 1 0 0 1 1-1h6.7a1 1 0 0 1 1 1v.9',
      ])

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
      return `sed-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    }

    /**
     * Client plugin body.
     * @param ctx - client root context.
     */
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'session-editor: dictionaries')
      ctx.effect(() => {
        const style = document.createElement('style')
        style.dataset.plugin = 'dsh-session-editor'
        style.textContent = CSS
        document.head.appendChild(style)
        return () => style.remove()
      }, 'session-editor: styles')

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
       * move until its own command lifecycle appends have settled.
       * @param sessionId - Session the replacement replaces.
       */
      async function discardSource(sessionId) {
        let failure
        try {
          const response = await ctx.remote.commands.execute(
            sessionId,
            `/session-editor delete ${sessionId} --confirm`,
            [],
          )
          if (response === undefined) throw new Error(t('error.unknown'))
          if (!response.ok) throw new Error(`${response.error.code}: ${response.error.message}`)
          const execution = response.value
          if (execution === undefined) throw new Error(t('error.unknown'))
          const result = execution.result
          if (result === undefined) throw new Error(t('error.commandShape'))
          if (result.kind === 'error') throw new Error(result.text)
          showToast('success', result.text === undefined ? t('toast.deleted') : result.text)
          return
        } catch (error) {
          failure = error
        }
        // A command that runs inside the Session it deletes can report a late
        // settlement error after the artifact is already gone. Only warn when
        // the Session is still listed once the removal has had time to settle.
        console.warn('session-editor: delete source reported an error', failure)
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 600))
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
            `/session-editor delete ${dialog.sessionId} --confirm`,
            [],
          )
        } catch (error) {
          throw new Error(t('error.command', { message: describe(error) }))
        }
        if (response === undefined) throw new Error(t('error.unknown'))
        if (!response.ok) {
          throw new Error(t('error.command', { message: `${response.error.code}: ${response.error.message}` }))
        }
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
            : h('div', { className: 'sed-user-fallback' }, text)
        const editable = sessionId !== undefined && boundary !== null && text.trim() !== ''
        return h(
          'div',
          { className: 'sed-user-row' },
          bubble,
          h(
            'div',
            { className: 'sed-user-actions' },
            h(
              'button',
              {
                type: 'button',
                className: 'sed-icon',
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
                    className: 'sed-icon',
                    title: tr('action.editUser'),
                    'aria-label': tr('action.editUser'),
                    onClick: () => {
                      openDialog({ kind: 'edit-message', sessionId, boundary, text, content: data?.content })
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
            className: 'sed-menu',
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
        const turns = snapshot?.timeline?.turns
        const locations = snapshot?.locations
        const nodes = snapshot?.nodes
        const info = React.useMemo(
          () => findTurn(snapshot, messageId),
          [turns, locations, nodes, messageId],
        )
        if (info === null || sessionId === undefined) return null
        const label = (key) => props.t(key)
        return h(
          'span',
          { className: 'sed-actions' },
          h(
            'button',
            {
              type: 'button',
              className: 'sed-icon',
              title: label('action.regenerate'),
              'aria-label': label('action.regenerate'),
              onClick: () => {
                openDialog({
                  kind: 'regenerate',
                  sessionId,
                  boundary: info.boundary,
                  prompt: info.prompt,
                  turn: info.turn,
                })
              },
            },
            h(RegenerateIcon),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'sed-icon',
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
              className: 'sed-icon',
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
        const [acked, setAcked] = React.useState(false)
        const busy = dialog.busy === true
        const editing = dialog.kind === 'edit-message'
        const deleting = dialog.kind === 'delete-session'
        // The prompt endpoint takes text plus freshly uploaded blocks; the
        // recorded attachment ids cannot be replayed through it, so any
        // non-text block would be silently dropped by the resend below.
        const droppedAttachments =
          editing && Array.isArray(dialog.content)
            ? dialog.content.filter((block) => block !== null && typeof block === 'object' && block.type !== 'text')
                .length
            : 0
        const blocked = busy || (deleting && !acked) || (droppedAttachments > 0 && !acked)
        let body
        if (deleting) {
          body = [
            h('p', { key: 'body', className: 'sed-text' }, props.t('dialog.deleteSession.body', { title: dialog.title })),
            h('div', { key: 'id', className: 'sed-text' }, h('span', { className: 'sed-code' }, dialog.sessionId)),
            h('p', { key: 'warn', className: 'sed-warning' }, props.t('dialog.deleteSession.warning')),
            h('p', { key: 'advice', className: 'sed-text' }, props.t('dialog.deleteSession.advice')),
            h(
              'label',
              { key: 'ack', className: 'sed-ack' },
              h('input', {
                type: 'checkbox',
                checked: acked,
                disabled: busy,
                onChange: (event) => setAcked(event.target.checked),
              }),
              h('span', null, props.t('dialog.deleteSession.ack')),
            ),
          ]
        } else if (dialog.kind === 'edit-message') {
          body = [
            h('p', { key: 'body', className: 'sed-text' }, props.t('dialog.edit.body')),
            h('textarea', {
              key: 'edit',
              className: 'sed-textarea',
              value: text,
              disabled: busy,
              autoFocus: true,
              'aria-label': props.t('action.edit'),
              onChange: (event) => setText(event.target.value),
              onKeyDown: (event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault()
                  if (!blocked) submitDialog({ ...dialog, text })
                }
              },
            }),
          ]
          if (droppedAttachments > 0) {
            body.push(
              h(
                'p',
                { key: 'attachments', className: 'sed-warning' },
                props.t('dialog.edit.attachments', { count: droppedAttachments }),
              ),
              h(
                'label',
                { key: 'attachmentsAck', className: 'sed-ack' },
                h('input', {
                  type: 'checkbox',
                  checked: acked,
                  disabled: busy,
                  onChange: (event) => setAcked(event.target.checked),
                }),
                h('span', null, props.t('dialog.edit.attachmentsAck')),
              ),
            )
          }
        } else if (dialog.kind === 'regenerate') {
          body = [
            h('p', { key: 'body', className: 'sed-text' }, props.t('dialog.regenerate.body')),
            h(
              'div',
              { key: 'turn', className: 'sed-text' },
              h('span', { className: 'sed-code' }, props.t('dialog.deleteTurn.turn', { turn: dialog.turn })),
            ),
          ]
        } else {
          body = [
            h('p', { key: 'body', className: 'sed-text' }, props.t('dialog.deleteTurn.body')),
            h(
              'div',
              { key: 'turn', className: 'sed-text' },
              h('span', { className: 'sed-code' }, props.t('dialog.deleteTurn.turn', { turn: dialog.turn })),
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
            className: 'sed-dialog',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-label': title,
            onClick: (event) => event.stopPropagation(),
          },
          h('h2', { className: 'sed-title' }, title),
          ...body,
          dialog.error === null || dialog.error === undefined
            ? null
            : h('p', { className: 'sed-error', role: 'alert' }, dialog.error),
          h(
            'div',
            { className: 'sed-footer' },
            h(
              'button',
              {
                type: 'button',
                className: 'sed-btn',
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
                className: 'sed-btn',
                'data-kind': dialog.kind === 'edit-message' ? 'primary' : 'danger',
                disabled: blocked,
                onClick: () => submitDialog(editing ? { ...dialog, text } : dialog),
              },
              busy ? props.t('common.working') : submitLabel,
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
                  className: 'sed-backdrop',
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
                { className: 'sed-toast', 'data-kind': toast.kind, role: 'status' },
                h('span', null, toast.text),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'sed-icon',
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
            id: 'session-editor-delete',
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
            id: 'session-editor-actions',
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
            id: 'session-editor-dialog',
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
