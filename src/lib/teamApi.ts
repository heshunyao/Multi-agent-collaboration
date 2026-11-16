import { apiRequest } from './api'

/* ---------- 团队 ---------- */

export type TeamMode = 'sequential' | 'group'

export interface TeamMember {
  id: string
  name: string
  role: string
  icon: string
  model: string
}

export interface Team {
  id: string
  name: string
  description: string
  mode: TeamMode
  agentIds: string[]
  members: TeamMember[]
  createdAt: number
  updatedAt: number
}

export interface TeamInput {
  name: string
  description: string
  mode: TeamMode
  agentIds: string[]
}

/* ---------- 运行 ---------- */

export type RunStatus = 'pending' | 'running' | 'paused' | 'done' | 'cancelled' | 'failed'
export type StepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped'
export type MessageKind = 'assignment' | 'discussion' | 'result' | 'summary'

export interface RunSummary {
  id: string
  teamId: string
  teamName: string
  title: string
  prompt: string
  mode: TeamMode
  status: RunStatus
  stepCount: number
  doneCount: number
  createdAt: number
  startedAt?: number
  finishedAt?: number
}

export interface RunStep {
  id: string
  seq: number
  agentId: string
  agentName: string
  title: string
  status: StepStatus
  content: string
  reasoning: string
  error?: string
  promptTokens?: number
  completionTokens?: number
  startedAt?: number
  finishedAt?: number
}

export interface AgentMessage {
  id: string
  stepId: string
  seq: number
  fromAgentId: string
  fromName: string
  toAgentId: string
  toName: string
  kind: MessageKind
  content: string
  createdAt?: number
}

export interface RunDetail {
  id: string
  teamId: string
  teamName: string
  title: string
  prompt: string
  mode: TeamMode
  status: RunStatus
  summary: string
  createdAt: number
  startedAt?: number
  finishedAt?: number
  updatedAt: number
  steps: RunStep[]
  messages: AgentMessage[]
}

export interface RunControlResult {
  ok: boolean
  status: RunStatus
}

export interface RunToolEvent {
  stepId: string
  name: string
  status: string
  result?: unknown
}

export const TEAM_MODE_LABEL: Record<TeamMode, string> = {
  sequential: '顺序执行',
  group: '群聊模式',
}

export const TEAM_MODE_HINT: Record<TeamMode, string> = {
  sequential: '按团队成员顺序逐个执行，上一个 Agent 的产出作为下一个的输入。',
  group: '多个 Agent 共享上下文多轮讨论，项目经理最后汇总输出。',
}

export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  pending: '排队中',
  running: '执行中',
  paused: '已暂停',
  done: '已完成',
  cancelled: '已终止',
  failed: '运行失败',
}

export const STEP_STATUS_LABEL: Record<StepStatus, string> = {
  pending: '等待',
  running: '进行中',
  done: '完成',
  failed: '失败',
  skipped: '跳过',
}

export const MESSAGE_KIND_LABEL: Record<MessageKind, string> = {
  assignment: '任务分配',
  discussion: '讨论',
  result: '执行结果',
  summary: '总结',
}

/** 运行是否仍在进行（含暂停），用于决定是否继续订阅事件流。 */
export function isRunActive(status: RunStatus | undefined | null): boolean {
  return status === 'pending' || status === 'running' || status === 'paused'
}

export function isRunTerminal(status: RunStatus | undefined | null): boolean {
  return status === 'done' || status === 'cancelled' || status === 'failed'
}

/* ---------- HTTP ---------- */

export const teamApi = {
  listTeams: () => apiRequest<Team[]>('/teams'),
  createTeam: (input: TeamInput) =>
    apiRequest<Team>('/teams', { method: 'POST', body: JSON.stringify(input) }),
  updateTeam: (id: string, input: Partial<TeamInput>) =>
    apiRequest<Team>(`/teams/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  deleteTeam: (id: string) => apiRequest<{ ok: boolean }>(`/teams/${id}`, { method: 'DELETE' }),

  listRuns: (teamId?: string, limit = 30) => {
    const query = new URLSearchParams()
    if (teamId) query.set('teamId', teamId)
    query.set('limit', String(limit))
    return apiRequest<RunSummary[]>(`/runs?${query.toString()}`)
  },
  createRun: (teamId: string, prompt: string) =>
    apiRequest<RunDetail>('/runs', { method: 'POST', body: JSON.stringify({ teamId, prompt }) }),
  getRun: (id: string) => apiRequest<RunDetail>(`/runs/${id}`),
  pauseRun: (id: string) => apiRequest<RunControlResult>(`/runs/${id}/pause`, { method: 'POST' }),
  resumeRun: (id: string) => apiRequest<RunControlResult>(`/runs/${id}/resume`, { method: 'POST' }),
  cancelRun: (id: string) => apiRequest<RunControlResult>(`/runs/${id}/cancel`, { method: 'POST' }),
}

/* ---------- SSE ---------- */

interface StepEvent {
  stepId: string
  seq: number
  agentId: string
  agentName: string
  title: string
  status: StepStatus
}

interface StepSnapshot extends StepEvent {
  content?: string
  reasoning?: string
  error?: string
  promptTokens?: number
  completionTokens?: number
}

export interface RunStreamHandlers {
  onStatus?: (payload: { runId?: string; status: RunStatus }) => void
  onStep?: (payload: StepEvent) => void
  onDelta?: (payload: { stepId: string; text: string }) => void
  onReasoning?: (payload: { stepId: string; text: string }) => void
  onTool?: (payload: RunToolEvent) => void
  onStepDone?: (payload: StepSnapshot) => void
  onMessage?: (payload: AgentMessage) => void
  onDone?: (payload: { runId?: string; status: RunStatus; summary?: string }) => void
  onError?: (message: string) => void
}

const asString = (value: unknown, fallback = '') => (value == null ? fallback : String(value))
const asNumber = (value: unknown, fallback = 0) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

/**
 * 订阅一次运行的 SSE 事件流。
 * 服务端会先回放历史事件再推送实时事件，运行结束后主动关闭连接。
 */
export async function streamRun(
  runId: string,
  handlers: RunStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`/api/runs/${runId}/stream`, {
    method: 'GET',
    headers: { Accept: 'text/event-stream', 'Cache-Control': 'no-cache' },
    signal,
  })

  if (!res.ok || !res.body) {
    let message = `事件流连接失败（${res.status}）`
    try {
      const data = (await res.json()) as { error?: unknown }
      if (data?.error) message = String(data.error)
    } catch {
      /* ignore */
    }
    handlers.onError?.(message)
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const dispatch = (block: string) => {
    let event = 'message'
    const dataLines: string[] = []
    for (const rawLine of block.split('\n')) {
      const line = rawLine.replace(/\r$/, '')
      if (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
    }
    if (!dataLines.length) return

    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(dataLines.join('\n')) as Record<string, unknown>
    } catch {
      return
    }

    switch (event) {
      case 'status':
        handlers.onStatus?.({ runId: asString(payload.runId), status: asString(payload.status, 'running') as RunStatus })
        break
      case 'step':
        handlers.onStep?.({
          stepId: asString(payload.stepId),
          seq: asNumber(payload.seq),
          agentId: asString(payload.agentId),
          agentName: asString(payload.agentName),
          title: asString(payload.title),
          status: asString(payload.status, 'running') as StepStatus,
        })
        break
      case 'delta':
        handlers.onDelta?.({ stepId: asString(payload.stepId), text: asString(payload.text) })
        break
      case 'reasoning':
        handlers.onReasoning?.({ stepId: asString(payload.stepId), text: asString(payload.text) })
        break
      case 'tool':
        handlers.onTool?.({
          stepId: asString(payload.stepId),
          name: asString(payload.name, '工具调用'),
          status: asString(payload.status),
          result: payload.result,
        })
        break
      case 'step_done':
        handlers.onStepDone?.({
          stepId: asString(payload.stepId),
          seq: asNumber(payload.seq),
          agentId: asString(payload.agentId),
          agentName: asString(payload.agentName),
          title: asString(payload.title),
          status: asString(payload.status, 'done') as StepStatus,
          content: payload.content == null ? undefined : asString(payload.content),
          reasoning: payload.reasoning == null ? undefined : asString(payload.reasoning),
          error: payload.error == null ? undefined : asString(payload.error),
          promptTokens: asNumber(payload.promptTokens),
          completionTokens: asNumber(payload.completionTokens),
        })
        break
      case 'message':
        handlers.onMessage?.({
          id: asString(payload.id),
          stepId: asString(payload.stepId),
          seq: asNumber(payload.seq),
          fromAgentId: asString(payload.fromAgentId),
          fromName: asString(payload.fromName),
          toAgentId: asString(payload.toAgentId),
          toName: asString(payload.toName),
          kind: asString(payload.kind, 'discussion') as MessageKind,
          content: asString(payload.content),
          createdAt: payload.createdAt == null ? undefined : asNumber(payload.createdAt),
        })
        break
      case 'done':
        handlers.onDone?.({
          runId: asString(payload.runId),
          status: asString(payload.status, 'done') as RunStatus,
          summary: payload.summary == null ? undefined : asString(payload.summary),
        })
        break
      case 'error':
        handlers.onError?.(asString(payload.message, '协作运行失败'))
        break
      default:
        break
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const blocks = buffer.split('\n\n')
      buffer = blocks.pop() || ''
      blocks.forEach(dispatch)
    }
    if (buffer.trim()) dispatch(buffer)
  } finally {
    reader.releaseLock()
  }
}
