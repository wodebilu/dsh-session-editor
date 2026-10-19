// Offline smoke test for the Session Toolkit host half. Run: node test/host-smoke.mjs
import { mkdtemp, mkdir, writeFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from '../index.js'

const root = await mkdtemp(join(tmpdir(), 'stk-host-'))

const makeContext = (header) => {
  const events = []
  const archived = []
  const context = {
    commands: { register: (definition) => { context.definition = definition } },
    agents: { get: () => undefined },
    workspaceRegistry: { archiveSession: async (id, options) => { archived.push([id, options]) } },
    sessionPersistence: {
      stat: async () => (header === undefined ? undefined : { header }),
      locate: (value) => ({ path: join(root, value.id, 'session.v4.jsonl.zstd') }),
      flush: async () => {},
    },
    emit: (name, id) => events.push([name, id]),
    events,
    archived,
  }
  return context
}

const materialize = async (id) => {
  const directory = join(root, id)
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'session.v4.jsonl.zstd'), 'stub')
  return directory
}

// 1. A fork child (parentSession, no origin) is a normal session: deleted at once.
const childDir = await materialize('session-fork-child')
const child = makeContext({ id: 'session-fork-child', cwd: 'F:\\demo', parentSession: 'session-parent' })
apply(child)
const childResult = await child.definition.handler({ agent: { id: 'session-other' }, rawInput: 'delete session-fork-child' })
if (childResult.kind !== 'success') throw new Error(`fork child refused: ${JSON.stringify(childResult)}`)
if (await readdir(childDir).then(() => true, () => false)) throw new Error('fork child directory survived')

// 2. A true subagent session stays refused.
const sub = makeContext({ id: 'session-sub', cwd: 'F:\\demo', parentSession: 'session-parent', origin: 'subagent' })
apply(sub)
const subResult = await sub.definition.handler({ agent: { id: 'session-other' }, rawInput: 'delete session-sub' })
if (subResult.kind !== 'error' || !subResult.text.includes('子代理')) throw new Error('subagent not refused')

// 3. Self-deletion defers the artifact removal past the command lifecycle appends.
const selfDir = await materialize('session-self')
const self = makeContext({ id: 'session-self', cwd: 'F:\\demo' })
apply(self)
const fakeSession = { seq: 10 }
const selfResult = await self.definition.handler({ agent: { id: 'session-self', session: fakeSession }, rawInput: 'delete session-self' })
if (selfResult.kind !== 'success' || !selfResult.text.includes('正在删除')) throw new Error(`self delete: ${JSON.stringify(selfResult)}`)
// Simulate the command plane appending `command/done` right after the handler settles.
setTimeout(() => { fakeSession.seq += 1 }, 15)
await new Promise((resolve) => setTimeout(resolve, 400))
if (await readdir(selfDir).then(() => true, () => false)) throw new Error('self directory survived the deferred delete')
if (!self.events.some(([name, value]) => name === 'api-session/removed' && value === 'session-self')) throw new Error('self removal not announced')

await rm(root, { recursive: true, force: true })
console.log('direct-delete host OK')
