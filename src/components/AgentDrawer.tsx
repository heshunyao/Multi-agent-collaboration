import { useEffect, useState, type CSSProperties } from 'react'
import type { AgentDef, ModelId, ModelInfo } from '../types'
import { TOOL_POOL, modelOf } from '../data/presets'
import { Icon } from './Icon'
import { AgentAvatar } from './ui'

interface AgentDrawerProps {
  agent: AgentDef
  isNew: boolean
  models: ModelInfo[]
  onClose: () => void
  onSave: (agent: AgentDef) => void
  onDelete?: (id: string) => void
}

export function AgentDrawer({ agent, isNew, models, onClose, onSave, onDelete }: AgentDrawerProps) {
  const [draft, setDraft] = useState<AgentDef>(agent)

  useEffect(() => setDraft(agent), [agent])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const patch = <K extends keyof AgentDef>(key: K, value: AgentDef[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const toggleTool = (tool: string) =>
    setDraft((d) => ({
      ...d,
      tools: d.tools.includes(tool) ? d.tools.filter((t) => t !== tool) : [...d.tools, tool],
    }))

  return (
    <div className="drawer-layer">
      <div className="drawer-scrim" onClick={onClose} />
      <div className="drawer">
        <header className="drawer-head">
          <div className="drawer-title">
            <AgentAvatar icon={draft.icon} model={draft.model} size={38} />
            <div>
              <h3>{isNew ? '新增 Agent' : '配置 Agent'}</h3>
              <p>{modelOf(draft.model).vendor} · {modelOf(draft.model).context}</p>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose}>
            <Icon name="x" size={17} />
          </button>
        </header>

        <div className="drawer-body">
          <label className="field">
            <span className="field-label">名称</span>
            <input value={draft.name} onChange={(e) => patch('name', e.target.value)} placeholder="例如：安全审计 Agent" />
          </label>

          <label className="field">
            <span className="field-label">职责概述</span>
            <input value={draft.role} onChange={(e) => patch('role', e.target.value)} placeholder="例如：依赖扫描 · 合规检查" />
          </label>

          <div className="field">
            <span className="field-label">分配大模型</span>
            <div className="model-select">
              {models.map((m) => {
                const isOn = m.connected
                return (
                  <button
                    key={m.id}
                    className={`model-option ${draft.model === m.id ? 'selected' : ''} ${isOn ? '' : 'disabled'}`}
                    style={{ '--mc': m.color } as CSSProperties}
                    onClick={() => isOn && patch('model', m.id as ModelId)}
                  >
                    <i className="model-dot" />
                    <b>{m.label}</b>
                    <em>{m.hasKey ? m.vendor : '未配置 Key'}</em>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="field">
            <span className="field-label">Agent 类型（决定参与阶段）</span>
            <div className="segmented">
              {([
                ['pm', '项目管理'],
                ['arch', '架构设计'],
                ['backend', '后端实现'],
                ['frontend', '前端实现'],
                ['qa', '测试验证'],
                ['reviewer', '代码审查'],
              ] as const).map(([icon, label]) => (
                <button
                  key={icon}
                  className={`segment ${draft.icon === icon ? 'selected' : ''}`}
                  onClick={() => patch('icon', icon)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <label className="field">
            <span className="field-label">具体职责（每行一条）</span>
            <textarea
              rows={3}
              value={draft.responsibilities.join('\n')}
              onChange={(e) => patch('responsibilities', e.target.value.split('\n').filter(Boolean))}
            />
          </label>

          <div className="field">
            <span className="field-label">授权工具</span>
            <div className="tool-chips">
              {TOOL_POOL.map((tool) => (
                <button
                  key={tool}
                  className={`tool-chip ${draft.tools.includes(tool) ? 'on' : ''}`}
                  onClick={() => toggleTool(tool)}
                >
                  {draft.tools.includes(tool) && <Icon name="check" size={11} />}
                  {tool}
                </button>
              ))}
            </div>
          </div>

          <label className="field">
            <span className="field-label">System Prompt</span>
            <textarea rows={4} value={draft.systemPrompt} onChange={(e) => patch('systemPrompt', e.target.value)} />
          </label>

          <div className="field">
            <div className="field-row">
              <span className="field-label">温度 temperature</span>
              <b>{draft.temperature.toFixed(1)}</b>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={draft.temperature}
              onChange={(e) => patch('temperature', Number(e.target.value))}
            />
            <p className="field-hint">越低越稳定，适合代码与审查；越高越发散，适合方案探索。</p>
          </div>

          <div className="field switch-field">
            <div>
              <span className="field-label">加入协作团队</span>
              <p className="field-hint">关闭后该 Agent 不参与下一次自动编排。</p>
            </div>
            <button
              className={`switch ${draft.enabled ? 'on' : ''}`}
              onClick={() => patch('enabled', !draft.enabled)}
              aria-label="toggle"
            >
              <i />
            </button>
          </div>
        </div>

        <footer className="drawer-foot">
          {!isNew && onDelete && (
            <button className="btn danger" onClick={() => onDelete(draft.id)}>
              <Icon name="trash" size={14} /> 删除
            </button>
          )}
          <div className="drawer-foot-right">
            <button className="btn" onClick={onClose}>
              取消
            </button>
            <button className="btn primary" onClick={() => onSave(draft)}>
              <Icon name="check" size={14} /> 保存配置
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
