import { useEffect, useMemo, useState } from 'react'
import type {
  AgentDef,
  AgentIcon,
  AgentLiveState,
  ConversationSummary,
  ModelInfo,
  ModelInput,
  ModelListResult,
  ModelTestResult,
  View,
} from './types'
import { SUGGESTIONS, modelOf, setModelRegistry } from './data/presets'
import { api } from './lib/api'
import type { RunDetail, Team, TeamInput, TeamMember, TeamMode } from './lib/teamApi'
import { TEAM_MODE_LABEL, teamApi } from './lib/teamApi'
import { useTeamRun } from './lib/useTeamRun'
import { Sidebar } from './components/Sidebar'
import { Composer } from './components/Composer'
import { RunView } from './components/RunView'
import { Inspector } from './components/Inspector'
import { TeamView } from './components/TeamView'
import { TeamDrawer } from './components/TeamDrawer'
import { AgentsView } from './components/AgentsView'
import { ModelsView } from './components/ModelsView'
import { ProjectsView } from './components/ProjectsView'
import { AgentChat } from './components/AgentChat'
import { AgentDrawer } from './components/AgentDrawer'
import { Icon } from './components/Icon'
import { AgentAvatar, LiveDot, timeAgo } from './components/ui'

const TEAM_STORAGE_KEY = 'agentforge.activeTeam'
const AGENT_ICONS: AgentIcon[] = ['pm', 'arch', 'backend', 'frontend', 'qa', 'reviewer', 'generic']

function normalizeIcon(icon: string): AgentIcon {
  return AGENT_ICONS.includes(icon as AgentIcon) ? (icon as AgentIcon) : 'generic'
}

function toAgentDef(member: TeamMember, agents: AgentDef[]): AgentDef {
  const found = agents.find((agent) => agent.id === member.id)
  const icon = normalizeIcon(member.icon)
  if (found) {
    return { ...found, name: member.name, role: member.role, icon, model: member.model, enabled: true }
  }
  return {
    id: member.id,
    name: member.name,
    role: member.role,
    model: member.model,
    icon,
    responsibilities: [],
    tools: [],
    systemPrompt: '',
    temperature: 0.3,
    enabled: true,
  }
}

function teamAgentsOf(team: Team | null, agents: AgentDef[]): AgentDef[] {
  if (!team) return []
  return team.members.map((member) => toAgentDef(member, agents))
}

function deriveStates(agents: AgentDef[], run: RunDetail | null): Record<string, AgentLiveState> {
  const map: Record<string, AgentLiveState> = {}
  agents.forEach((agent) => {
    map[agent.id] = { status: agent.enabled ? 'waiting' : 'skipped', progress: 0 }
  })
  if (!run) return map

  run.steps.forEach((step) => {
    const current = map[step.agentId]
    if (!current) return
    if (step.status === 'running') {
      const length = step.content.length
      map[step.agentId] = {
        status: 'working',
        progress: length ? Math.min(0.92, Math.max(0.25, length / 520)) : 0.15,
      }
    } else if (step.status === 'failed') {
      map[step.agentId] = { status: 'failed', progress: 1 }
    } else if (step.status === 'done') {
      if (current.status !== 'working' && current.status !== 'failed') {
        map[step.agentId] = { status: 'done', progress: 1 }
      }
    }
  })
  return map
}

function deliveryRatio(run: RunDetail | null): number {
  if (!run || run.steps.length === 0) return run?.status === 'done' ? 1 : 0
  if (run.status === 'done') return 1
  return run.steps.filter((step) => step.status === 'done').length / run.steps.length
}

function latestConversation(list: ConversationSummary[], agentId: string): ConversationSummary | undefined {
  return list.filter((c) => c.agentId === agentId).sort((a, b) => b.updatedAt - a.updatedAt)[0]
}

export default function App() {
  const [view, setView] = useState<View>('chat')
  const [agents, setAgents] = useState<AgentDef[]>([])
  const [models, setModels] = useState<ModelInfo[]>([])
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null)
  const [teamEditing, setTeamEditing] = useState<{ team: Team | null } | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 900)
  const [input, setInput] = useState('')
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ agent: AgentDef; isNew: boolean } | null>(null)
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [toast, setToast] = useState('')

  const engine = useTeamRun({ onNotify: (message) => setToast(message) })
  const run = engine.run

  setModelRegistry(models)

  useEffect(() => {
    let cancelled = false
    Promise.all([api.bootstrap(), teamApi.listTeams()])
      .then(([data, teamList]) => {
        if (cancelled) return
        setAgents(data.agents)
        setModels(data.models)
        setConversations(data.conversations)
        setTeams(teamList)
        const stored = window.localStorage.getItem(TEAM_STORAGE_KEY)
        const next =
          teamList.find((team) => team.id === stored) ??
          teamList.find((team) => team.name === 'AI 研发团队') ??
          teamList[0]
        setActiveTeamId(next?.id ?? null)
        setSelectedAgentId(data.agents[0]?.id ?? null)
        void engine.refreshHistory()
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : '无法连接后端服务')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [engine.refreshHistory])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 3200)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (activeTeamId) window.localStorage.setItem(TEAM_STORAGE_KEY, activeTeamId)
  }, [activeTeamId])

  const activeTeam = useMemo(
    () => teams.find((team) => team.id === activeTeamId) ?? null,
    [teams, activeTeamId],
  )
  const teamAgents = useMemo(() => teamAgentsOf(activeTeam, agents), [activeTeam, agents])
  const states = useMemo(() => deriveStates(teamAgents, run), [teamAgents, run])
  const deliveryProgress = run ? deliveryRatio(run) : 0
  const mode = activeTeam?.mode ?? null
  const ready = Boolean(activeTeam && activeTeam.members.length >= 2)

  const showError = (err: unknown, fallback: string) => {
    setToast(err instanceof Error ? err.message : fallback)
  }

  /* ---------- 团队 ---------- */
  const selectTeam = (id: string) => {
    setActiveTeamId(id)
    if (run && run.teamId !== id) {
      engine.reset()
      setActiveRunId(null)
    }
  }

  const changeMode = async (nextMode: TeamMode) => {
    if (!activeTeam || activeTeam.mode === nextMode) return
    try {
      const saved = await teamApi.updateTeam(activeTeam.id, { mode: nextMode })
      setTeams((prev) => prev.map((team) => (team.id === saved.id ? saved : team)))
      setToast(`已切换为${TEAM_MODE_LABEL[nextMode]}，将在下一次协作生效`)
    } catch (err) {
      showError(err, '切换协作模式失败')
    }
  }

  const saveTeam = async (value: TeamInput, id?: string) => {
    try {
      const saved = id ? await teamApi.updateTeam(id, value) : await teamApi.createTeam(value)
      setTeams((prev) =>
        id ? prev.map((team) => (team.id === saved.id ? saved : team)) : [saved, ...prev],
      )
      setActiveTeamId(saved.id)
      setTeamEditing(null)
      setToast(id ? '团队已保存' : '团队已创建')
    } catch (err) {
      showError(err, '保存团队失败')
    }
  }

  const refreshTeams = async () => {
    try {
      const list = await teamApi.listTeams()
      setTeams(list)
    } catch {
      /* 忽略刷新失败，保留本地团队 */
    }
  }

  const removeTeam = async (id: string) => {
    const target = teams.find((team) => team.id === id)
    if (!window.confirm(`确认删除团队「${target?.name ?? ''}」？该团队的运行记录也会一并删除。`)) return
    try {
      await teamApi.deleteTeam(id)
      const next = teams.filter((team) => team.id !== id)
      setTeams(next)
      setTeamEditing(null)
      if (activeTeamId === id) {
        setActiveTeamId(next[0]?.id ?? null)
        engine.reset()
        setActiveRunId(null)
      }
      void engine.refreshHistory()
      setToast('团队已删除')
    } catch (err) {
      showError(err, '删除团队失败')
    }
  }

  /* ---------- 运行 ---------- */
  const submit = async () => {
    const prompt = input.trim()
    if (!prompt || engine.active) return
    if (!activeTeam) {
      setToast('请先创建或选择一个 Agent 团队')
      setView('team')
      return
    }
    if (activeTeam.members.length < 2) {
      setToast('团队至少需要 2 个 Agent 才能协作')
      setView('team')
      return
    }
    try {
      const detail = await engine.startRun(activeTeam.id, prompt)
      setActiveRunId(detail.id)
      setInput('')
      setView('chat')
      setToast('协作已开始')
    } catch (err) {
      showError(err, '发起协作失败')
    }
  }

  const stopRun = async () => {
    try {
      await engine.cancel()
      setToast('已终止协作')
    } catch (err) {
      showError(err, '终止协作失败')
    }
  }

  const pauseRun = async () => {
    try {
      await engine.pause()
      setToast('协作已暂停')
    } catch (err) {
      showError(err, '暂停失败')
    }
  }

  const resumeRun = async () => {
    try {
      await engine.resume()
      setToast('协作已继续')
    } catch (err) {
      showError(err, '继续失败')
    }
  }

  const newRun = () => {
    engine.reset()
    setActiveRunId(null)
    setInput('')
    setView('chat')
  }

  const openRun = async (id: string) => {
    try {
      const detail = await engine.loadRun(id)
      setActiveRunId(id)
      if (detail.teamId) setActiveTeamId(detail.teamId)
      setView('chat')
    } catch (err) {
      showError(err, '加载运行记录失败')
    }
  }

  const controls = {
    status: run?.status ?? null,
    busy: engine.busy,
    onPause: () => {
      void pauseRun()
    },
    onResume: () => {
      void resumeRun()
    },
    onCancel: () => {
      void stopRun()
    },
  }

  /* ---------- agents ---------- */
  const openAgent = (agent: AgentDef) => setEditing({ agent, isNew: false })

  const createAgent = () => {
    setEditing({
      isNew: true,
      agent: {
        id: 'agent-' + Date.now().toString(36),
        name: '新 Agent',
        role: '自定义职责',
        model: models.find((model) => model.connected)?.id ?? models[0]?.id ?? '',
        icon: 'backend',
        responsibilities: [],
        tools: [],
        systemPrompt: '',
        temperature: 0.3,
        enabled: true,
      },
    })
  }

  const saveAgent = async (agent: AgentDef) => {
    const isNew = editing?.isNew ?? false
    try {
      const saved = isNew ? await api.createAgent(agent) : await api.updateAgent(agent.id, agent)
      setAgents((prev) => (isNew ? [...prev, saved] : prev.map((item) => (item.id === saved.id ? saved : item))))
      setEditing(null)
      setToast(isNew ? 'Agent 已创建' : 'Agent 配置已保存')
      void refreshTeams()
    } catch (err) {
      showError(err, '保存失败')
    }
  }

  const deleteAgent = async (id: string) => {
    try {
      await api.deleteAgent(id)
      setAgents((prev) => prev.filter((agent) => agent.id !== id))
      setConversations((prev) => prev.filter((conversation) => conversation.agentId !== id))
      setEditing(null)
      if (selectedAgentId === id) {
        setSelectedAgentId(null)
        setActiveConversationId(null)
      }
      setToast('Agent 已删除')
      void refreshTeams()
    } catch (err) {
      showError(err, '删除失败')
    }
  }

  const toggleAgent = async (id: string) => {
    const agent = agents.find((item) => item.id === id)
    if (!agent) return
    const nextEnabled = !agent.enabled
    setAgents((prev) => prev.map((item) => (item.id === id ? { ...item, enabled: nextEnabled } : item)))
    try {
      await api.updateAgent(id, { enabled: nextEnabled })
    } catch (err) {
      setAgents((prev) => prev.map((item) => (item.id === id ? { ...item, enabled: agent.enabled } : item)))
      showError(err, '更新失败')
    }
  }

  /* ---------- models ---------- */
  const saveModel = async (value: ModelInput, id?: string) => {
    const saved = id ? await api.updateModel(id, value) : await api.createModel(value)
    setModels((prev) => (id ? prev.map((model) => (model.id === id ? saved : model)) : [...prev, saved]))
    setToast(id ? '模型配置已更新' : '模型已接入')
  }

  const deleteModel = async (model: ModelInfo) => {
    await api.deleteModel(model.id)
    setModels((prev) => prev.filter((item) => item.id !== model.id))
    setToast(`已删除模型 ${model.label}`)
  }

  const toggleModel = async (model: ModelInfo) => {
    try {
      const saved = await api.updateModel(model.id, { connected: !model.connected })
      setModels((prev) => prev.map((item) => (item.id === saved.id ? saved : item)))
    } catch (err) {
      showError(err, '更新失败')
    }
  }

  const testModel = (value: { id?: string; baseUrl?: string; modelName?: string; apiKey?: string }) =>
    api.testModel(value) as Promise<ModelTestResult>

  const listModels = (value: { id?: string; baseUrl?: string; apiKey?: string }) =>
    api.listAvailableModels(value) as Promise<ModelListResult>

  /* ---------- conversations ---------- */
  const refreshConversations = () => {
    api
      .listConversations()
      .then(setConversations)
      .catch(() => undefined)
  }

  const createConversation = async (agentId: string) => {
    try {
      const created = await api.createConversation(agentId)
      setConversations((prev) => [created, ...prev.filter((conversation) => conversation.id !== created.id)])
      setActiveConversationId(created.id)
      return created.id
    } catch (err) {
      showError(err, '创建会话失败')
      return null
    }
  }

  const deleteConversation = async (id: string) => {
    try {
      await api.deleteConversation(id)
      setConversations((prev) => prev.filter((conversation) => conversation.id !== id))
      if (activeConversationId === id) setActiveConversationId(null)
    } catch (err) {
      showError(err, '删除会话失败')
    }
  }

  const openAgentChat = (agent: AgentDef) => {
    setSelectedAgentId(agent.id)
    setActiveConversationId(latestConversation(conversations, agent.id)?.id ?? null)
    setView('agent-chat')
  }

  const selectAgentForChat = (id: string) => {
    setSelectedAgentId(id)
    setActiveConversationId(latestConversation(conversations, id)?.id ?? null)
  }

  if (loading) {
    return (
      <div className="boot">
        <span className="spinner large" />
        <p>正在加载工作区…</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="boot">
        <Icon name="server" size={28} />
        <h2>后端服务未连接</h2>
        <p>{loadError}</p>
        <pre className="boot-code">npm run dev</pre>
        <p className="boot-hint">请确认 Java 业务服务（端口 8080）、Python Agent Engine（端口 8000）与前端（端口 5173）同时运行。</p>
        <button className="btn primary" onClick={() => window.location.reload()}>
          <Icon name="refresh" size={14} /> 重新连接
        </button>
      </div>
    )
  }

  return (
    <div className={`app ${collapsed ? 'collapsed' : ''}`}>
      {!collapsed && <div className="side-scrim" onClick={() => setCollapsed(true)} />}

      <Sidebar
        view={view}
        onView={setView}
        collapsed={collapsed}
        history={engine.history}
        activeRunId={activeRunId}
        running={engine.live}
        agents={teamAgents}
        team={activeTeam}
        onNew={newRun}
        onSelectRun={(id) => {
          void openRun(id)
        }}
      />

      <main className="main">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-btn" onClick={() => setCollapsed((value) => !value)} title="收起侧边栏">
              <Icon name="panel" size={17} />
            </button>
            <div className="crumbs">
              <span>工作区</span>
              <i>/</i>
              <b>
                {view === 'chat'
                  ? run
                    ? run.title
                    : '新协作'
                  : view === 'team'
                    ? '协作视图'
                    : view === 'agents'
                      ? 'Agent 配置'
                      : view === 'models'
                        ? '模型中心'
                        : view === 'projects'
                          ? 'AI 项目构建'
                          : agents.find((agent) => agent.id === selectedAgentId)?.name ?? 'Agent 对话'}
              </b>
            </div>
          </div>
          <div className="topbar-right">
            <span className="topbar-live">
              <LiveDot active={engine.live} />
              {engine.live ? '协作运行中' : run?.status === 'paused' ? '协作已暂停' : 'Agent 团队待命'}
            </span>
            <div className="topbar-model">
              <span>协作模式</span>
              <b className="topbar-mode">{mode ? TEAM_MODE_LABEL[mode] : '未选择团队'}</b>
            </div>
            <button className="btn small">
              <Icon name="share" size={14} /> 分享
            </button>
          </div>
        </header>

        {view === 'chat' ? (
          <div className="chat-shell">
            <div className={`thread-scroll ${run ? 'has-run' : ''}`}>
              {run ? (
                <div className="thread">
                  <div className="user-row">
                    <div className="user-bubble">
                      <p>{run.prompt}</p>
                      <span className="user-stamp">{timeAgo(run.createdAt)}</span>
                    </div>
                    <span className="user-avatar">我</span>
                  </div>

                  <RunView
                    run={run}
                    agents={teamAgents}
                    tools={engine.tools}
                    live={engine.live}
                    elapsed={engine.elapsed}
                    controls={controls}
                    onOpenTeam={() => setView('team')}
                  />
                </div>
              ) : (
                <div className="empty">
                  <span className="empty-badge">
                    <Icon name="sparkle" size={12} /> AgentForge 2.0 · 多 Agent 真实协作
                  </span>
                  <h1>
                    今天要构建<span className="grad">什么</span>？
                  </h1>
                  <p className="empty-sub">
                    一句话描述需求，选中的 Agent 团队会真实协作：项目经理规划任务、分配工作，成员依次执行或群聊讨论，全过程实时推送。
                  </p>

                  <div className="starters">
                    {SUGGESTIONS.map((suggestion) => (
                      <button key={suggestion.title} className="starter" onClick={() => setInput(suggestion.prompt)}>
                        <span className="starter-head">
                          <b>{suggestion.title}</b>
                          <Icon name="arrowUp" size={14} className="starter-arrow" />
                        </span>
                        <em>{suggestion.desc}</em>
                        <span className="starter-prompt">{suggestion.prompt}</span>
                      </button>
                    ))}
                  </div>

                  <div className="team-ready">
                    <span className="ready-label">{activeTeam ? '当前团队' : '尚未组队'}</span>
                    <div className="ready-avatars">
                      {teamAgents
                        .filter((agent) => agent.enabled)
                        .map((agent) => (
                          <span key={agent.id} className="ready-agent" title={`${agent.name} · ${modelOf(agent.model).label}`}>
                            <AgentAvatar icon={agent.icon} model={agent.model} size={24} />
                            {agent.name.replace(' Agent', '')}
                          </span>
                        ))}
                    </div>
                    <span className="ready-meta">
                      {activeTeam
                        ? `${TEAM_MODE_LABEL[activeTeam.mode]} · ${teamAgents.length} Agent · ${
                            new Set(teamAgents.map((agent) => agent.model)).size
                          } 模型`
                        : '请选择或创建一个团队'}
                    </span>
                    <button className="link-btn" onClick={() => setTeamEditing({ team: activeTeam })}>
                      {activeTeam ? '管理团队' : '创建团队'} <Icon name="arrowRight" size={12} />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <Composer
              value={input}
              onChange={setInput}
              onSubmit={submit}
              running={engine.active}
              onStop={() => {
                void stopRun()
              }}
              teams={teams}
              teamId={activeTeamId}
              onTeam={selectTeam}
              onManageTeams={() => setTeamEditing({ team: activeTeam })}
              mode={mode}
              onMode={(nextMode) => {
                void changeMode(nextMode)
              }}
              ready={ready}
            />
          </div>
        ) : view === 'agent-chat' ? (
          <AgentChat
            agents={agents}
            models={models}
            agentId={selectedAgentId}
            onSelectAgent={selectAgentForChat}
            conversations={conversations}
            activeConversationId={activeConversationId}
            onSelectConversation={setActiveConversationId}
            onCreateConversation={createConversation}
            onDeleteConversation={deleteConversation}
            onConversationsChanged={refreshConversations}
            onOpenConfig={openAgent}
            onOpenModels={() => setView('models')}
          />
        ) : (
          <div className="page-scroll">
            {view === 'team' && (
              <TeamView
                teams={teams}
                team={activeTeam}
                agents={teamAgents}
                states={states}
                deliveryProgress={deliveryProgress}
                run={run}
                runs={engine.history}
                elapsed={engine.elapsed}
                live={engine.live}
                controls={controls}
                onSelectTeam={selectTeam}
                onEditTeam={(team) => setTeamEditing({ team })}
                onModeChange={(nextMode) => {
                  void changeMode(nextMode)
                }}
                onAgentClick={openAgent}
                onOpenAgents={() => setView('agents')}
                onNewRun={newRun}
                onOpenRun={(id) => {
                  void openRun(id)
                }}
              />
            )}
            {view === 'agents' && (
              <AgentsView
                agents={agents}
                onEdit={openAgent}
                onNew={createAgent}
                onToggle={toggleAgent}
                onChat={openAgentChat}
              />
            )}
            {view === 'models' && (
              <ModelsView
                models={models}
                agents={agents}
                onSave={saveModel}
                onDelete={deleteModel}
                onToggle={toggleModel}
                onTest={testModel}
                onListModels={listModels}
                onOpenAgents={() => setView('agents')}
              />
            )}
            {view === 'projects' && <ProjectsView onNotify={setToast} />}
          </div>
        )}
      </main>

      {view === 'chat' && (
        <Inspector
          agents={teamAgents}
          states={states}
          deliveryProgress={deliveryProgress}
          run={run}
          team={activeTeam}
          elapsed={engine.elapsed}
          live={engine.live}
          onAgentClick={openAgent}
          onOpenTeam={() => setView('team')}
        />
      )}

      {editing && (
        <AgentDrawer
          agent={editing.agent}
          isNew={editing.isNew}
          models={models}
          onClose={() => setEditing(null)}
          onSave={saveAgent}
          onDelete={editing.isNew ? undefined : deleteAgent}
        />
      )}

      {teamEditing && (
        <TeamDrawer
          team={teamEditing.team}
          agents={agents}
          defaultAgentIds={activeTeam?.agentIds ?? agents.filter((agent) => agent.enabled).map((agent) => agent.id)}
          onClose={() => setTeamEditing(null)}
          onSave={saveTeam}
          onDelete={removeTeam}
        />
      )}

      {toast && (
        <div className="toast">
          <Icon name="check" size={13} />
          {toast}
        </div>
      )}
    </div>
  )
}
