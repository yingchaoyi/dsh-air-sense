// 读空气的默认值与参数收敛。只放常量和小函数，不碰磁盘、不碰 ctx。

export const JUDGE_PROMPT_DEFAULT = `你当前的任务是做「这句话该不该接」的判断，不是生成回复。

【人格注入说明】
- 如果这次判断注入了人格设定，按该人格的立场、兴趣和说话倾向来判断现在会不会开口。
- 没有注入人格时，就按上下文做中性判断，不要脑补角色扮演。

【判断依据】
- 这句话是在跟别人说，还是在跟群里所有人说，还是明显在跟某人对话。
- 最近几轮是谁在接谁的话，氛围是热聊、冷场、吵架还是刷屏。
- 距离上一次群里有实质对话过去了多久。
- 当前时间段（深夜、清晨、上班时间）是否适合冒出来。

【倾向】
- 你的默认立场是「接」。群里聊天本来就是东一句西一句，接一句不丢人，一直装死才丢人。
- 只要这句话有能接的点（可以接梗、可以补一句、可以损一句数据、可以顺着聊），就回 yes。
- 只有明确不该插的时候才回 no：明显是两个人的私聊、纯刷屏复读、正在吵架别掺和、凌晨深夜、刚说完一句还没人应。

【输出要求】
- 适合接：输出 yes
- 不适合：输出 no
- 只回 yes 或 no，不要解释、不要标点、不要前后缀。`

export const DEFAULTS = {
  // 总开关：关掉之后插件彻底不干预，一条消息都不拦
  enabled: true,

  // 消息加工（在 AstrBot 侧拼）
  stamp: {
    timestamp: true,
    timestampFormat: 'YYYY-MM-DD 周W HH:mm:ss',
    sender: true,
    senderFormat: '昵称(QQ)',
  },

  // 概率
  initialProb: 0.02,
  replyProb: 0.2,
  replyBoostSec: 120,
  attention: true,

  // 并发
  concurrencyMode: 'legacy',
  waitLoops: 10,
  waitIntervalSec: 1,

  atAlwaysReply: true,
  atOthersSkip: true,

  // 关键词
  keywords: [],
  keywordSmart: false,

  // 图片与表情
  stickerFilter: true,
  stickerDecay: 0.7,
  stickerFloor: 0.08,
  captionCache: true,
  captionCacheMax: 500,
  captionCacheKeep: 0.8,

  // 黑名单 / 白名单
  blacklist: [],
  blacklistGroups: [],
  whitelistGroups: [],
  cmdPrefixes: ['/', '!', '#', '：'],

  // 戳一戳
  pokeMode: 'bot_only',
  pokeSkipProb: true,
  pokeBoost: 0.3,
  pokeBackProb: 0.2,
  replyPokeProb: 0.15,
  pokeWhitelist: [],

  // 活跃度
  needActivity: true,
  minUserMsgs: 5,
  activityWindowSec: 300,

  // 预判断
  judgePrompt: '',
  judgeTimeoutSec: 15,
  // 连续被判断拦下这么多次之后，下一次跳过判断直接开口（0 = 不用这招）
  judgeStreakBypass: 3,
  judgeMaxChars: 1200,

  // 憋劲：憋满 = 100%，直接开口
  silenceUrgeSec: 1800,
  silenceUrgeMsgs: 20,
  silenceUrgeWeightSec: 0.5,
  silenceUrgeWeightMsgs: 0.5,
  usePersona: true,

  // 自适应分数
  adaptive: true,
  hunger: true,
  scoreInit: 80,
  scoreSuccess: 15,
  scoreFail: 8,
  scoreFast: 5,
  scoreMulti: 10,
  scoreStreak: 5,
  scoreRevive: 20,
  scoreDailyDecay: 2,
  scoreMin: 10,
  scoreMax: 100,
  fastReplySec: 30,

  // 回复密度
  density: true,
  densityWindowSec: 300,
  densityMax: 5,

  // 额度与冷却
  dailyCap: 80,
  hourlyCap: 15,
  sameUserCooldownSec: 30,

  // 静默时段
  quiet: { enabled: false, from: '01:00', to: '07:00' },

  // 氛围：最近窗口里吵架/刷屏时不开口
  moodMute: false,
  moodWindowSec: 90,
  moodThreshold: 12,

  // 日志
  logMax: 300,
  pageSize: 10,
}

function clampNum(value, min, max, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function clampList(value, fallback) {
  if (!Array.isArray(value)) return fallback
  return [...new Set(value.map((x) => String(x).trim()).filter(Boolean))].slice(0, 200)
}

function strList(value) {
  if (Array.isArray(value)) return clampList(value, [])
  if (typeof value === 'string') return clampList(value.split(/[,，\s]+/), [])
  return []
}

export function normalizeSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const d = DEFAULTS
  const stamp = src.stamp && typeof src.stamp === 'object' ? src.stamp : {}
  const quiet = src.quiet && typeof src.quiet === 'object' ? src.quiet : {}

  return {
    enabled: src.enabled !== false,
    stamp: {
      timestamp: stamp.timestamp !== false,
      timestampFormat: String(stamp.timestampFormat || d.stamp.timestampFormat).slice(0, 40),
      sender: stamp.sender !== false,
      senderFormat: String(stamp.senderFormat || d.stamp.senderFormat).slice(0, 40),
    },
    initialProb: clampNum(src.initialProb, 0, 1, d.initialProb),
    replyProb: clampNum(src.replyProb, 0, 1, d.replyProb),
    replyBoostSec: clampNum(src.replyBoostSec, 0, 3600, d.replyBoostSec),
    attention: src.attention !== false,
    concurrencyMode: src.concurrencyMode === 'smart' ? 'smart' : 'legacy',
    waitLoops: clampNum(src.waitLoops, 1, 100, d.waitLoops),
    waitIntervalSec: clampNum(src.waitIntervalSec, 0.2, 30, d.waitIntervalSec),
    atAlwaysReply: src.atAlwaysReply !== false,
    atOthersSkip: src.atOthersSkip !== false,
    keywords: strList(src.keywords),
    keywordSmart: src.keywordSmart === true,
    stickerFilter: src.stickerFilter !== false,
    stickerDecay: clampNum(src.stickerDecay, 0, 1, d.stickerDecay),
    stickerFloor: clampNum(src.stickerFloor, 0, 1, d.stickerFloor),
    captionCache: src.captionCache !== false,
    captionCacheMax: clampNum(src.captionCacheMax, 10, 5000, d.captionCacheMax),
    captionCacheKeep: clampNum(src.captionCacheKeep, 0.5, 1, d.captionCacheKeep),
    blacklist: strList(src.blacklist),
    blacklistGroups: strList(src.blacklistGroups),
    whitelistGroups: strList(src.whitelistGroups),
    cmdPrefixes: strList(src.cmdPrefixes === undefined ? d.cmdPrefixes : src.cmdPrefixes),
    pokeMode: ['ignore', 'bot_only', 'all'].includes(src.pokeMode) ? src.pokeMode : d.pokeMode,
    pokeSkipProb: src.pokeSkipProb !== false,
    pokeBoost: clampNum(src.pokeBoost, 0, 1, d.pokeBoost),
    pokeBackProb: clampNum(src.pokeBackProb, 0, 1, d.pokeBackProb),
    replyPokeProb: clampNum(src.replyPokeProb, 0, 1, d.replyPokeProb),
    pokeWhitelist: strList(src.pokeWhitelist),
    needActivity: src.needActivity !== false,
    minUserMsgs: clampNum(src.minUserMsgs, 1, 50, d.minUserMsgs),
    activityWindowSec: clampNum(src.activityWindowSec, 60, 3600, d.activityWindowSec),
    judgePrompt: String(src.judgePrompt || '').slice(0, 4000),
    judgeTimeoutSec: clampNum(src.judgeTimeoutSec, 5, 120, d.judgeTimeoutSec),
    judgeStreakBypass: clampNum(src.judgeStreakBypass, 0, 20, d.judgeStreakBypass),
    judgeMaxChars: clampNum(src.judgeMaxChars, 200, 4000, d.judgeMaxChars),
    silenceUrgeSec: clampNum(src.silenceUrgeSec, 60, 21600, d.silenceUrgeSec),
    silenceUrgeMsgs: clampNum(src.silenceUrgeMsgs, 3, 300, d.silenceUrgeMsgs),
    silenceUrgeWeightSec: clampNum(src.silenceUrgeWeightSec, 0, 1, d.silenceUrgeWeightSec),
    silenceUrgeWeightMsgs: clampNum(src.silenceUrgeWeightMsgs, 0, 1, d.silenceUrgeWeightMsgs),
    // 两个权重同时为 0 就没法归一化了，回落到各一半
    ...(src.silenceUrgeWeightSec + src.silenceUrgeWeightMsgs <= 0
      ? { silenceUrgeWeightSec: 0.5, silenceUrgeWeightMsgs: 0.5 }
      : {}),
    usePersona: src.usePersona !== false,
    adaptive: src.adaptive !== false,
    hunger: src.hunger !== false,
    scoreInit: clampNum(src.scoreInit, 0, 100, d.scoreInit),
    scoreSuccess: clampNum(src.scoreSuccess, 0, 50, d.scoreSuccess),
    scoreFail: clampNum(src.scoreFail, 0, 50, d.scoreFail),
    scoreFast: clampNum(src.scoreFast, 0, 50, d.scoreFast),
    scoreMulti: clampNum(src.scoreMulti, 0, 50, d.scoreMulti),
    scoreStreak: clampNum(src.scoreStreak, 0, 50, d.scoreStreak),
    scoreRevive: clampNum(src.scoreRevive, 0, 50, d.scoreRevive),
    scoreDailyDecay: clampNum(src.scoreDailyDecay, 0, 20, d.scoreDailyDecay),
    scoreMin: clampNum(src.scoreMin, 0, 100, d.scoreMin),
    scoreMax: clampNum(src.scoreMax, 0, 100, d.scoreMax),
    fastReplySec: clampNum(src.fastReplySec, 5, 300, d.fastReplySec),
    density: src.density !== false,
    densityWindowSec: clampNum(src.densityWindowSec, 30, 3600, d.densityWindowSec),
    densityMax: clampNum(src.densityMax, 1, 50, d.densityMax),
    dailyCap: clampNum(src.dailyCap, 1, 2000, d.dailyCap),
    hourlyCap: clampNum(src.hourlyCap, 1, 500, d.hourlyCap),
    sameUserCooldownSec: clampNum(src.sameUserCooldownSec, 0, 3600, d.sameUserCooldownSec),
    quiet: {
      enabled: quiet.enabled === true,
      from: /^\d{2}:\d{2}$/.test(String(quiet.from || '')) ? String(quiet.from) : d.quiet.from,
      to: /^\d{2}:\d{2}$/.test(String(quiet.to || '')) ? String(quiet.to) : d.quiet.to,
    },
    moodMute: src.moodMute === true,
    moodWindowSec: clampNum(src.moodWindowSec, 30, 1800, d.moodWindowSec),
    moodThreshold: clampNum(src.moodThreshold, 3, 100, d.moodThreshold),
    logMax: clampNum(src.logMax, 20, 2000, d.logMax),
    pageSize: clampNum(src.pageSize, 5, 50, d.pageSize),
  }
}
