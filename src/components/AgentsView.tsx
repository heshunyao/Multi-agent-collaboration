import { useState } from 'react'
import type { AgentDef } from '../types'
import { modelOf } from '../data/presets'
import { Icon } from './Icon'
import { AgentAvatar, ModelBadge } from './ui'

interface AgentsViewProps {
  agents: AgentDef[]
  onEdit: (agent: AgentDef) => void
  onNew: () => void
  onToggle: (id: string) => void
  onChat: (agent: AgentDef) => void
}

export function AgentsView({ agents, onEdit, onNew, onToggle, onChat }: AgentsViewProps) {
  const enabled = agents.filter((a) => a.enabled)
  const [query, setQuery] = useState('')

  const keyword = query.trim().toLowerCase()
  const list = keyword
    ? agents.filter((a) =>
        [a.name, a.role, ...a.responsibilities, ...a.tools, a.id].join(' ').toLowerCase().includes(keyword),
      )
    : agents

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <span className="eyebrow">AGENT STUDIO</span>
          <h1>Agent 配置</h1>
          <p>自定义每个 Agent 的大模型、职责、工具与系统提示词，组队方式完全由你决定。</p>
        </div>
        <div className="page-actions">
          <div className="head-stat">
            <b>{enabled.length}</b>
            <em>参与协作</em>
          </div>
          <div className="head-stat">
            <b>{new Set(agents.map((a) => a.model)).size}</b>
            <em>绑定模型</em>
          </div>
          <button className="btn primary" onClick={onNew}>
            <Icon name="plus" size={14} /> 新增 Agent
          </button>
        </div>
      </header>

      <div className="toolbar">
        <label className="search-box">
          <Icon name="search" size={14} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索 Agent 名称、职责或工具…"
          />
          {query && (
            <button className="icon-btn ghost" onClick={() => setQuery('')}>
              <Icon name="x" size={13} />
            </button>
          )}
        </label>
        <span className="toolbar-count">
          {list.length} / {agents.length} 个 Agent
        </span>
      </div>

      <div className="agent-grid">
        {list.map((agent) => {
          const info = modelOf(agent.model)
          return (
            <article
              key={agent.id}
              className={`agent-card ${agent.enabled ? '' : 'disabled'}`}
              style={{ ['--mc' as string]: info.color }}
            >
              <div className="agent-card-head">
                <AgentAvatar icon={agent.icon} model={agent.model} size={38} muted={!agent.enabled} />
                <div className="agent-card-title">
                  <b>{agent.name}</b>
                  <em>{agent.role}</em>
                </div>
                <button
                  className={`switch small ${agent.enabled ? 'on' : ''}`}
                  onClick={() => onToggle(agent.id)}
                  aria-label="toggle"
                >
                  <i />
                </button>
              </div>

              <div className="agent-card-meta">
                <ModelBadge model={agent.model} size="md" />
                <span className="agent-temp">T {agent.temperature.toFixed(1)}</span>
                <span className={`agent-live ${agent.enabled ? 'on' : ''}`}>{agent.enabled ? '已组队' : '未参与'}</span>
              </div>

              <ul className="agent-duties">
                {agent.responsibilities.slice(0, 3).map((r) => (
                  <li key={r}>{r}</li>
                ))}
                {agent.responsibilities.length === 0 && <li className="muted">尚未填写职责</li>}
              </ul>

              <div className="agent-tools">
                {agent.tools.slice(0, 4).map((t) => (
                  <span key={t}>{t}</span>
                ))}
                {agent.tools.length > 4 && <span className="more">+{agent.tools.length - 4}</span>}
              </div>

              <div className="agent-card-foot">
                <button className="btn primary small" onClick={() => onChat(agent)}>
                  <Icon name="sparkle" size={13} /> 对话
                </button>
                <div className="agent-card-actions">
                  <button className="btn ghost small" onClick={() => onEdit(agent)}>
                    <Icon name="sliders" size={13} /> 配置
                  </button>
                  <span className="agent-id">{agent.id.length > 14 ? agent.id.slice(0, 14) + '…' : agent.id}</span>
                </div>
              </div>
            </article>
          )
        })}

        {query && list.length === 0 && (
          <div className="agent-empty">
            <Icon name="search" size={18} />
            没有匹配「{query}」的 Agent
          </div>
        )}

        <button className="agent-add" onClick={onNew}>
          <span className="agent-add-icon">
            <Icon name="plus" size={20} />
          </span>
          <b>新增 Agent</b>
          <em>分配模型、职责与工具，加入你的研发团队</em>
        </button>
      </div>
    </div>
  )
}

