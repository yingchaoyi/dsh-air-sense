// 读空气 · 设置面板。只在客户端跑，出问题最多白屏，不会连累会话。
window.__ModuleLoader__.load({
  id: 'dsh-air-sense',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const API = '/api/air-sense'
    const PAGE = 10

    async function get(path) {
      const res = await fetch(API + path, { headers: { accept: 'application/json' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    }
    async function post(path, body) {
      const res = await fetch(API + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body || {}),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    }

    function useStyleOnce(id, css) {
      if (typeof document === 'undefined') return
      if (document.querySelector(`style[data-plugin-css="${id}"]`)) return
      const el = document.createElement('style')
      el.dataset.pluginCss = id
      el.textContent = css
      document.head.appendChild(el)
    }

    useStyleOnce(
      'dsh-air-sense',
      `
.as-root{display:flex;flex-direction:column;gap:14px;font-size:13px;line-height:1.6;color:inherit}
.as-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.as-head .as-title{font-size:15px;font-weight:700;letter-spacing:.2px}
.as-head .as-sub{font-size:12px;opacity:.55}
.as-head .as-grow{flex:1}
.as-tabs{display:flex;gap:4px;padding:3px;border-radius:10px;background:color-mix(in oklab,currentColor 6%,transparent);width:fit-content}
.as-tab{padding:5px 14px;border-radius:8px;border:0;background:transparent;color:inherit;cursor:pointer;font-size:12.5px;opacity:.65}
.as-tab:hover{opacity:.9}
.as-tab[data-on="1"]{background:color-mix(in oklab,currentColor 13%,transparent);opacity:1;font-weight:600}
.as-panel{display:flex;flex-direction:column;gap:12px}
.as-card{border:1px solid color-mix(in oklab,currentColor 12%,transparent);border-radius:12px;padding:14px 16px;background:color-mix(in oklab,currentColor 2.5%,transparent)}
.as-card .as-card-title{font-size:12px;font-weight:700;opacity:.75;margin-bottom:8px;letter-spacing:.3px}
.as-card-desc{font-size:11.5px;opacity:.55;line-height:1.6;margin-bottom:10px}
.as-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.as-stat{padding:11px 13px;border-radius:10px;border:1px solid color-mix(in oklab,currentColor 10%,transparent)}
.as-stat .k{font-size:11.5px;opacity:.6}
.as-stat .v{font-size:19px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.4}
.as-stat .d{font-size:10.5px;opacity:.45;line-height:1.5}
.as-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px}
.as-gcard{padding:12px 14px;border-radius:10px;border:1px solid color-mix(in oklab,currentColor 11%,transparent);display:flex;flex-direction:column;gap:6px}
.as-gcard .gid{font-weight:700;font-size:13px}
.as-gcard .gmeta{font-size:11.5px;opacity:.6;font-variant-numeric:tabular-nums}
.as-gcard .grow{display:flex;justify-content:space-between;align-items:center;gap:8px}

.as-sec{border:1px solid color-mix(in oklab,currentColor 11%,transparent);border-radius:11px;overflow:hidden;background:color-mix(in oklab,currentColor 1.5%,transparent)}
.as-sec>summary{display:flex;align-items:center;gap:8px;padding:11px 14px;cursor:pointer;font-size:12.5px;font-weight:600;list-style:none;user-select:none}
.as-sec>summary::-webkit-details-marker{display:none}
.as-sec>summary::before{content:"";width:5px;height:5px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(-45deg);opacity:.5;transition:transform .15s;margin-right:2px}
.as-sec[open]>summary::before{transform:rotate(45deg)}
.as-sec>summary:hover{background:color-mix(in oklab,currentColor 5%,transparent)}
.as-sec-body{padding:0 16px 14px;display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:0 26px}
.as-sec-desc{grid-column:1 / -1;font-size:11.5px;opacity:.55;line-height:1.65;padding:2px 0 10px;border-bottom:1px solid color-mix(in oklab,currentColor 8%,transparent);margin-bottom:4px}
.as-field{display:grid;grid-template-columns:1fr auto;align-items:start;gap:3px 16px;padding:9px 0;border-top:1px dashed color-mix(in oklab,currentColor 8%,transparent)}
.as-sec-body .as-field:first-of-type,.as-sec-body .as-field:nth-of-type(2){border-top:0}
.as-field .as-meta{display:flex;flex-direction:column;gap:2px;min-width:0;padding-top:2px}
.as-field .as-name{font-size:12.5px;font-weight:500}
.as-field .as-tip{font-size:11px;opacity:.52;line-height:1.55;max-width:46ch}
.as-field .as-ctl{display:flex;align-items:center;gap:6px;justify-self:end;padding-top:1px}
.as-field.as-field-wide{grid-column:1 / -1;grid-template-columns:1fr;align-items:stretch;gap:7px}
.as-field.as-field-wide .as-ctl{justify-self:stretch}
.as-field-wide .as-tip{max-width:none}

.as-switch{position:relative;width:38px;height:21px;border-radius:999px;border:0;padding:0;cursor:pointer;background:color-mix(in oklab,currentColor 18%,transparent);transition:background .16s;flex:none;margin-top:1px}
.as-switch[aria-checked="true"]{background:color-mix(in oklab,#3f9ffd 55%,currentColor)}
.as-switch::after{content:"";position:absolute;top:2.5px;left:2.5px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .16s;box-shadow:0 1px 2px rgba(0,0,0,.25)}
.as-switch[aria-checked="true"]::after{transform:translateX(17px)}
.as-switch:focus-visible{outline:2px solid color-mix(in oklab,#3f9ffd 60%,transparent);outline-offset:2px}

.as-num{width:86px;height:28px;text-align:right;padding:0 8px;border-radius:8px;border:1px solid color-mix(in oklab,currentColor 16%,transparent);background:color-mix(in oklab,currentColor 3%,transparent);color:inherit;font-size:12.5px;font-variant-numeric:tabular-nums}
.as-num:focus{outline:0;border-color:color-mix(in oklab,#3f9ffd 55%,transparent)}
.as-text{width:100%;min-height:28px;padding:4px 9px;border-radius:8px;border:1px solid color-mix(in oklab,currentColor 16%,transparent);background:color-mix(in oklab,currentColor 3%,transparent);color:inherit;font-family:inherit;font-size:12.5px}
.as-text:focus{outline:0;border-color:color-mix(in oklab,#3f9ffd 55%,transparent)}
.as-text.as-wide{min-width:180px}
.as-sel{height:28px;padding:0 8px;border-radius:8px;border:1px solid color-mix(in oklab,currentColor 16%,transparent);background:color-mix(in oklab,currentColor 3%,transparent);color:inherit;font-size:12.5px;max-width:190px}
.as-btn{height:28px;padding:0 12px;border-radius:8px;border:1px solid color-mix(in oklab,currentColor 18%,transparent);background:color-mix(in oklab,currentColor 4%,transparent);color:inherit;cursor:pointer;font-size:12px;white-space:nowrap}
.as-btn:hover{background:color-mix(in oklab,currentColor 10%,transparent)}
.as-btn[data-danger="1"]{border-color:color-mix(in oklab,#e5484d 45%,transparent);color:color-mix(in oklab,#e5484d 80%,currentColor)}
.as-btn[data-danger="1"]:hover{background:color-mix(in oklab,#e5484d 12%,transparent)}

.as-logline{display:flex;gap:10px;padding:8px 2px;border-top:1px dashed color-mix(in oklab,currentColor 8%,transparent);align-items:flex-start}
.as-logline:first-child{border-top:0}
.as-badge{flex:none;min-width:34px;text-align:center;padding:1px 7px;border-radius:6px;font-size:11px;font-weight:600;margin-top:1px}
.as-badge[data-k="pass"]{color:color-mix(in oklab,#2f9e44 85%,currentColor);background:color-mix(in oklab,#2f9e44 12%,transparent)}
.as-badge[data-k="block"]{color:color-mix(in oklab,#e5484d 85%,currentColor);background:color-mix(in oklab,#e5484d 10%,transparent)}
.as-badge[data-k="score"]{opacity:.7;background:color-mix(in oklab,currentColor 8%,transparent)}
.as-logbody{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.as-logbody .l1{font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.as-logbody .l2{font-size:11px;opacity:.5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-variant-numeric:tabular-nums}
.as-pager{display:flex;gap:4px;align-items:center;flex-wrap:wrap;padding-top:12px}
.as-pg{min-width:30px;height:28px;padding:0 8px;border-radius:7px;border:1px solid color-mix(in oklab,currentColor 14%,transparent);background:transparent;color:inherit;cursor:pointer;font-size:12px}
.as-pg[data-on="1"]{background:color-mix(in oklab,currentColor 14%,transparent);font-weight:700}
.as-pg:disabled{opacity:.3;cursor:default}
.as-muted{opacity:.5}
.as-empty{padding:22px 0;text-align:center;opacity:.5;font-size:12.5px}
.as-warn{margin-top:2px;font-size:12px;color:color-mix(in oklab,#e5a50a 85%,currentColor)}
.as-err{font-size:12px;color:color-mix(in oklab,#e5484d 85%,currentColor)}
.as-chip{display:inline-flex;align-items:center;gap:4px;padding:1px 9px;border-radius:999px;border:1px solid color-mix(in oklab,currentColor 14%,transparent);font-size:11px;opacity:.8;white-space:nowrap}
.as-chip[data-on="1"]{border-color:color-mix(in oklab,#2f9e44 45%,transparent);color:color-mix(in oklab,#2f9e44 80%,currentColor);opacity:1}
.as-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.as-prompt{min-height:132px;resize:vertical;line-height:1.55;padding:8px 10px}
.as-note{font-size:11.5px;opacity:.55;line-height:1.65}
      `,
    )

    function Switch({ value, onChange, title }) {
      return h('button', {
        type: 'button',
        className: 'as-switch',
        role: 'switch',
        title,
        'aria-checked': value ? 'true' : 'false',
        'aria-label': title,
        onClick: () => onChange(!value),
      })
    }

    function Num({ value, onChange, min, max, step }) {
      return h('input', {
        className: 'as-num',
        type: 'number',
        value: value ?? 0,
        min,
        max,
        step: step ?? (max !== undefined && max <= 1 ? 0.01 : 1),
        onChange: (e) => onChange(Number(e.target.value)),
      })
    }

    function Text({ value, onCommit, placeholder, wide, style }) {
      return h('input', {
        className: wide ? 'as-text as-wide' : 'as-text',
        defaultValue: value ?? '',
        placeholder,
        style,
        onBlur: (e) => onCommit(e.target.value),
      })
    }

    function Field({ label, hint, children }) {
      return h(
        'div',
        { className: 'as-field' },
        h(
          'div',
          { className: 'as-meta' },
          h('span', { className: 'as-name' }, label),
          hint ? h('span', { className: 'as-tip' }, hint) : null,
        ),
        h('div', { className: 'as-ctl' }, children),
      )
    }

    function Sec({ title, desc, children, open }) {
      return h(
        'details',
        { className: 'as-sec', open: !!open },
        h('summary', null, title),
        h('div', { className: 'as-sec-body' }, desc ? h('div', { className: 'as-sec-desc' }, desc) : null, children),
      )
    }

    // 与服务端 decide.mjs 同一条曲线，只用来在概览里给人看
    function scoreF(score) {
      const v = Math.min(100, Math.max(0, score || 0))
      if (v <= 40) return 0.35 + (v / 40) * 0.65
      if (v <= 70) return 1 + ((v - 40) / 30) * 1.2
      return 2.2 + ((v - 70) / 30) * 3.8
    }
    function hungerF(lastReplyAt) {
      if (!lastReplyAt) return 1
      const hrs = (Date.now() - lastReplyAt) / 3600000
      return hrs <= 1 ? 1 : Math.min(2, 1 + (hrs - 1) * 0.25)
    }

    function pageNumbers(cur, count) {
      if (count <= 7) return Array.from({ length: count }, (_, i) => i)
      const out = [0]
      const from = Math.max(1, cur - 1)
      const to = Math.min(count - 2, cur + 1)
      if (from > 1) out.push(-1)
      for (let i = from; i <= to; i++) out.push(i)
      if (to < count - 2) out.push(-2)
      out.push(count - 1)
      return out
    }

    function Pager({ page, count, onPage }) {
      if (count <= 1) return null
      return h(
        'div',
        { className: 'as-pager' },
        h('button', { className: 'as-pg', disabled: page <= 0, onClick: () => onPage(page - 1) }, '上一页'),
        ...pageNumbers(page, count).map((n) =>
          n < 0
            ? h('span', { key: `g${n}`, className: 'as-pg', style: { border: 'none', opacity: 0.5 } }, '…')
            : h('button', { key: n, className: 'as-pg', 'data-on': n === page ? '1' : '0', onClick: () => onPage(n) }, String(n + 1)),
        ),
        h('button', { className: 'as-pg', disabled: page >= count - 1, onClick: () => onPage(page + 1) }, '下一页'),
        h('span', { className: 'as-muted', style: { fontSize: 11.5, marginLeft: 4 } }, `第 ${page + 1}/${count} 页`),
      )
    }

    function Panel() {
      const [state, setState] = React.useState(null)
      const [error, setError] = React.useState('')
      const [tab, setTab] = React.useState('overview')
      const [q, setQ] = React.useState('')
      const [page, setPage] = React.useState(0)
      const [saving, setSaving] = React.useState(false)
      const [prompt, setPrompt] = React.useState('')
      const promptTouched = React.useRef(false)

      const reload = React.useCallback(async () => {
        try {
          const data = await get('/state')
          setState(data)
          setError('')
          if (!promptTouched.current) setPrompt(String(data?.settings?.judgePrompt || ''))
        } catch (e) {
          setError(String(e.message || e))
        }
      }, [])

      React.useEffect(() => {
        reload()
        const t = setInterval(reload, 4000)
        return () => clearInterval(t)
      }, [reload])

      React.useEffect(() => setPage(0), [tab, q])

      const s = state?.settings
      const save = async (patch) => {
        setSaving(true)
        try {
          const out = await post('/settings', patch)
          setState((prev) => (prev ? { ...prev, settings: out.settings } : prev))
        } catch (e) {
          setError(String(e.message || e))
        } finally {
          setSaving(false)
        }
      }
      const set = (key, value) => save({ [key]: value })
      const setNested = (key, sub, value) => save({ [key]: { ...(s?.[key] || {}), [sub]: value } })

      if (!state) {
        return h('div', { className: 'as-root' },
          error ? h('div', { className: 'as-err' }, `读不到：${error}`) : h('div', { className: 'as-muted' }, '读空气：加载中…'))
      }

      const logs = (state.log || []).filter((l) => {
        const needle = q.trim().toLowerCase()
        if (!needle) return true
        return `${l.text || ''} ${l.reasonText || ''} ${l.senderName || ''} ${l.groupId || ''}`.toLowerCase().includes(needle)
      })
      const pageCount = Math.max(1, Math.ceil(logs.length / PAGE))
      const cur = Math.min(page, pageCount - 1)
      const pageLogs = logs.slice(cur * PAGE, cur * PAGE + PAGE)
      const today = state.totals || {}

      return h(
        'div',
        { className: 'as-root' },

        h(
          'div',
          { className: 'as-head' },
          h('span', { className: 'as-title' }, '读空气'),
          h('span', { className: 'as-sub' }, '群消息要不要接，先过这一道'),
          h('span', { className: 'as-grow' }),
          h('span', { className: 'as-chip', 'data-on': s.enabled ? '1' : '0' }, s.enabled ? '运行中' : '已关闭'),
          h(Switch, { value: s.enabled, onChange: (v) => set('enabled', v), title: '总开关' }),
        ),

        h(
          'div',
          { className: 'as-tabs' },
          ['overview', 'rules', 'log', 'settings'].map((k) =>
            h('button', { key: k, className: 'as-tab', 'data-on': tab === k ? '1' : '0', onClick: () => setTab(k) },
              { overview: '概览', rules: '规则', log: '日志', settings: '设置' }[k]),
          ),
        ),

        error ? h('div', { className: 'as-err' }, `出错：${error}`) : null,
        s.enabled ? null : h('div', { className: 'as-warn' }, '总开关关着：插件不参与任何判断，@ 也按原逻辑走。打开右上角那个开关它就回来了。'),

        tab === 'overview'
          ? h(
              'div',
              { className: 'as-panel' },
              h(
                'div',
                { className: 'as-stats' },
                h('div', { className: 'as-stat' },
                  h('div', { className: 'k' }, '今天看了'), h('div', { className: 'v' }, String(today.todayCount || 0)),
                  h('div', { className: 'd' }, '经过闸门的消息总数')),
                h('div', { className: 'as-stat' },
                  h('div', { className: 'k' }, '今天接了'), h('div', { className: 'v' }, String(today.todayPass || 0)),
                  h('div', { className: 'd' }, '真正放进来回复的')),
                h('div', { className: 'as-stat' },
                  h('div', { className: 'k' }, '在管的群'), h('div', { className: 'v' }, String(today.groups || 0)),
                  h('div', { className: 'd' }, '有独立分数和额度')),
                h('div', { className: 'as-stat' },
                  h('div', { className: 'k' }, '图片描述缓存'), h('div', { className: 'v' }, String(state.captions || 0)),
                  h('div', { className: 'd' }, '同一张图不重复花钱')),
              ),
              h(
                'div',
                { className: 'as-card' },
                h('div', { className: 'as-card-title' }, '群'),
                h('div', { className: 'as-card-desc' }, '每个群有自己的自适应分数：有人接话就加分，开口没人理就扣分。分数越高，越敢主动开口。闭麦之后这个群的任何消息都不接，@ 也不接。'),
                (state.groups || []).length === 0
                  ? h('div', { className: 'as-empty' }, '还没有群找过它。群里发条消息就会出现在这。')
                  : h('div', { className: 'as-grid' },
                      state.groups.map((g) =>
                        h(
                          'div',
                          { className: 'as-gcard', key: g.id },
                          h('div', { className: 'grow' },
                            h('span', { className: 'gid' }, g.id),
                            g.muteUntil > Date.now()
                              ? h('span', { className: 'as-chip' }, '闭麦中')
                              : h('span', { className: 'as-chip' }, `分数 ${g.score}`)),
                          h('div', { className: 'gmeta' }, `近窗 ${g.recent} 条 · 今天 ${g.stats?.count || 0} 看 / ${g.stats?.pass || 0} 接`),
                          h('div', { className: 'gmeta' },
                            `分数 ×${scoreF(g.score).toFixed(1)}`,
                            s.hunger === false ? '' : ` · 闲了 ${((Date.now() - (g.lastReplyAt || 0)) / 3600000).toFixed(1)}h ×${hungerF(g.lastReplyAt).toFixed(1)}`,
                            ` · 这次约 ${Math.min(100, Math.round((s.initialProb || 0) * scoreF(g.score) * (s.hunger === false ? 1 : hungerF(g.lastReplyAt)) * 100))}%`),
                          h('div', { className: 'grow' },
                            h('span', null),
                            h('button', {
                              className: 'as-btn',
                              onClick: () => post('/mute', { groupId: g.id, minutes: g.muteUntil > Date.now() ? 0 : 30 }).then(reload),
                            }, g.muteUntil > Date.now() ? '恢复' : '闭麦 30 分钟')),
                        ),
                      ),
                    ),
              ),
            )
          : null,

        tab === 'rules'
          ? h(
              'div',
              { className: 'as-panel' },
              h(Sec, {
                title: '概率',
                open: true,
                desc: '概率是这个插件的心脏。每条普通消息先按「初始概率」掷一次骰子，掷过了才可能进入判断。@、关键词、戳一戳是另外几条路，不受这一条限制。',
              },
                h(Field, { label: '初始读空气概率', hint: '每条普通消息的启动概率。0.02 = 2%，也就是平均 50 条里会看 1 条。' },
                  h(Num, { value: s.initialProb, onChange: (v) => set('initialProb', v), min: 0, max: 1 })),
                h(Field, { label: '回复后的概率', hint: '刚成功回过一条，整个群会话临时用这个概率，不分用户；这期间再成功回复会重新计时。开了注意力机制后，这一项不再参与计算。' },
                  h(Num, { value: s.replyProb, onChange: (v) => set('replyProb', v), min: 0, max: 1 })),
                h(Field, { label: '提升持续时间', hint: '秒。刚回过之后的窗口有多长，默认 120 秒。' },
                  h(Num, { value: s.replyBoostSec, onChange: (v) => set('replyBoostSec', v), min: 0, max: 3600 })),
                h(Field, { label: '注意力机制', hint: '按用户接管：跟你聊过的人再说话，概率会提高；开了它，上面那条「回复后的概率」就不参与计算了。' },
                  h(Switch, { value: s.attention, onChange: (v) => set('attention', v) })),
              ),
              h(Sec, {
                title: '接话规则',
                desc: '这几种消息不走概率：被 @ 是硬命令，关键词是暗号，@ 别人则是明确的「不是在跟你说话」。',
              },
                h(Field, { label: '@ 老子必接', hint: '被 @ 时跳过所有概率筛选，一定进判断。关掉就是 @ 也要掷骰子。' },
                  h(Switch, { value: s.atAlwaysReply, onChange: (v) => set('atAlwaysReply', v) })),
                h(Field, { label: '@ 别人时不插嘴', hint: '开：别人 @ 别人就闭嘴；关：只要这条消息里有 @，不管 @ 的是谁，老子都接一句（不计入主动额度，也不受日/时上限约束）。' },
                  h(Switch, { value: s.atOthersSkip, onChange: (v) => set('atOthersSkip', v) })),
                h(Field, { label: '关键词智能模式', hint: '命中关键词只跳过概率，仍然让读空气 AI 判断该不该回。关掉=命中就直接回。' },
                  h(Switch, { value: s.keywordSmart, onChange: (v) => set('keywordSmart', v) })),
                h(Field, { label: '关键词', hint: '逗号分隔，命中当 @ 处理。填 AI 的名字、别名都行；留空不启用。' },
                  h(Text, { value: (s.keywords || []).join('，'), onCommit: (v) => set('keywords', v), wide: true })),
              ),
              h(Sec, {
                title: '图片与表情',
                desc: '表情包和普通图片混在一起最容易被误读。这里认表情、降概率、把图片转成文字记账，省 token。',
              },
                h(Field, { label: '表情包过滤', hint: '用 QQ 的元数据认出表情包并降权，避免把表情包当普通图片去描述。' },
                  h(Switch, { value: s.stickerFilter, onChange: (v) => set('stickerFilter', v) })),
                h(Field, { label: '衰减因子', hint: '实际概率 = 原概率 ×(1−衰减)。0.7 = 降到 30%；1 = 完全屏蔽；0 = 只打标记不降。' },
                  h(Num, { value: s.stickerDecay, onChange: (v) => set('stickerDecay', v), min: 0, max: 1 })),
                h(Field, { label: '衰减最低门槛', hint: '原概率本来就很低时不再衰减，免得表情包永远轮不到。建议 0.05~0.15。' },
                  h(Num, { value: s.stickerFloor, onChange: (v) => set('stickerFloor', v), min: 0, max: 1 })),
                h(Field, { label: '图片描述缓存', hint: '图片转文字的结果按 URL 存本地，同一张图不再重复调用模型；所有群共享一份。' },
                  h(Switch, { value: s.captionCache, onChange: (v) => set('captionCache', v) })),
                h(Field, { label: '缓存上限', hint: `现在 ${state.captions} 条。超过自动清最旧的、保留 80% 最新；硬上限 5000。` },
                  h(Num, { value: s.captionCacheMax, onChange: (v) => set('captionCacheMax', v), min: 10, max: 5000 })),
              ),
              h(Sec, {
                title: '活跃与密度',
                desc: '防两种尴尬：死群里突然冒泡，和刷屏时跟着上头。',
              },
                h(Field, { label: '需要用户活跃', hint: '最近没人说话就不主动开口。强烈建议开着。' },
                  h(Switch, { value: s.needActivity, onChange: (v) => set('needActivity', v) })),
                h(Field, { label: '最少用户消息数', hint: '距老子上次发言后，至少攒够这么多条用户消息才考虑接。建议 5~10。' },
                  h(Num, { value: s.minUserMsgs, onChange: (v) => set('minUserMsgs', v), min: 1, max: 50 })),
                h(Field, { label: '活跃时间窗口', hint: '多少秒内有用户发言算「还活着」，默认 300 秒。' },
                  h(Num, { value: s.activityWindowSec, onChange: (v) => set('activityWindowSec', v), min: 60, max: 3600 })),
                h(Field, { label: '回复密度限制', hint: '统计本群最近一段时间老子回了多少次：没到上限不干预，超过后线性衰减，到硬限完全拦截。@ 和关键词不受限。' },
                  h(Switch, { value: s.density, onChange: (v) => set('density', v) })),
                h(Field, { label: '密度检测时长', hint: '统计最近多少秒内的回复次数，建议 180~600 秒。' },
                  h(Num, { value: s.densityWindowSec, onChange: (v) => set('densityWindowSec', v), min: 30, max: 3600 })),
                h(Field, { label: '窗口内硬限', hint: '窗口内最多回几条，达到后概率降为 0。建议 3~10。' },
                  h(Num, { value: s.densityMax, onChange: (v) => set('densityMax', v), min: 1, max: 50 })),
              ),
              h(Sec, {
                title: '额度与静默',
                desc: '总闸门。宁可少说，别把群刷成自己的独角戏。',
              },
                h(Field, { label: '每日上限', hint: '一天最多主动开口几次。只数老子自己插的话，@ 老子的回复不算，也不受它限制。' },
                  h(Num, { value: s.dailyCap, onChange: (v) => set('dailyCap', v), min: 1, max: 2000 })),
                h(Field, { label: '每小时上限', hint: '每小时最多主动开口几次，防一时上头。@ 的同样不计数。' },
                  h(Num, { value: s.hourlyCap, onChange: (v) => set('hourlyCap', v), min: 1, max: 500 })),
                h(Field, { label: '同人冷却', hint: '同一个人刚被回过，这段时间内不再追着答。0 = 关掉。' },
                  h(Num, { value: s.sameUserCooldownSec, onChange: (v) => set('sameUserCooldownSec', v), min: 0, max: 3600 })),
                h(Field, { label: '静默时段', hint: '这个时间段内一律不接，@ 也不接。' },
                  h(Switch, { value: s.quiet?.enabled, onChange: (v) => setNested('quiet', 'enabled', v) })),
                h(Field, { label: '静默范围', hint: '从 / 到，可跨零点，比如 23:30 — 07:30。' },
                  h('span', { style: { display: 'flex', gap: 6, alignItems: 'center' } },
                    h(Text, { value: s.quiet?.from, onCommit: (v) => setNested('quiet', 'from', v), style: { width: 64 } }),
                    h('span', { className: 'as-muted' }, '—'),
                    h(Text, { value: s.quiet?.to, onCommit: (v) => setNested('quiet', 'to', v), style: { width: 64 } }))),
                h(Field, { label: '吵架刷屏时闭嘴', hint: '窗口内消息突然爆量，先不插嘴，等安静下来再说。' },
                  h(Switch, { value: s.moodMute, onChange: (v) => set('moodMute', v) })),
              ),
              h(Sec, {
                title: '戳一戳',
                desc: '戳一戳是另一种「叫你」的方式。它能不掷骰子直接进判断，也能反手戳回去。',
              },
                h(Field, { label: '处理方式', hint: 'ignore 全忽略；bot_only 只认戳老子的；all 全都认，并告诉 AI 是谁戳了谁。' },
                  h('select', { className: 'as-sel', value: s.pokeMode, onChange: (e) => set('pokeMode', e.target.value) },
                    h('option', { value: 'ignore' }, '全部忽略'),
                    h('option', { value: 'bot_only' }, '只认戳老子'),
                    h('option', { value: 'all' }, '全部都认'))),
                h(Field, { label: '戳老子时不掷骰子', hint: '戳的是老子，直接进判断，不再过概率。' },
                  h(Switch, { value: s.pokeSkipProb, onChange: (v) => set('pokeSkipProb', v) })),
                h(Field, { label: '戳一戳概率增值', hint: '戳一戳消息额外加的通过率参考值，0 = 不加，1 = 必过。' },
                  h(Num, { value: s.pokeBoost, onChange: (v) => set('pokeBoost', v), min: 0, max: 1 })),
                h(Field, { label: '反戳概率', hint: '被戳后按这个概率直接戳回去，然后本条不再处理。' },
                  h(Num, { value: s.pokeBackProb, onChange: (v) => set('pokeBackProb', v), min: 0, max: 1 })),
                h(Field, { label: '回复后戳回去概率', hint: '主动回复时顺手戳一下提问的人。默认 0.15，太高会烦人。' },
                  h(Num, { value: s.replyPokeProb, onChange: (v) => set('replyPokeProb', v), min: 0, max: 1 })),
              ),
              h(Sec, {
                title: '过滤',
                desc: '不看的、不回的、不当真话处理的消息都在这一组。',
              },
                h(Field, { label: '黑名单用户', hint: '逗号分隔的 QQ 号。这些人的消息一律不看，但别的插件照常处理。' },
                  h(Text, { value: (s.blacklist || []).join('，'), onCommit: (v) => set('blacklist', v), wide: true })),
                h(Field, { label: '黑名单群', hint: '这些群直接不管，连 @ 也不接。' },
                  h(Text, { value: (s.blacklistGroups || []).join('，'), onCommit: (v) => set('blacklistGroups', v), wide: true })),
                h(Field, { label: '白名单群', hint: '填了之后只在列出的群里工作；留空 = 所有群都管。' },
                  h(Text, { value: (s.whitelistGroups || []).join('，'), onCommit: (v) => set('whitelistGroups', v), wide: true })),
                h(Field, { label: '指令前缀', hint: '以这些符号开头的消息当指令跳过，空格分隔，比如 / ! # ：。' },
                  h(Text, { value: (s.cmdPrefixes || []).join(' '), onCommit: (v) => set('cmdPrefixes', v), wide: true })),
              ),
              h(Sec, {
                title: '自适应分数',
                desc: '让频率自己贴合每个群：有人接话就敢多说，开口没人理就学会闭嘴。分数直接乘进概率。',
              },
                h(Field, { label: '启用', hint: '关掉之后分数固定，不再随互动涨落。' },
                  h(Switch, { value: s.adaptive, onChange: (v) => set('adaptive', v) })),
                h(Field, { label: '饥饿加成', hint: '越久没在这个群开口，概率越高，最多翻倍（5 小时到顶）。冷场不代表不该说话。' },
                  h(Switch, { value: s.hunger !== false, onChange: (v) => set('hunger', v) })),
                h(Field, { label: '初始分', hint: '新群第一次出现时的起始分，默认 50。' },
                  h(Num, { value: s.scoreInit, onChange: (v) => set('scoreInit', v), min: 0, max: 100 })),
                h(Field, { label: '有人接加分', hint: '主动开口有人回复时的加分，默认 15。' },
                  h(Num, { value: s.scoreSuccess, onChange: (v) => set('scoreSuccess', v), min: 0, max: 50 })),
                h(Field, { label: '没人理扣分', hint: '开口之后没人应声的扣分，默认 8。' },
                  h(Num, { value: s.scoreFail, onChange: (v) => set('scoreFail', v), min: 0, max: 50 })),
                h(Field, { label: '每日衰减', hint: '每 24 小时没互动自动扣一点，防止吃老本，默认 2。' },
                  h(Num, { value: s.scoreDailyDecay, onChange: (v) => set('scoreDailyDecay', v), min: 0, max: 20 })),
                h(Field, { label: '分数下限', hint: '再惨也不低于这个分，给个翻身机会。' },
                  h(Num, { value: s.scoreMin, onChange: (v) => set('scoreMin', v), min: 0, max: 100 })),
                h(Field, { label: '分数上限', hint: '再热也不超过这个分，防止越说越上头。' },
                  h(Num, { value: s.scoreMax, onChange: (v) => set('scoreMax', v), min: 0, max: 100 })),
              ),
              h(Sec, {
                title: 'AI 判断',
                desc: '概率过了之后，还要问一次「现在真的适合开口吗」。这一步会调一次模型，所以能省就省：只在 borderline 的时候问，超时就当不接。',
              },
                h(Field, { label: '判断时带人格', hint: '把三档记忆插件里的人设一起发给判断模型，让它按人格立场决定要不要开口。' },
                  h(Switch, { value: s.usePersona, onChange: (v) => set('usePersona', v) })),
                h(Field, { label: '超时时间', hint: '秒。超时按「不接」处理，不拖住消息。建议 10~30。' },
                  h(Num, { value: s.judgeTimeoutSec, onChange: (v) => set('judgeTimeoutSec', v), min: 5, max: 120 })),
                h('div', { className: 'as-field as-field-wide' },
                  h('div', { className: 'as-meta' },
                    h('span', { className: 'as-name' }, '判断提示词'),
                    h('span', { className: 'as-tip' }, '留空用默认。默认提示词里写死了：只回 yes 或 no，不解释；判断对象是「这一次适不适合主动开口」，不是「该怎么回」。改坏了也不影响回复本身，只是判断会变钝。')),
                  h('textarea', {
                    className: 'as-text as-prompt',
                    value: prompt,
                    placeholder: state.judgePromptDefault || '默认提示词',
                    onChange: (e) => { promptTouched.current = true; setPrompt(e.target.value) },
                  }),
                  h('div', { style: { display: 'flex', gap: 6, justifyContent: 'flex-end' } },
                    h('button', { className: 'as-btn', onClick: () => { promptTouched.current = false; setPrompt(''); save({ judgePrompt: '' }) } }, '用默认'),
                    h('button', { className: 'as-btn', onClick: () => save({ judgePrompt: prompt }) }, '保存'))),
              ),
              saving ? h('div', { className: 'as-note' }, '保存中…') : null,
            )
          : null,

        tab === 'log'
          ? h(
              'div',
              { className: 'as-card' },
              h('div', { className: 'as-card-title' }, '判断记录'),
              h('div', { className: 'as-card-desc' }, '每一条「为什么没接」都在这。接了的标绿，被规则拦掉的标红，分数变动单独一行。按内容、理由、昵称、群号都能搜，每页 10 条。'),
              h('div', { className: 'as-toolbar' },
                h('input', { className: 'as-text', style: { flex: 1, minWidth: 160 }, placeholder: '搜内容、理由、昵称、群号', value: q, onChange: (e) => setQ(e.target.value) }),
                h('span', { className: 'as-muted', style: { fontSize: 11.5 } }, `共 ${logs.length} 条`),
                h('button', { className: 'as-btn', 'data-danger': '1', onClick: () => post('/log/clear').then(reload) }, '清空')),
              logs.length === 0
                ? h('div', { className: 'as-empty' }, '还没有判断记录。')
                : h('div', { style: { marginTop: 8 } },
                    pageLogs.map((l, i) =>
                      h(
                        'div',
                        { className: 'as-logline', key: `${l.at}-${i}` },
                        h('span', { className: 'as-badge', 'data-k': l.kind === 'pass' ? 'pass' : l.kind === 'score' ? 'score' : 'block' },
                          l.kind === 'pass' ? '接' : l.kind === 'score' ? '分' : '不接'),
                        h('div', { className: 'as-logbody' },
                          h('div', { className: 'l1' }, l.reasonText || l.reason),
                          h('div', { className: 'l2' },
                            `${new Date(l.at).toLocaleString('zh-CN', { hour12: false })} · ${l.senderName || '某人'}${l.senderId ? `(${l.senderId})` : ''}${l.groupId ? ` · 群${l.groupId}` : ''}${l.text ? ` · ${String(l.text).slice(0, 60)}` : l.hasMedia ? ` · ${l.sticker ? '[表情包]' : '[图片]'}` : ''}${l.judge ? ` · judge:${l.judge}` : ''}`)),
                      ),
                    ),
                  ),
              h(Pager, { page: cur, count: pageCount, onPage: setPage }),
            )
          : null,

        tab === 'settings'
          ? h(
              'div',
              { className: 'as-panel' },
              h(Sec, {
                title: '消息加工',
                open: true,
                desc: '这两项不是判断，是给消息「化妆」：让 AI 知道这句话几点说的、谁说的。改完在 AstrBot 侧重载插件才生效。',
              },
                h(Field, { label: '消息前插入时间', hint: '在每条群消息前面加上发送时间，模型就知道这句话是几点说的。' },
                  h(Switch, { value: s.stamp?.timestamp, onChange: (v) => setNested('stamp', 'timestamp', v) })),
                h(Field, { label: '时间格式', hint: 'YYYY 年、MM 月、DD 日、HH 时、mm 分、ss 秒、W 星期；随便排，这几个占位符会被替换。' },
                  h(Text, { value: s.stamp?.timestampFormat, onCommit: (v) => setNested('stamp', 'timestampFormat', v), wide: true })),
                h(Field, { label: '插入发送者 ID 和名字', hint: '在消息里带上「昵称(QQ号)」，模型才知道是谁在说话。' },
                  h(Switch, { value: s.stamp?.sender, onChange: (v) => setNested('stamp', 'sender', v) })),
              ),
              h(Sec, {
                title: '并发',
                desc: '同一时间好几条消息挤进来时怎么办。调错不会崩，只是回复可能对不上最新那条。',
              },
                h(Field, { label: '模式', hint: '传统：每条独立走完整流程，最稳。智能：先等一小会，只回最新那条，避免顺序颠倒。' },
                  h('select', { className: 'as-sel', value: s.concurrencyMode, onChange: (e) => set('concurrencyMode', e.target.value) },
                    h('option', { value: 'legacy' }, '传统'),
                    h('option', { value: 'smart' }, '智能批处理'))),
                h(Field, { label: '等待循环次数', hint: '新消息最多等多少轮。默认 10，响应慢可以调高。' },
                  h(Num, { value: s.waitLoops, onChange: (v) => set('waitLoops', v), min: 1, max: 100 })),
                h(Field, { label: '等待间隔', hint: '秒。总等待 = 次数 × 间隔，默认 10 次 × 1 秒 = 最多等 10 秒。' },
                  h(Num, { value: s.waitIntervalSec, onChange: (v) => set('waitIntervalSec', v), min: 0.2, max: 30, step: 0.1 })),
              ),
              h(Sec, {
                title: '数据与迁移',
                desc: '所有东西都落在本地一个目录里，换插件目录、重装、备份，整目录拷走就行，不用一条条重配。',
              },
                h('div', { className: 'as-note', style: { gridColumn: '1 / -1', paddingTop: 2 } },
                  `数据目录：${state.dir || '~/.dsh/air-sense'}`,
                  h('br'),
                  '里面有：store.json（设置、群分数、日志、图片描述缓存）、token（AstrBot 侧鉴权）、air-sense.log（运行日志）。'),
                h('div', { style: { gridColumn: '1 / -1', display: 'flex', gap: 8, paddingTop: 10 } },
                  h('button', { className: 'as-btn', onClick: () => post('/settings/reset').then(reload) }, '恢复默认参数'),
                  h('button', { className: 'as-btn', 'data-danger': '1', onClick: () => post('/reset').then(reload) }, '清空所有群状态')),
              ),
            )
          : null,
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('settings.section', () =>
          ctx.slots.register({ name: 'settings.section', id: 'dsh-air-sense', order: 33, label: '读空气' }, () => h(Panel)),
        )
      },
    }
  },
})
