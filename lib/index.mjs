// 读空气：AstrBot 每来一条群消息，先问这里一句「这句该不该接」。
// 拒了 Python 侧就 stop_event，一个字都不发；接了才走原来的 _forward。
//
// 三个原则：
//   1) 不注册任何工具 —— 工具 schema 写错会把整轮模型请求打成 400，插件可以废，会话不能死。
//   2) apply 里不抛异常 —— 任何错只写日志，插件自己坏掉不能连累 profile。
//   3) 判断失败一律 fail-open：读空气不可用时 AstrBot 退回原行为。

import { readFileSync, existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { JUDGE_PROMPT_DEFAULT, normalizeSettings } from './defaults.mjs'
import {
  REASONS, evaluate, onUserMessage, onReply, settle, currentScore, ensureDay,
  inQuiet, newGroupState,
  silenceUrge,
} from './decide.mjs'
import {
  DIR, load, save, saveNow, flush, warn, ensureToken, token, groupOf, pushLog,
  captionGet, captionSet, resetStore, ensureDir,
} from './store.mjs'

export const name = 'air-sense'
export const inject = ['tools']

const TICK_MS = 2000
const PERSONA_FILE = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'memory-tier', 'store.json')

// ───────────────────────── 人设 ─────────────────────────

function readPersona() {
  try {
    if (!existsSync(PERSONA_FILE)) return ''
    const data = JSON.parse(readFileSync(PERSONA_FILE, 'utf8'))
    return String(data?.settings?.personaText || '').slice(0, 1200)
  } catch {
    return ''
  }
}

// ───────────────────────── 判断 ─────────────────────────

let defaultModelSvc = null
let llmSvc = null
let attachSvc = null

/** 只有 inject 过的上下文才能读到服务；拿引用比每次 ctx.get 稳。 */
function adoptServices(ctx) {
  try {
    if (typeof ctx.inject === 'function') {
      ctx.inject(['agentDefaultModel'], (sub) => { defaultModelSvc = sub.agentDefaultModel })
      ctx.inject(['llm'], (sub) => { llmSvc = sub.llm })
      ctx.inject(['attachments'], (sub) => { attachSvc = sub.attachments })
    }
  } catch { /* 老版本没有 inject，退回 ctx.get */ }
}

function pickModel(ctx) {
  try {
    const svc = defaultModelSvc || ctx.agentDefaultModel || (() => { try { return ctx.get('agentDefaultModel') } catch { return undefined } })()
    const sel = svc?.currentSelection?.()
    if (sel && typeof sel === 'object') {
      const provider = sel.provider || sel.providerId || sel.route?.provider
      const model = sel.model?.id || sel.model || sel.modelId || sel.route?.model
      if (provider && model) return { provider: String(provider), model: String(model) }
    }
  } catch { /* 拿不到就算了 */ }
  return null
}

async function askJudge(ctx, body, settings) {
  const started = Date.now()
  const llm = llmSvc || (() => {
    try { return ctx.get('llm') } catch { return undefined }
  })() || (() => {
    try { return ctx.llm } catch { return undefined }
  })()
  if (!llm || typeof llm.stream !== 'function') {
    warn('llm 服务不可用，这次判断算不接')
    return { answer: 'no', ms: 0, error: 'no-llm' }
  }
  const target = pickModel(ctx)
  if (!target) {
    warn('拿不到默认模型，这次判断算不接')
    return { answer: 'no', ms: 0, error: 'no-model' }
  }

  const persona = settings.usePersona ? readPersona() : ''
  const system = `${settings.judgePrompt?.trim() || JUDGE_PROMPT_DEFAULT}${persona ? `\n\n【人格】\n${persona}` : ''}`
  const prompt = buildJudgeInput(body, settings, null)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), settings.judgeTimeoutSec * 1000)
  let text = ''
  try {
    const stream = llm.stream({
      provider: target.provider,
      model: target.model,
      system,
      messages: [{
        role: 'user',
        id: `air-${Date.now()}`,
        content: [{ type: 'text', text: prompt }],
        source: { kind: 'plugin', plugin: 'air-sense' },
      }],
      maxTokens: 8,
      temperature: 0,
      signal: controller.signal,
    })
    for await (const chunk of stream) {
      if (!chunk || typeof chunk !== 'object') continue
      if (chunk.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text
      if (chunk.type === 'finish' && chunk.kind && chunk.kind !== 'stop') {
        throw new Error(`stream ${chunk.kind}`)
      }
    }
  } catch (error) {
    warn(`judge 失败：${error?.message || error}`)
    return { answer: 'no', ms: Date.now() - started, error: String(error?.message || error) }
  } finally {
    clearTimeout(timer)
  }

  const answer = /^\s*(yes|y|是|接)/i.test(text.trim()) ? 'yes' : 'no'
  return { answer, ms: Date.now() - started, raw: text.trim().slice(0, 40) }
}

function mediaTypeOf(p) {
  const ext = String(p).toLowerCase().split('.').pop()
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  return 'image/jpeg'
}

/**
 * 一张图 → 一句话。缓存按内容 sha256 存，同一张图发一百次只花一次钱。
 * 拿不到附件服务、模型不吃图、超时：一律返回空，判断照旧，不阻塞。
 */
async function captionOne(ctx, img, s, target) {
  const path = typeof img === 'string' ? img : img?.path
  if (!path || !existsSync(path)) return ''
  let buf
  try {
    buf = await readFile(path)
  } catch {
    return ''
  }
  if (!buf.length || buf.length > 6 * 1024 * 1024) return ''
  const key = 'img:' + createHash('sha256').update(buf).digest('hex').slice(0, 32)
  const hit = captionGet(key)
  if (hit) return hit === 'unsupported' ? '' : hit

  const atts = attachSvc || (() => {
    try { return ctx.get('attachments') } catch { return undefined }
  })()
  if (!atts || typeof atts.saveImage !== 'function') {
    warn('没有附件服务，图描述跳过')
    return ''
  }
  if (!target) return ''
  if (!llmSvc || typeof llmSvc.stream !== 'function') {
    warn('没有 llm 服务，图描述跳过')
    return ''
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  let text = ''
  try {
    const ref = await atts.saveImage({ data: buf, mediaType: mediaTypeOf(path) })
    const stream = llmSvc.stream({
      provider: target.provider,
      model: target.model,
      system: '你在看群聊里的一张图。用一句话说清楚：画面是什么、有没有字、像什么梗。别客套，别解释你在干什么。',
      messages: [{
        role: 'user',
        id: `air-img-${Date.now()}`,
        content: [{ type: 'text', text: '这张图是什么？' }, { type: 'image', attachment: ref }],
        source: { kind: 'plugin', plugin: 'air-sense' },
      }],
      maxTokens: 120,
      temperature: 0.2,
      signal: controller.signal,
    })
    for await (const chunk of stream) {
      if (!chunk || typeof chunk !== 'object') continue
      if (chunk.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text
      if (chunk.type === 'finish' && chunk.kind && chunk.kind !== 'stop') throw new Error(`stream ${chunk.kind}`)
    }
  } catch (error) {
    warn(`图描述失败：${error?.message || error}`)
    return ''
  } finally {
    clearTimeout(timer)
  }

  const clean = text.trim().replace(/\s+/g, ' ').slice(0, 160)
  if (!clean) {
    // 模型不吃图时会回空，记一笔别再反复试
    captionSet(key, 'unsupported', s)
    return ''
  }
  captionSet(key, clean, s)
  return clean
}

const capQueue = []
let capBusy = false

/** 带图的消息先在后台把图看一遍存进缓存：@ 的不判断、被拦的也照样记，下一张同样的图就不用再花钱。 */
export function adoptForTest(ctx) { adoptServices(ctx) }
export async function describeForTest(ctx, img, settings) { return captionOne(ctx, img, settings, pickModel(ctx)) }

export function warmCaptions(ctx, body, s) {
  if (!s.captionCache) return
  const imgs = Array.isArray(body?.images) ? body.images.slice(0, 2) : []
  let added = false
  for (const img of imgs) {
    const p = typeof img === 'string' ? img : img?.path
    if (p && !capQueue.includes(p)) { capQueue.push(p); added = true }
  }
  if (!added) return
  void (async () => {
    if (capBusy) return
    capBusy = true
    try {
      const target = pickModel(ctx)
      while (capQueue.length) {
        const p = capQueue.shift()
        try { await captionOne(ctx, { path: p }, s, target) } catch (error) { warn('预热描述失败：' + (error && error.message)) }
      }
    } finally { capBusy = false }
  })()
}

async function describeImages(ctx, body, s, target) {
  if (!s.captionCache) return []
  const imgs = Array.isArray(body?.images) ? body.images.slice(0, 2) : []
  if (!imgs.length) return []
  const out = []
  for (const img of imgs) {
    try {
      const text = await captionOne(ctx, img, s, target)
      if (text) out.push(text)
    } catch (error) {
      warn(`图描述异常：${error?.message || error}`)
    }
  }
  return out
}

function buildJudgeInput(body, s, g) {
  const lines = []
  const gname = body.groupName ? `${body.groupName}(${body.groupId})` : body.groupId
  lines.push(`群：${gname}`)
  lines.push(`时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`)
  if (body.atBot) lines.push('这条消息 @ 了你。')
  else if (body.atOthers) lines.push('这条消息 @ 的是别人，不是你。')
  if (body.isPoke) lines.push('这是一次戳一戳。')
  if (body.quoted) lines.push(`这条消息在引用前面的话：「${String(body.quoted).slice(0, 160)}」`)
  if (g) {
    const idleMin = Math.max(0, Math.round((Date.now() - (g.lastReplyAt || g.createdAt || Date.now())) / 60000))
    if (idleMin >= 1) lines.push(`你上一句话是 ${idleMin} 分钟前说的。`)
    const said = g.stats?.replies || 0
    lines.push(`今天你在这个群已经开口 ${said} 次。`)
    if (g.judgeNoStreak >= 3) lines.push('你已经连续好几次没接话了，别一直装死。')
  }
  if (body.hasMedia) lines.push(body.sticker ? '这条消息带表情包/图片。' : '这条消息带图片。')
  if (Array.isArray(body.__captions) && body.__captions.length) {
    lines.push('图里是：')
    for (const c of body.__captions) lines.push(`· ${c}`)
  }
  const recent = Array.isArray(body.recent) ? body.recent.slice(-8) : []
  if (recent.length) {
    lines.push('最近几条：')
    for (const r of recent) lines.push(`· ${r.name || '某人'}：${String(r.text || '').slice(0, 60)}`)
  }
  lines.push('')
  lines.push(`要判断的这条 —— ${body.senderName || body.senderId || '某人'}：${String(body.text || '').slice(0, s.judgeMaxChars)}`)
  lines.push('')
  lines.push('现在适合接这一句吗？只回 yes 或 no。')
  return lines.join('\n').slice(0, s.judgeMaxChars + 800)
}

// ───────────────────────── 主流程 ─────────────────────────

async function decide(ctx, body) {
  const data = load()
  const s = data.settings
  const started = Date.now()
  // 总开关关着 = 这个插件不存在。回 ok:false，AstrBot 侧就会退回原来的「只认 @」逻辑。
  if (!s.enabled) return { ok: false, reason: 'off', reasonText: '读空气关着' }
  const groupId = String(body?.groupId || body?.group_id || 'unknown')
  const senderId = String(body?.senderId || body?.sender_id || '')
  const isPoke = body?.isPoke === true || body?.kind === 'poke'
  const msg = {
    id: String(body?.messageId || body?.message_id || `${groupId}:${senderId}:${Date.now()}`),
    groupId,
    senderId,
    senderName: String(body?.senderName || ''),
    text: String(body?.text || ''),
    atBot: !!body?.atBot,
    atOthers: !!body?.atOthers,
    sticker: !!body?.sticker,
    hasMedia: !!body?.hasMedia,
    isPoke,
  }

  const g = groupOf(groupId)
  if (!isPoke) onUserMessage(g, msg, started)
  if (msg.hasMedia || (Array.isArray(body?.images) && body.images.length)) warmCaptions(ctx, body, s)
  const verdict = evaluate(msg, g, s, started)

  let judge = null
  let pass = verdict.pass
  let reason = verdict.reason
  let answer = ''

  // 憋劲攒满：不管掷骰子还是模型怎么想，这一轮直接开口
  const urge = silenceUrge(g, s, Date.now())
  if (!pass && !msg.atBot && urge.pct >= 100) {
    pass = true
    reason = 'silenceUrge'
    judge = { answer: 'yes', ms: 0, forced: true }
    g.judgeNoStreak = 0
  }

  if (pass && verdict.needJudge && !judge) {
    if (msg.hasMedia) {
      const captions = await describeImages(ctx, body, s, pickModel(ctx))
      if (captions.length) body.__captions = captions
    }
    if (s.judgeStreakBypass > 0 && (g.judgeNoStreak || 0) >= s.judgeStreakBypass) {
      // 连续好几句都没接：这次别让模型再拦一道，先开口，把锅甩给上回合的谨慎
      judge = { answer: 'yes', ms: 0, forced: true }
      reason = 'judgedStreak'
    } else {
      judge = await askJudge(ctx, body, s, g)
    }
    if (judge.answer !== 'yes') {
      pass = false
      reason = 'judgedNo'
      g.judgeNoStreak = (g.judgeNoStreak || 0) + 1
    } else {
      reason = judge.forced ? 'judgedStreak' : 'judgedYes'
      g.judgeNoStreak = 0
    }
    answer = judge.answer
  }

  if (pass) {
    onReply(g, s, msg, Date.now(), { proactive: !msg.atBot && !isPoke })
  } else if (verdict.reason === 'dice' || reason === 'judgedNo') {
    // 掷到了但没接，也算一次「读空气」的落空，不改分数，只留痕
  }

  const entry = {
    kind: pass ? 'pass' : 'block',
    reason: pass ? reason : verdict.reason === 'dice' ? reason : verdict.reason,
    reasonText: REASONS[pass ? reason : reason] || reason,
    groupId,
    senderId,
    senderName: msg.senderName,
    text: msg.text.slice(0, 80),
    prob: Number(verdict.prob?.toFixed?.(3) ?? verdict.prob),
    score: currentScore(g, s),
    judge: answer,
    hasMedia: msg.hasMedia,
    sticker: msg.sticker,
    ms: Date.now() - started,
  }
  pushLog(entry, s.logMax)
  save()

  return {
    ok: true,
    pass,
    reason: entry.reason,
    reasonText: entry.reasonText,
    prob: entry.prob,
    score: entry.score,
    judge: answer,
    judgeMs: judge?.ms ?? 0,
    detail: verdict.detail || {},
    caption: msg.hasMedia ? captionOf(body) : '',
    // AstrBot 侧按这个拼时间戳
    stamp: s.stamp,
    pokeBack: verdict.pokeBack === true,
    replyPoke: s.replyPokeProb,
    waitMs: s.concurrencyMode === 'smart' ? s.waitIntervalSec * 1000 : Math.round(s.waitIntervalSec * 1000),
    loops: s.waitLoops,
  }
}

function captionOf(body) {
  const url = body?.imageUrl || body?.mediaUrl || ''
  if (!url) return ''
  const s = load().settings
  if (!s.captionCache) return ''
  return captionGet(url)
}

// ───────────────────────── HTTP ─────────────────────────

function sendJson(res, code, payload) {
  try {
    const body = JSON.stringify(payload)
    res.statusCode = code
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.setHeader('cache-control', 'no-store')
    res.end(body)
  } catch (error) {
    warn(`写回包失败：${error?.message || error}`)
  }
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > 512 * 1024) {
        resolve({})
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      } catch {
        resolve({})
      }
    })
    req.on('error', () => resolve({}))
  })
}

function authed(req) {
  const want = token()
  const got = String(req.headers['x-air-sense-token'] || '')
  return !!want && got === want
}

function sameOrigin(req) {
  const origin = String(req.headers.origin || '')
  if (!origin) return true // curl / AstrBot 直连
  try {
    const host = String(req.headers.host || '')
    return origin.includes(host)
  } catch {
    return false
  }
}

function publicState() {
  const data = load()
  const s = data.settings
  const groups = Object.values(data.groups).map((g) => ({
    id: g.id,
    score: currentScore(g, s),
    recent: (g.userMsgs || []).length,
    muteUntil: g.muteUntil || 0,
    stats: g.stats || ensureDay(g),
    lastReplyAt: g.lastReplyAt || 0,
  }))
  return {
    ok: true,
    settings: s,
    groups,
    totals: {
      groups: groups.length,
      todayCount: groups.reduce((n, g) => n + (g.stats?.count || 0), 0),
      todayPass: groups.reduce((n, g) => n + (g.stats?.pass || 0), 0),
    },
    judgePromptDefault: JUDGE_PROMPT_DEFAULT,
    captions: Object.keys(data.captions || {}).length,
    log: (data.log || []).slice(-200).reverse(),
    dir: DIR,
  }
}

function routes(ctx) {
  return async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    const sub = url.pathname.replace('/api/air-sense', '') || '/'
    try {
      if (sub === '/decide' && req.method === 'POST') {
        if (!authed(req)) return sendJson(res, 401, { ok: false, message: 'token 不对' })
        const body = await readBody(req)
        const out = await decide(ctx, body)
        return sendJson(res, 200, out)
      }

      if (sub === '/config' && req.method === 'GET') {
        if (!authed(req)) return sendJson(res, 401, { ok: false })
        const s = load().settings
        return sendJson(res, 200, {
          ok: true,
          enabled: s.enabled,
          stamp: s.stamp,
          cmdPrefixes: s.cmdPrefixes,
          concurrency: { mode: s.concurrencyMode, waitMs: s.waitIntervalSec * 1000, loops: s.waitLoops },
          poke: { mode: s.pokeMode, back: s.pokeBackProb, afterReply: s.replyPokeProb },
          quiet: s.quiet,
        })
      }

      if (sub === '/observe' && req.method === 'POST') {
        if (!authed(req)) return sendJson(res, 401, { ok: false })
        const body = await readBody(req)
        const g = groupOf(String(body.groupId || 'unknown'))
        onUserMessage(g, {
          senderId: String(body.senderId || ''),
          text: String(body.text || ''),
        }, Date.now())
        save()
        return sendJson(res, 200, { ok: true })
      }

      if (sub === '/describe' && req.method === 'POST') {
        if (!authed(req)) return sendJson(res, 401, { ok: false })
        const body = await readBody(req)
        const url = String(body.url || '')
        if (!url) return sendJson(res, 400, { ok: false, message: '缺 url' })
        if (body.text) captionSet(url, String(body.text), load().settings)
        return sendJson(res, 200, { ok: true, text: captionGet(url) })
      }

      // 面板口：只认同源
      if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, message: '跨站拒绝' })

      if (sub === '/state' && req.method === 'GET') return sendJson(res, 200, publicState())

      if (sub === '/settings' && req.method === 'POST') {
        const body = await readBody(req)
        const data = load()
        data.settings = normalizeSettings({ ...data.settings, ...body })
        saveNow()
        return sendJson(res, 200, { ok: true, settings: data.settings })
      }

      if (sub === '/settings/reset' && req.method === 'POST') {
        const data = load()
        data.settings = normalizeSettings({})
        saveNow()
        return sendJson(res, 200, { ok: true, settings: data.settings })
      }

      if (sub === '/mute' && req.method === 'POST') {
        const body = await readBody(req)
        const minutes = Number(body.minutes ?? 0)
        const targets = body.groupId ? [groupOf(String(body.groupId))] : Object.values(load().groups)
        for (const g of targets) g.muteUntil = minutes > 0 ? Date.now() + minutes * 60_000 : 0
        saveNow()
        return sendJson(res, 200, { ok: true })
      }

      if (sub === '/reset' && req.method === 'POST') {
        const body = await readBody(req)
        if (body?.groupId) {
          const data = load()
          data.groups[String(body.groupId)] = newGroupState(String(body.groupId))
          saveNow()
        } else {
          resetStore()
        }
        return sendJson(res, 200, { ok: true })
      }

      if (sub === '/log/clear' && req.method === 'POST') {
        const data = load()
        data.log = []
        saveNow()
        return sendJson(res, 200, { ok: true })
      }

      if (sub === '/simulate' && req.method === 'POST') {
        const body = await readBody(req)
        const s = load().settings
        const g = newGroupState('simulate')
        g.score = s.scoreInit
        g.userMsgs = Array.from({ length: Math.max(s.minUserMsgs + 1, 1) }, () => Date.now())
        const verdict = evaluate({
          id: `sim-${Date.now()}`,
          groupId: 'simulate',
          senderId: String(body.senderId || '10000'),
          text: String(body.text || ''),
          atBot: !!body.atBot,
          atOthers: !!body.atOthers,
          sticker: !!body.sticker,
          hasMedia: !!body.hasMedia,
          isPoke: !!body.isPoke,
        }, g, s, Date.now())
        return sendJson(res, 200, { ok: true, ...verdict })
      }

      return sendJson(res, 404, { ok: false, message: 'not found' })
    } catch (error) {
      warn(`HTTP ${sub} 出错：${error?.stack || error}`)
      return sendJson(res, 500, { ok: false, message: String(error?.message || error) })
    }
  }
}

// ───────────────────────── 插件入口 ─────────────────────────

export function apply(ctx, config) {
  try {
    adoptServices(ctx)
    load()
    ensureDir()
    ensureToken()
    if (config && typeof config === 'object' && Object.keys(config).length) {
      const data = load()
      data.settings = normalizeSettings({ ...data.settings, ...config })
      saveNow()
    }

    try {
      ctx.inject(['webServer'], (c) => {
        const webServer = c.webServer || (() => { try { return c.get('webServer') } catch { return undefined } })()
        if (!webServer || typeof webServer.register !== 'function') {
          warn('webServer 不可用，HTTP 口没挂上')
          return
        }
        const handler = routes(c)
        const mount = () => webServer.register({ kind: 'prefix', path: '/api/air-sense', handler })
        try {
          if (typeof c.effect === 'function') c.effect(mount)
          else mount()
        } catch (error) {
          warn(`HTTP 注册失败：${error?.message || error}`)
          try { mount() } catch (e2) { warn(`HTTP 兜底注册也失败：${e2?.message || e2}`) }
        }
      })
    } catch (error) {
      warn(`inject webServer 失败：${error?.message || error}`)
    }

    // 每两秒扫一次：结算加减分、清过期状态
    const timer = setInterval(() => {
      try {
        const data = load()
        const s = data.settings
        if (!s.adaptive) return
        for (const g of Object.values(data.groups)) {
          const out = settle(g, s, Date.now())
          if (out) {
            pushLog({
              kind: 'score',
              reason: out.ok ? 'settle-ok' : 'settle-fail',
              reasonText: `${out.ok ? '有人接' : '没人理'}：${out.before} → ${out.after}`,
              groupId: g.id,
              text: '',
            }, s.logMax)
          }
        }
        save()
      } catch (error) {
        warn(`tick 出错：${error?.message || error}`)
      }
    }, TICK_MS)
    if (typeof timer.unref === 'function') timer.unref()

    try {
      if (typeof ctx.effect === 'function') ctx.effect(() => () => clearInterval(timer))
      else if (typeof ctx.on === 'function') ctx.on('dispose', () => clearInterval(timer))
    } catch { /* 清理不挂钩也不致命 */ }

    saveNow()
  } catch (error) {
    // 绝不把异常抛给宿主：插件废了可以重装，会话不能死
    warn(`apply 出错：${error?.stack || error}`)
  }
}

export { decide, publicState, flush }
