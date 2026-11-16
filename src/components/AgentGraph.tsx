import type { CSSProperties } from 'react'
import type { AgentDef, AgentLiveState } from '../types'
import { modelOf } from '../data/presets'
import { Icon } from './Icon'
import { AgentAvatar, ModelBadge, STATUS_TEXT } from './ui'

interface AgentGraphProps {
  agents: AgentDef[]
  states: Record<string, AgentLiveState>
  deliveryProgress: number
  onAgentClick?: (agent: AgentDef) => void
  size?: 'sm' | 'md' | 'lg'
  showParallelLabel?: boolean
}

function Connector({ active, done }: { active: boolean; done: boolean }) {
  return (
    <div className={`connector ${active ? 'active' : ''} ${done ? 'done' : ''}`}>
      <i className="connector-line" />
      {active && <i className="connector-pulse" />}
      <Icon name="arrowDown" size={13} className="connector-arrow" />
    </div>
  )
}

function AgentNode({
  agent,
  state,
  onClick,
  size,
}: {
  agent: AgentDef
  state: AgentLiveState
  onClick?: (agent: AgentDef) => void
  size: 'sm' | 'md' | 'lg'
}) {
  const info = modelOf(agent.model)
  return (
    <button
      className={`node ${state.status} size-${size}`}
      style={{ '--mc': info.color } as CSSProperties}
      onClick={() => onClick?.(agent)}
      title={`点击配置 ${agent.name}`}
    >
      <AgentAvatar icon={agent.icon} model={agent.model} size={size === 'lg' ? 38 : size === 'md' ? 32 : 28} muted={state.status === 'skipped'} />
      <span className="node-main">
        <span className="node-top">
          <b className="node-name">{agent.name}</b>
          <ModelBadge model={agent.model} />
        </span>
        <span className="node-role">{agent.role}</span>
        {state.status === 'working' && (
          <span className="node-progress">
            <i style={{ width: `${Math.max(6, Math.round(state.progress * 100))}%` }} />
          </span>
        )}
        {state.status === 'working' && (
          <span className="node-activity">
            <i className="typing"><i /><i /><i /></i>
            正在执行 · {Math.round(state.progress * 100)}%
          </span>
        )}
      </span>
      <span className={`node-state ${state.status}`}>
        {state.status === 'done' ? <Icon name="check" size={13} /> : null}
        {STATUS_TEXT[state.status]}
      </span>
    </button>
  )
}

export function AgentGraph({
  agents,
  states,
  deliveryProgress,
  onAgentClick,
  size = 'md',
  showParallelLabel = true,
}: AgentGraphProps) {
  const pm = agents.find((a) => a.id === 'pm')
  const arch = agents.find((a) => a.id === 'arch')
  const builders = agents.filter((a) => !['pm', 'arch'].includes(a.id) && a.icon !== 'qa' && a.icon !== 'reviewer')
  const verifiers = agents.filter((a) => a.icon === 'qa' || a.icon === 'reviewer')

  const stateOf = (a: AgentDef): AgentLiveState => states[a.id] ?? { status: a.enabled ? 'waiting' : 'skipped', progress: 0 }
  const activeIn = (list: AgentDef[]) => list.some((a) => stateOf(a).status === 'working')
  const doneIn = (list: AgentDef[]) => list.length > 0 && list.every((a) => stateOf(a).status === 'done' || stateOf(a).status === 'skipped')
  const deliveryDone = deliveryProgress >= 1

  return (
    <div className={`agent-graph size-${size}`}>
      <div className="graph-user">
        <span className="graph-user-icon">
          <Icon name="user" size={18} />
        </span>
        <div>
          <b>用户 / 项目负责人</b>
          <em>提出需求 · 确认方案 · 审批交付</em>
        </div>
      </div>

      {pm && (
        <>
          <Connector active={stateOf(pm).status === 'working'} done={doneIn([pm])} />
          <AgentNode agent={pm} state={stateOf(pm)} onClick={onAgentClick} size={size} />
        </>
      )}

      {arch && (
        <>
          <Connector active={stateOf(arch).status === 'working'} done={doneIn([arch])} />
          <AgentNode agent={arch} state={stateOf(arch)} onClick={onAgentClick} size={size} />
        </>
      )}

      {builders.length > 0 && (
        <>
          <Connector active={activeIn(builders)} done={doneIn(builders)} />
          <div className={`parallel-group ${activeIn(builders) ? 'running' : ''}`}>
            {showParallelLabel && (
              <span className="parallel-label">
                <Icon name="branch" size={11} />
                并行开发 · {builders.length}
              </span>
            )}
            {builders.map((agent) => (
              <AgentNode key={agent.id} agent={agent} state={stateOf(agent)} onClick={onAgentClick} size={size} />
            ))}
          </div>
        </>
      )}

      {verifiers.length > 0 && (
        <>
          <Connector active={activeIn(verifiers)} done={doneIn(verifiers)} />
          <div className={`parallel-group ${activeIn(verifiers) ? 'running' : ''}`}>
            {showParallelLabel && (
              <span className="parallel-label">
                <Icon name="branch" size={11} />
                并行验证 · {verifiers.length}
              </span>
            )}
            {verifiers.map((agent) => (
              <AgentNode key={agent.id} agent={agent} state={stateOf(agent)} onClick={onAgentClick} size={size} />
            ))}
          </div>
        </>
      )}

      <Connector active={deliveryProgress > 0 && !deliveryDone} done={deliveryDone} />
      <div className={`graph-delivery ${deliveryDone ? 'done' : deliveryProgress > 0 ? 'working' : ''}`}>
        <span className="delivery-icon">
          <Icon name="package" size={17} />
        </span>
        <div>
          <b>软件项目交付</b>
          <em>代码仓库 · 数据库脚本 · 测试报告 · 部署文档</em>
        </div>
        {deliveryDone && <span className="delivery-badge">已交付</span>}
      </div>
    </div>
  )
}
