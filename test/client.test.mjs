/**
 * Offline Client test for Session Editor. React and the slot/store shapes are
 * stubbed; this proves the wiring and the command payloads, not the browser.
 */
import assert from 'node:assert/strict'
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

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
new Function('window', 'document', source)(globalThis.window, globalThis.document)
const loaded = definition.factory((name) => {
  if (name === 'react') return stubReact
  throw new Error(`unexpected require ${name}`)
})

assert.deepEqual(loaded.inject.slice(0, 3), ['slots', 'locale', 'sessions'])
assert.equal(definition.id, 'dsh-session-editor')

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
    register: (options, component) => {
      registrations.push({ options, component })
      return () => {}
    },
  },
  sessions: {
    fork: async (options) => {
      calls.push(['fork', options])
      return 'session-child'
    },
    list: { getSnapshot: () => ({ byId: {} }) },
  },
  remote: {
    session: {
      prompt: async (request) => {
        calls.push(['prompt', request])
        return {}
      },
    },
    commands: {
      execute: async (...args) => {
        calls.push(['execute', args])
        return { ok: true, value: { result: { kind: 'success', text: 'ok' } } }
      },
    },
  },
  uiWorkspace: {
    openSession: (id) => calls.push(['open', id]),
  },
}
loaded.apply(ctx)

const byId = (id) => registrations.find((entry) => entry.options.id === id)
const t = (key, params) => `${key}${params === undefined ? '' : JSON.stringify(params)}`

const snapshot = {
  timeline: {
    turns: new Map([
      [
        1,
        {
          turn: 1,
          status: 'closed',
          data: new Map([['turn-tail', { closing: { finalNode: { messageId: 'm1', seq: 9 } } }]]),
        },
      ],
    ]),
  },
  locations: { getTurn: () => ['n1'] },
  nodes: new Map([
    [
      'n1',
      {
        kind: 'user',
        seq: 6,
        location: { kind: 'step', step: { start: { seq: 4 } }, turn: { start: { seq: 5 } } },
        data: { content: [{ type: 'text', text: 'hello' }] },
      },
    ],
  ]),
}

/** Assistant actions: three buttons and the replace flow. */
const actions = byId('session-editor-actions').component
const actionEl = actions({ messageId: 'm1', sessionId: 'session-parent', useChat: (selector) => selector(snapshot), t })
const buttons = actionEl.children.filter((child) => child !== null && child.type === 'button')
assert.equal(buttons.length, 3)

buttons[0].props.onClick()
const overlay = byId('session-editor-dialog').component
let overlayEl = overlay({ t })
assert.notEqual(overlayEl, null, 'regenerate dialog did not open')

let backdrop = overlayEl.children[0]
let dialogView = backdrop.children[0]
let dialogContent = dialogView.type(dialogView.props)
let footer = dialogContent.children.find((child) => child && child.props && child.props.className === 'sed-footer')
let submit = footer.children[1]
submit.props.onClick()
await new Promise((resolvePromise) => setImmediate(resolvePromise))

const fork = calls.find(([kind]) => kind === 'fork')
assert.ok(fork, 'fork was not called')
assert.equal(fork[1].atSeq, 3)
assert.equal(fork[1].increaseTitle, false)
const prompt = calls.find(([kind]) => kind === 'prompt')
assert.ok(prompt, 'prompt was not called')
assert.equal(prompt[1].content[0].text, 'hello')
assert.equal(prompt[1].sessionId, 'session-child')
const open = calls.find(([kind]) => kind === 'open')
assert.deepEqual(open, ['open', 'session-child'])
const discard = calls.find(([kind, args]) => kind === 'execute' && args[1] === '/session-editor delete session-parent --confirm')
assert.ok(discard, 'source session was not deleted')
assert.equal(discard[1][0], 'session-parent')

/** User-message renderer: shipped bubble Factory plus copy/edit actions. */
const userReg = registrations.find(
  (entry) => entry.options.name === 'conversation.chat.node' && entry.options.key === 'user',
)
assert.ok(userReg, 'user node renderer not registered')
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
assert.ok(factoryCall, 'user bubble factory was not used')
assert.equal(factoryCall.name, 'conversation.chat.user.content')
assert.equal(factoryCall.props.content.text, 'hello')
assert.equal(factoryCall.props.interactive, true)
const userButtons = userEl.children[1].children.filter(Boolean)
assert.equal(userButtons.length, 2)
userButtons[1].props.onClick()
overlayEl = overlay({ t })
assert.notEqual(overlayEl, null, 'user edit dialog did not open')
dialogView = overlayEl.children[0].children[0]
assert.equal(dialogView.props.dialog.kind, 'edit-message')
assert.equal(dialogView.props.dialog.boundary, 3)
assert.equal(dialogView.props.dialog.text, 'hello')

/** Session-row menu: refuses to delete the session currently being viewed. */
const menuReg = byId('session-editor-delete')
assert.ok(menuReg, 'delete menu item not registered')
const menuCalls = []
const menu = menuReg.component({
  sessionId: 'session-other',
  displayTitle: 'Other',
  useMenuOpenState: () => [true, () => menuCalls.push('close')],
  useSessions: (selector) => selector({ ids: ['session-current'], byId: { 'session-current': { retainedBy: { mainView: 1 } } } }),
  t: (key) => key,
})
menu.props.onClick()
assert.deepEqual(menuCalls, ['close'])
overlayEl = overlay({ t })
assert.notEqual(overlayEl, null, 'delete dialog did not open')
dialogView = overlayEl.children[0].children[0]
assert.equal(dialogView.props.dialog.kind, 'delete-session')
assert.equal(dialogView.props.dialog.runnerId, 'session-current')

/** The permanent-delete dialog keeps its confirm disabled until the box is ticked. */
const deleteContent = dialogView.type(dialogView.props)
const ackLabel = deleteContent.children.find((child) => child && child.props && child.props.className === 'sed-ack')
assert.ok(ackLabel, 'acknowledgement checkbox missing')
assert.equal(ackLabel.children[0].props.type, 'checkbox')
assert.equal(ackLabel.children[0].props.checked, false)
const deleteFooter = deleteContent.children.find((child) => child && child.props && child.props.className === 'sed-footer')
const confirmButton = deleteFooter.children[1]
assert.equal(confirmButton.props.disabled, true, 'confirm enabled before acknowledgement')

/** Editing a message that carries attachments warns, and gates the resend. */
{
  let bubble
  const attached = userReg.component({
    node: {
      data: {
        content: [
          { type: 'text', text: 'look at this' },
          { type: 'image', attachment: { id: 'att-1' } },
        ],
        time: 2,
      },
      location: { step: { start: { seq: 4 } } },
      seq: 6,
    },
    sessionId: 'session-parent',
    t,
    renderFactorySlot: (name, props) => {
      bubble = props
      return { type: 'div', props: {}, children: [] }
    },
  })
  assert.equal(bubble.content.attachments.length, 1, 'attachment was not shown in the bubble')
  attached.children[1].children.filter(Boolean)[1].props.onClick()

  const attachedView = overlay({ t }).children[0].children[0]
  assert.equal(attachedView.props.dialog.kind, 'edit-message')
  assert.equal(attachedView.props.dialog.text, 'look at this')
  const attachedContent = attachedView.type(attachedView.props)
  const warning = attachedContent.children.find(
    (child) => child && child.props && child.props.className === 'sed-warning',
  )
  assert.ok(warning, 'attachment-loss warning missing')
  assert.match(warning.children[0], /dialog\.edit\.attachments/)
  const attachedAck = attachedContent.children.find(
    (child) => child && child.props && child.props.className === 'sed-ack',
  )
  assert.ok(attachedAck, 'attachment-loss acknowledgement missing')
  const attachedFooter = attachedContent.children.find(
    (child) => child && child.props && child.props.className === 'sed-footer',
  )
  assert.equal(
    attachedFooter.children[1].props.disabled,
    true,
    'resend enabled while attachments would be dropped unacknowledged',
  )
}

console.log('session-editor client tests OK')
