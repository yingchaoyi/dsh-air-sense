// 判定漏斗。纯函数，不碰磁盘、不碰 ctx，方便单测。

export const REASONS = {
  silenceUrge: '憋够了，直接开口',
  off: '总开关关着',
  groupBlacklist: '这个群在黑名单里',
  groupNotWhitelisted: '不在白名单群里',
  muted: '正在闭麦',
  senderBlacklist: '这个人在黑名单里',
  command: '是指令，不接',
  quiet: '静默时段',
  keyword: '命中关键词',
  keywordJudge: '命中关键词，但要让 AI 看一眼',
  atBot: '在 @ 老子',
  atOthers: '在跟别人说话',
  dead: '群里太久没人说话',
  busy: '最近回得太多',
  hourly: '这一小时说够了',
  daily: '今天说够了',
  cooldown: '刚接过这个人',
  mood: '群里在吵架/刷屏',
  pokeDirect: '戳的是老子',
  dice: '概率没过',
  judgedNo: 'AI 判断不接',
  judgedStreak: '装死太久，这轮直接开口',
  judgedYes: 'AI 判断该接',
  pokeBack: '反戳了',
}

const HOUR = 3_600_000
const DAY = 86_400_000

export function hash32(str) {
  let h = 0x811c9dc5
  const s = String(str)
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** 同一条消息永远掷出同一个结果：重试、并发、重复回调都不会抖。 */
export function rollHit(prob, seed) {
  if (prob <= 0) return false
  if (prob >= 1) return true
  return hash32(seed) / 0xffffffff < prob
}

export function inQuiet(quiet, date = new Date()) {
  if (!quiet || !quiet.enabled) return false
  const toMin = (s) => {
    const [h, m] = String(s).split(':').map(Number)
    return (h || 0) * 60 + (m || 0)
  }
  const now = date.getHours() * 60 + date.getMinutes()
  const from = toMin(quiet.from)
  const to = toMin(quiet.to)
  if (from === to) return false
  return from < to ? now >= from && now < to : now >= from || now < to
}

export function newGroupState(id) {
  return {
    id: String(id || 'unknown'),
    score: null, // 第一次用时按 settings.scoreInit 落
    scoreAt: 0,
    userMsgs: [],
    replies: [],
    lastReplyAt: 0,
    lastReplyStartedAt: 0,
    pendingSettle: null,
    streak: 0,
    lastUser: null,
    lastUserAt: 0,
    stats: null,
    boostUntil: 0,
    attention: {},
    muteUntil: 0,
    mood: [],
  }
}

export function localDayKey(now = Date.now()) {
  const d = new Date(now)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function ensureDay(g, now = Date.now()) {
  const key = localDayKey(now)
  if (!g.stats || g.stats.day !== key) {
    g.stats = { day: key, count: 0, pass: 0, replies: 0, proactive: 0, byHour: {}, byHourProactive: {} }
  } else {
    // 老 store 没有主动计数：从 0 起算，不把历史用户消息当成老子说的话
    if (!Number.isFinite(g.stats.proactive)) g.stats.proactive = 0
    if (!g.stats.byHourProactive) g.stats.byHourProactive = {}
  }
  return g.stats
}

export function currentScore(g, s, now = Date.now()) {
  if (g.score === null || g.score === undefined) g.score = s.scoreInit
  if (g.scoreAt && now - g.scoreAt > DAY) {
    const days = Math.floor((now - g.scoreAt) / DAY)
    g.score -= days * s.scoreDailyDecay
    g.scoreAt = now
  }
  g.score = Math.min(s.scoreMax, Math.max(s.scoreMin, g.score))
  return g.score
}

export function bumpScore(g, s, delta) {
  g.score = Math.min(s.scoreMax, Math.max(s.scoreMin, (g.score ?? s.scoreInit) + delta))
  g.scoreAt = Date.now()
  return g.score
}

/**
 * 分数直接乘进概率，而且是有来有回的放大：
 *   0 分 ×0.35、40 分 ×1.0、70 分 ×2.2、100 分 ×6。
 * 低分段压着别乱开口，高分段真的要能听见它说话——上一版满分也只有 ×1，等于没加成。
 */
export function scoreFactor(score) {
  const v = Math.min(100, Math.max(0, score))
  if (v <= 40) return 0.35 + (v / 40) * 0.65
  if (v <= 70) return 1 + ((v - 40) / 30) * 1.2
  return 2.2 + ((v - 70) / 30) * 3.8
}

/**
 * 饥饿加成：越久没在这个群开口，概率越高，最多 ×2。
 * 冷场不代表不该说话——分数已经证明这个群接得住，那就别再憋着。
 *   1 小时内 ×1，3 小时 ×1.5，5 小时及以上 ×2。
 */
export function hungerFactor(g, now = Date.now()) {
  const last = g.lastReplyAt || 0
  if (!last) return 1
  const hours = (now - last) / 3_600_000
  if (hours <= 1) return 1
  return Math.min(2, 1 + (hours - 1) * 0.25)
}

export function densityFactor(g, s, now = Date.now()) {
  if (!s.density) return { factor: 1, ratio: 0 }
  const win = s.densityWindowSec * 1000
  g.replies = (g.replies || []).filter((t) => now - t < win)
  const ratio = g.replies.length / Math.max(1, s.densityMax)
  if (ratio >= 1) return { factor: 0, ratio }
  if (ratio <= 0.6) return { factor: 1, ratio }
  return { factor: 1 - (ratio - 0.6) / 0.4, ratio }
}

export function countRecentUsers(g, s, now = Date.now()) {
  const win = s.activityWindowSec * 1000
  g.userMsgs = (g.userMsgs || []).filter((t) => now - t < win)
  return g.userMsgs.length
}

function boostFor(g, s, msg, now) {
  // 注意力机制：按人接管，比整会话加成更准
  if (s.attention) {
    const until = g.attention?.[msg.senderId] || 0
    return until > now ? s.replyProb : 0
  }
  return g.boostUntil > now ? s.replyProb : 0
}

/**
 * 走一遍漏斗。返回 { pass, reason, prob, detail, needJudge, keyword, pokeBack }
 * msg: { id, groupId, senderId, senderName, text, atBot, atOthers, sticker, hasMedia, isPoke, now }
 */
export function evaluate(msg, g, s, now = Date.now()) {
  const id = String(msg.id || `${msg.groupId}:${msg.senderId}:${now}`)
  const seed = `${id}#${msg.text || ''}`
  ensureDay(g, now)

  if (!s.enabled) return deny('off', 1)

  if (s.blacklistGroups?.includes(msg.groupId)) return deny('groupBlacklist', 1)
  if (s.whitelistGroups?.length && !s.whitelistGroups.includes(msg.groupId)) return deny('groupNotWhitelisted', 1)
  if (s.blacklist?.includes(msg.senderId)) return deny('senderBlacklist', 1)
  if (g.muteUntil > now) return deny('muted', 1)

  const text = String(msg.text || '')
  if (s.cmdPrefixes?.some((p) => p && text.startsWith(p))) return deny('command', 1)

  // 戳一戳
  let pokeBoost = 0
  let pokeBack = false
  if (msg.isPoke) {
    if (s.pokeMode === 'ignore') return deny('pokeDirect', 1)
    if (s.pokeMode === 'bot_only' && !msg.atBot) return deny('pokeDirect', 1)
    if (s.pokeBackProb > 0 && rollHit(s.pokeBackProb, `${seed}#back`)) pokeBack = true
    pokeBoost = s.pokeBoost
  }

  // 关键词：命中直接当作 @，但智能模式仍要让 AI 看一眼
  let keyword = false
  if (s.keywords?.length) {
    const lower = text.toLowerCase()
    keyword = s.keywords.some((k) => k && lower.includes(String(k).toLowerCase()))
  }

  if (keyword && !s.keywordSmart && !msg.isPoke) {
    return { pass: true, reason: 'keyword', reasonText: REASONS.keyword, prob: 1, detail: { keyword: true }, needJudge: false, pokeBack }
  }

  if (inQuiet(s.quiet, new Date(now))) return deny('quiet', 1)

  if (msg.atBot && s.atAlwaysReply && !msg.isPoke) {
    return allow('atBot', 1, { needJudge: false })
  }
  if (msg.isPoke && msg.atBot && s.pokeSkipProb) {
    return allow('pokeDirect', 1, { needJudge: true, pokeBoost })
  }
  if (msg.atOthers && !msg.atBot) {
    // 开关开 = 别人 @ 别人时闭嘴；关 = 有 @ 就接一句，且不占主动额度
    if (s.atOthersSkip) return deny('atOthers', 1)
    return allow('atOthers', 1, { needJudge: false })
  }

  // 氛围：短时间内消息太密（刷屏/吵架）就先不插嘴
  if (s.moodMute) {
    g.mood = (g.mood || []).filter((t) => now - t < s.moodWindowSec * 1000)
    g.mood.push(now)
    if (g.mood.length > s.moodThreshold) return deny('mood', 1)
  }

  // 活跃度
  if (s.needActivity && !msg.isPoke) {
    const recent = countRecentUsers(g, s, now)
    if (recent < s.minUserMsgs) return deny('dead', 1)
  }

  // 额度：只算老子主动开口。@ 老子的回复在上面就走掉了，既不占额度也不受限制。
  const stats = g.stats
  const proactive = Number.isFinite(stats.proactive) ? stats.proactive : 0
  if (proactive >= s.dailyCap) return deny('daily', 1)
  const hour = String(new Date(now).getHours())
  if ((stats.byHourProactive?.[hour] || 0) >= s.hourlyCap) return deny('hourly', 1)

  // 同人冷却
  const replied = g.repliedTo
  if (s.sameUserCooldownSec > 0 && replied && replied.id === msg.senderId && now - replied.at < s.sameUserCooldownSec * 1000) {
    return deny('cooldown', 1)
  }

  const score = currentScore(g, s, now)
  const dens = densityFactor(g, s, now)
  if (dens.factor <= 0) return deny('busy', 0)

  // 基础概率
  let base = s.initialProb
  if (keyword) base = Math.max(base, s.initialProb)
  const boost = boostFor(g, s, msg, now)
  let prob = Math.max(base, boost)
  if (pokeBoost > 0) prob = Math.max(prob, pokeBoost)

  // 表情包衰减
  let stickerDecay = 1
  if (s.stickerFilter && msg.sticker && prob >= s.stickerFloor) {
    stickerDecay = 1 - s.stickerDecay
  }

  const scoreF = s.adaptive ? scoreFactor(score) : 1
  const hungerF = s.hunger === false ? 1 : hungerFactor(g, now)
  const factor = scoreF * hungerF * dens.factor * stickerDecay
  const final = Math.min(1, Math.max(0, prob * factor))

  const needJudge = true
  if (!rollHit(final, seed)) {
    return deny('dice', final, { needJudge, keyword, score, scoreF, hungerF, boost: boost > 0, density: dens.ratio, stickerDecay })
  }
  if (keyword && s.keywordSmart) {
    return { pass: true, reason: 'keywordJudge', reasonText: REASONS.keywordJudge, prob: final, detail: { keyword: true, needJudge: true }, needJudge: true, pokeBack }
  }
  return allow('dice', final, { needJudge: true, keyword, score, scoreF, hungerF, boost: boost > 0, density: dens.ratio, stickerDecay, pokeBack })
}

function deny(reason, prob, detail = {}) {
  return { pass: false, reason, reasonText: REASONS[reason] || reason, prob, detail, needJudge: false }
}

function allow(reason, prob, extra = {}) {
  return { pass: true, reason, reasonText: REASONS[reason] || reason, prob, detail: extra, needJudge: extra.needJudge === true, pokeBack: extra.pokeBack === true }
}

/** 记一条用户消息（活跃度、氛围、同人冷却都靠它）。 */
export function onUserMessage(g, msg, now = Date.now()) {
  g.userMsgs = (g.userMsgs || []).filter((t) => now - t < 3600_000)
  g.userMsgs.push(now)
  if (msg.senderId) {
    g.lastUser = msg.senderId
    g.lastUserAt = now
  }
  ensureDay(g, now)
  g.stats.count += 1 // 只是「今天看过多少条」的参考值，不再参与额度
}


/** 憋劲：距上次开口的时长 + 未回复条数，各归一后加权，攒到 100 就强制开口。 */
export function silenceUrge(g, s, now = Date.now()) {
  const secTarget = Math.max(1, Number(s.silenceUrgeSec) || 1800)
  const msgTarget = Math.max(1, Number(s.silenceUrgeMsgs) || 20)
  const wS = Math.max(0, Number(s.silenceUrgeWeightSec) || 0)
  const wM = Math.max(0, Number(s.silenceUrgeWeightMsgs) || 0)
  const last = g.lastReplyAt || g.createdAt || now
  const elapsed = Math.max(0, (now - last) / 1000)
  const pending = (g.userMsgs || []).filter((t) => t > last).length
  const secPct = Math.min(1, elapsed / secTarget)
  const msgPct = Math.min(1, pending / msgTarget)
  const total = wS + wM > 0 ? wS + wM : 2
  const wSn = wS + wM > 0 ? wS : 1
  const wMn = wS + wM > 0 ? wM : 1
  const weighted = (secPct * wSn + msgPct * wMn) / total
  // 时长到点就算憋满，条数只负责在时长没满时补进度
  const pct = Math.max(secPct, weighted) * 100
  return { pct, secPct, msgPct, pending, elapsed, secTarget, msgTarget }
}

/** 开口之后调用：记回复、刷加成、排下一次结算。 */
export function onReply(g, s, msg, now = Date.now(), opts = {}) {
  if (msg.senderId) g.repliedTo = { id: msg.senderId, at: now }
  ensureDay(g, now)
  g.stats.replies += 1
  g.stats.pass += 1
  const hour = String(new Date(now).getHours())
  g.stats.byHour[hour] = (g.stats.byHour[hour] || 0) + 1
  // 只有主动开口才占额度；@ 老子、戳老子这些是被叫的，不算老子自己想说
  if (opts.proactive !== false) {
    g.stats.proactive = (Number.isFinite(g.stats.proactive) ? g.stats.proactive : 0) + 1
    g.stats.byHourProactive[hour] = (g.stats.byHourProactive[hour] || 0) + 1
  }
  g.replies = [...(g.replies || []), now]
  g.lastReplyAt = now
  g.lastReplyStartedAt = now
  if (s.attention && msg.senderId) {
    g.attention[msg.senderId] = now + s.replyBoostSec * 1000
  }
  g.boostUntil = now + s.replyBoostSec * 1000
  // 结算：这一句之后有没有人接
  g.pendingSettle = { at: now, senderId: msg.senderId, scoreBaseline: g.score }
}

/** 有人接话 / 没人接话 → 加减分。返回是否发生了结算。 */
export function settle(g, s, now = Date.now()) {
  const p = g.pendingSettle
  if (!p) return null
  const age = now - p.at
  if (age < 20_000) return null // 给点时间
  g.pendingSettle = null
  const respondents = (g.userMsgs || []).filter((t) => t > p.at + 500)
  if (!respondents.length) {
    g.streak = 0
    return { ok: false, before: p.scoreBaseline, after: bumpScore(g, s, -s.scoreFail) }
  }
  let delta = s.scoreSuccess
  if (respondents.length >= 2) delta += s.scoreMulti
  if (respondents[0] - p.at <= s.fastReplySec * 1000) delta += s.scoreFast
  if (g.score !== null && g.score < 30) delta += s.scoreRevive
  g.streak = (g.streak || 0) + 1
  if (g.streak >= 3) delta += s.scoreStreak
  return { ok: true, before: p.scoreBaseline, after: bumpScore(g, s, delta), delta }
}

export function startBoost(g, s, senderId, now = Date.now()) {
  g.boostUntil = now + s.replyBoostSec * 1000
  if (s.attention && senderId) g.attention[senderId] = g.boostUntil
}
