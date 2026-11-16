import { useMemo } from 'react'
import type { AgentDef, AgentLiveState } from '../types'
import type { RunDetail, Team } from '../lib/teamApi'
import { MESSAGE_KIND_LABEL, RUN_STATUS_LABEL, TEAM_MODE_LABEL } from '../lib/teamApi'
import { modelOf } from '../data/presets'
import { AgentGraph } from './AgentGraph'
import { Icon } from './Icon'
import { LiveDot } from './ui'

interface InspectorProps {
  agents: AgentDef[]
  states: Record<string, AgentLiveState>
  deliveryProgress: number
  run: RunDetail | null
  team: Team | null
  elapsed: number
  live: boolean
  onAgentClick: (agent: AgentDef) => void
  onOpenTeam: () => void
}

export function Inspector({
  agents,
  states,
  deliveryProgress,
  run,
  team,
  elapsed,
  live,
  onAgentClick,
  onOpenTeam,
}: InspectorProps) {
  const enabled = agents.filter((agent) => agent.enabled)
  const total = run?.steps.length ?? 0
  const done = run?.steps.filter((step) => step.status === 'done').length ?? 0
  const overall = total ? Math.round((done / total) * 100) : 0
  const activeAgents = Object.values(states).filter((state) => state.status === 'working').length

  const feed = useMemo(() => {
    if (!run) return []
    return [...run.messages]
      .sort((a, b) => a.seq - b.seq)
      .slice(-7)
      .reverse()
      .map((message) => {
        const agent = agents.find((item) => item.id === message.fromAgentId)
        const text = message.content.replace(/\s+/g, ' ').trim()
        return {
          id: message.id,
          name: message.fromName.replace(' Agent', ''),
          color: modelOf(agent?.model ?? '').color,
          text: `${MESSAGE_KIND_LABEL[message.kind]} · ${text.length > 72 ? text.slice(0, 72) + '…' : text}`,
        }
      })
  }, [run, agents])

  return (
    <aside className="inspector">
      <div className="insp-head">
        <div>
          <h3>{team?.name ?? '协作团队'}</h3>
          <p>
            {enabled.length} 个 Agent · {team ? TEAM_MODE_LABEL[team.mode] : '未选择团队'}
          </p>
        </div>
        <LiveDot active={live} />
      </div>

      <div className="insp-scroll">
        <div className="insp-graph">
          <AgentGraph
            agents={agents}
            states={states}
            deliveryProgress={deliveryProgress}
            onAgentClick={onAgentClick}
            size="sm"
            showParallelLabel={false}
          />
        </div>

        <div className="insp-grid">
          <div className="insp-stat">
            <b>{overall}%</b>
            <em>步骤进度</em>
          </div>
          <div className="insp-stat">
            <b>{activeAgents}</b>
            <em>执行中</em>
          </div>
          <div className="insp-stat">
            <b>{run ? Math.max(1, elapsed) + 's' : '0s'}</b>
            <em>协作耗时</em>
          </div>
          <div className="insp-stat">
            <b>{run ? `${done}/${total}` : '—'}</b>
            <em>完成步骤</em>
          </div>
        </div>

        <div className="insp-section">
          <div className="insp-label">
            <span>消息流</span>
            {live && <span className="insp-live">LIVE</span>}
          </div>
          {feed.length === 0 ? (
            <p className="insp-empty">团队已就位，等待需求或消息。</p>
          ) : (
            <ul className="event-feed">
              {feed.map((entry) => (
                <li key={entry.id}>
                  <i style={{ background: entry.color }} />
                  <span>
                    <b>{entry.name}</b>
                    {entry.text}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="insp-section">
          <div className="insp-label">
            <span>运行状态</span>
            {run && <em className="insp-count">{RUN_STATUS_LABEL[run.status]}</em>}
          </div>
          {run ? (
            <ul className="mini-artifacts">
              <li>
                <Icon name="layers" size={12} />
                <span>{run.title}</span>
                <em>{run.steps.length} 步</em>
              </li>
              <li>
                <Icon name="users" size={12} />
                <span>{run.teamName}</span>
                <em>{TEAM_MODE_LABEL[run.mode]}</em>
              </li>
              <li>
                <Icon name="clock" size={12} />
                <span>最近更新</span>
                <em>{new Date(run.updatedAt).toLocaleTimeString('zh-CN', { hour12: false })}</em>
              </li>
            </ul>
          ) : (
            <p className="insp-empty">开始协作后，这里会展示运行概况。</p>
          )}
        </div>

        <button className="insp-cta" onClick={onOpenTeam}>
          <Icon name="branch" size={15} />
          打开完整协作视图
          <Icon name="arrowRight" size={14} />
        </button>
      </div>
    </aside>
  )
}
