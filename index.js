/**
 * Session Toolkit — Host half.
 *
 * Owns the one operation that cannot be done from the browser: physically
 * removing a Session's durable artifact from the JSONL persistence root.
 * The Chat actions (regenerate / edit-and-resend / drop-turn) are implemented
 * by the Client half on top of supported fork + prompt APIs and need no Host
 * code here.
 */
import { rm } from 'node:fs/promises'
import { basename, dirname } from 'node:path'

/** Host services this plugin cannot work without. */
export const inject = ['commands', 'agents', 'sessionPersistence', 'workspaceRegistry']

const USAGE = '用法：/session-toolkit delete <sessionId>'

/**
 * Register the `session-toolkit` human command.
 * @param ctx - owning plugin context.
 */
export function apply(ctx) {
  ctx.commands.register({
    name: 'session-toolkit',
    description: '会话工具箱：删除指定会话的本地记录',
    input: { hint: 'delete <sessionId>' },
    handler: async ({ agent, rawInput }) => {
      const parts = rawInput.trim().split(/\s+/)
      const action = parts[0]
      const sessionId = parts[1]
      if (action !== 'delete' || sessionId === undefined || sessionId === '') {
        return { kind: 'error', text: USAGE }
      }
      try {
        return { kind: 'success', text: await deleteSession(ctx, agent, sessionId) }
      } catch (error) {
        return { kind: 'error', text: `删除会话失败：${describe(error)}` }
      }
    },
  })
}

/**
 * Physically delete one Session: gate it against further work, remove its
 * artifact directory, and tell connected Clients that the row is gone.
 * @param ctx - owning plugin context.
 * @param agent - the Agent that ran the command, when the command plane supplied one.
 * @param sessionId - Session to delete.
 * @returns human-readable outcome.
 */
async function deleteSession(ctx, agent, sessionId) {
  const self = agent !== undefined && agent.id === sessionId

  const persistence = ctx.sessionPersistence
  const snapshot = await persistence.stat(sessionId)
  if (snapshot === undefined) {
    ctx.emit('api-session/removed', sessionId)
    return `会话 ${sessionId} 的记录已不存在，已从列表移除`
  }
  if (snapshot.header?.origin === 'subagent') {
    throw new Error('这是子代理会话；请通过它的父会话处理')
  }

  // Gate the Session first: archiving stops a running turn and blocks any
  // later step, so a live Agent cannot quietly write the log back.
  const live = ctx.agents.get(sessionId)
  try {
    await ctx.workspaceRegistry.archiveSession(
      sessionId,
      live?.status === 'running' ? { stopActivity: true } : undefined,
    )
  } catch {
    // Not a Workspace member, or already archived: deletion is still valid.
  }
  if (live !== undefined && live.status === 'running') {
    // Archive admission may not cover a Session outside every Workspace.
    try {
      live.cancel({ kind: 'user' })
    } catch {
      // Cancellation is best-effort; the archived gate still blocks new turns.
    }
    await Promise.race([
      live.whenIdle().catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ])
  }

  const location = typeof persistence.locate === 'function' ? persistence.locate(snapshot.header) : undefined
  const artifact = location?.path
  if (typeof artifact !== 'string' || artifact === '') throw new Error('无法定位该会话的存储位置')
  const directory = dirname(artifact)
  const name = basename(directory)
  if (name === '' || name === '.' || name === '..' || !/^[A-Za-z0-9._~-]+$/.test(name)) {
    throw new Error(`拒绝删除可疑路径：${directory}`)
  }

  const description = `会话 ${sessionId}${snapshot.header?.cwd === undefined ? '' : `（${snapshot.header.cwd}）`}`
  if (self) {
    // This command runs inside the Session it deletes. The command plane
    // appends `command/done` after the handler settles; wait for that exact
    // append and its durability barrier instead of guessing a fixed delay.
    const session = agent.session
    const seqBefore = session.seq
    const finalize = async () => {
      const deadline = Date.now() + 5000
      while (session.seq <= seqBefore && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 20))
      }
      try {
        await ctx.sessionPersistence.flush()
      } catch {
        // A failed flush is reported elsewhere; removal still proceeds.
      }
      await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 80 })
      ctx.emit('api-session/removed', sessionId)
    }
    setTimeout(() => {
      finalize().catch((error) => console.warn(`session-toolkit: deferred delete failed for ${sessionId}`, error))
    }, 0)
    return `${description} 正在删除`
  }

  await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 80 })
  ctx.emit('api-session/removed', sessionId)
  return `已删除${description}`
}

/**
 * Normalize an unknown thrown value for command output.
 * @param error - thrown value.
 * @returns a short message.
 */
function describe(error) {
  if (error instanceof Error) return error.message
  return String(error)
}
