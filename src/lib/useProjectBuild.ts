import { useCallback, useEffect, useRef, useState } from 'react'
import type { BuildStatus, ProjectBuild, ProjectStage, TestRecord } from './projectApi'
import { isBuildActive, projectApi, streamProjectBuild } from './projectApi'

interface UseProjectBuildOptions {
  onNotify?: (message: string) => void
  /** 工作区文件发生变化（用于刷新文件树）。 */
  onFile?: () => void
  /** 构建进入终态（用于刷新项目详情与 Git 记录）。 */
  onFinished?: () => void
}

const sortStages = (stages: ProjectStage[]) => [...stages].sort((a, b) => a.seq - b.seq)

const emptyStage = (stage: ProjectStage): ProjectStage => ({
  ...stage,
  content: '',
  reasoning: '',
})

export function useProjectBuild(options: UseProjectBuildOptions = {}) {
  const [build, setBuild] = useState<ProjectBuild | null>(null)
  const [tests, setTests] = useState<TestRecord[]>([])
  const [busy, setBusy] = useState<'pause' | 'resume' | 'cancel' | null>(null)
  const [now, setNow] = useState(Date.now())

  const buildRef = useRef<ProjectBuild | null>(null)
  const streamRef = useRef<AbortController | null>(null)
  const finishedRef = useRef(false)
  const notifyRef = useRef(options.onNotify)
  const onFileRef = useRef(options.onFile)
  const onFinishedRef = useRef(options.onFinished)

  notifyRef.current = options.onNotify
  onFileRef.current = options.onFile
  onFinishedRef.current = options.onFinished

  const setBuildDetail = useCallback((detail: ProjectBuild | null) => {
    buildRef.current = detail
    setBuild(detail)
    setNow(Date.now())
  }, [])

  const patchBuild = useCallback((updater: (prev: ProjectBuild) => ProjectBuild) => {
    setBuild((prev) => {
      if (!prev) return prev
      const next = updater(prev)
      buildRef.current = next
      return next
    })
  }, [])

  const abortStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.abort()
      streamRef.current = null
    }
  }, [])

  const subscribe = useCallback(
    (buildId: string) => {
      abortStream()
      finishedRef.current = false
      const controller = new AbortController()
      streamRef.current = controller

      const guard = () => {
        const current = buildRef.current
        return !current || current.id !== buildId || current.status === 'done'
          || current.status === 'failed' || current.status === 'cancelled'
      }

      const patchStage = (stage: ProjectStage, finished: boolean) => {
        patchBuild((prev) => {
          const exists = prev.stages.some((item) => item.id === stage.id)
          const stages = exists
            ? prev.stages.map((item) =>
                item.id === stage.id
                  ? {
                      ...item,
                      ...stage,
                      content: finished ? (stage.content || item.content) : item.content,
                      reasoning: finished ? (stage.reasoning || item.reasoning) : item.reasoning,
                    }
                  : item,
              )
            : [...prev.stages, finished ? { ...emptyStage(stage), ...stage } : emptyStage(stage)]
          return { ...prev, stages: sortStages(stages), updatedAt: Date.now() }
        })
      }

      void streamProjectBuild(
        buildId,
        {
          onStatus: (payload) => {
            if (guard()) return
            patchBuild((prev) => ({
              ...prev,
              status: payload.status,
              updatedAt: Date.now(),
            }))
          },
          onStage: (stage) => {
            if (guard()) return
            patchStage(stage, false)
          },
          onStageDone: (stage) => {
            if (guard()) return
            patchStage(stage, true)
          },
          onDelta: ({ stageId, text }) => {
            if (guard()) return
            patchBuild((prev) => ({
              ...prev,
              stages: prev.stages.map((stage) =>
                stage.id === stageId && stage.status === 'running'
                  ? { ...stage, content: stage.content + text }
                  : stage,
              ),
              updatedAt: Date.now(),
            }))
          },
          onReasoning: ({ stageId, text }) => {
            if (guard()) return
            patchBuild((prev) => ({
              ...prev,
              stages: prev.stages.map((stage) =>
                stage.id === stageId && stage.status === 'running'
                  ? { ...stage, reasoning: (stage.reasoning ?? '') + text }
                  : stage,
              ),
              updatedAt: Date.now(),
            }))
          },
          onTask: (task) => {
            if (guard()) return
            patchBuild((prev) => {
              if (prev.tasks.some((item) => item.id === task.id)) return prev
              const tasks = [...prev.tasks, task].sort((a, b) => a.orderIndex - b.orderIndex)
              return { ...prev, tasks, updatedAt: Date.now() }
            })
          },
          onFile: () => {
            onFileRef.current?.()
          },
          onTest: (record) => {
            if (guard()) return
            setTests((prev) => {
              if (prev.some((item) => item.round === record.round)) {
                return prev.map((item) => (item.round === record.round ? record : item))
              }
              return [...prev, record].sort((a, b) => a.round - b.round)
            })
            patchBuild((prev) => ({
              ...prev,
              testRounds: Math.max(prev.testRounds, record.round),
              testsPassed: record.ok,
              lastTestOutput: record.output,
              updatedAt: Date.now(),
            }))
          },
          onGit: (payload) => {
            patchBuild((prev) => ({
              ...prev,
              gitCommit: payload.hash ?? prev.gitCommit,
              gitBranch: payload.branch ?? prev.gitBranch,
              updatedAt: Date.now(),
            }))
            if (payload.ok && payload.message) {
              notifyRef.current?.(`Git 已提交：${payload.shortHash ?? ''} ${payload.message}`)
            }
          },
          onDone: (payload) => {
            finishedRef.current = true
            patchBuild((prev) => ({
              ...prev,
              status: payload.status,
              summary: payload.summary ?? prev.summary,
              fileCount: payload.fileCount ?? prev.fileCount,
              testRounds: payload.testRounds ?? prev.testRounds,
              testsPassed: payload.testsPassed ?? prev.testsPassed,
              gitCommit: payload.gitCommit || prev.gitCommit,
              finishedAt: prev.finishedAt ?? Date.now(),
              updatedAt: Date.now(),
            }))
            setNow(Date.now())
            onFinishedRef.current?.()
          },
          onError: (message) => {
            finishedRef.current = true
            patchBuild((prev) => ({
              ...prev,
              status: 'failed',
              summary: message,
              finishedAt: prev.finishedAt ?? Date.now(),
              updatedAt: Date.now(),
            }))
            notifyRef.current?.(message)
            onFinishedRef.current?.()
          },
        },
        controller.signal,
      )
        .catch((error: unknown) => {
          if (controller.signal.aborted) return
          notifyRef.current?.(error instanceof Error ? error.message : '构建事件流中断')
        })
        .finally(() => {
          if (streamRef.current === controller) streamRef.current = null
          if (finishedRef.current || controller.signal.aborted) return
          const current = buildRef.current
          if (!current || current.id !== buildId || !isBuildActive(current.status)) return
          // 连接意外关闭时以服务端状态校准
          void projectApi
            .buildDetail(buildId)
            .then((detail) => {
              if (buildRef.current?.id !== buildId) return
              setBuildDetail(detail)
              if (!isBuildActive(detail.status)) onFinishedRef.current?.()
            })
            .catch(() => undefined)
        })
    },
    [abortStream, patchBuild, setBuildDetail],
  )

  const start = useCallback(
    async (projectId: string, requirement: string, stack: string) => {
      abortStream()
      setTests([])
      const detail = await projectApi.build(projectId, requirement, stack)
      setBuildDetail(detail)
      subscribe(detail.id)
      return detail
    },
    [abortStream, setBuildDetail, subscribe],
  )

  const load = useCallback(
    async (buildId: string) => {
      abortStream()
      setTests([])
      const detail = await projectApi.buildDetail(buildId)
      setBuildDetail(detail)
      if (detail.lastTestOutput) {
        setTests([{
          round: detail.testRounds || 1,
          ok: detail.testsPassed,
          command: '',
          output: detail.lastTestOutput,
          durationMs: 0,
        }])
      }
      if (isBuildActive(detail.status)) subscribe(detail.id)
      return detail
    },
    [abortStream, setBuildDetail, subscribe],
  )

  const control = useCallback(
    async (action: 'pause' | 'resume' | 'cancel') => {
      const id = buildRef.current?.id
      if (!id) return
      setBusy(action)
      try {
        const call = action === 'pause'
          ? projectApi.pauseBuild(id)
          : action === 'resume'
            ? projectApi.resumeBuild(id)
            : projectApi.cancelBuild(id)
        const result = await call
        patchBuild((prev) => ({
          ...prev,
          status: result.status as BuildStatus,
          updatedAt: Date.now(),
        }))
        if (action === 'cancel') onFinishedRef.current?.()
      } finally {
        setBusy(null)
      }
    },
    [patchBuild],
  )

  const reset = useCallback(() => {
    abortStream()
    setTests([])
    setBuildDetail(null)
  }, [abortStream, setBuildDetail])

  const live = build?.status === 'pending' || build?.status === 'running'

  useEffect(() => {
    if (!live) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [live])

  useEffect(() => () => abortStream(), [abortStream])

  const startAt = build?.startedAt && build.startedAt > 0 ? build.startedAt : build?.createdAt
  const endAt = build?.finishedAt && build.finishedAt > 0 ? build.finishedAt : live ? now : build?.updatedAt
  const elapsed = build && startAt && endAt ? Math.max(0, Math.round((endAt - startAt) / 1000)) : 0

  return {
    build,
    tests,
    live,
    busy: busy !== null,
    busyAction: busy,
    elapsed,
    start,
    load,
    pause: () => control('pause'),
    resume: () => control('resume'),
    cancel: () => control('cancel'),
    reset,
  }
}

export type ProjectBuildEngine = ReturnType<typeof useProjectBuild>
