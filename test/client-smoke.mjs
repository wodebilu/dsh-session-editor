// Scratch harness for the direct-edit client flow.
import { readFileSync } from 'node:fs'

const stubReact = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  Fragment: Symbol('Fragment'),
  useState: (value) => [value, () => {}],
  useMemo: (fn) => fn(),
  useEffect: () => {},
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
}

let definition
globalThis.window = {
  __ModuleLoader__: { load: (value) => { definition = value } },
  addEventListener: () => {},
  removeEventListener: () => {},
  setTimeout: () => 0,
  clearTimeout: () => {},
}
globalThis.document = {
  createElement: () => ({ dataset: {}, remove() {}, textContent: '' }),
  head: { appendChild: () => {} },
}
const cryptoStub = { randomUUID: () => '00000000-0000-4000-8000-000000000000' }

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
new Function('window', 'document', 'crypto', source)(globalThis.window, globalThis.document, cryptoStub)
const loaded = definition.factory((name) => {
  if (name === 'react') return stubReact
  throw new Error(`unexpected require ${name}`)
})

const registrations = []
const calls = []
const ctx = {
  effect: (callback) => callback(),
  locale: {
    register: () => () => {},
    bind: () => (key, params) => `${key}${params === undefined ? '' : JSON.stringify(params)}`,
  },
  slots: {
    inject: (key, callback) => callback(),
    register: (options, component) => { registrations.push({ options, component }); return () => {} },
  },
  sessions: { fork: async (options) => { calls.push(['fork', options]); return 'session-child' } },
  remote: {
    session: { prompt: async (request) => { calls.push(['prompt', request]); return {} } },
    commands: { execute: async (...args) => { calls.push(['execute', args]); return { ok: true, value: { result: { kind: 'success', text: 'ok' } } } } },
  },
  uiWorkspace: { openSession: (id) => calls.push(['open', id]) },
}
loaded.apply(ctx)

const byId = (id) => registrations.find((entry) => entry.options.id === id)
const t = (key, params) => `${key}${params === undefined ? '' : JSON.stringify(params)}`
const snapshot = {
  timeline: {
    turns: new Map([[1, {
      turn: 1,
      status: 'closed',
      start: { seq: 5 },
      data: new Map([['turn-tail', { closing: { finalNode: { messageId: 'm1', seq: 9 } } }]]),
    }]]),
  },
  locations: { getTurn: () => ['n1'] },
  nodes: new Map([['n1', { kind: 'user', seq: 6, location: { kind: 'step', step: { start: { seq: 4 } }, turn: { start: { seq: 5 } } }, data: { content: [{ type: 'text', text: 'hello' }] } }]]),
}

const actions = byId('session-toolkit-actions').component
const actionEl = actions({ messageId: 'm1', sessionId: 'session-parent', useChat: (selector) => selector(snapshot), t })
const buttons = actionEl.children.filter((child) => child !== null && child.type === 'button')
if (buttons.length !== 3) throw new Error(`expected 3 actions, got ${buttons.length}`)

buttons[0].props.onClick()
const overlay = byId('session-toolkit-dialog').component
const overlayEl = overlay({ t })
if (overlayEl === null) throw new Error('regenerate dialog did not open')

const backdrop = overlayEl.children[0]
const dialogView = backdrop.children[0]
const dialogContent = dialogView.type(dialogView.props)
const footer = dialogContent.children.find((child) => child && child.props && child.props.className === 'stk-footer')
const submit = footer.children[1]
submit.props.onClick()

await new Promise((resolve) => setImmediate(resolve))

const fork = calls.find(([kind]) => kind === 'fork')
if (!fork || fork[1].atSeq !== 3 || fork[1].increaseTitle !== false) throw new Error('fork was not direct/title-preserving')
const prompt = calls.find(([kind]) => kind === 'prompt')
if (!prompt || prompt[1].content[0].text !== 'hello') throw new Error('prompt was not resent')
const open = calls.find(([kind]) => kind === 'open')
if (!open || open[1] !== 'session-child') throw new Error('child was not opened')
const discard = calls.find(([kind, args]) => kind === 'execute' && args[1] === '/session-toolkit delete session-parent')
if (!discard) throw new Error('source session was not deleted')

console.log('direct-edit flow OK')

// User-message renderer: shipped bubble Factory plus copy/edit actions.
const userReg = registrations.find((entry) => entry.options.name === 'conversation.chat.node' && entry.options.key === 'user')
if (!userReg) throw new Error('user node renderer not registered')
let factoryCall
const userEl = userReg.component({
  node: {
    data: { content: [{ type: 'text', text: 'hello' }], time: 1 },
    location: { step: { start: { seq: 4 } } },
    seq: 6,
  },
  sessionId: 'session-parent',
  t,
  renderFactorySlot: (name, props) => {
    factoryCall = { name, props }
    return { type: 'div', props: {}, children: [] }
  },
})
if (!factoryCall || factoryCall.name !== 'conversation.chat.user.content') throw new Error('user bubble factory was not used')
if (factoryCall.props.content.text !== 'hello' || factoryCall.props.interactive !== true) throw new Error('user bubble content mismatch')
const userButtons = userEl.children[1].children.filter(Boolean)
if (userButtons.length !== 2) throw new Error(`expected copy and edit, got ${userButtons.length}`)
userButtons[1].props.onClick()
const editOverlay = overlay({ t })
if (editOverlay === null) throw new Error('user edit dialog did not open')
const editView = editOverlay.children[0].children[0]
if (editView.props.dialog.kind !== 'edit-message' || editView.props.dialog.boundary !== 3 || editView.props.dialog.text !== 'hello') {
  throw new Error('user edit dialog carried the wrong payload')
}
console.log('user-message edit OK')
