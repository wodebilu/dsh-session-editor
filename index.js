/**
 * Session Editor — Host half.
 *
 * Owns the only operation the browser cannot do: removing a Session's durable
 * artifact from the JSONL persistence root. The Chat actions (regenerate /
 * edit-and-resend / drop-turn) are implemented by the Client half on top of the
 * supported fork + prompt APIs.
 *
 * Deletion is permanent and deliberately conservative — there is no trash:
 *  - the artifact path is resolved *before* any state change, through several
 *    independent fallbacks, and refused when it cannot be verified;
 *  - a running Session is archived, stopped, and awaited before its directory
 *    is touched;
 *  - only then is the session directory erased from disk.
 *
 * Users who merely want a conversation out of the sidebar should archive it
 * instead: archiving keeps the data and can be undone.
 *
 * The Host APIs used here are `sessionPersistence` (stat / list / flush and,
 * when present, the backend's `listArtifacts` / `locate` / `root`),
 * `agents.get` (runtime Session state), and `workspaceRegistry.archiveSession`.
 * No third-party runtime dependency is required.
 */

import { lstat, readdir, rm, stat as statFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'

/** Loader entry id used by `cordis.patch.yml`. */
export const name = 'session-editor'

/** Services this plugin cannot work without. */
export const inject = ['commands', 'agents', 'sessionPersistence']

const STOP_WAIT_MS = 15_000
const FINALIZE_WAIT_MS = 5_000
const SEQ_POLL_MS = 25
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,199}$/
const LOG_NAME_PATTERN = /^session(?:\.[0-9a-z]+)?\.jsonl(?:\.zstd)?$/i
const USAGE = '用法：/session-editor delete <sessionId>'

/** Session ids whose deletion is already running in this process. */
const inFlight = new Set()

/** Persistence roots discovered at runtime, reused for later deletions. */
const knownRoots = new Set()

/** A failure with a stable code for tests and diagnostics. */
class ToolkitError extends Error {
  /**
   * @param code - machine-readable reason.
   * @param message - human-readable reason.
   */
  constructor(code, message) {
    super(message)
    this.name = 'ToolkitError'
    this.code = code
  }
}

/**
 * Register the `/session-editor` command.
 * @param ctx - owning plugin context.
 */
export function apply(ctx) {
  ctx.effect(() => {
    try {
      return ctx.commands.register({
        name: 'session-editor',
        description: '会话编辑器：永久删除指定会话的本地记录（不可恢复）',
        input: { hint: 'delete <sessionId>' },
        handler: (invocation) => handleCommand(ctx, invocation),
      })
    } catch (error) {
      console.warn('session-editor: could not register /session-editor', error)
      return () => {}
    }
  }, 'session-editor command')
}

/**
 * Parse and execute one command line.
 * @param ctx - owning plugin context.
 * @param invocation - command invocation supplied by the command plane.
 * @returns a command result; never throws.
 */
async function handleCommand(ctx, invocation) {
  const agent = invocation?.agent
  const raw = typeof invocation?.rawInput === 'string' ? invocation.rawInput.trim() : ''
  const match = /^delete\s+(\S+)\s*$/i.exec(raw)
  if (match === null) return { kind: 'error', text: USAGE }
  const sessionId = match[1]
  if (!ID_PATTERN.test(sessionId)) {
    return { kind: 'error', text: `无效的会话 ID：${sessionId}` }
  }
  if (inFlight.has(sessionId)) {
    return { kind: 'error', text: `会话 ${sessionId} 正在删除，请稍候` }
  }
  inFlight.add(sessionId)
  try {
    const text = await deleteSession(ctx, agent, sessionId)
    return { kind: 'success', text }
  } catch (error) {
    return { kind: 'error', text: `删除会话失败：${describe(error)}` }
  } finally {
    inFlight.delete(sessionId)
  }
}

/**
 * Delete one Session's artifact (or schedule the deferred removal when the
 * command runs inside the Session it deletes).
 * @param ctx - owning plugin context.
 * @param agent - the Agent that ran the command, when the command plane supplied one.
 * @param sessionId - Session to delete.
 * @returns human-readable outcome.
 */
async function deleteSession(ctx, agent, sessionId) {
  const persistence = ctx.sessionPersistence
  let snapshot
  try {
    snapshot = await persistence.stat(sessionId)
  } catch (error) {
    throw new ToolkitError('STAT_FAILED', `无法读取会话信息：${describe(error)}`)
  }
  if (snapshot === undefined || snapshot === null) {
    safeEmit(ctx, 'api-session/removed', sessionId)
    return `会话 ${sessionId} 的记录已不存在`
  }

  const header = snapshot.header ?? {}
  if (header.origin === 'subagent') {
    throw new ToolkitError('SUBAGENT', '这是子代理会话；请通过它的父会话处理')
  }

  const children = await inspectChildren(persistence, sessionId)
  if (children.subagents > 0) {
    throw new ToolkitError(
      'SUBAGENT_CHILDREN',
      `仍有 ${children.subagents} 个子代理会话引用它，请先处理这些子代理`,
    )
  }

  // Resolve first: a failed lookup must leave the Session untouched.
  const artifact = await locateArtifact(persistence, sessionId, header)

  const live = ctx.agents.get(sessionId)
  const running = live !== undefined && live.status === 'running'
  const prepared = await prepareDeletion(ctx, sessionId, live, running)

  const self = agent !== undefined && agent.id === sessionId
  if (self) {
    scheduleSelfFinalize(ctx, { sessionId, artifact, live, prepared })
    return `会话 ${sessionId} 正在永久删除`
  }

  try {
    await finalizeDeletion(ctx, { sessionId, artifact })
  } catch (error) {
    if (prepared.archived) await unarchive(ctx, sessionId)
    throw error
  }
  return `已永久删除会话 ${sessionId}${header.cwd === undefined ? '' : `（${header.cwd}）`}；如只是想让会话从列表消失，下次可使用「归档」`
}

/**
 * Archive and quiesce a Session before its directory is moved.
 * @param ctx - owning plugin context.
 * @param sessionId - Session to stop.
 * @param live - live Agent for that Session, when present.
 * @param running - whether the Agent is currently executing.
 * @returns whether the Session was archived.
 */
async function prepareDeletion(ctx, sessionId, live, running) {
  let archived = false
  const registry = ctx.get('workspaceRegistry')
  if (registry !== undefined && typeof registry.archiveSession === 'function') {
    try {
      await registry.archiveSession(sessionId, running ? { stopActivity: true } : undefined)
      archived = true
    } catch {
      // Not a Workspace member, already archived, or no registry: deletion is still valid.
    }
  }
  if (running) {
    if (!archived && live !== undefined && typeof live.cancel === 'function') {
      try {
        live.cancel({ kind: 'user' })
      } catch {
        // Cancellation is best-effort; the idle wait below is the real gate.
      }
    }
    await waitForIdle(live, STOP_WAIT_MS)
  }
  // Durability barrier: no write handle for this Session should be mid-append.
  try {
    await ctx.sessionPersistence.flush()
  } catch {
    // An unrelated Session's flush failure must not block this deletion.
  }
  return { archived }
}

/**
 * Erase the verified session directory and announce the removal.
 * @param ctx - owning plugin context.
 * @param job - Session id and resolved artifact.
 */
async function finalizeDeletion(ctx, job) {
  await deleteArtifact(job.artifact, job.sessionId)
  safeEmit(ctx, 'api-session/removed', job.sessionId)
}

/**
 * Defer the artifact removal until the command plane has appended
 * `command/done` (the command runs inside the Session it deletes, so an
 * immediate removal would race that append). If the lifecycle never settles,
 * the Session is restored and nothing is deleted.
 * @param ctx - owning plugin context.
 * @param job - deletion job plus the prepared state.
 */
function scheduleSelfFinalize(ctx, job) {
  const seqBefore = typeof job.live?.session?.seq === 'number' ? job.live.session.seq : undefined
  const timer = setTimeout(() => {
    void finalizeSelf().catch((error) => {
      console.warn(`session-editor: deferred delete failed for ${job.sessionId}`, error)
    })
  }, 0)
  if (typeof timer.unref === 'function') timer.unref()
  ctx.effect(() => () => clearTimeout(timer), 'session-editor deferred delete')

  /** Complete the deferred removal. */
  async function finalizeSelf() {
    try {
      if (seqBefore !== undefined) await waitForSeq(job.live, seqBefore, FINALIZE_WAIT_MS)
      else await delay(50)
      try {
        await ctx.sessionPersistence.flush()
      } catch {
        // Best effort; the removal below is what the caller asked for.
      }
      await finalizeDeletion(ctx, job)
    } catch (error) {
      if (job.prepared.archived) await unarchive(ctx, job.sessionId)
      console.warn(`session-editor: could not finish deleting ${job.sessionId}`, error)
    }
  }
}

/**
 * Wait until the command lifecycle advances the Session sequence.
 * @param live - Agent whose Session sequence is observed.
 * @param seqBefore - sequence read before the handler returned.
 * @param timeoutMs - maximum wait.
 * @returns resolution once the sequence advanced.
 */
function waitForSeq(live, seqBefore, timeoutMs) {
  return new Promise((resolvePromise, rejectPromise) => {
    const deadline = Date.now() + timeoutMs
    const poll = () => {
      const seq = live?.session?.seq
      if (typeof seq === 'number' && seq > seqBefore) {
        resolvePromise()
        return
      }
      if (Date.now() >= deadline) {
        rejectPromise(new ToolkitError('FINALIZE_TIMEOUT', '命令生命周期未在预期时间内结束'))
        return
      }
      const timer = setTimeout(poll, SEQ_POLL_MS)
      if (typeof timer.unref === 'function') timer.unref()
    }
    poll()
  })
}

/**
 * Wait for one Agent to become idle.
 * @param live - live Agent.
 * @param timeoutMs - maximum wait.
 * @returns resolution once idle.
 */
function waitForIdle(live, timeoutMs) {
  if (live === undefined || typeof live.whenIdle !== 'function') return Promise.resolve()
  return new Promise((resolvePromise, rejectPromise) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      rejectPromise(
        new ToolkitError(
          'STOP_TIMEOUT',
          `会话仍在运行；已等待 ${Math.round(timeoutMs / 1000)} 秒，未做删除`,
        ),
      )
    }, timeoutMs)
    if (typeof timer.unref === 'function') timer.unref()
    const done = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolvePromise()
    }
    live.whenIdle().then(done, done)
  })
}

/**
 * Restore a Session archived by a failed deletion.
 * @param ctx - owning plugin context.
 * @param sessionId - Session to restore.
 */
async function unarchive(ctx, sessionId) {
  const registry = ctx.get('workspaceRegistry')
  if (registry === undefined || typeof registry.unarchiveSession !== 'function') return
  try {
    await registry.unarchiveSession(sessionId)
  } catch {
    // The Session may already be gone, or not belong to a Workspace.
  }
}

/**
 * Count persisted children that reference this Session.
 * @param persistence - session persistence service.
 * @param sessionId - parent Session.
 * @returns total child count and the subagent subset.
 */
async function inspectChildren(persistence, sessionId) {
  if (typeof persistence.list !== 'function') return { total: 0, subagents: 0 }
  let snapshots
  try {
    snapshots = await persistence.list()
  } catch {
    return { total: 0, subagents: 0 }
  }
  let total = 0
  let subagents = 0
  if (!Array.isArray(snapshots)) return { total, subagents }
  for (const snapshot of snapshots) {
    const header = snapshot?.header
    if (header?.parentSession !== sessionId) continue
    total += 1
    if (header.origin === 'subagent') subagents += 1
  }
  return { total, subagents }
}

/**
 * Resolve the on-disk log of one Session.
 *
 * The public persistence seam deliberately exposes no path. The shipped JSONL
 * backend nevertheless offers three progressively more internal ways to find
 * it; every candidate is verified against the configured layout before use.
 * @param persistence - session persistence service.
 * @param sessionId - Session to locate.
 * @param header - stored Session header.
 * @returns the verified file path and its persistence root.
 */
async function locateArtifact(persistence, sessionId, header) {
  const roots = candidateRoots(persistence)
  const located = await tryLocate(persistence, sessionId, header, roots)
  if (located !== undefined) return located
  const listed = await tryListArtifacts(persistence, sessionId, roots)
  if (listed !== undefined) return listed
  for (const root of roots) {
    const scanned = await scanRoot(root, sessionId)
    if (scanned !== undefined) return scanned
  }
  throw new ToolkitError('LOCATE_FAILED', '找不到该会话的磁盘目录；会话未做任何改动')
}

/**
 * Use a backend-provided `locate(header)`, when the harness has one.
 * @param persistence - session persistence service.
 * @param sessionId - Session to locate.
 * @param header - stored Session header.
 * @param roots - candidate persistence roots.
 * @returns the verified artifact, or undefined.
 */
async function tryLocate(persistence, sessionId, header, roots) {
  if (typeof persistence.locate !== 'function') return undefined
  let value
  try {
    value = persistence.locate(header)
  } catch {
    return undefined
  }
  const path = typeof value === 'string' ? value : value?.path
  return validateArtifactPath(path, sessionId, roots)
}

/**
 * Use the JSONL backend's `listArtifacts()`, which returns every stored log
 * with its validated header.
 * @param persistence - session persistence service.
 * @param sessionId - Session to locate.
 * @param roots - candidate persistence roots.
 * @returns the verified artifact, or undefined.
 */
async function tryListArtifacts(persistence, sessionId, roots) {
  if (typeof persistence.listArtifacts !== 'function') return undefined
  let artifacts
  try {
    artifacts = await persistence.listArtifacts()
  } catch {
    return undefined
  }
  if (!Array.isArray(artifacts)) return undefined
  for (const artifact of artifacts) {
    if (artifact?.header?.id !== sessionId) continue
    const verified = await validateArtifactPath(artifact.path, sessionId, roots)
    if (verified !== undefined) return verified
  }
  return undefined
}

/**
 * Scan every project directory under one persistence root for the Session
 * directory, which is the escaped id itself for every id this plugin accepts.
 * @param root - persistence root.
 * @param sessionId - Session to locate.
 * @returns the verified artifact, or undefined.
 */
async function scanRoot(root, sessionId) {
  const resolvedRoot = resolve(root)
  let projects
  try {
    projects = await readdir(resolvedRoot, { withFileTypes: true })
  } catch {
    return undefined
  }
  let found
  for (const project of projects) {
    if (!project.isDirectory()) continue
    const directory = join(resolvedRoot, project.name, sessionId)
    const logName = await findLogName(directory)
    if (logName === undefined) continue
    if (found !== undefined) {
      throw new ToolkitError(
        'LOCATE_AMBIGUOUS',
        `会话 ${sessionId} 出现在多个工作区目录中；为安全起见未删除`,
      )
    }
    found = await validateArtifactPath(join(directory, logName), sessionId, [resolvedRoot])
  }
  if (found !== undefined) knownRoots.add(resolvedRoot)
  return found
}

/**
 * Verify one candidate log path against the storage layout.
 * @param path - candidate file path.
 * @param sessionId - expected Session id.
 * @param roots - known persistence roots.
 * @returns the verified artifact, or undefined.
 */
async function validateArtifactPath(path, sessionId, roots) {
  if (typeof path !== 'string' || path === '' || !isAbsolute(path)) return undefined
  const info = await statFile(path).catch(() => undefined)
  if (info === undefined || !info.isFile()) return undefined
  const directory = dirname(path)
  const derivedRoot = dirname(dirname(directory))
  const root = roots.find((candidate) => samePath(resolve(candidate), derivedRoot)) ?? derivedRoot
  try {
    await assertSessionDirectory(directory, sessionId, root)
  } catch {
    return undefined
  }
  knownRoots.add(resolve(root))
  return { path, root: resolve(root) }
}

/**
 * Refuse any directory that is not exactly `<root>/<project>/<sessionId>` with
 * a real log file inside.
 * @param directory - session-owned directory.
 * @param sessionId - expected directory name.
 * @param root - expected persistence root.
 */
async function assertSessionDirectory(directory, sessionId, root) {
  const resolvedDirectory = resolve(directory)
  if (basename(resolvedDirectory) !== sessionId) {
    throw new ToolkitError('UNSAFE_PATH', `拒绝删除目录：${resolvedDirectory}`)
  }
  const project = dirname(resolvedDirectory)
  if (!samePath(dirname(project), resolve(root))) {
    throw new ToolkitError('UNSAFE_PATH', `拒绝删除工作区之外的目录：${resolvedDirectory}`)
  }
  const info = await lstat(resolvedDirectory).catch(() => undefined)
  if (info === undefined || !info.isDirectory() || info.isSymbolicLink()) {
    throw new ToolkitError('UNSAFE_PATH', `不是可删除的会话目录：${resolvedDirectory}`)
  }
  if ((await findLogName(resolvedDirectory)) === undefined) {
    throw new ToolkitError('UNSAFE_PATH', `目录中没有会话日志：${resolvedDirectory}`)
  }
}

/**
 * Find a session log file inside one directory.
 * @param directory - candidate directory.
 * @returns the file name, or undefined.
 */
async function findLogName(directory) {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    return undefined
  }
  for (const entry of entries) {
    if (entry.isFile() && LOG_NAME_PATTERN.test(entry.name)) return entry.name
  }
  return undefined
}

/**
 * Permanently erase one verified session directory.
 * @param artifact - verified artifact path and root.
 * @param sessionId - Session being deleted.
 */
async function deleteArtifact(artifact, sessionId) {
  const directory = dirname(artifact.path)
  await assertSessionDirectory(directory, sessionId, artifact.root)
  try {
    await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 80 })
  } catch (error) {
    throw new ToolkitError('DELETE_FAILED', `无法删除会话目录：${describe(error)}`)
  }
  const remaining = await lstat(directory).then(() => true, () => false)
  if (remaining) {
    throw new ToolkitError('DELETE_FAILED', `会话目录仍然存在：${directory}`)
  }
}

/**
 * Candidate persistence roots, most specific first.
 * @param persistence - session persistence service.
 * @returns absolute candidate roots.
 */
function candidateRoots(persistence) {
  const roots = []
  const add = (value) => {
    if (typeof value !== 'string' || value.trim() === '' || !isAbsolute(value)) return
    const resolved = resolve(value)
    if (!roots.some((candidate) => samePath(candidate, resolved))) roots.push(resolved)
  }
  add(persistence?.root)
  add(persistence?.config?.root)
  add(persistence?.storage?.root)
  for (const root of knownRoots) add(root)
  const home =
    typeof process.env.DSH_HOME === 'string' && process.env.DSH_HOME !== ''
      ? process.env.DSH_HOME
      : join(homedir(), '.dsh')
  add(join(home, 'sessions'))
  return roots
}

/**
 * Compare two absolute paths using the host filesystem's case rules.
 * @param left - first path.
 * @param right - second path.
 * @returns whether they name the same location.
 */
function samePath(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false
  return process.platform === 'win32'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right
}

/**
 * Emit a Host event without letting a listener failure break the command.
 * @param ctx - owning plugin context.
 * @param event - event name.
 * @param payload - event payload.
 */
function safeEmit(ctx, event, payload) {
  try {
    ctx.emit(event, payload)
  } catch (error) {
    console.warn(`session-editor: could not emit ${event}`, error)
  }
}

/**
 * Normalize an unknown thrown value for command output.
 * @param error - thrown value.
 * @returns a short message.
 */
function describe(error) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Resolve after a delay.
 * @param ms - delay in milliseconds.
 * @returns resolution after the delay.
 */
function delay(ms) {
  return new Promise((resolvePromise) => {
    const timer = setTimeout(resolvePromise, ms)
    if (typeof timer.unref === 'function') timer.unref()
  })
}

/** Test seam: the pure-ish helpers that decide what may be deleted. */
export const __internals = {
  ToolkitError,
  candidateRoots,
  deleteArtifact,
  deleteSession,
  locateArtifact,
  validateArtifactPath,
}
