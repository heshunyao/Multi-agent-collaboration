import type { AgentDef, View } from '../types'
import type { RunSummary, Team } from '../lib/teamApi'
import { RUN_STATUS_LABEL, TEAM_MODE_LABEL } from '../lib/teamApi'
import { modelOf } from '../data/presets'
import { Icon } from './Icon'
import { LiveDot, timeAgo } from './ui'

interface SidebarProps {
  view: View
  onView: (v: View) => void
  collapsed: boolean
  history: RunSummary[]
  activeRunId: string | null
  running: boolean
  agents: AgentDef[]
  team: Team | null
  onNew: () => void
  onSelectRun: (id: string) => void
}

const NAV: Array<{ view: View; label: string; icon: string }> = [
  { view: 'chat', label: '协作会话', icon: 'sparkle' },
  { view: 'agent-chat', label: 'Agent 对话', icon: 'terminal' },
  { view: 'team', label: '协作视图', icon: 'branch' },
  { view: 'projects', label: '项目构建', icon: 'package' },
  { view: 'agents', label: 'Agent 配置', icon: 'sliders' },
  { view: 'models', label: '模型中心', icon: 'cpu' },
]

function runMeta(item: RunSummary): string {
  const status = RUN_STATUS_LABEL[item.status]
  const steps = `${item.doneCount}/${item.stepCount} 步`
  return `${status} · ${steps}`
}

export function Sidebar({
  view,
  onView,
  collapsed,
  history,
  activeRunId,
  running,
  agents,
  team,
  onNew,
  onSelectRun,
}: SidebarProps) {
  const enabled = agents.filter((agent) => agent.enabled)
  const models = new Set(enabled.map((agent) => agent.model))

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="side-head">
        <button className="brand" onClick={() => onView('chat')}>
          <span className="logo-mark">
            <svg viewBox="0 0 32 32" width="19" height="19" fill="none">
              <path d="M9 21.5 16 8l7 13.5" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="16" cy="20.5" r="2.3" fill="currentColor" />
            </svg>
          </span>
          <span className="brand-text">
            <b>AgentForge</b>
            <em>AI 研发协作平台</em>
          </span>
        </button>
      </div>

      <button className="new-run" onClick={onNew}>
        <Icon name="plus" size={17} />
        <span>新建协作</span>
      </button>

      <nav className="side-nav">
        {NAV.map((item) => (
          <button
            key={item.view}
            className={`nav-item ${view === item.view ? 'active' : ''}`}
            onClick={() => onView(item.view)}
            title={item.label}
          >
            <Icon name={item.icon} size={18} />
            <span>{item.label}</span>
            {item.view === 'agents' && <span className="nav-count">{enabled.length}</span>}
          </button>
        ))}
      </nav>

      <div className="side-history">
        <div className="side-label">
          <span>最近协作</span>
          {running && <LiveDot active />}
        </div>
        <div className="history-list">
          {history.length === 0 && <p className="history-empty">还没有协作记录，描述一个需求即可自动组队。</p>}
          {history.map((item) => (
            <button
              key={item.id}
              className={`history-item ${item.id === activeRunId ? 'active' : ''}`}
              onClick={() => onSelectRun(item.id)}
            >
              <span className={`history-status ${item.status}`} />
              <span className="history-main">
                <span className="history-title">{item.title}</span>
                <span className="history-meta">
                  {runMeta(item)}
                  <i>·</i>
                  {timeAgo(item.createdAt)}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="side-foot">
        <div className="team-card">
          <div className="team-row">
            <span className="team-name">{team?.name ?? '未选择团队'}</span>
            <span className="team-count">
              {team ? `${TEAM_MODE_LABEL[team.mode]} · ${enabled.length} 在线` : '待配置'}
            </span>
          </div>
          <div className="avatar-stack">
            {enabled.slice(0, 5).map((agent) => (
              <span key={agent.id} className="stack-dot" style={{ borderColor: modelOf(agent.model).color }} title={agent.name}>
                {agent.name.slice(0, 1)}
              </span>
            ))}
            <span className="stack-dot more">+{Math.max(0, enabled.length - 5)}</span>
          </div>
          <div className="team-models">
            {[...models].slice(0, 3).map((model) => (
              <span key={model} style={{ color: modelOf(model).color }}>
                {modelOf(model).label}
              </span>
            ))}
          </div>
        </div>
        <div className="profile">
          <span className="profile-avatar">研</span>
          <div className="profile-main">
            <b>研发负责人</b>
            <em>工作区 · agentforge</em>
          </div>
          <button className="icon-btn ghost" title="设置">
            <Icon name="settings" size={16} />
          </button>
        </div>
      </div>
    </aside>
  )
}
