# 读空气 · dsh-air-sense

DSH 插件。给 QQ 群里的 AI 装一道「读空气」的闸：**这条群消息，现在值不值得接**。不值得就闭嘴，一个 token 都不花在回复上。

AstrBot 的群消息流先送到这里过一遍，过了才放行去回复。

```
QQ ── AstrBot(dsh 插件 + 补丁) ──POST /api/air-sense/decide──> DSH(dsh-air-sense)
                                      │
                          不接 ────────┴──────── 接：走原来的回复流程，正文前插时间戳
                            │
                            └─ stop_event()，群里什么都看不到
```

## 它解决什么

群里 AI 最招人烦的不是不会说话，是**每句都接**。有人随口吐槽一句它分析、有人 @ 别人它插嘴、半夜两点它比谁都精神。

所以判断的不是「回什么」，而是**「要不要开口」**。一条消息要过一整套闸门：

```
总开关 → 群黑/白名单 → 发送者黑名单 → 闭麦 → 指令前缀 → 戳一戳
      → 关键词 → 静默时段 → @老子（硬过）→ @别人（硬拦）→ 刷屏氛围
      → 活跃度 → 每日/每小时额度 → 同人冷却
      → 概率 = 基础 × 回复加成 × 注意力 × 戳戳增值 × 表情衰减 × 密度衰减 × 自适应分数
      → 掷骰子 → 还是拿不准？问一次判断模型（只回 yes / no）
```

任何一步不过就是「不接」。判断模型挂了、超时了、插件整个挂了，一律**退回 AstrBot 原来的逻辑**——不会把群聊憋死。

## 装

这是 DSH 插件，需要在 DSH 的 profile 里装；配合 AstrBot 那边的 `astrbot_plugin_dsh` 用。

```bash
# 1) 拷进 profile
cp -R . ~/.dsh/profiles/web/node_modules/dsh-air-sense

# 2) 让 profile 认识它（bundles 管加载，dependencies 管插件页显示）
python3 - <<'PY'
import json, os
p = os.path.expanduser('~/.dsh/profiles/web/package.json')
d = json.load(open(p))
d.setdefault('dependencies', {})['dsh-air-sense'] = 'file:' + os.getcwd()
b = d.setdefault('dsh', {}).setdefault('profile', {}).setdefault('bundles', [])
if 'dsh-air-sense' not in b:
    b.append('dsh-air-sense')
json.dump(d, open(p, 'w'), ensure_ascii=False, indent=2)
PY

# 3) 重启 dsh web（新 bundle 不会热加载）
```

AstrBot 侧要改 `astrbot_plugin_dsh/main.py` 四处，改完重载插件：

1. `_air_body()` / `_air_base()` / `_air_token()`：拼 `{groupId,senderId,senderName,messageId,text,atBot,atOthers,sticker,hasMedia,recent}`，token 读 `~/.dsh/air-sense/token`，地址默认 `http://127.0.0.1:3080`（`trust_env=False`，超时 20 秒）。
2. `_air_decide()`：`POST /api/air-sense/decide`，成功返回 `{ok, pass, reason, stamp}`；非 200、异常、`ok=false` 一律返回 `None`。
3. `on_message()` 开头：群消息先问一次，不接就 `event.stop_event()` 直接返回；接了置 `air_pass = True`，用它绕过 `_group_gate_allows` 与 `_should_capture`。
4. `_forward()`：正文前加 `_air_stamp()`，按回包里的 `stamp.timestampFormat` 渲染 `YYYY MM DD HH mm ss W`。

任何一步连不上都由 `_air_decide` 返回 `None`，自动退回原逻辑。

## 面板

设置 → **读空气**，四个 tab：

| tab | 内容 |
| --- | --- |
| 概览 | 今天看了多少 / 接了多少、每群的分数和闭麦按钮、右上角总开关 |
| 规则 | 九组折叠：概率、接话、图片表情、活跃密度、额度静默、戳一戳、过滤、自适应、AI 判断。**49 个设置项每一项都有一行说明** |
| 日志 | 每条「为什么没接」都在这，可按内容/理由/昵称/群号搜，每页 10 条 |
| 设置 | 时间戳与发送者格式（AstrBot 侧执行）、并发参数、数据目录与恢复默认 |

总开关在右上角：**关掉之后插件彻底不插手**，@ 也按老逻辑走。写坏了随时关。

## 数据

`~/.dsh/air-sense/` 一个目录装完：

| 文件 | 内容 |
| --- | --- |
| `store.json` | 设置、每群分数与统计、判断日志、图片描述缓存 |
| `token` | AstrBot 侧鉴权用（0600） |
| `air-sense.log` | 运行日志，超过 512KB 自动截断 |

换目录、重装、备份：整目录拷走就行。

## 关键参数

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| 初始读空气概率 | 0.02 | 每条普通消息的启动概率，平均 50 条看 1 条 |
| 回复后的概率 / 提升持续 | 0.2 / 120s | 刚成功回过会更敢接，期间再回重新计时 |
| 注意力机制 | 开 | 按人接管：跟谁聊过，谁再说话概率更高 |
| 判定超时 | 15s | 超时按「不接」处理，不拖住消息 |
| 活跃度要求 / 最少消息 | 开 / 5 条 / 300s | 死群不突然冒泡 |
| 回复密度 | 开 / 300s / 5 条 | 刷屏时自动收手，到硬限完全拦 |
| 表情衰减 / 最低门槛 | 0.7 / 0.08 | 表情包降权，但不至于永远轮不到 |
| 每日 / 每小时上限 | 80 / 10 | 硬额度 |
| 静默时段 | 23:30–07:30（默认关） | 这段时间 @ 也不理 |
| 自适应分数 | 开 | 有人接 +15、没人理 −8、每天衰减 2 |

## 硬规矩（踩过的坑）

- **不注册任何工具**。工具 schema 是直接投影给模型上下文的，写歪一次能把整轮会话打成 400 —— 上一版就是这么炸的。
- `apply` 里任何异常只写日志，绝不抛出。
- 判定失败 = 不接，不是「接所有人」。这是两个完全不同的故障方向。

## 自测

```bash
node test/smoke.mjs          # 40 项：假 ctx 假 req/res，跑完整漏斗与 HTTP
node test/client-smoke.mjs   # 14 项：假 React 把四个 tab 真渲染一遍，抓白屏
npm test                     # 两个一起跑
```

## 已知限制

- **判断阶段只拿得到「这条带图/带表情包」，看不到图本身**。图要等这条消息被放行、随消息一起进模型。要让判断也「看图」，得在 AstrBot 侧先转文字，再通过 `/api/air-sense/caption` 写进缓存。
- 群昵称依赖 AstrBot，DSH 侧拿不到；`stamp.sender` 打开时由 AstrBot 拼 `昵称(QQ号)`。

## License

MIT
