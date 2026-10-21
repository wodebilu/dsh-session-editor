/**
 * Offline Host tests for Session Editor. They never touch a real session.
 *
 * The fixture deliberately has no `locate()` method: the shipped DSH 0.2.1
 * backend does not have one, and the plugin must work through `listArtifacts()`
 * and the root scan instead.
 */
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { apply, __internals } from '../index.js'

const { deleteArtifact, restoreAfterFailedDelete } = __internals
const TRASH = 'dsh-session-editor-trash'
const LOG = 'session.v4.jsonl.zstd'

/**
 * Build a temp sessions root with one stored session.
 * @param id - Session id.
 * @param project - project directory name.
 * @returns the sessions root and the artifact path.
 */
async function makeStore(id, project = '--F-demo--') {
  const base = await mkdtemp(join(tmpdir(), 'sed-host-'))
  const root = join(base, 'sessions')
  const directory = join(root, project, id)
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, LOG), 'stub')
  return { base, root, directory, path: join(directory, LOG) }
}

/**
 * Build a command context with a fake persistence seam.
 * @param options - fixture values.
 * @returns the context, recorded calls, and the registered definition.
 */
function makeContext(options) {
  const calls = { archived: [], unarchived: [], emitted: [], flushed: 0 }
  const agents = new Map(options.agents ?? [])
  const registry = {
    archiveSession: async (id, archiveOptions) => {
      calls.archived.push([id, archiveOptions])
    },
    unarchiveSession: async (id) => {
      calls.unarchived.push(id)
    },
  }
  const snapshots = options.snapshots ?? []
  const byId = new Map(snapshots.map((snapshot) => [snapshot.header.id, snapshot]))
  const persistence = {
    root: options.root,
    stat: async (id) => byId.get(id),
    list: async () => snapshots,
    flush: async () => {
      calls.flushed += 1
    },
  }
  if (options.artifacts !== undefined) persistence.listArtifacts = async () => options.artifacts
  if (options.locate !== undefined) persistence.locate = options.locate

  const ctx = {
    commands: {
      register: (definition) => {
        ctx.definition = definition
        return () => {}
      },
    },
    agents: { get: (id) => agents.get(id) },
    sessionPersistence: persistence,
    get: (name) => (name === 'workspaceRegistry' ? registry : undefined),
    emit: (event, payload) => calls.emitted.push([event, payload]),
    effect: (callback) => {
      const disposer = callback()
      return typeof disposer === 'function' ? disposer : () => {}
    },
  }
  apply(ctx)
  return { ctx, calls, definition: ctx.definition }
}

/**
 * Run one command through the registered handler.
 * @param definition - registered command definition.
 * @param rawInput - command input.
 * @param agent - invoking Agent.
 * @returns the command result.
 */
function run(definition, rawInput, agent) {
  return definition.handler({ agent, rawInput, attachments: [], commandId: 'cmd', signal: new AbortController().signal })
}

/** Test 1: deletion through `listArtifacts()` (no `locate()`). */
{
  const store = await makeStore('session-a')
  const header = { id: 'session-a', cwd: 'F:\\demo' }
  const { calls, definition } = makeContext({
    root: store.root,
    snapshots: [{ header }],
    artifacts: [{ header, path: store.path }],
  })
  const result = await run(definition, 'delete session-a --confirm', { id: 'session-runner' })
  assert.equal(result.kind, 'success', JSON.stringify(result))
  assert.match(result.text, /永久删除/)
  assert.equal(
    await readdir(store.directory).then(() => true, () => false),
    false,
    'session directory survived',
  )
  // Permanent deletion leaves nothing behind: no trash directory next to the root.
  assert.equal(await stat(join(dirname(store.root), TRASH)).then(() => true, () => false), false)
  assert.deepEqual(calls.emitted, [['api-session/removed', 'session-a']])
  assert.equal(calls.archived.length, 1)
  assert.ok(calls.flushed >= 1)
  await rm(store.base, { recursive: true, force: true })
}

/** Test 2: deletion through the root scan when no backend helper exists. */
{
  const store = await makeStore('session-b')
  const { definition } = makeContext({
    root: store.root,
    snapshots: [{ header: { id: 'session-b', cwd: 'F:\\demo' } }],
  })
  const result = await run(definition, 'delete session-b --confirm', { id: 'session-runner' })
  assert.equal(result.kind, 'success', JSON.stringify(result))
  assert.equal(await stat(store.directory).then(() => true, () => false), false)
  await rm(store.base, { recursive: true, force: true })
}

/** Test 3: a failed lookup must not archive or delete anything. */
{
  const store = await makeStore('session-c')
  const previousHome = process.env.DSH_HOME
  const emptyHome = await mkdtemp(join(tmpdir(), 'sed-home-'))
  process.env.DSH_HOME = emptyHome
  try {
    const { calls, definition } = makeContext({
      root: undefined,
      snapshots: [{ header: { id: 'session-c', cwd: 'F:\\demo' } }],
    })
    const result = await run(definition, 'delete session-c --confirm', { id: 'session-runner' })
    assert.equal(result.kind, 'error')
    assert.match(result.text, /找不到该会话的磁盘目录/)
    assert.equal(calls.archived.length, 0, 'archived before locating')
    assert.equal(await stat(store.directory).then(() => true, () => false), true, 'directory was removed')
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    await rm(store.base, { recursive: true, force: true })
    await rm(emptyHome, { recursive: true, force: true })
  }
}

/** Test 4: a subagent session is deletable like any other stored session. */
{
  const store = await makeStore('session-sub')
  const header = { id: 'session-sub', origin: 'subagent' }
  const { calls, definition } = makeContext({
    root: store.root,
    snapshots: [{ header }],
    artifacts: [{ header, path: store.path }],
  })
  const result = await run(definition, 'delete session-sub --confirm', { id: 'session-runner' })
  assert.equal(result.kind, 'success', JSON.stringify(result))
  assert.equal(await stat(store.directory).then(() => true, () => false), false, 'subagent directory survived')
  assert.equal(calls.archived.length, 1)
  await rm(store.base, { recursive: true, force: true })
}

/** Test 5: a session with subagent children is refused; fork children are fine. */
{
  const store = await makeStore('session-parent')
  const header = { id: 'session-parent' }
  const forkChild = { header: { id: 'session-fork', parentSession: 'session-parent' } }
  const { calls, definition } = makeContext({
    root: store.root,
    snapshots: [{ header }, forkChild, { header: { id: 'session-sub', parentSession: 'session-parent', origin: 'subagent' } }],
    artifacts: [{ header, path: store.path }],
  })
  const result = await run(definition, 'delete session-parent --confirm', { id: 'session-runner' })
  assert.equal(result.kind, 'error')
  assert.match(result.text, /子代理会话引用/)
  assert.equal(calls.archived.length, 0)
  await rm(store.base, { recursive: true, force: true })
}

/** Test 6: deleting the invoking session is deferred until the log settles. */
{
  const store = await makeStore('session-self')
  const live = { id: 'session-self', status: 'idle', session: { seq: 10 } }
  const { calls, definition } = makeContext({
    root: store.root,
    snapshots: [{ header: { id: 'session-self' } }],
    artifacts: [{ header: { id: 'session-self' }, path: store.path }],
    agents: [['session-self', live]],
  })
  const result = await run(definition, 'delete session-self --confirm', { id: 'session-self' })
  assert.equal(result.kind, 'success')
  assert.match(result.text, /正在永久删除/)
  setTimeout(() => {
    live.session.seq += 1
  }, 10)
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 300))
  assert.equal(await stat(store.directory).then(() => true, () => false), false, 'self directory survived')
  assert.deepEqual(calls.emitted, [['api-session/removed', 'session-self']])
  await rm(store.base, { recursive: true, force: true })
}

/** Test 7: a running session is stopped, erased, then archived to hide the row. */
{
  const store = await makeStore('session-running')
  let idleResolved = false
  const live = {
    id: 'session-running',
    status: 'running',
    session: { seq: 3 },
    whenIdle: async () => {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 30))
      idleResolved = true
    },
  }
  const { calls, definition } = makeContext({
    root: store.root,
    snapshots: [{ header: { id: 'session-running' } }],
    artifacts: [{ header: { id: 'session-running' }, path: store.path }],
    agents: [['session-running', live]],
  })
  const result = await run(definition, 'delete session-running --confirm', { id: 'session-runner' })
  assert.equal(result.kind, 'success', JSON.stringify(result))
  assert.equal(idleResolved, true)
  // First archive stops the work; the second one hides the row after the file erase.
  assert.deepEqual(calls.archived, [
    ['session-running', { stopActivity: true }],
    ['session-running', undefined],
  ])
  assert.equal(await stat(store.directory).then(() => true, () => false), false, 'running directory survived')
  await rm(store.base, { recursive: true, force: true })
}

/** Test 8: an ordinary session is erased and then archived exactly once. */
{
  const store = await makeStore('session-order')
  const header = { id: 'session-order' }
  const ctxHolder = makeContext({
    root: store.root,
    snapshots: [{ header }],
    artifacts: [{ header, path: store.path }],
  })
  const result = await run(ctxHolder.definition, 'delete session-order --confirm', { id: 'session-runner' })
  assert.equal(result.kind, 'success', JSON.stringify(result))
  assert.deepEqual(ctxHolder.calls.archived, [['session-order', undefined]])
  assert.equal(await stat(store.directory).then(() => true, () => false), false)
  await rm(store.base, { recursive: true, force: true })
}

/** Test 9: an id that could escape the sessions root is refused. */
{
  const { calls, definition } = makeContext({ root: undefined, snapshots: [] })
  const result = await run(definition, 'delete ..\\..\\evil --confirm', { id: 'session-runner' })
  assert.equal(result.kind, 'error')
  assert.equal(calls.archived.length, 0)
}

/** Test 10: missing usage is reported, not thrown. */
{
  const { definition } = makeContext({ root: undefined, snapshots: [] })
  const result = await run(definition, 'nonsense', { id: 'session-runner' })
  assert.equal(result.kind, 'error')
  assert.match(result.text, /用法/)
}

/** Test 11: a refused deletion leaves the directory intact. */
{
  const store = await makeStore('session-escape')
  const otherBase = await mkdtemp(join(tmpdir(), 'sed-other-'))
  const otherRoot = join(otherBase, 'sessions')
  await mkdir(otherRoot, { recursive: true })
  await assert.rejects(
    deleteArtifact({ path: store.path, root: otherRoot }, 'session-escape'),
    /拒绝删除/,
  )
  assert.equal(await stat(store.directory).then(() => true, () => false), true)
  await rm(store.base, { recursive: true, force: true })
  await rm(otherBase, { recursive: true, force: true })
}

/** Test 12: an unconfirmed command is a no-op — nothing is read, stopped or erased. */
{
  const store = await makeStore('session-unconfirmed')
  const { calls, definition } = makeContext({
    root: store.root,
    snapshots: [{ header: { id: 'session-unconfirmed' } }],
    artifacts: [{ header: { id: 'session-unconfirmed' }, path: store.path }],
  })
  const result = await run(definition, 'delete session-unconfirmed', { id: 'session-runner' })
  assert.equal(result.kind, 'error')
  assert.match(result.text, /--confirm/)
  assert.equal(calls.archived.length, 0, 'archived without confirmation')
  assert.equal(calls.flushed, 0, 'flushed without confirmation')
  assert.equal(await stat(store.directory).then(() => true, () => false), true, 'directory was removed')
  await rm(store.base, { recursive: true, force: true })
}

/** Test 13: a failed erase brings back a row that was archived only to stop the Session. */
{
  const store = await makeStore('session-restore')
  const archived = []
  const ctx = {
    get: (name) =>
      name === 'workspaceRegistry'
        ? {
            unarchiveSession: async (id) => {
              archived.push(id)
            },
          }
        : undefined,
  }
  const artifact = { path: store.path, root: store.root }

  // The log is still on disk: the row must come back.
  await restoreAfterFailedDelete(ctx, 'session-restore', artifact, true)
  assert.deepEqual(archived, ['session-restore'])

  // Nothing was archived to stop it: nothing to restore.
  await restoreAfterFailedDelete(ctx, 'session-restore', artifact, false)
  assert.deepEqual(archived, ['session-restore'])

  // The directory is gone: the Session really was deleted, so its row must stay hidden.
  await rm(store.directory, { recursive: true, force: true })
  await restoreAfterFailedDelete(ctx, 'session-restore', artifact, true)
  assert.deepEqual(archived, ['session-restore'])

  await rm(store.base, { recursive: true, force: true })
}

/** Test 14: the projection cache is part of the conversation and is erased too. */
{
  const store = await makeStore('session-cached')
  // The cache is a sibling of the persistence root: <base>/storages/...
  const cacheDir = join(store.base, 'storages', 'session_projcache', 'sessions')
  await mkdir(cacheDir, { recursive: true })
  const cache = join(cacheDir, 'session-cached.json')
  await writeFile(cache, JSON.stringify({ record: { rows: { turnOutline: { val: { turns: [] } } } } }))
  // A neighbouring session's cache must survive untouched.
  const otherCache = join(cacheDir, 'session-other.json')
  await writeFile(otherCache, '{}')

  const { calls, definition } = makeContext({
    root: store.root,
    snapshots: [{ header: { id: 'session-cached' } }],
    artifacts: [{ header: { id: 'session-cached' }, path: store.path }],
  })
  const result = await run(definition, 'delete session-cached --confirm', { id: 'session-runner' })
  assert.equal(result.kind, 'success', JSON.stringify(result))
  assert.equal(await stat(store.directory).then(() => true, () => false), false, 'log survived')
  assert.equal(await stat(cache).then(() => true, () => false), false, 'projection cache survived')
  assert.equal(await stat(otherCache).then(() => true, () => false), true, 'neighbour cache was removed')
  assert.equal(calls.archived.length, 1)
  await rm(store.base, { recursive: true, force: true })
}

/** Test 15: a library with no projection-cache directory still deletes cleanly. */
{
  const store = await makeStore('session-nocache')
  const { definition } = makeContext({
    root: store.root,
    snapshots: [{ header: { id: 'session-nocache' } }],
    artifacts: [{ header: { id: 'session-nocache' }, path: store.path }],
  })
  const result = await run(definition, 'delete session-nocache --confirm', { id: 'session-runner' })
  assert.equal(result.kind, 'success', JSON.stringify(result))
  assert.equal(await stat(store.directory).then(() => true, () => false), false)
  await rm(store.base, { recursive: true, force: true })
}

console.log('session-editor host tests OK')