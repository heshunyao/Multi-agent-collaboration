import { useEffect, useRef, useState } from 'react'
import type { AgentDef, ChatMessage, ConversationSummary, ModelInfo } from '../types'
import { AGENT_CHAT_SUGGESTIONS, modelOf } from '../data/presets'
import { streamChat } from '../lib/streamChat'
import { Icon } from './Icon'
import { AgentAvatar, LiveDot, ModelBadge, timeAgo } from './ui'

interface AgentChatProps {
  agents: AgentDef[]
  models: ModelInfo[]
  agentId: string | null
  onSelectAgent: (id: string) => void
  conversations: ConversationSummary[]
  activeConversationId: string | null
  onSelectConversation: (id: string) => void
  onCreateConversation: (agentId: string) => Promise<string | null>
  onDeleteConversation: (id: string) => void
  onConversationsChanged: () => void
  onOpenConfig: (agent: AgentDef) => void
  onOpenModels: () => void
}

export function AgentChat({
  agents,
  models,
  agentId,
  onSelectAgent,
  conversations,
  activeConversationId,
  onSelectConversation,
  onCreateConversation,
  onDeleteConversation,
  onConversationsChanged,
  onOpenConfig,
  onOpenModels,
}: AgentChatProps) {
  const agent = agents.find((a) => a.id === agentId) ?? agents[0] ?? null
  const model = agent ? models.find((m) => m.id === agent.model) ?? modelOf(agent.model) : null
  const agentConversations = conversations
    .filter((c) => c.agentId === agent?.id)
    .sort((a, b) => b.updatedAt - a.updatedAt)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const justCreatedRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setError('')
    if (!activeConversationId) {
      setMessages([])
      return
    }
    if (justCreatedRef.current === activeConversationId) {
      justCreatedRef.current = null
      setLoading(false)
      return
    }
    setLoading(true)
    fetch(`/api/conversations/${activeConversationId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('会话加载失败'))))
      .then((data) => {
        if (!cancelled) setMessages(Array.isArray(data.messages) ? data.messages : [])
      })
      .catch(() => {
        if (!cancelled) setError('会话加载失败，请稍后重试')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [activeConversationId])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages, streaming])

  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }, [draft])

  useEffect(() => {
    setDraft('')
    setError('')
  }, [agentId])

  const modelReady = Boolean(model && model.hasKey && model.baseUrl && model.connected)

  const send = async (text?: string) => {
    const content = (text ?? draft).trim()
    if (!content || streaming || !agent) return
    setError('')

    let convId = activeConversationId
    if (!convId) {
      convId = await onCreateConversation(agent.id)
      if (!convId) return
      justCreatedRef.current = convId
    }

    const stamp = Date.now()
    const userId = 'local-u-' + stamp
    const assistantId = 'local-a-' + stamp
    setMessages((prev) => [
      ...prev,
      { id: userId, role: 'user', content, createdAt: stamp },
      { id: assistantId, role: 'assistant', content: '', createdAt: stamp, modelId: agent.model },
    ])
    setDraft('')
    setStreaming(true)
    const controller = new AbortController()
    abortRef.current = controller

    try {
      await streamChat(
        convId,
        content,
        {
          onMeta: (payload) => {
            setMessages((prev) => prev.map((m) => (m.id === userId ? payload.userMessage : m)))
          },
          onDelta: (delta) => {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + delta } : m)),
            )
          },
          onReasoning: (delta) => {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, reasoning: (m.reasoning || '') + delta } : m)),
            )
          },
          onDone: (payload) => {
            setMessages((prev) => prev.map((m) => (m.id === assistantId ? payload.message : m)))
            onConversationsChanged()
          },
          onError: (message) => {
            setError(message)
            setMessages((prev) => prev.filter((m) => m.id !== assistantId))
            onConversationsChanged()
          },
          onAborted: () => {
            setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, aborted: true } : m)))
            onConversationsChanged()
          },
        },
        controller.signal,
      )
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setError(err instanceof Error ? err.message : '对话失败')
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }

  const stop = () => {
    abortRef.current?.abort()
  }

  const newConversation = async () => {
    if (!agent) return
    const id = await onCreateConversation(agent.id)
    if (id) {
      justCreatedRef.current = id
      setMessages([])
      setError('')
    }
  }

  if (!agent) {
    return (
      <div className="agentchat empty-chat">
        <Icon name="cpu" size={26} />
        <h2>还没有可对话的 Agent</h2>
        <p>先创建或启用一个 Agent，再开始独立对话。</p>
      </div>
    )
  }

  return (
    <div className="agentchat">
      <aside className="ac-rail">
        <div className="ac-rail-head">
          <span>Agent 对话</span>
          <button className="icon-btn ghost" title="新会话" onClick={newConversation} disabled={streaming}>
            <Icon name="plus" size={15} />
          </button>
        </div>

        <label className="ac-select">
          <AgentAvatar icon={agent.icon} model={agent.model} size={26} />
          <select value={agent.id} onChange={(e) => onSelectAgent(e.target.value)}>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <Icon name="chevronDown" size={13} />
        </label>

        <div className="ac-conv-head">
          <span>会话记录</span>
          <span className="ac-conv-count">{agentConversations.length}</span>
        </div>

        <div className="ac-conv-list">
          {agentConversations.length === 0 && (
            <p className="ac-conv-empty">还没有会话，发送第一条消息即可创建。</p>
          )}
          {agentConversations.map((c) => (
            <div
              key={c.id}
              className={`ac-conv ${c.id === activeConversationId ? 'active' : ''}`}
              onClick={() => onSelectConversation(c.id)}
            >
              <span className="ac-conv-icon">
                <Icon name="terminal" size={13} />
              </span>
              <span className="ac-conv-main">
                <b>{c.title}</b>
                <em>
                  {c.messageCount} 条消息 · {timeAgo(c.updatedAt)}
                </em>
              </span>
              <button
                className="ac-conv-del"
                title="删除会话"
                onClick={(e) => {
                  e.stopPropagation()
                  onDeleteConversation(c.id)
                }}
              >
                <Icon name="trash" size={12} />
              </button>
            </div>
          ))}
        </div>

        <div className="ac-rail-foot">
          <div className="ac-model-line">
            <i style={{ background: model?.color ?? '#6b7280' }} />
            <span>{model?.label ?? '未绑定模型'}</span>
            <em>{model?.modelName || '—'}</em>
          </div>
          <button className="link-btn" onClick={onOpenModels}>
            管理模型 <Icon name="arrowRight" size={12} />
          </button>
        </div>
      </aside>

      <section className="ac-main">
        <header className="ac-head">
          <div className="ac-head-agent">
            <AgentAvatar icon={agent.icon} model={agent.model} size={34} />
            <div>
              <b>{agent.name}</b>
              <em>{agent.role || '未填写职责'}</em>
            </div>
            <ModelBadge model={agent.model} size="md" />
            <span className={`ac-state ${streaming ? 'live' : ''}`}>
              <LiveDot active={streaming} />
              {streaming ? '生成中' : '在线'}
            </span>
          </div>
          <div className="ac-head-actions">
            <button className="btn small ghost" onClick={() => onOpenConfig(agent)}>
              <Icon name="sliders" size={13} /> Agent 配置
            </button>
          </div>
        </header>

        {!modelReady && (
          <div className="notice warn ac-notice">
            <Icon name="zap" size={13} />
            <span>
              「{model?.label ?? '未绑定模型'}」尚未完成配置（Base URL / API Key / 启用），当前无法真实调用模型。
            </span>
            <button className="link-btn" onClick={onOpenModels}>
              去配置 <Icon name="arrowRight" size={12} />
            </button>
          </div>
        )}

        <div className="ac-messages" ref={scrollRef}>
          {loading ? (
            <div className="ac-loading">
              <span className="spinner" /> 正在加载会话记录…
            </div>
          ) : messages.length === 0 ? (
            <div className="ac-empty">
              <AgentAvatar icon={agent.icon} model={agent.model} size={46} />
              <h2>你好，我是 {agent.name}</h2>
              <p>{agent.role || '随时可以开始对话'}</p>
              <div className="ac-suggests">
                {AGENT_CHAT_SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)} disabled={streaming}>
                    {s}
                  </button>
                ))}
              </div>
              {!modelReady && <p className="ac-empty-hint">提示：完成模型配置后才能真正获得回答。</p>}
            </div>
          ) : (
            <div className="ac-thread">
              {messages.map((m) => (
                <div key={m.id} className={`msg-row ${m.role}`}>
                  {m.role === 'assistant' && (
                    <AgentAvatar icon={agent.icon} model={m.modelId || agent.model} size={28} />
                  )}
                  <div
                    className={`msg-body ${m.role}`}
                    style={{ ['--mc' as string]: model?.color ?? '#6b7280' }}
                  >
                    {m.role === 'assistant' && (
                      <div className="msg-meta">
                        <b>{agent.name}</b>
                        <ModelBadge model={m.modelId || agent.model} />
                        <span>{new Date(m.createdAt).toLocaleTimeString('zh-CN', { hour12: false })}</span>
                      </div>
                    )}
                    {m.reasoning && (
                      <details className="msg-reasoning">
                        <summary>推理过程 · {m.reasoning.length} 字</summary>
                        <p>{m.reasoning}</p>
                      </details>
                    )}
                    {m.content ? (
                      <p className="msg-text">
                        {m.content}
                        {streaming && m.id === messages[messages.length - 1]?.id && m.role === 'assistant' && (
                          <span className="caret" />
                        )}
                      </p>
                    ) : (
                      m.role === 'assistant' && (
                        <p className="msg-waiting">
                          <i className="typing"><i /><i /><i /></i> 正在思考…
                        </p>
                      )
                    )}
                    {m.aborted && <p className="msg-aborted">已中止生成</p>}
                  </div>
                  {m.role === 'user' && <span className="msg-user-avatar">我</span>}
                </div>
              ))}
              {error && (
                <div className="msg-error">
                  <Icon name="x" size={13} />
                  <span>{error}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="ac-composer">
          <div className="composer">
            <textarea
              ref={areaRef}
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  send()
                }
              }}
              placeholder={`向 ${agent.name} 发送消息…`}
            />
            <div className="composer-bar">
              <div className="composer-left">
                <span className="chip-btn static">
                  <span className="model-dot" style={{ background: model?.color ?? '#6b7280' }} />
                  {model?.label ?? '未绑定模型'}
                  <span className="tag muted">{model?.modelName || '—'}</span>
                </span>
                <span className="ac-mode">
                  <Icon name="zap" size={12} /> SSE 流式
                </span>
              </div>
              <div className="composer-right">
                <span className="composer-tip">Enter 发送</span>
                {streaming ? (
                  <button className="send-btn stop" onClick={stop} title="中止生成">
                    <Icon name="stop" size={15} />
                  </button>
                ) : (
                  <button className="send-btn" disabled={!draft.trim()} onClick={() => send()} title="发送">
                    <Icon name="arrowUp" size={17} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <aside className="ac-side">
        <div className="ac-side-head">
          <span>Agent 档案</span>
          <button className="icon-btn ghost" onClick={() => onOpenConfig(agent)}>
            <Icon name="sliders" size={14} />
          </button>
        </div>

        <div className="ac-profile">
          <AgentAvatar icon={agent.icon} model={agent.model} size={42} />
          <b>{agent.name}</b>
          <em>{agent.role}</em>
          <div className="ac-profile-tags">
            <ModelBadge model={agent.model} size="md" />
            <span className="agent-temp">T {agent.temperature.toFixed(1)}</span>
          </div>
        </div>

        <div className="ac-block">
          <span className="ac-block-label">职责</span>
          <ul className="ac-duty-list">
            {agent.responsibilities.length ? (
              agent.responsibilities.map((r) => <li key={r}>{r}</li>)
            ) : (
              <li className="muted">未填写</li>
            )}
          </ul>
        </div>

        <div className="ac-block">
          <span className="ac-block-label">授权工具</span>
          <div className="ac-tools">
            {agent.tools.length ? agent.tools.map((t) => <span key={t}>{t}</span>) : <span className="muted">无</span>}
          </div>
        </div>

        <div className="ac-block">
          <span className="ac-block-label">System Prompt</span>
          <p className="ac-prompt">{agent.systemPrompt || '未设置系统提示词'}</p>
        </div>

        <div className="ac-block">
          <span className="ac-block-label">模型状态</span>
          <div className="ac-model-state">
            <i className={`dot ${modelReady ? 'ok' : ''}`} />
            <span>{modelReady ? '已就绪，可发起对话' : '待配置 API Key / Base URL'}</span>
          </div>
          <p className="ac-endpoint">{model?.baseUrl || '未配置 Base URL'}</p>
        </div>

        <button className="insp-cta" onClick={() => onOpenConfig(agent)}>
          <Icon name="sliders" size={14} /> 编辑 Agent 配置
          <Icon name="arrowRight" size={13} />
        </button>
      </aside>
    </div>
  )
}
