// 面板渲染冒烟：用假 React 把四个 tab 真渲染一遍，抓住「白屏」类错误。
// 跑法：node test/client-smoke.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const { DEFAULTS } = await import(path.join(root, 'lib', 'defaults.mjs'))

const src = fs.readFileSync(path.join(root, 'client.js'), 'utf8')
let mod = null
globalThis.window = { __ModuleLoader__: { load: (m) => { mod = m } } }

const React = {
  __q: [],
  createElement: (type, props, ...children) => {
    if (typeof type === 'function') return type({ ...(props || {}), children })
    const kids = children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false)
    const attrs = Object.entries(props || {})
      .filter(([k, v]) => typeof v !== 'function' && k !== 'children' && k !== 'key' && v !== undefined)
      .map(([k, v]) => ` ${k}="${String(v)}"`).join('')
    if (type === 'textarea') return `<textarea${attrs}></textarea>`
    return `<${type}${attrs}>${kids.map(render).join('')}</${type}>`
  },
  useState: (init) => [React.__q.length ? React.__q.shift() : init, () => {}],
  useCallback: (fn) => fn,
  useEffect: () => {},
  useRef: (v) => ({ current: v }),
}

function render(node) {
  if (node === null || node === undefined || node === false) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(render).join('')
  if (typeof node === 'object' && node.type) return React.createElement(node.type, node.props, ...(node.children || []))
  return ''
}

const fakeState = {
  ok: true,
  settings: JSON.parse(JSON.stringify(DEFAULTS)),
  groups: [{ id: '681553272', score: 42, recent: 3, muteUntil: 0, stats: { count: 12, pass: 1 } }],
  totals: { groups: 1, todayCount: 12, todayPass: 1 },
  judgePromptDefault: '默认提示词',
  captions: 4,
  log: [{ at: Date.now(), kind: 'block', reason: 'prob', reasonText: '概率没过 2%', senderName: '刘邦', groupId: '681553272', text: '在吗' }],
  dir: '~/.dsh/air-sense',
}

const fakeRequire = (name) => {
  if (name === 'react') return React
  throw new Error('unexpected require ' + name)
}
new Function('window', 'require', src)(globalThis.window, fakeRequire)
const client = mod.factory(fakeRequire)

function renderTab(tab) {
  React.__q = [fakeState, '', tab, '', 0, false, '']
  let node = null
  client.apply({
    slots: {
      inject: (_name, fn) => fn(),
      register: (_meta, comp) => { node = comp() },
    },
  })
  return render(node)
}

const results = {}
for (const tab of ['overview', 'rules', 'log', 'settings']) results[tab] = renderTab(tab)

const checks = [
  ['概览：统计卡', results.overview.includes('今天看了') && results.overview.includes('12')],
  ['概览：群卡片', results.overview.includes('681553272')],
  ['概览：闭麦按钮', results.overview.includes('闭麦 30 分钟')],
  ['概览：统计说明', results.overview.includes('经过闸门的消息总数')],
  ['规则：开关数量', (results.rules.match(/role="switch"/g) || []).length >= 12],
  ['规则：概率项', results.rules.includes('初始读空气概率')],
  ['规则：字段说明', results.rules.includes('平均 50 条里会看 1 条')],
  ['规则：分组说明', results.rules.includes('概率是这个插件的心脏')],
  ['规则：折叠分节', (results.rules.match(/<summary>/g) || []).length >= 9],
  ['日志：拦下原因', results.log.includes('概率没过 2%')],
  ['日志：搜索框', results.log.includes('搜内容、理由')],
  ['日志：说明', results.log.includes('每一条「为什么没接」都在这')],
  ['设置：时间格式', results.settings.includes('YYYY 年')],
  ['设置：分组说明', results.settings.includes('不是判断，是给消息')],
]

let ok = true
for (const [name, pass] of checks) {
  console.log(pass ? '  ✓' : '  ✗', name)
  if (!pass) ok = false
}
console.log(ok ? '\n全部通过' : '\n有失败项')
process.exit(ok ? 0 : 1)
