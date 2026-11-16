import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type {
  FileNode,
  GitInfo,
  ProjectBuild,
  ProjectDetail,
  ProjectStage,
  ProjectSummary,
  StackKey,
} from '../lib/projectApi'
import {
  AREA_LABEL,
  BUILD_STATUS_LABEL,
  STACK_LABEL,
  STACK_OPTIONS,
  STAGE_STATUS_LABEL,
  projectApi,
} from '../lib/projectApi'
import { useProjectBuild } from '../lib/useProjectBuild'
import { Icon } from './Icon'
import { timeAgo } from './ui'

interface ProjectsViewProps {
  onNotify: (message: string) => void
}

const EMPTY_FORM = { name: '', stack: 'java-react' as StackKey, requirement: '' }

const errorText = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback

function formatDuration(seconds: number): string {
  if (!seconds) return '0s'
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return minutes > 0 ? `${minutes}m ${rest}s` : `${rest}s`
}

function StageCard({ stage }: { stage: ProjectStage }) {
  const running = stage.status === 'running'
  const tokens = (stage.promptTokens ?? 0) + (stage.completionTokens ?? 0)
  return (
    <div className={`pj-stage ${stage.status}`}>
      <div className="pj-stage-head">
        <span className="pj-stage-index">{String(stage.seq).padStart(2, '0')}</span>
        <div className="pj-stage-main">
          <div className="pj-stage-title">
            {stage.title || stage.stageKey}
            {stage.agentName && <em>· {stage.agentName}</em>}
          </div>
          <div className="pj-stage-meta">
            {STAGE_STATUS_LABEL[stage.status]}
            {tokens > 0 && <span> · {tokens} tokens</span>}
            {running && <span className="pj-streaming"> · 生成中</span>}
          </div>
        </div>
        <span className={`pj-dot ${stage.status}`} />
      </div>
      {(stage.content || stage.error) && (
        <pre className="pj-stage-content">{stage.error || stage.content}</pre>
      )}
    </div>
  )
}

export function ProjectsView({ onNotify }: ProjectsViewProps) {
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ProjectDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [requirement, setRequirement] = useState('')
  const [stack, setStack] = useState<StackKey>('java-react')
  const [tab, setTab] = useState<'files' | 'tests' | 'git'>('files')
  const [tree, setTree] = useState<FileNode[]>([])
  const [fileCount, setFileCount] = useState(0)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [selectedPath, setSelectedPath] = useState('')
  const [fileContent, setFileContent] = useState('')
  const [fileLoading, setFileLoading] = useState(false)
  const [git, setGit] = useState<GitInfo | null>(null)
  const [commitMessage, setCommitMessage] = useState('')
  const [gitBusy, setGitBusy] = useState(false)

  const selectedRef = useRef<string | null>(null)
  const fileTimer = useRef<number | null>(null)
  const notifyRef = useRef(onNotify)

  selectedRef.current = selectedId
  notifyRef.current = onNotify

  const notify = useCallback((message: string) => notifyRef.current(message), [])

  const refreshGit = useCallback(async (projectId?: string) => {
    const id = projectId ?? selectedRef.current
    if (!id) return
    try {
      setGit(await projectApi.git(id))
    } catch {
      /* Git 信息刷新失败不打断主流程 */
    }
  }, [])

  const refreshFiles = useCallback(() => {
    const id = selectedRef.current
    if (!id) return
    if (fileTimer.current) window.clearTimeout(fileTimer.current)
    fileTimer.current = window.setTimeout(() => {
      projectApi
        .files(id)
        .then((res) => {
          setTree(res.tree)
          setFileCount(res.fileCount)
        })
        .catch(() => undefined)
      void refreshGit(id)
    }, 700)
  }, [refreshGit])

  const refreshDetail = useCallback(
    async (projectId?: string) => {
      const id = projectId ?? selectedRef.current
      if (!id) return
      try {
        const data = await projectApi.detail(id)
        setDetail(data)
        setTree(data.files)
        setFileCount(data.fileCount)
        void refreshGit(id)
      } catch (error) {
        notify(errorText(error, '刷新项目失败'))
      }
    },
    [notify, refreshGit],
  )

  const engine = useProjectBuild({
    onNotify: notify,
    onFile: refreshFiles,
    onFinished: () => {
      void refreshDetail()
    },
  })

  const loadProjects = useCallback(
    async (preferId?: string) => {
      try {
        const list = await projectApi.list()
        setProjects(list)
        setSelectedId((prev) => {
          if (preferId && list.some((item) => item.id === preferId)) return preferId
          if (prev && list.some((item) => item.id === prev)) return prev
          return list[0]?.id ?? null
        })
      } catch (error) {
        notify(errorText(error, '加载项目列表失败'))
      } finally {
        setLoading(false)
      }
    },
    [notify],
  )

  useEffect(() => {
    void loadProjects()
    return () => {
      if (fileTimer.current) window.clearTimeout(fileTimer.current)
    }
  }, [loadProjects])

  const { load: loadBuild, reset: resetBuild } = engine

  useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      setTree([])
      setFileCount(0)
      setGit(null)
      resetBuild()
      return
    }
    let cancelled = false
    setSelectedPath('')
    setFileContent('')
    setExpanded({})
    setTab('files')
    resetBuild()
    void (async () => {
      try {
        const data = await projectApi.detail(selectedId)
        if (cancelled) return
        setDetail(data)
        setTree(data.files)
        setFileCount(data.fileCount)
        setRequirement(data.requirement || '')
        setStack((data.stack as StackKey) || 'java-react')
        void refreshGit(selectedId)
        const latest = data.latestBuild
        const active = latest != null
          && (latest.status === 'pending' || latest.status === 'running' || latest.status === 'paused')
        if (active && latest) {
          await loadBuild(latest.id)
        }
      } catch (error) {
        if (!cancelled) notify(errorText(error, '加载项目详情失败'))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedId, loadBuild, resetBuild, notify, refreshGit])

  const activeBuild: ProjectBuild | null =
    engine.build && engine.build.projectId === detail?.id ? engine.build : detail?.latestBuild ?? null
  const stages = activeBuild?.stages ?? []
  const tasks = activeBuild?.tasks ?? []
  const buildLive = activeBuild
    ? activeBuild.status === 'pending' || activeBuild.status === 'running' || activeBuild.status === 'paused'
    : false
  const commits = git?.commits ?? detail?.commits ?? []

  // 构建结束后重新进入页面时，用持久化的测试阶段还原每一轮测试结果
  const testRecords = engine.tests.length > 0
    ? engine.tests
    : stages
      .filter((stage) => stage.stageKey === 'test')
      .map((stage, index) => {
        const matched = stage.title.match(/第\s*(\d+)\s*轮/)
        return {
          round: matched ? Number(matched[1]) : index + 1,
          ok: stage.status === 'done',
          command: '',
          output: stage.content || '',
          durationMs: 0,
        }
      })

  const elapsedSeconds = activeBuild?.startedAt && activeBuild?.finishedAt
    ? Math.max(0, Math.round((activeBuild.finishedAt - activeBuild.startedAt) / 1000))
    : engine.elapsed

  const control = async (action: 'pause' | 'resume' | 'cancel') => {
    try {
      if (action === 'pause') await engine.pause()
      else if (action === 'resume') await engine.resume()
      else await engine.cancel()
    } catch (error) {
      notify(errorText(error, '操作失败'))
    }
  }

  const startBuild = async () => {
    if (!detail) return
    const text = requirement.trim()
    if (!text) {
      notify('请先填写项目需求，AI 需要需求才能构建')
      return
    }
    try {
      await engine.start(detail.id, text, stack)
      setTab('files')
      await loadProjects(detail.id)
      await refreshDetail(detail.id)
      notify('AI 构建已启动')
    } catch (error) {
      notify(errorText(error, '启动构建失败'))
    }
  }

  const createProject = async () => {
    const name = form.name.trim()
    if (!name) {
      notify('请填写项目名称')
      return
    }
    try {
      const created = await projectApi.create({
        name,
        description: form.requirement.slice(0, 160),
        stack: form.stack,
        requirement: form.requirement,
      })
      setForm(EMPTY_FORM)
      setCreating(false)
      await loadProjects(created.id)
      notify('项目已创建，填写需求即可启动 AI 构建')
    } catch (error) {
      notify(errorText(error, '创建项目失败'))
    }
  }

  const removeProject = async (id: string, name: string) => {
    if (!window.confirm(`确认删除项目「${name}」？工作区文件、构建记录与 Git 记录会一并删除。`)) return
    try {
      await projectApi.remove(id)
      if (selectedRef.current === id) {
        setSelectedId(null)
        engine.reset()
      }
      await loadProjects()
      notify('项目已删除')
    } catch (error) {
      notify(errorText(error, '删除项目失败'))
    }
  }

  const openFile = async (path: string) => {
    if (!detail) return
    setSelectedPath(path)
    setFileLoading(true)
    try {
      const data = await projectApi.readFile(detail.id, path)
      setFileContent(data.content)
    } catch (error) {
      setFileContent(`读取失败：${errorText(error, '未知错误')}`)
    } finally {
      setFileLoading(false)
    }
  }

  const commitAll = async () => {
    if (!detail || gitBusy) return
    setGitBusy(true)
    try {
      const result = await projectApi.commit(
        detail.id,
        commitMessage.trim() || `chore: 更新 ${detail.name}`,
      )
      setCommitMessage('')
      notify(result.ok ? `已提交 ${result.commit?.shortHash ?? ''}` : result.message)
      setGit(await projectApi.git(detail.id))
    } catch (error) {
      notify(errorText(error, '提交失败'))
    } finally {
      setGitBusy(false)
    }
  }

  const createBranch = async () => {
    if (!detail || gitBusy) return
    const name = window.prompt('新分支名称（例如 feature/ai-build）')
    if (!name) return
    setGitBusy(true)
    try {
      await projectApi.branch(detail.id, name)
      notify(`已切换到分支 ${name}`)
      setGit(await projectApi.git(detail.id))
    } catch (error) {
      notify(errorText(error, '创建分支失败'))
    } finally {
      setGitBusy(false)
    }
  }

  const switchBranch = async (name: string) => {
    if (!detail || gitBusy || !name || name === git?.branch) return
    setGitBusy(true)
    try {
      await projectApi.checkout(detail.id, name)
      notify(`已切换到分支 ${name}`)
      setGit(await projectApi.git(detail.id))
    } catch (error) {
      notify(errorText(error, '切换分支失败'))
    } finally {
      setGitBusy(false)
    }
  }

  const renderNodes = (nodes: FileNode[], depth = 0): ReactNode =>
    nodes.map((node) => {
      if (node.type === 'dir') {
        const open = expanded[node.path] ?? depth === 0
        return (
          <div key={node.path}>
            <button
              type="button"
              className="pj-node dir"
              style={{ paddingLeft: 8 + depth * 12 }}
              onClick={() => setExpanded((prev) => ({ ...prev, [node.path]: !open }))}
            >
              <Icon name={open ? 'chevronDown' : 'arrowRight'} size={12} />
              <Icon name="package" size={13} />
              <span>{node.name}</span>
            </button>
            {open && node.children ? renderNodes(node.children, depth + 1) : null}
          </div>
        )
      }
      return (
        <button
          key={node.path}
          type="button"
          className={`pj-node ${selectedPath === node.path ? 'active' : ''}`}
          style={{ paddingLeft: 8 + depth * 12 }}
          onClick={() => {
            void openFile(node.path)
          }}
        >
          <Icon name="file" size={12} />
          <span>{node.name}</span>
        </button>
      )
    })

  if (loading) {
    return (
      <div className="pj-loading">
        <span className="spinner" />
        <p>正在加载项目…</p>
      </div>
    )
  }

  return (
    <div className="page pj-page">
      <div className="page-head">
        <div>
          <span className="eyebrow">AI 软件项目构建</span>
          <h1>{detail?.name ?? '项目构建'}</h1>
          <p>
            多个 Agent 协同完成需求分析、架构设计、任务拆解、代码生成、真实执行测试与缺陷修复，
            最终交付完整项目代码、文档与 Git 提交。
          </p>
        </div>
        <div className="page-actions">
          {activeBuild && (
            <span className={`pj-status ${activeBuild.status}`}>
              {BUILD_STATUS_LABEL[activeBuild.status]}
            </span>
          )}
          {detail && (
            <a className="btn small" href={projectApi.downloadUrl(detail.id)} download>
              <Icon name="download" size={13} /> 下载 ZIP
            </a>
          )}
          {detail && (
            <button
              className="btn small"
              onClick={() => {
                void refreshDetail()
              }}
            >
              <Icon name="refresh" size={13} /> 刷新
            </button>
          )}
        </div>
      </div>

      <div className="pj-layout">
        <aside className="pj-side">
          <button
            className={`btn ${creating ? 'ghost' : 'primary'} pj-new`}
            onClick={() => setCreating((value) => !value)}
          >
            <Icon name={creating ? 'x' : 'plus'} size={14} />
            {creating ? '取消' : '新建项目'}
          </button>

          {creating && (
            <div className="panel pj-create">
              <div className="field">
                <span className="field-label">项目名称</span>
                <input
                  value={form.name}
                  placeholder="例如：任务管理系统"
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                />
              </div>
              <div className="field">
                <span className="field-label">技术栈</span>
                <select
                  value={form.stack}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, stack: event.target.value as StackKey }))
                  }
                >
                  {STACK_OPTIONS.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <span className="field-label">项目需求</span>
                <textarea
                  rows={4}
                  value={form.requirement}
                  placeholder="描述要实现的功能，例如：做一个支持任务增删改查、状态流转与统计的任务管理系统"
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, requirement: event.target.value }))
                  }
                />
              </div>
              <button className="btn primary pj-create-btn" onClick={() => void createProject()}>
                <Icon name="check" size={13} /> 创建项目
              </button>
            </div>
          )}

          <div className="pj-projects">
            {projects.length === 0 && (
              <p className="pj-empty">还没有项目，点击上方「新建项目」开始。</p>
            )}
            {projects.map((project) => (
              <div
                key={project.id}
                className={`pj-project ${project.id === selectedId ? 'active' : ''}`}
                onClick={() => setSelectedId(project.id)}
              >
                <div className="pj-project-top">
                  <b>{project.name}</b>
                  <span className={`pj-status mini ${project.buildStatus || 'planning'}`}>
                    {project.buildStatus
                      ? BUILD_STATUS_LABEL[project.buildStatus as keyof typeof BUILD_STATUS_LABEL]
                      : '未构建'}
                  </span>
                </div>
                <div className="pj-project-meta">
                  <span>{STACK_LABEL[project.stack] ?? project.stack}</span>
                  <i>·</i>
                  <span>{project.fileCount} 文件</span>
                  <i>·</i>
                  <span>{timeAgo(project.updatedAt)}</span>
                </div>
                <button
                  className="pj-project-del"
                  title="删除项目"
                  onClick={(event) => {
                    event.stopPropagation()
                    void removeProject(project.id, project.name)
                  }}
                >
                  <Icon name="trash" size={12} />
                </button>
              </div>
            ))}
          </div>
        </aside>

        <main className="pj-main">
          {!detail ? (
            <div className="panel pj-blank">
              <Icon name="package" size={26} />
              <h3>选择一个项目，或新建项目</h3>
              <p>创建项目后描述需求，AI 研发团队会自动完成从需求到交付的完整构建。</p>
            </div>
          ) : (
            <>
              <div className="panel pj-req">
                <div className="panel-head">
                  <div>
                    <h3>需求与构建</h3>
                    <p>需求会作为流水线输入，构建过程实时推送</p>
                  </div>
                  <div className="pj-req-actions">
                    <select
                      className="pj-select"
                      value={stack}
                      disabled={buildLive}
                      onChange={(event) => setStack(event.target.value as StackKey)}
                    >
                      {STACK_OPTIONS.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {buildLive ? (
                      <>
                        {activeBuild?.status === 'running' && (
                          <button
                            className="btn small"
                            disabled={engine.busy}
                            onClick={() => void control('pause')}
                          >
                            <Icon name="pause" size={12} /> 暂停
                          </button>
                        )}
                        {activeBuild?.status === 'paused' && (
                          <button
                            className="btn small"
                            disabled={engine.busy}
                            onClick={() => void control('resume')}
                          >
                            <Icon name="play" size={12} /> 继续
                          </button>
                        )}
                        <button
                          className="btn small danger"
                          disabled={engine.busy}
                          onClick={() => void control('cancel')}
                        >
                          <Icon name="stop" size={12} /> 终止
                        </button>
                      </>
                    ) : (
                      <button className="btn primary" onClick={() => void startBuild()}>
                        <Icon name="zap" size={13} /> {activeBuild ? '重新构建' : '启动 AI 构建'}
                      </button>
                    )}
                  </div>
                </div>
                <textarea
                  className="pj-req-input"
                  rows={3}
                  value={requirement}
                  placeholder="描述要实现的功能、用户场景与验收标准…"
                  onChange={(event) => setRequirement(event.target.value)}
                />
                {activeBuild?.summary && (
                  <div className={`pj-summary ${activeBuild.status}`}>
                    <Icon name={activeBuild.testsPassed ? 'check' : 'bug'} size={13} />
                    <span>{activeBuild.summary}</span>
                  </div>
                )}
              </div>

              <div className="pj-stats">
                <div>
                  <b>{activeBuild?.stageCount ?? 0}</b>
                  <em>流水线阶段</em>
                </div>
                <div>
                  <b>{activeBuild?.fileCount ?? fileCount}</b>
                  <em>生成文件</em>
                </div>
                <div>
                  <b>{activeBuild?.testRounds ?? 0}</b>
                  <em>测试轮次</em>
                </div>
                <div>
                  <b>{activeBuild?.testsPassed ? '通过' : activeBuild ? '待验证' : '—'}</b>
                  <em>测试结果</em>
                </div>
                <div>
                  <b>{formatDuration(elapsedSeconds)}</b>
                  <em>构建耗时</em>
                </div>
              </div>

              <div className="pj-grid">
                <div className="panel pj-stages-panel">
                  <div className="panel-head">
                    <div>
                      <h3>构建流水线</h3>
                      <p>需求分析 → 架构设计 → 任务拆解 → 代码生成 → 测试 → 修复 → 交付</p>
                    </div>
                    <span className={`panel-live ${engine.live ? 'on' : ''}`}>
                      {engine.live ? '实时运行中' : activeBuild ? BUILD_STATUS_LABEL[activeBuild.status] : '未构建'}
                    </span>
                  </div>
                  {stages.length === 0 ? (
                    <p className="pj-empty">启动构建后，这里会显示每个阶段的 Agent 产出。</p>
                  ) : (
                    <div className="pj-timeline">
                      {stages.map((stage) => (
                        <StageCard key={stage.id} stage={stage} />
                      ))}
                    </div>
                  )}
                </div>

                <div className="panel pj-tasks-panel">
                  <div className="panel-head">
                    <div>
                      <h3>任务拆解</h3>
                      <p>前端 / 后端 / 数据库任务由项目经理 Agent 生成</p>
                    </div>
                    <span className="panel-sub">{tasks.length} 项</span>
                  </div>
                  {tasks.length === 0 ? (
                    <p className="pj-empty">构建进入任务拆解阶段后自动生成。</p>
                  ) : (
                    <div className="pj-tasks">
                      {tasks.map((task) => (
                        <div key={task.id} className="pj-task">
                          <span className={`pj-area ${task.area}`}>
                            {AREA_LABEL[task.area] ?? task.area}
                          </span>
                          <div className="pj-task-main">
                            <b>{task.title}</b>
                            {task.description && <em>{task.description}</em>}
                          </div>
                          <span className={`pj-priority ${task.priority}`}>{task.priority}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="panel pj-workbench">
                <div className="pj-tabs">
                  <button
                    className={tab === 'files' ? 'active' : ''}
                    onClick={() => setTab('files')}
                  >
                    <Icon name="file" size={13} /> 项目文件
                    <span>{fileCount}</span>
                  </button>
                  <button
                    className={tab === 'tests' ? 'active' : ''}
                    onClick={() => setTab('tests')}
                  >
                    <Icon name="terminal" size={13} /> 测试输出
                    <span>{testRecords.length}</span>
                  </button>
                  <button
                    className={tab === 'git' ? 'active' : ''}
                    onClick={() => setTab('git')}
                  >
                    <Icon name="branch" size={13} /> Git
                    <span>{commits.length}</span>
                  </button>
                </div>

                {tab === 'files' && (
                  <div className="pj-files">
                    <div className="pj-tree">
                      <div className="pj-tree-head">
                        <span>工作区</span>
                        <button
                          className="icon-btn ghost"
                          title="刷新文件树"
                          onClick={() => {
                            void refreshDetail()
                          }}
                        >
                          <Icon name="refresh" size={12} />
                        </button>
                      </div>
                      {tree.length === 0 ? (
                        <p className="pj-empty">还没有生成文件。</p>
                      ) : (
                        <div className="pj-tree-body">{renderNodes(tree)}</div>
                      )}
                    </div>
                    <div className="pj-preview">
                      {selectedPath ? (
                        <>
                          <div className="pj-preview-head">
                            <span>{selectedPath}</span>
                            <em>{fileContent.length} 字符</em>
                          </div>
                          {fileLoading ? (
                            <div className="pj-preview-loading">
                              <span className="spinner" /> 读取中…
                            </div>
                          ) : (
                            <pre className="pj-code">{fileContent}</pre>
                          )}
                        </>
                      ) : (
                        <div className="pj-preview-empty">
                          <Icon name="code" size={20} />
                          <p>选择左侧文件查看代码</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {tab === 'tests' && (
                  <div className="pj-tests">
                    {testRecords.length === 0 ? (
                      <p className="pj-empty">
                        构建进入测试阶段后，会在这里真实执行测试命令并展示输出；失败会自动回传 Agent 修复。
                      </p>
                    ) : (
                      testRecords.map((record) => (
                        <div key={record.round} className={`pj-test ${record.ok ? 'ok' : 'fail'}`}>
                          <div className="pj-test-head">
                            <span className={`pj-test-badge ${record.ok ? 'ok' : 'fail'}`}>
                              {record.ok ? '通过' : '失败'}
                            </span>
                            <b>第 {record.round} 轮自动测试</b>
                            {record.durationMs > 0 && <em>{record.durationMs} ms</em>}
                          </div>
                          {record.command && <code className="pj-test-cmd">{record.command}</code>}
                          <pre className="pj-test-output">{record.output || '（无输出）'}</pre>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {tab === 'git' && (
                  <div className="pj-git">
                    <div className="pj-git-head">
                      <div className="pj-git-branch">
                        <Icon name="branch" size={14} />
                        <select
                          className="pj-select"
                          value={git?.branch || activeBuild?.gitBranch || 'main'}
                          disabled={gitBusy || !git?.initialized}
                          onChange={(event) => {
                            void switchBranch(event.target.value)
                          }}
                        >
                          {(git?.branches && git.branches.length > 0
                            ? git.branches
                            : [git?.branch || activeBuild?.gitBranch || 'main']
                          ).map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </select>
                        <span>{git?.changedFiles ?? 0} 个未提交变更</span>
                      </div>
                      <div className="pj-git-actions">
                        <button className="btn small" disabled={gitBusy} onClick={() => void createBranch()}>
                          新建分支
                        </button>
                      </div>
                    </div>
                    {git && !git.available && (
                      <p className="pj-git-warn">本机未检测到 Git 命令行，代码提交与分支管理不可用。</p>
                    )}
                    <div className="pj-commit-form">
                      <input
                        value={commitMessage}
                        placeholder="提交说明，例如 feat: 完成订单模块"
                        onChange={(event) => setCommitMessage(event.target.value)}
                      />
                      <button className="btn primary small" disabled={gitBusy} onClick={() => void commitAll()}>
                        <Icon name="check" size={12} /> 提交全部变更
                      </button>
                    </div>
                    <div className="pj-commits">
                      {commits.length === 0 ? (
                        <p className="pj-empty">构建完成后会自动初始化仓库并提交代码。</p>
                      ) : (
                        commits.map((commit) => (
                          <div key={commit.id} className="pj-commit">
                            <code>{commit.shortHash || commit.hash.slice(0, 7)}</code>
                            <div className="pj-commit-main">
                              <b>{commit.message}</b>
                              <em>
                                {commit.branch} · {commit.fileCount} 个文件 · {timeAgo(commit.createdAt)}
                              </em>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
