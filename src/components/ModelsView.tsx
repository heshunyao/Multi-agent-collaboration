import { useState } from 'react'
import type { AgentDef, ModelInfo, ModelInput, ModelListResult, ModelTestResult } from '../types'
import { Icon } from './Icon'
import { ModelDrawer } from './ModelDrawer'

interface ModelsViewProps {
  models: ModelInfo[]
  agents: AgentDef[]
  onSave: (input: ModelInput, id?: string) => Promise<void>
  onDelete: (model: ModelInfo) => Promise<void>
  onToggle: (model: ModelInfo) => Promise<void>
  onTest: (input: {
    id?: string
    baseUrl?: string
    modelName?: string
    apiKey?: string
  }) => Promise<ModelTestResult>
  onListModels: (input: { id?: string; baseUrl?: string; apiKey?: string }) => Promise<ModelListResult>
  onOpenAgents: () => void
}

type TestState = ModelTestResult | 'loading' | undefined

export function ModelsView({
  models,
  agents,
  onSave,
  onDelete,
  onToggle,
  onTest,
  onListModels,
  onOpenAgents,
}: ModelsViewProps) {
  const [editing, setEditing] = useState<{ model: ModelInfo | null; isNew: boolean } | null>(null)
  const [tests, setTests] = useState<Record<string, TestState>>({})
  const [notice, setNotice] = useState('')

  const enabledAgents = agents.filter((a) => a.enabled)
  const readyModels = models.filter((m) => m.connected && m.hasKey)

  const runTest = async (model: ModelInfo) => {
    setTests((t) => ({ ...t, [model.id]: 'loading' }))
    try {
      const result = await onTest({ id: model.id })
      setTests((t) => ({ ...t, [model.id]: result }))
    } catch (err) {
      setTests((t) => ({
        ...t,
        [model.id]: { ok: false, error: err instanceof Error ? err.message : '测试失败' },
      }))
    }
  }

  const remove = async (model: ModelInfo) => {
    setNotice('')
    try {
      await onDelete(model)
    } catch (err) {
      setNotice(err instanceof Error ? err.message : '删除失败')
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <span className="eyebrow">MODEL HUB</span>
          <h1>模型中心</h1>
          <p>配置 DeepSeek、GPT、Qwen 等 OpenAI 兼容模型，测试连通性后即可绑定到 Agent。</p>
        </div>
        <div className="page-actions">
          <div className="head-stat">
            <b>{models.length}</b>
            <em>模型</em>
          </div>
          <div className="head-stat">
            <b>{readyModels.length}</b>
            <em>就绪</em>
          </div>
          <button className="btn primary" onClick={() => setEditing({ model: null, isNew: true })}>
            <Icon name="plus" size={14} /> 接入新模型
          </button>
        </div>
      </header>

      {notice && (
        <div className="notice warn">
          <Icon name="x" size={13} /> {notice}
        </div>
      )}

      {!readyModels.length && (
        <div className="notice">
          <Icon name="zap" size={13} />
          还没有可用的模型：请为至少一个模型填写 Base URL 与 API Key，并点击「测试连接」确认可用。
        </div>
      )}

      <div className="model-grid">
        {models.map((m) => {
          const users = enabledAgents.filter((a) => a.model === m.id)
          const test = tests[m.id]
          return (
            <article key={m.id} className={`model-card ${m.connected ? '' : 'off'}`} style={{ ['--mc' as string]: m.color }}>
              <div className="model-card-head">
                <span className="model-logo" style={{ background: m.color }}>
                  {m.label.slice(0, 1)}
                </span>
                <div className="model-card-title">
                  <b>{m.label}</b>
                  <em>{m.vendor}</em>
                </div>
                <button
                  className={`switch small ${m.connected ? 'on' : ''}`}
                  onClick={() => onToggle(m)}
                  aria-label="toggle"
                >
                  <i />
                </button>
              </div>

              <p className="model-desc">{m.tags.length ? m.tags.join(' · ') : '暂无能力标签'}</p>

              <div className="model-specs">
                <div>
                  <em>模型标识</em>
                  <b title={m.modelName}>{m.modelName || '—'}</b>
                </div>
                <div>
                  <em>上下文</em>
                  <b>{m.context}</b>
                </div>
                <div>
                  <em>价格</em>
                  <b>{m.price}</b>
                </div>
              </div>

              <div className="model-endpoint" title={m.baseUrl}>
                <Icon name="server" size={12} />
                <span>{m.baseUrl || '未配置 Base URL'}</span>
              </div>

              <div className="model-key">
                <span className={`conn-state ${m.hasKey ? 'on' : ''}`}>
                  <i /> {m.hasKey ? `API Key ${m.apiKeyMasked}` : '未配置 API Key'}
                </span>
              </div>

              <div className="model-usage">
                <span className="usage-label">承担 Agent</span>
                {users.length === 0 ? (
                  <span className="usage-empty">未分配</span>
                ) : (
                  <div className="usage-chips">
                    {users.map((a) => (
                      <span key={a.id} className="usage-chip">
                        <i style={{ background: m.color }} />
                        {a.name.replace(' Agent', '')}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {test && test !== 'loading' && (
                <div className={`test-inline ${test.ok ? 'ok' : 'fail'}`}>
                  <Icon name={test.ok ? 'check' : 'x'} size={11} />
                  {test.ok
                    ? `${test.detail || '连接成功'}${test.latency ? ` · ${test.latency}ms` : ''}`
                    : test.error}
                </div>
              )}

              <div className="model-card-foot">
                <button className="link-btn" onClick={() => runTest(m)} disabled={test === 'loading' || !m.baseUrl}>
                  {test === 'loading' ? <span className="spinner" /> : <Icon name="zap" size={12} />}
                  {test === 'loading' ? '测试中…' : '测试连接'}
                </button>
                <div className="model-card-actions">
                  <button className="link-btn" onClick={() => setEditing({ model: m, isNew: false })}>
                    <Icon name="sliders" size={12} /> 配置
                  </button>
                  <button className="link-btn danger" onClick={() => remove(m)}>
                    <Icon name="trash" size={12} />
                  </button>
                </div>
              </div>
            </article>
          )
        })}

        <button className="agent-add" onClick={() => setEditing({ model: null, isNew: true })}>
          <span className="agent-add-icon">
            <Icon name="plus" size={20} />
          </span>
          <b>接入新模型</b>
          <em>支持任意 OpenAI 兼容协议的服务</em>
        </button>
      </div>

      <button className="inline-link" onClick={onOpenAgents}>
        前往 Agent 配置，把模型绑定到 Agent <Icon name="arrowRight" size={12} />
      </button>

      {editing && (
        <ModelDrawer
          model={editing.model}
          isNew={editing.isNew}
          onClose={() => setEditing(null)}
          onSave={async (input, id) => {
            await onSave(input, id)
            setEditing(null)
            setTests({})
          }}
          onTest={onTest}
          onListModels={onListModels}
        />
      )}
    </div>
  )
}
