import type { AgentDef, AgentLiveState } from '../types'
import type { RunDetail, RunSummary, Team, TeamMode } from '../lib/teamApi'
import { RUN_STATUS_LABEL, TEAM_MODE_HINT, TEAM_MODE_LABEL } from '../lib/teamApi'
import { modelOf } from '../data/presets'
import { AgentGraph } from './AgentGraph'
import { Icon } from './Icon'
import { LiveDot, timeAgo } from './ui'
import { MessageFeed } from './MessageFeed'
import { RunControls, type RunControlsValue } from './RunControls'

interface TeamViewProps {
  teams: Team[]
  team: Team | null
  agents: AgentDef[]
  states: Record<string, AgentLiveState>
  deliveryProgress: number
  run: RunDetail | null
  runs: RunSummary[]
  elapsed: number
  live: boolean
  controls: RunControlsValue
  onSelectTeam: (id: string) => void
  onEditTeam: (team: Team | null) => void
  onModeChange: (mode: TeamMode) => void
  onAgentClick: (agent: AgentDef) => void
  onOpenAgents: () => void
  onNewRun: () => void
  onOpenRun: (id: string) => void
}

export function TeamView({
  teams,
  team,
  agents,
  states,
  deliveryProgress,
  run,
  runs,
  elapsed,
  live,
  controls,
  onSelectTeam,
  onEditTeam,
  onModeChange,
  onAgentClick,
  onOpenAgents,
  onNewRun,
  onOpenRun,
}: TeamViewProps) {
  const enabled = agents.filter((agent) => agent.enabled)
  const models = [...new Set(enabled.map((agent) => agent.model))]
  const total = run?.steps.length ?? 0
  const done = run?.steps.filter((step) => step.status === 'done').length ?? 0
  const overall = total ? Math.round((done / total) * 100) : 0
  const working = Object.values(states).filter((state) => state.status === 'working').length
  const teamMode = team?.mode ?? 'sequential'
  const runMode = run?.mode ?? teamMode
  const assignmentMessages = run?.messages.filter((message) => message.kind === 'assignment') ?? []

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <span className="eyebrow">ORCHESTRATION</span>
          <h1>协作编排视图</h1>
          <p>选择团队、切换协作模式，观察每个 Agent 的实时状态、任务分配与消息流转。</p>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={() => onEditTeam(team)}>
            <Icon name="sliders" size={14} /> 编辑团队
          </button>
          <button className="btn primary" onClick={onNewRun}>
            <Icon name="plus" size={14} /> 新建协作
          </button>
        </div>
      </header>

      <div className="team-picker">
        <div className="team-picker-list">
          {teams.map((item) => (
            <button
              key={item.id}
              className={`team-pick ${item.id === team?.id ? 'active' : ''}`}
              onClick={() => onSelectTeam(item.id)}
            >
              <span className="team-pick-name">{item.name}</span>
              <span className="team-pick-meta">
                {TEAM_MODE_LABEL[item.mode]} · {item.members.length} Agent
              </span>
            </button>
          ))}
          <button className="team-pick add" onClick={() => onEditTeam(null)}>
            <Icon name="plus" size={13} />
            新建团队
          </button>
        </div>
        <button className="btn ghost small" onClick={onOpenAgents}>
          <Icon name="sliders" size={13} /> Agent 配置
        </button>
      </div>

      <div className="team-layout">
        <section className="panel graph-panel">
          <div className="panel-head">
            <div>
              <h3>{team?.name ?? '尚未选择团队'}</h3>
              <p>
                {team
                  ? `${TEAM_MODE_LABEL[team.mode]} · ${enabled.length} 个 Agent 在线`
                  : '先在下方选择或创建一个团队'}
              </p>
            </div>
            <div className="panel-head-right">
              <div className="segmented mode-toggle">
                {(['sequential', 'group'] as const).map((item) => (
                  <button
                    key={item}
                    className={`segment ${teamMode === item ? 'selected' : ''}`}
                    disabled={!team}
                    onClick={() => onModeChange(item)}
                  >
                    {TEAM_MODE_LABEL[item]}
                  </button>
                ))}
              </div>
              <span className={`panel-live ${live ? 'on' : ''}`}>
                <LiveDot active={live} />
                {live ? '协作进行中' : run ? RUN_STATUS_LABEL[run.status] : '待命'}
              </span>
            </div>
          </div>

          <p className="team-mode-hint">{TEAM_MODE_HINT[teamMode]}</p>

          {team ? (
            <div className="graph-scroll">
              <AgentGraph
                agents={agents}
                states={states}
                deliveryProgress={deliveryProgress}
                onAgentClick={onAgentClick}
                size="lg"
              />
            </div>
          ) : (
            <div className="team-empty">
              <Icon name="users" size={24} />
              <p>还没有可用的 Agent 团队。</p>
              <button className="btn primary" onClick={() => onEditTeam(null)}>
                <Icon name="plus" size={14} /> 创建第一个团队
              </button>
            </div>
          )}
        </section>

        <aside className="team-side">
          <section className="panel">
            <div className="panel-head">
              <div>
                <h3>运行状态</h3>
                <p>{run ? run.title : '尚未开始协作'}</p>
              </div>
              <span className="panel-sub">{run ? `${Math.max(1, elapsed)}s` : '—'}</span>
            </div>

            <div className="ring-row">
              <div className="ring" style={{ ['--p' as string]: `${overall * 3.6}deg` }}>
                <div className="ring-inner">
                  <b>{overall}%</b>
                  <em>步骤进度</em>
                </div>
              </div>
              <ul className="ring-stats">
                <li>
                  <span>执行中 Agent</span>
                  <b>{working}</b>
                </li>
                <li>
                  <span>完成步骤</span>
                  <b>
                    {done}/{total}
                  </b>
                </li>
                <li>
                  <span>Agent 消息</span>
                  <b>{run?.messages.length ?? 0}</b>
                </li>
                <li>
                  <span>调用模型</span>
                  <b>{models.length}</b>
                </li>
              </ul>
            </div>

            <RunControls value={controls} compact />
          </section>

          <section className="panel">
            <div className="panel-head">
              <h3>任务分配</h3>
              <span className="panel-sub">{assignmentMessages.length} 条</span>
            </div>
            <MessageFeed
              messages={assignmentMessages}
              agents={agents}
              limit={4}
              compact
              empty="项目经理完成规划后，任务分配会显示在这里。"
            />
          </section>

          <section className="panel">
            <div className="panel-head">
              <h3>{runMode === 'group' ? '群聊讨论' : '协作消息'}</h3>
              <span className="panel-sub">{run?.messages.length ?? 0} 条</span>
            </div>
            <MessageFeed
              messages={run?.messages ?? []}
              agents={agents}
              kinds={runMode === 'group' ? ['discussion'] : ['result', 'summary']}
              limit={6}
              compact
              empty={runMode === 'group' ? '群聊开始后，各 Agent 的讨论会实时出现在这里。' : 'Agent 执行完成后会回传结果消息。'}
            />
          </section>

          <section className="panel">
            <div className="panel-head">
              <h3>最近运行</h3>
              <span className="panel-sub">{runs.length} 条</span>
            </div>
            {runs.length === 0 ? (
              <p className="insp-empty">还没有运行记录。</p>
            ) : (
              <ul className="mini-runs">
                {runs.slice(0, 6).map((item) => (
                  <li key={item.id}>
                    <button onClick={() => onOpenRun(item.id)}>
                      <span className={`history-status ${item.status}`} />
                      <span className="mini-run-main">
                        <b>{item.title}</b>
                        <em>
                          {RUN_STATUS_LABEL[item.status]} · {item.doneCount}/{item.stepCount} 步 ·{' '}
                          {timeAgo(item.createdAt)}
                        </em>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel">
            <div className="panel-head">
              <h3>模型矩阵</h3>
            </div>
            <div className="model-matrix">
              {models.map((model) => {
                const info = modelOf(model)
                const list = enabled.filter((agent) => agent.model === model)
                return (
                  <div key={model} className="matrix-item" style={{ ['--mc' as string]: info.color }}>
                    <i className="model-dot" />
                    <b>{info.label}</b>
                    <span>{list.length} 个 Agent</span>
                    <em>{list.map((agent) => agent.name.replace(' Agent', '')).join(' / ')}</em>
                  </div>
                )
              })}
              {models.length === 0 && <p className="insp-empty">暂无在线 Agent。</p>}
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}
