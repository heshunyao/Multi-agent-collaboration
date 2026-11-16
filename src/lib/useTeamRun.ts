import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AgentMessage,
  RunDetail,
  RunStatus,
  RunStep,
  RunSummary,
  RunToolEvent,
  StepStatus,
} from './teamApi'
import { isRunActive, isRunTerminal, streamRun, teamApi } from './teamApi'

const sortSteps = (steps: RunStep[]) => [...steps].sort((a, b) => a.seq - b.seq)

const emptyStep = (event: {
  stepId: string
  seq: number
  agentId: string
  agentName: string
  title: string
  status: StepStatus
}): RunStep => ({
  id: event.stepId,
  seq: event.seq,
  agentId: event.agentId,
  agentName: event.agentName,
  title: event.title,
  status: event.status,
  content: '',
  reasoning: '',
})

interface UseTeamRunOptions {
  /** SSE / 网络错误提示，由页面决定如何展示。 */
  onNotify?: (message: string) => void
}

export function useTeamRun(options: UseTeamRunOptions = {}) {
  const [run, setRun] = useState<RunDetail | null>(null)
  const [history, setHistory] = useState<RunSummary[]>([])
  const [tools, setTools] = useState<Record<string, RunToolEvent[]>>({})
  const [loading, setLoading] = useState(false)
  const [busyAction, setBusyAction] = useState<'pause' | 'resume' | 'cancel' | null>(null)

  const runRef = useRef<RunDetail | null>(null)
  const streamRef = useRef<AbortController | null>(null)
  const finishedRef = useRef(false)
  const notifyRef = useRef(options.onNotify)
  const [now, setNow] = useState(Date.now())

  notifyRef.current = options.onNotify

  const setRunDetail = useCallback((detail: RunDetail | null) => {
    runRef.current = detail
    setRun(detail)
    setNow(Date.now())
  }, [])

  const patchRun = useCallback((updater: (prev: RunDetail) => RunDetail) => {
    setRun((prev) => {
      if (!prev) return prev
      const next = updater(prev)
      runRef.current = next
      return next
    })
  }, [])

  const notify = useCallback((message: string) => {
    notifyRef.current?.(message)
  }, [])

  const abortStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.abort()
      streamRef.current = null
    }
  }, [])

  const refreshHistory = useCallback(async (teamId?: string) => {
    try {
      const list = await teamApi.listRuns(teamId)
      setHistory(list)
      return list
    } catch {
      return []
    }
  }, [])

  const status: RunStatus | null = run?.status ?? null
  const live = status === 'pending' || status === 'running'
  const active = live || status === 'paused'

  /* ---------- 连接事件流 ---------- */
  const subscribe = useCallback(
    (runId: string) => {
      abortStream()
      finishedRef.current = false
      const controller = new AbortController()
      streamRef.current = controller

      const guardTerminal = () => {
        const current = runRef.current
        return !current || isRunTerminal(current.status)
      }

      void streamRun(
        runId,
        {
          onStatus: (payload) => {
            const current = runRef.current
            // 人工终止后忽略回放中的旧状态事件
            if (current && isRunTerminal(current.status) && !isRunTerminal(payload.status)) return
            if (current && current.status === 'paused' && payload.status === 'running') return
            patchRun((prev) => {
              const nextStatus = payload.status
              return {
                ...prev,
                status: nextStatus,
                startedAt:
                  nextStatus === 'running' && !prev.startedAt ? Date.now() : prev.startedAt,
                finishedAt: isRunTerminal(nextStatus) ? prev.finishedAt ?? Date.now() : prev.finishedAt,
                updatedAt: Date.now(),
              }
            })
            if (isRunTerminal(payload.status)) {
              finishedRef.current = true
              void refreshHistory()
            }
          },
          onStep: (event) => {
            if (guardTerminal()) return
            patchRun((prev) => {
              const found = prev.steps.find((step) => step.id === event.stepId)
              if (found) {
                // 回放事件不覆盖已经完成的步骤
                const locked = found.status === 'done' || found.status === 'failed'
                const steps = prev.steps.map((step) =>
                  step.id === event.stepId
                    ? {
                        ...step,
                        seq: event.seq,
                        agentId: event.agentId,
                        agentName: event.agentName,
                        title: event.title,
                        status: locked ? step.status : event.status,
                      }
                    : step,
                )
                return { ...prev, steps: sortSteps(steps), updatedAt: Date.now() }
              }
              return {
                ...prev,
                steps: sortSteps([...prev.steps, emptyStep(event)]),
                updatedAt: Date.now(),
              }
            })
          },
          onDelta: ({ stepId, text }) => {
            if (guardTerminal()) return
            patchRun((prev) => {
              const target = prev.steps.find((step) => step.id === stepId)
              if (!target || target.status === 'done' || target.status === 'failed') return prev
              return {
                ...prev,
                steps: prev.steps.map((step) =>
                  step.id === stepId ? { ...step, content: step.content + text } : step,
                ),
                updatedAt: Date.now(),
              }
            })
          },
          onReasoning: ({ stepId, text }) => {
            if (guardTerminal()) return
            patchRun((prev) => {
              const target = prev.steps.find((step) => step.id === stepId)
              if (!target || target.status === 'done' || target.status === 'failed') return prev
              return {
                ...prev,
                steps: prev.steps.map((step) =>
                  step.id === stepId ? { ...step, reasoning: step.reasoning + text } : step,
                ),
                updatedAt: Date.now(),
              }
            })
          },
          onTool: (event) => {
            if (guardTerminal()) return
            setTools((prev) => ({
              ...prev,
              [event.stepId]: [...(prev[event.stepId] ?? []), event],
            }))
          },
          onStepDone: (event) => {
            if (guardTerminal()) return
            patchRun((prev) => {
              const found = prev.steps.find((step) => step.id === event.stepId)
              const base = found ?? emptyStep(event)
              const merged: RunStep = {
                ...base,
                seq: event.seq || base.seq,
                agentId: event.agentId || base.agentId,
                agentName: event.agentName || base.agentName,
                title: event.title || base.title,
                status: event.status,
                content: event.content ? event.content : base.content,
                reasoning: event.reasoning ? event.reasoning : base.reasoning,
                error: event.error,
                promptTokens: event.promptTokens,
                completionTokens: event.completionTokens,
                finishedAt: Date.now(),
              }
              const steps = found
                ? prev.steps.map((step) => (step.id === event.stepId ? merged : step))
                : [...prev.steps, merged]
              return { ...prev, steps: sortSteps(steps), updatedAt: Date.now() }
            })
          },
          onMessage: (message) => {
            if (guardTerminal()) return
            patchRun((prev) => {
              if (message.id && prev.messages.some((item) => item.id === message.id)) return prev
              const next: AgentMessage = {
                ...message,
                id: message.id || `msg-${message.stepId}-${message.seq}-${message.fromAgentId}`,
                createdAt: message.createdAt ?? Date.now(),
              }
              return {
                ...prev,
                messages: [...prev.messages, next].sort((a, b) => a.seq - b.seq),
                updatedAt: Date.now(),
              }
            })
          },
          onDone: (payload) => {
            finishedRef.current = true
            patchRun((prev) => ({
              ...prev,
              status: payload.status,
              summary: payload.summary ?? prev.summary,
              finishedAt: prev.finishedAt ?? Date.now(),
              updatedAt: Date.now(),
            }))
            setNow(Date.now())
            void refreshHistory()
          },
          onError: (message) => {
            finishedRef.current = true
            patchRun((prev) => ({
              ...prev,
              status: 'failed',
              summary: message,
              finishedAt: prev.finishedAt ?? Date.now(),
              updatedAt: Date.now(),
            }))
            notify(message)
            void refreshHistory()
          },
        },
        controller.signal,
      )
        .catch((error: unknown) => {
          if (controller.signal.aborted) return
          notify(error instanceof Error ? error.message : '事件流连接中断')
        })
        .finally(() => {
          if (streamRef.current === controller) streamRef.current = null
          if (finishedRef.current || controller.signal.aborted) return
          const current = runRef.current
          if (!current || current.id !== runId || !isRunActive(current.status)) return
          // 连接意外关闭时，以服务端详情为准做一次校准
          void teamApi
            .getRun(runId)
            .then((detail) => {
              if (runRef.current?.id !== runId) return
              setRunDetail({
                ...detail,
                steps: detail.steps.map((step) => {
                  const local = runRef.current?.steps.find((item) => item.id === step.id)
                  if (local && local.content.length > step.content.length) {
                    return { ...step, content: local.content, reasoning: local.reasoning || step.reasoning }
                  }
                  return step
                }),
                messages:
                  detail.messages.length >= (runRef.current?.messages.length ?? 0)
                    ? detail.messages
                    : runRef.current?.messages ?? detail.messages,
              })
            })
            .catch(() => undefined)
        })
    },
    [abortStream, notify, patchRun, refreshHistory, setRunDetail],
  )

  /* ---------- 对外操作 ---------- */
  const startRun = useCallback(
    async (teamId: string, prompt: string) => {
      abortStream()
      setTools({})
      const detail = await teamApi.createRun(teamId, prompt)
      setRunDetail(detail)
      void refreshHistory()
      subscribe(detail.id)
      return detail
    },
    [abortStream, refreshHistory, setRunDetail, subscribe],
  )

  const loadRun = useCallback(
    async (runId: string) => {
      abortStream()
      setLoading(true)
      try {
        const detail = await teamApi.getRun(runId)
        setTools({})
        setRunDetail(detail)
        if (isRunActive(detail.status)) subscribe(detail.id)
        return detail
      } finally {
        setLoading(false)
      }
    },
    [abortStream, setRunDetail, subscribe],
  )

  const pause = useCallback(async () => {
    const id = runRef.current?.id
    if (!id) return
    setBusyAction('pause')
    try {
      const result = await teamApi.pauseRun(id)
      patchRun((prev) => ({ ...prev, status: result.status, updatedAt: Date.now() }))
      void refreshHistory()
    } finally {
      setBusyAction(null)
    }
  }, [patchRun, refreshHistory])

  const resume = useCallback(async () => {
    const id = runRef.current?.id
    if (!id) return
    setBusyAction('resume')
    try {
      const result = await teamApi.resumeRun(id)
      patchRun((prev) => ({ ...prev, status: result.status, updatedAt: Date.now() }))
      void refreshHistory()
    } finally {
      setBusyAction(null)
    }
  }, [patchRun, refreshHistory])

  const cancel = useCallback(async () => {
    const id = runRef.current?.id
    if (!id) return
    setBusyAction('cancel')
    try {
      const result = await teamApi.cancelRun(id)
      patchRun((prev) => ({
        ...prev,
        status: result.status,
        summary: prev.summary || '已终止',
        finishedAt: prev.finishedAt ?? Date.now(),
        updatedAt: Date.now(),
      }))
      void refreshHistory()
    } finally {
      setBusyAction(null)
    }
  }, [patchRun, refreshHistory])

  const reset = useCallback(() => {
    abortStream()
    setTools({})
    setRunDetail(null)
  }, [abortStream, setRunDetail])

  useEffect(() => {
    if (!live) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [live])

  useEffect(
    () => () => {
      abortStream()
    },
    [abortStream],
  )

  // 后端对未开始的运行会返回 startedAt=0，需要退回创建时间，避免出现超大耗时
  const startAt = run?.startedAt && run.startedAt > 0 ? run.startedAt : run?.createdAt
  const endAt = run?.finishedAt && run.finishedAt > 0 ? run.finishedAt : live ? now : run?.updatedAt
  const elapsed =
    run && startAt && endAt ? Math.max(0, Math.round((endAt - startAt) / 1000)) : 0

  return {
    run,
    history,
    tools,
    status,
    live,
    active,
    loading,
    busy: busyAction !== null,
    busyAction,
    elapsed,
    startRun,
    loadRun,
    pause,
    resume,
    cancel,
    reset,
    refreshHistory,
  }
}

export type TeamRunEngine = ReturnType<typeof useTeamRun>
