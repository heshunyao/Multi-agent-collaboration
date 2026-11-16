import { apiRequest } from './api'

/* ---------- 类型 ---------- */

export type BuildStatus = 'pending' | 'running' | 'paused' | 'done' | 'failed' | 'cancelled'
export type StageStatus = 'pending' | 'running' | 'done' | 'failed'
export type StackKey = 'java-react' | 'node-react' | 'python-fastapi'

export const STACK_OPTIONS: Array<{ key: StackKey; label: string; hint: string }> = [
  { key: 'java-react', label: 'Java + React', hint: 'Spring Boot 3 · React + Vite · H2' },
  { key: 'node-react', label: 'Node + React', hint: 'Express · React + Vite' },
  { key: 'python-fastapi', label: 'Python + FastAPI', hint: 'FastAPI · React + Vite' },
]

export const STACK_LABEL: Record<string, string> = {
  'java-react': 'Java + React',
  'node-react': 'Node + React',
  'python-fastapi': 'Python + FastAPI',
}

export const BUILD_STATUS_LABEL: Record<BuildStatus, string> = {
  pending: '排队中',
  running: '构建中',
  paused: '已暂停',
  done: '已完成',
  failed: '构建失败',
  cancelled: '已终止',
}

export const STAGE_STATUS_LABEL: Record<StageStatus, string> = {
  pending: '等待',
  running: '进行中',
  done: '完成',
  failed: '失败',
}

export const AREA_LABEL: Record<string, string> = {
  frontend: '前端',
  backend: '后端',
  database: '数据库',
  devops: '工程化',
  general: '通用',
}

export interface ProjectSummary {
  id: string
  name: string
  description: string
  status: string
  stack: string
  requirement: string
  workspacePath: string
  createdAt: number
  updatedAt: number
  buildId: string
  buildStatus: BuildStatus | ''
  currentStage: string
  fileCount: number
  testRounds: number
  lastBuildAt: number
}

export interface ProjectStage {
  id: string
  buildId: string
  projectId: string
  seq: number
  stageKey: string
  title: string
  agentId: string
  agentName: string
  status: StageStatus
  content: string
  reasoning?: string
  error?: string
  promptTokens?: number
  completionTokens?: number
  startedAt?: number
  finishedAt?: number
}

export interface ProjectTask {
  id: string
  title: string
  description: string
  status: string
  priority: 'high' | 'medium' | 'low'
  area: string
  orderIndex: number
}

export interface ProjectBuild {
  id: string
  projectId: string
  projectName: string
  stack: string
  requirement: string
  status: BuildStatus
  currentStage: string
  summary: string
  stageCount: number
  doneStages: number
  fileCount: number
  testRounds: number
  lastTestOutput: string
  testsPassed: boolean
  gitCommit: string
  gitBranch: string
  createdAt: number
  startedAt?: number
  finishedAt?: number
  updatedAt: number
  stages: ProjectStage[]
  tasks: ProjectTask[]
}

export interface GitCommit {
  id: string
  projectId: string
  buildId: string
  hash: string
  shortHash: string
  branch: string
  message: string
  fileCount: number
  createdAt: number
}

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'dir'
  size: number
  updatedAt: number
  children?: FileNode[]
}

export interface ProjectDetail {
  id: string
  name: string
  description: string
  status: string
  stack: string
  requirement: string
  workspacePath: string
  createdAt: number
  updatedAt: number
  latestBuild: ProjectBuild | null
  commits: GitCommit[]
  files: FileNode[]
  fileCount: number
}

export interface GitInfo {
  available: boolean
  initialized: boolean
  branch: string
  branches?: string[]
  changedFiles: number
  fileCount: number
  commits: GitCommit[]
}

export interface TestRecord {
  round: number
  ok: boolean
  command: string
  output: string
  durationMs: number
  steps?: Array<{ command: string; ok: boolean; output: string; durationMs: number }>
}

export interface ProjectInput {
  name: string
  description?: string
  stack: string
  requirement: string
}

/* ---------- HTTP ---------- */

export const projectApi = {
  list: () => apiRequest<ProjectSummary[]>('/projects'),
  create: (input: ProjectInput) =>
    apiRequest<ProjectDetail>('/projects', { method: 'POST', body: JSON.stringify(input) }),
  detail: (id: string) => apiRequest<ProjectDetail>(`/projects/${id}`),
  update: (id: string, input: Partial<ProjectInput>) =>
    apiRequest<unknown>(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  remove: (id: string) => apiRequest<{ ok: boolean }>(`/projects/${id}`, { method: 'DELETE' }),

  build: (id: string, requirement: string, stack: string) =>
    apiRequest<ProjectBuild>(`/projects/${id}/build`, {
      method: 'POST',
      body: JSON.stringify({ requirement, stack }),
    }),
  buildDetail: (id: string) => apiRequest<ProjectBuild>(`/project-builds/${id}`),
  pauseBuild: (id: string) =>
    apiRequest<{ ok: boolean; status: BuildStatus }>(`/project-builds/${id}/pause`, { method: 'POST' }),
  resumeBuild: (id: string) =>
    apiRequest<{ ok: boolean; status: BuildStatus }>(`/project-builds/${id}/resume`, { method: 'POST' }),
  cancelBuild: (id: string) =>
    apiRequest<{ ok: boolean; status: BuildStatus }>(`/project-builds/${id}/cancel`, { method: 'POST' }),

  files: (id: string) =>
    apiRequest<{ tree: FileNode[]; fileCount: number; workspace: string }>(`/projects/${id}/files`),
  readFile: (id: string, path: string) =>
    apiRequest<{ path: string; content: string }>(`/projects/${id}/file?path=${encodeURIComponent(path)}`),
  writeFile: (id: string, path: string, content: string) =>
    apiRequest<{ ok: boolean }>(`/projects/${id}/file`, {
      method: 'PUT',
      body: JSON.stringify({ path, content }),
    }),

  git: (id: string) => apiRequest<GitInfo>(`/projects/${id}/git`),
  commit: (id: string, message: string) =>
    apiRequest<{ ok: boolean; message: string; commit: GitCommit | null }>(`/projects/${id}/git/commit`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),
  branch: (id: string, name: string) =>
    apiRequest<{ ok: boolean; branch: string }>(`/projects/${id}/git/branch`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  checkout: (id: string, name: string) =>
    apiRequest<{ ok: boolean; branch: string }>(`/projects/${id}/git/checkout`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  downloadUrl: (id: string) => `/api/projects/${id}/download`,
}

/* ---------- SSE ---------- */

export interface ProjectStreamHandlers {
  onStatus?: (payload: { buildId?: string; status: BuildStatus }) => void
  onStage?: (stage: ProjectStage) => void
  onStageDone?: (stage: ProjectStage) => void
  onDelta?: (payload: { stageId: string; text: string }) => void
  onReasoning?: (payload: { stageId: string; text: string }) => void
  onTask?: (task: ProjectTask) => void
  onFile?: (payload: { path: string; bytes: number; action?: string }) => void
  onTest?: (record: TestRecord) => void
  onGit?: (payload: {
    ok: boolean
    hash?: string
    branch?: string
    shortHash?: string
    message?: string
    files?: number
  }) => void
  onDone?: (payload: {
    buildId?: string
    status: BuildStatus
    summary?: string
    fileCount?: number
    testRounds?: number
    testsPassed?: boolean
    gitCommit?: string
  }) => void
  onError?: (message: string) => void
}

const asString = (value: unknown, fallback = '') => (value == null ? fallback : String(value))
const asNumber = (value: unknown, fallback = 0) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

const toStage = (payload: Record<string, unknown>): ProjectStage => ({
  id: asString(payload.stageId ?? payload.id),
  buildId: asString(payload.buildId),
  projectId: asString(payload.projectId),
  seq: asNumber(payload.seq),
  stageKey: asString(payload.stageKey),
  title: asString(payload.title),
  agentId: asString(payload.agentId),
  agentName: asString(payload.agentName),
  status: asString(payload.status, 'running') as StageStatus,
  content: asString(payload.content),
  reasoning: payload.reasoning == null ? undefined : asString(payload.reasoning),
  error: payload.error == null ? undefined : asString(payload.error),
  promptTokens: asNumber(payload.promptTokens),
  completionTokens: asNumber(payload.completionTokens),
  startedAt: payload.startedAt == null ? undefined : asNumber(payload.startedAt),
  finishedAt: payload.finishedAt == null ? undefined : asNumber(payload.finishedAt),
})

/** 订阅一次项目构建的事件流（服务端会回放历史事件）。 */
export async function streamProjectBuild(
  buildId: string,
  handlers: ProjectStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`/api/project-builds/${buildId}/stream`, {
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
        handlers.onStatus?.({
          buildId: asString(payload.buildId),
          status: asString(payload.status, 'running') as BuildStatus,
        })
        break
      case 'stage':
        handlers.onStage?.(toStage(payload))
        break
      case 'stage_done':
        handlers.onStageDone?.({ ...toStage(payload), status: asString(payload.status, 'done') as StageStatus })
        break
      case 'delta':
        handlers.onDelta?.({ stageId: asString(payload.stageId), text: asString(payload.text) })
        break
      case 'reasoning':
        handlers.onReasoning?.({ stageId: asString(payload.stageId), text: asString(payload.text) })
        break
      case 'task':
        handlers.onTask?.({
          id: asString(payload.id),
          title: asString(payload.title),
          description: asString(payload.description),
          status: asString(payload.status, 'todo'),
          priority: asString(payload.priority, 'medium') as ProjectTask['priority'],
          area: asString(payload.area, 'general'),
          orderIndex: asNumber(payload.orderIndex),
        })
        break
      case 'file':
        handlers.onFile?.({
          path: asString(payload.path),
          bytes: asNumber(payload.bytes),
          action: asString(payload.action, 'write'),
        })
        break
      case 'test':
        handlers.onTest?.({
          round: asNumber(payload.round, 1),
          ok: Boolean(payload.ok),
          command: asString(payload.command),
          output: asString(payload.output),
          durationMs: asNumber(payload.durationMs),
          steps: Array.isArray(payload.steps) ? (payload.steps as TestRecord['steps']) : undefined,
        })
        break
      case 'git':
        handlers.onGit?.({
          ok: Boolean(payload.ok),
          hash: payload.hash == null ? undefined : asString(payload.hash),
          branch: payload.branch == null ? undefined : asString(payload.branch),
          shortHash: payload.shortHash == null ? undefined : asString(payload.shortHash),
          message: payload.message == null ? undefined : asString(payload.message),
          files: payload.files == null ? undefined : asNumber(payload.files),
        })
        break
      case 'done':
        handlers.onDone?.({
          buildId: asString(payload.buildId),
          status: asString(payload.status, 'done') as BuildStatus,
          summary: payload.summary == null ? undefined : asString(payload.summary),
          fileCount: payload.fileCount == null ? undefined : asNumber(payload.fileCount),
          testRounds: payload.testRounds == null ? undefined : asNumber(payload.testRounds),
          testsPassed: payload.testsPassed == null ? undefined : Boolean(payload.testsPassed),
          gitCommit: payload.gitCommit == null ? undefined : asString(payload.gitCommit),
        })
        break
      case 'error':
        handlers.onError?.(asString(payload.message, '项目构建失败'))
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

export const isBuildActive = (status: BuildStatus | undefined | null): boolean =>
  status === 'pending' || status === 'running' || status === 'paused'
