// 落盘：设置、各群状态、判断日志、图片描述缓存、token。全部同步写，量很小。

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, appendFileSync, statSync, chmodSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { DEFAULTS, normalizeSettings, mergeSettings } from './defaults.mjs'
import { newGroupState } from './decide.mjs'

const HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
export const DIR = join(HOME, 'air-sense')
const STORE = join(DIR, 'store.json')
const LOG = join(DIR, 'air-sense.log')
const TOKEN = join(DIR, 'token')

let cache = null
let timer = null

export function ensureDir() {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true, mode: 0o700 })
}

function emptyState() {
  return { v: 1, settings: normalizeSettings({}), groups: {}, log: [], captions: {}, token: '', updatedAt: 0 }
}

export function load() {
  if (cache) return cache
  ensureDir()
  let raw = null
  try {
    if (existsSync(STORE)) raw = JSON.parse(readFileSync(STORE, 'utf8'))
  } catch {
    raw = null
  }
  const base = emptyState()
  const data = raw && typeof raw === 'object' ? raw : base
  data.settings = normalizeSettings(data.settings)
  data.groups = data.groups && typeof data.groups === 'object' ? data.groups : {}
  for (const [k, g] of Object.entries(data.groups)) {
    data.groups[k] = { ...newGroupState(k), ...g, id: k }
  }
  data.log = Array.isArray(data.log) ? data.log : []
  data.captions = data.captions && typeof data.captions === 'object' ? data.captions : {}
  data.token = String(data.token || '')
  cache = data
  if (!data.token) ensureToken()
  return cache
}

export function save() {
  if (!cache) return
  if (timer) return
  timer = setTimeout(() => {
    timer = null
    saveNow()
  }, 150)
}

export function saveNow() {
  if (!cache) return
  try {
    ensureDir()
    cache.updatedAt = Date.now()
    const tmp = `${STORE}.tmp`
    writeFileSync(tmp, JSON.stringify(cache, null, 0))
    renameSync(tmp, STORE)
  } catch (error) {
    warn(`保存失败：${error && error.message}`)
  }
}

export function flush() {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  saveNow()
}

export function warn(msg) {
  try {
    ensureDir()
    if (existsSync(LOG) && statSync(LOG).size > 512 * 1024) writeFileSync(LOG, '')
    appendFileSync(LOG, `${new Date().toISOString()} ${msg}\n`)
  } catch {
    /* 日志写不进去也不能影响主流程 */
  }
}

export function ensureToken() {
  const data = load()
  if (data.token) return data.token
  const token = randomBytes(24).toString('hex')
  data.token = token
  try {
    ensureDir()
    writeFileSync(TOKEN, token + '\n', { mode: 0o600 })
    try { chmodSync(TOKEN, 0o600) } catch { /* ignore */ }
  } catch (error) {
    warn(`token 落盘失败：${error && error.message}`)
  }
  saveNow()
  return token
}

export function token() {
  return load().token || ensureToken()
}

export function groupOf(id) {
  const data = load()
  const key = String(id || 'unknown')
  if (!data.groups[key]) {
    data.groups[key] = newGroupState(key)
    data.groups[key].score = data.settings.scoreInit
  }
  return data.groups[key]
}

/**
 * 某个群生效的配置：群里单独存过就用群的那份，没存过就吃全局默认。
 * 群配置是整份快照（第一次在该群改设置时自动复制全局），改全局不会影响已单独配置过的群。
 */
export function settingsFor(id) {
  const data = load()
  const key = String(id || '')
  const g = key ? data.groups[key] : null
  return g && g.settings ? g.settings : data.settings
}

export function hasOwnSettings(id) {
  const data = load()
  const g = data.groups[String(id || '')]
  return !!(g && g.settings)
}

export function setSettingsFor(id, patch) {
  const data = load()
  const key = String(id || '')
  if (!key) {
    data.settings = normalizeSettings(mergeSettings(data.settings, patch))
    saveNow()
    return data.settings
  }
  const g = groupOf(key)
  g.settings = normalizeSettings(mergeSettings(settingsFor(key), patch))
  g.settingsAt = Date.now()
  saveNow()
  return g.settings
}

/** 把某个群恢复成「跟全局一样」 */
export function resetSettingsFor(id) {
  const data = load()
  const g = data.groups[String(id || '')]
  if (g) {
    delete g.settings
    delete g.settingsAt
    saveNow()
  }
  return settingsFor(id)
}

export function pushLog(entry, max) {
  const data = load()
  data.log.push({ at: Date.now(), ...entry })
  const cap = max || data.settings.logMax || DEFAULTS.logMax
  if (data.log.length > cap) data.log = data.log.slice(-cap)
  save()
}

export function captionGet(url) {
  const data = load()
  const hit = data.captions?.[url]
  return hit ? hit.text : ''
}

export function captionSet(url, text, s) {
  if (!url || !text) return
  const data = load()
  data.captions = data.captions || {}
  data.captions[url] = { text: String(text).slice(0, 400), at: Date.now() }
  const max = s?.captionCacheMax || 500
  const keys = Object.keys(data.captions)
  if (keys.length > max) {
    const keep = Math.max(1, Math.floor(max * (s?.captionCacheKeep || 0.8)))
    const sorted = keys.sort((a, b) => (data.captions[b].at || 0) - (data.captions[a].at || 0)).slice(0, keep)
    const next = {}
    for (const k of sorted) next[k] = data.captions[k]
    data.captions = next
  }
  save()
}

export function resetStore() {
  cache = { ...emptyState(), settings: normalizeSettings({}), token: cache?.token || '' }
  if (!cache.token) ensureToken()
  saveNow()
  return cache
}
