// 自测：不开 DSH，用假 ctx / 假 req 把判定漏斗和 HTTP 口都跑一遍。
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const home = mkdtempSync(join(tmpdir(), 'air-sense-test-'))
process.env.DSH_HOME = home

let failed = 0
function ok(cond, label) {
  if (cond) {
    console.log(`  ✓ ${label}`)
  } else {
    failed++
    console.log(`  ✗ ${label}`)
  }
}

const root = new URL('..', import.meta.url).pathname
const { apply, decide } = await import(join(root, 'lib/index.mjs'))
const { normalizeSettings, DEFAULTS } = await import(join(root, 'lib/defaults.mjs'))
const { evaluate, newGroupState, rollHit, inQuiet, scoreFactor, densityFactor } = await import(join(root, 'lib/decide.mjs'))
const { load, groupOf } = await import(join(root, 'lib/store.mjs'))

// ── 假 ctx：只给 webServer，别的服务一律没有 ──
const handlers = []
const disposers = []
const ctx = {
  inject(deps, cb) {
    const scoped = {
      webServer: {
        register: (route) => {
          handlers.push(route)
          return () => {}
        },
      },
      effect(fn) {
        const d = fn()
        if (typeof d === 'function') disposers.push(d)
        return () => {}
      },
      get(name) {
        if (name === 'webServer') return scoped.webServer
        throw new Error(`cannot get property "${name}" without inject`)
      },
    }
    cb(scoped)
    return () => {}
  },
  effect(fn) {
    const d = fn()
    if (typeof d === 'function') disposers.push(d)
    return () => {}
  },
  on() { return () => {} },
}

console.log('\n▶ 挂载')
apply(ctx, {})
ok(handlers.length === 1, `挂上一个 HTTP 前缀口（实际 ${handlers.length}）`)
ok(handlers[0]?.kind === 'prefix' && handlers[0]?.path === '/api/air-sense', '前缀是 /api/air-sense')
ok(existsSync(join(home, 'air-sense', 'store.json')), 'store.json 落盘')
ok(existsSync(join(home, 'air-sense', 'token')), 'token 落盘')

// ── 假 req/res ──
function call(method, path, body, headers = {}) {
  const route = handlers[0]
  const payload = body === undefined ? '' : JSON.stringify(body)
  const req = {
    method,
    url: path,
    headers: { host: '127.0.0.1:3080', ...headers },
    on(ev, fn) {
      if (ev === 'data' && payload) fn(Buffer.from(payload))
      if (ev === 'end') fn()
      return req
    },
    destroy() {},
  }
  return new Promise((resolve) => {
    const res = {
      statusCode: 0,
      headers: {},
      body: '',
      setHeader(k, v) { this.headers[k] = v },
      end(chunk) {
        this.body = String(chunk || '')
        let parsed = null
        try { parsed = JSON.parse(this.body) } catch { parsed = null }
        resolve({ code: this.statusCode, json: parsed })
      },
    }
    route.handler(req, res)
  })
}

const cfg = load().settings
const tok = load().token

console.log('\n▶ 判定漏斗（纯函数）')
{
  const s = normalizeSettings({ ...DEFAULTS, needActivity: false })
  const g = newGroupState('g1')
  g.score = s.scoreInit
  const at = evaluate({ id: 'm1', groupId: 'g1', senderId: '1', text: '在吗', atBot: true }, g, s, Date.now())
  ok(at.pass && at.reason === 'atBot', '@ 老子必接')

  const others = evaluate({ id: 'm2', groupId: 'g1', senderId: '1', text: '@别人 你去吗', atOthers: true }, g, s, Date.now())
  ok(!others.pass && others.reason === 'atOthers', '@ 别人不插嘴')

  const cmd = evaluate({ id: 'm3', groupId: 'g1', senderId: '1', text: '/help' }, g, s, Date.now())
  ok(!cmd.pass && cmd.reason === 'command', '指令不接')

  const off = evaluate({ id: 'm4', groupId: 'g1', senderId: '1', text: '随便说点啥' }, g, { ...s, enabled: false }, Date.now())
  ok(!off.pass && off.reason === 'off', '总开关关着 → 拦住，交还给原逻辑')

  const bl = evaluate({ id: 'm5', groupId: 'g1', senderId: '9', text: '随便说点啥' }, g, { ...s, blacklist: ['9'] }, Date.now())
  ok(!bl.pass && bl.reason === 'senderBlacklist', '黑名单拦住')

  const kw = evaluate({ id: 'm6', groupId: 'g1', senderId: '1', text: '大肥鱼在干嘛' }, g, { ...s, keywords: ['大肥鱼'] }, Date.now())
  ok(kw.pass && kw.reason === 'keyword' && !kw.needJudge, '关键词直接过（非智能模式）')

  const kwSmart = evaluate({ id: 'm7', groupId: 'g1', senderId: '1', text: '大肥鱼在干嘛' }, g, { ...s, initialProb: 1, adaptive: false, keywords: ['大肥鱼'], keywordSmart: true }, Date.now())
  ok(kwSmart.needJudge === true, '关键词智能模式 → 仍要 AI 判断')

  const dead = evaluate({ id: 'm8', groupId: 'g1', senderId: '1', text: '有人吗' }, newGroupState('g2'), { ...s, needActivity: true, minUserMsgs: 5 }, Date.now())
  ok(!dead.pass && dead.reason === 'dead', '冷场不开口')

  const p1 = evaluate({ id: 'm9', groupId: 'g1', senderId: '1', text: 'x' }, g, { ...s, initialProb: 1, adaptive: false }, Date.now())
  ok(p1.pass, '概率 1 → 必过')

  const p0 = evaluate({ id: 'm10', groupId: 'g1', senderId: '1', text: 'x' }, g, { ...s, initialProb: 0, adaptive: false }, Date.now())
  ok(!p0.pass && p0.reason === 'dice', '概率 0 → 必拒')

  const q = evaluate({ id: 'm11', groupId: 'g1', senderId: '1', text: 'x' }, g, { ...s, quiet: { enabled: true, from: '00:00', to: '23:59' } }, Date.now())
  ok(!q.pass && q.reason === 'quiet', '静默时段不接')

  const stickerS = { ...s, initialProb: 1, adaptive: false, stickerFilter: true, stickerDecay: 0.7, stickerFloor: 0.08 }
  const st = evaluate({ id: 'm12', groupId: 'g1', senderId: '1', text: '', sticker: true, hasMedia: true }, g, stickerS, Date.now())
  ok(st.prob <= 0.31, `表情包衰减生效（prob=${st.prob}）`)

  const dg = newGroupState('g3')
  dg.replies = Array.from({ length: 5 }, () => Date.now())
  const df = densityFactor(dg, { ...s, density: true, densityWindowSec: 300, densityMax: 5 }, Date.now())
  ok(df.factor === 0, '密度到硬限 → 概率归零')

  ok(scoreFactor(100) === 1 && scoreFactor(10) < 0.5, '分数低 → 概率打折')

  const quietCross = inQuiet({ enabled: true, from: '23:00', to: '07:00' }, new Date('2026-10-29T02:00:00'))
  ok(quietCross === true, '跨零点的静默时段')
}

console.log('\n▶ HTTP')
{
  const noTok = await call('POST', '/api/air-sense/decide', { groupId: 'g1', senderId: '1', text: 'hi' })
  ok(noTok.code === 401, '没 token → 401')

  const offState = await call('POST', '/api/air-sense/settings', { enabled: false })
  const offOut = await call('POST', '/api/air-sense/decide', { groupId: 'g1', senderId: '1', text: 'hi' }, { 'x-air-sense-token': tok })
  ok(offOut.json?.ok === false, '总开关关着 → 回 ok:false，AstrBot 走原逻辑')
  await call('POST', '/api/air-sense/settings', { enabled: true })

  const out = await call('POST', '/api/air-sense/decide', { groupId: 'g9', senderId: '42', senderName: '老王', text: '这游戏真难', atBot: true }, { 'x-air-sense-token': tok })
  ok(out.code === 200 && out.json?.ok === true, '/decide 正常回包')
  ok(out.json?.stamp?.timestamp === true, '回包带时间戳配置')
  ok(typeof out.json?.pass === 'boolean' && typeof out.json?.reasonText === 'string', '回包带结论和理由')

  const cfgOut = await call('GET', '/api/air-sense/config', undefined, { 'x-air-sense-token': tok })
  ok(cfgOut.code === 200 && cfgOut.json?.stamp, '/config 给 AstrBot 拿配置')

  const state = await call('GET', '/api/air-sense/state', undefined)
  ok(state.code === 200 && state.json?.settings, '/state 给面板')
  ok(Array.isArray(state.json?.log) && state.json.log.length > 0, '日志记下来了')
  ok(state.json.log[0].reasonText, '日志有中文理由')

  const settings = await call('POST', '/api/air-sense/settings', { initialProb: 0.5, keywords: 'a,b' })
  ok(settings.code === 200 && settings.json.settings.initialProb === 0.5, '改设置生效')
  ok(settings.json.settings.keywords.length === 2, '关键词字符串也能收')

  const sim = await call('POST', '/api/air-sense/simulate', { text: '在吗', atBot: true })
  ok(sim.code === 200 && sim.json.pass === true, '面板模拟：@ 命中必接')

  const cap = await call('POST', '/api/air-sense/describe', { url: 'http://x/1.png', text: '一只猫' }, { 'x-air-sense-token': tok })
  ok(cap.code === 200 && cap.json.text === '一只猫', '图片描述缓存写入')
  const cap2 = await call('POST', '/api/air-sense/describe', { url: 'http://x/1.png' }, { 'x-air-sense-token': tok })
  ok(cap2.json.text === '一只猫', '相同 URL 命中缓存')

  const cross = await call('GET', '/api/air-sense/state', undefined, { origin: 'http://evil.example' })
  ok(cross.code === 403, '跨站 Origin 被拒')

  const mute = await call('POST', '/api/air-sense/mute', { minutes: 5 })
  ok(mute.code === 200, '闭麦接口正常')
  const muted = await call('POST', '/api/air-sense/decide', { groupId: 'g9', senderId: '42', text: '在吗' }, { 'x-air-sense-token': tok })
  ok(muted.json?.pass === false && muted.json?.reason === 'muted', '闭麦后不接')
  await call('POST', '/api/air-sense/mute', { minutes: 0 })
}

console.log('\n▶ 落盘与清理')
{
  const data = JSON.parse(readFileSync(join(home, 'air-sense', 'store.json'), 'utf8'))
  ok(!!data.groups.g9, '群状态写进 store.json')
  ok(!!data.token, 'token 在 store 里')
  ok(Object.keys(data.captions).length === 1, '描述缓存只有一条')

  const g = groupOf('g9')
  ok(typeof g.score === 'number', '分数初始化')
}

for (const d of disposers) {
  try { d() } catch { /* ignore */ }
}
rmSync(home, { recursive: true, force: true })

console.log(failed === 0 ? '\n全部通过' : `\n失败 ${failed} 项`)
process.exit(failed === 0 ? 0 : 1)
