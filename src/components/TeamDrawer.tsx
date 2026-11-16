import { useEffect, useState, type CSSProperties } from 'react'
import type { AgentDef } from '../types'
import type { Team, TeamInput, TeamMode } from '../lib/teamApi'
import { TEAM_MODE_HINT, TEAM_MODE_LABEL } from '../lib/teamApi'
import { modelOf } from '../data/presets'
import { Icon } from './Icon'
import { AgentAvatar, ModelBadge } from './ui'

interface TeamDrawerProps {
  team: Team | null
  agents: AgentDef[]
  defaultAgentIds: string[]
  onClose: () => void
  onSave: (input: TeamInput, id?: string) => void | Promise<void>
  onDelete?: (id: string) => void
}

export function TeamDrawer({ team, agents, defaultAgentIds, onClose, onSave, onDelete }: TeamDrawerProps) {
  const [name, setName] = useState(team?.name ?? '我的协作团队')
  const [description, setDescription] = useState(team?.description ?? '')
  const [mode, setMode] = useState<TeamMode>(team?.mode ?? 'sequential')
  const [selected, setSelected] = useState<string[]>(() =>
    (team?.agentIds ?? defaultAgentIds).filter((id) => agents.some((agent) => agent.id === id)),
  )
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
  }

  const valid = name.trim().length > 0 && selected.length >= 2 && !submitting

  const submit = async () => {
    if (!valid) return
    setSubmitting(true)
    try {
      await onSave(
        {
          name: name.trim(),
          description: description.trim(),
          mode,
          agentIds: selected,
        },
        team?.id,
      )
    } catch {
      /* 错误由上层提示 */
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="drawer-layer">
      <div className="drawer-scrim" onClick={onClose} />
      <div className="drawer">
        <header className="drawer-head">
          <div className="drawer-title">
            <span className="team-drawer-mark">
              <Icon name="users" size={19} />
            </span>
            <div>
              <h3>{team ? '编辑 Agent 团队' : '新建 Agent 团队'}</h3>
              <p>选择多个 Agent 组成团队，协作模式会随团队一起保存。</p>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose}>
            <Icon name="x" size={17} />
          </button>
        </header>

        <div className="drawer-body">
          <label className="field">
            <span className="field-label">团队名称</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：商城研发团队" />
          </label>

          <label className="field">
            <span className="field-label">团队说明</span>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="描述这个团队的职责与适用场景…"
            />
          </label>

          <div className="field">
            <span className="field-label">协作模式</span>
            <div className="segmented">
              {(['sequential', 'group'] as const).map((item) => (
                <button
                  key={item}
                  className={`segment ${mode === item ? 'selected' : ''}`}
                  onClick={() => setMode(item)}
                >
                  {TEAM_MODE_LABEL[item]}
                </button>
              ))}
            </div>
            <p className="field-hint">{TEAM_MODE_HINT[mode]}</p>
          </div>

          <div className="field">
            <div className="field-row">
              <span className="field-label">团队成员</span>
              <b>{selected.length} / {agents.length}</b>
            </div>
            <p className="field-hint">至少选择 2 个 Agent。项目经理负责规划与汇总。</p>
            <div className="team-agent-list">
              {agents.map((agent) => {
                const info = modelOf(agent.model)
                const on = selected.includes(agent.id)
                return (
                  <button
                    key={agent.id}
                    className={`team-agent-option ${on ? 'selected' : ''}`}
                    style={{ '--mc': info.color } as CSSProperties}
                    onClick={() => toggle(agent.id)}
                  >
                    <AgentAvatar icon={agent.icon} model={agent.model} size={30} />
                    <span className="team-agent-main">
                      <b>{agent.name}</b>
                      <em>{agent.role}</em>
                    </span>
                    <ModelBadge model={agent.model} />
                    <span className={`team-agent-check ${on ? 'on' : ''}`}>
                      {on && <Icon name="check" size={12} />}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {!valid && selected.length < 2 && <p className="form-error">团队至少需要 2 个 Agent。</p>}
        </div>

        <footer className="drawer-foot">
          {team && onDelete && (
            <button className="btn danger" onClick={() => onDelete(team.id)}>
              <Icon name="trash" size={14} /> 删除团队
            </button>
          )}
          <div className="drawer-foot-right">
            <button className="btn" onClick={onClose}>
              取消
            </button>
            <button className="btn primary" disabled={!valid} onClick={submit}>
              {submitting ? <span className="spinner" /> : <Icon name="check" size={14} />}
              {team ? '保存团队' : '创建团队'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
