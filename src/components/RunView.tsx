import { useEffect, useRef, type CSSProperties } from 'react'
import type { AgentDef } from '../types'
import type { RunDetail, RunStep, RunToolEvent } from '../lib/teamApi'
import { RUN_STATUS_LABEL, TEAM_MODE_LABEL } from '../lib/teamApi'
import { modelOf } from '../data/presets'
import { Icon } from './Icon'
import { AgentAvatar, LiveDot, ModelBadge } from './ui'
import { MessageFeed } from './MessageFeed'
import { RunControls, type RunControlsValue } from './RunControls'

function formatNumber(value: number): string {
  return value.toLocaleString('zh-CN')
}

function toolText(tool: RunToolEvent): string {
  if (tool.result == null || tool.result === '') return ''
  if (typeof tool.result === 'string') return tool.result
  try {
    return JSON.stringify(tool.result)
  } catch {
    return ''
  }
}

function StepCard({
  step,
  agent,
  tools,
}: {
  step: RunStep
  agent: AgentDef | undefined
  tools: RunToolEvent[]
}) {
  const info = modelOf(agent?.model ?? '')
  const working = step.status === 'running'
  const done = step.status === 'done'
  const failed = step.status === 'failed'
  const stateClass = working ? 'working' : done ? 'done' : failed ? 'failed' : 'waiting'

  return (
    <div
      className={`step-card ${stateClass}`}
      style={{ '--mc': info.color } as CSSProperties}
    >
      <div className="step-head">
        <AgentAvatar icon={agent?.icon ?? 'generic'} model={agent?.model ?? ''} size={30} />
        <div className="step-who">
          <b>{agent?.name ?? step.agentName}</b>
          <em>{step.title}</em>
        </div>
        {agent && <ModelBadge model={agent.model} />}
        <span className={`step-state ${stateClass}`}>
          {working ? (
            <>
              <i className="typing">
                <i />
                <i />
                <i />
              </i>
              进行中
            </>
          ) : done ? (
            '完成'
          ) : failed ? (
            '失败'
          ) : step.status === 'skipped' ? (
            '跳过'
          ) : (
            '等待'
          )}
        </span>
      </div>

      <div className="step-body">
        {working && !step.content ? (
          <p className="step-placeholder">
            <i className="typing">
              <i />
              <i />
              <i />
            </i>
            正在思考并生成内容…
          </p>
        ) : step.content ? (
          <p className="step-narration">
            {step.content}
            {working && <span className="caret" />}
          </p>
        ) : (
          <p className="step-placeholder">
            {step.status === 'pending' ? '等待上游 Agent 交付输入…' : step.status === 'skipped' ? '本步骤已跳过。' : '暂无输出。'}
          </p>
        )}

        {step.reasoning && (
          <details className="step-reasoning">
            <summary>推理过程</summary>
            <p>{step.reasoning}</p>
          </details>
        )}

        {step.error && <p className="step-error">{step.error}</p>}

        {tools.length > 0 && (
          <div className="step-logs">
            {tools.map((tool, index) => (
              <span key={`${tool.name}-${index}`} className="step-log">
                <Icon name={tool.status === 'failed' ? 'x' : 'zap'} size={11} />
                {tool.name}
                {tool.status ? ` · ${tool.status}` : ''}
                {toolText(tool) ? ` · ${toolText(tool)}` : ''}
              </span>
            ))}
          </div>
        )}

        {(step.promptTokens || step.completionTokens) && (
          <div className="step-tokens">
            <span>prompt {formatNumber(step.promptTokens ?? 0)}</span>
            <span>completion {formatNumber(step.completionTokens ?? 0)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function SummaryPanel({ run, elapsed }: { run: RunDetail; elapsed: number }) {
  const doneCount = run.steps.filter((step) => step.status === 'done').length
  const tokens = run.steps.reduce(
    (total, step) => total + (step.promptTokens ?? 0) + (step.completionTokens ?? 0),
    0,
  )
  const title =
    run.status === 'done' ? '协作已完成' : run.status === 'cancelled' ? '协作已终止' : '协作运行失败'
  const hint =
    run.status === 'done'
      ? '全部步骤已归档，可在左侧历史记录中随时回看。'
      : run.status === 'cancelled'
        ? '运行已被人工终止，已产生的步骤与消息仍然保留。'
        : '运行未能正常结束，请根据下方信息排查模型或团队配置。'

  return (
    <article className={`delivery-panel ${run.status}`}>
      <div className="delivery-head">
        <span className="delivery-mark">
          <Icon name="package" size={20} />
        </span>
        <div className="delivery-title">
          <h3>{title}</h3>
          <p>{run.summary || hint}</p>
        </div>
        <div className="delivery-progress">
          <b>{doneCount}</b>
          <em>完成步骤</em>
        </div>
      </div>

      <div className="delivery-metrics">
        <div>
          <b>
            {doneCount} / {run.steps.length}
          </b>
          <em>步骤完成</em>
        </div>
        <div>
          <b>{Math.max(1, elapsed)}s</b>
          <em>协作耗时</em>
        </div>
        <div>
          <b>{run.messages.length}</b>
          <em>Agent 消息</em>
        </div>
        <div>
          <b>{formatNumber(tokens)}</b>
          <em>Tokens</em>
        </div>
        <div>
          <b>{TEAM_MODE_LABEL[run.mode]}</b>
          <em>协作模式</em>
        </div>
      </div>
    </article>
  )
}

interface RunViewProps {
  run: RunDetail
  agents: AgentDef[]
  tools: Record<string, RunToolEvent[]>
  live: boolean
  elapsed: number
  controls: RunControlsValue
  onOpenTeam: () => void
}

export function RunView({ run, agents, tools, live, elapsed, controls, onOpenTeam }: RunViewProps) {
  const steps = run.steps
  const total = steps.length
  const doneCount = steps.filter((step) => step.status === 'done').length
  const overall = total ? Math.round((doneCount / total) * 100) : 0
  const stepRefs = useRef<Record<string, HTMLElement | null>>({})
  const activeStep = steps.find((step) => step.status === 'running')
  const finished = run.status === 'done' || run.status === 'cancelled' || run.status === 'failed'

  useEffect(() => {
    if (!live || !activeStep) return
    stepRefs.current[activeStep.id]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [live, activeStep?.id])

  const eyebrow = live
    ? 'AI 研发团队协作中'
    : run.status === 'paused'
      ? '协作已暂停'
      : run.status === 'done'
        ? 'AI 研发团队已完成协作'
        : run.status === 'cancelled'
          ? '协作已终止'
          : run.status === 'failed'
            ? '协作运行失败'
            : '等待开始'

  return (
    <section className="run-view">
      <header className="run-head">
        <div className="run-head-top">
          <span className="run-eyebrow">
            {live ? <LiveDot active /> : <span className={`run-done-dot ${run.status}`} />}
            {eyebrow}
          </span>
          <button className="link-btn" onClick={onOpenTeam}>
            查看协作视图 <Icon name="arrowRight" size={13} />
          </button>
        </div>
        <h2>{run.title}</h2>
        <p className="run-prompt">{run.prompt}</p>

        <div className="run-meta-row">
          <span>
            <Icon name="users" size={12} /> {run.teamName}
          </span>
          <span>
            <Icon name="branch" size={12} /> {TEAM_MODE_LABEL[run.mode]}
          </span>
          <span className={`run-status-text ${run.status}`}>{RUN_STATUS_LABEL[run.status]}</span>
        </div>

        <div className="run-progress">
          <div className="run-progress-bar">
            <i style={{ width: `${finished && run.status === 'done' ? 100 : overall}%` }} />
          </div>
          <div className="run-progress-meta">
            <span>{finished && run.status === 'done' ? 100 : overall}%</span>
            <span>
              步骤 {doneCount} / {total}
            </span>
            <span>{Math.max(1, elapsed)}s</span>
          </div>
        </div>

        <RunControls value={controls} />

        {run.status === 'failed' && (
          <div className="run-error-banner">
            <Icon name="x" size={12} />
            <span>{run.summary || '运行失败，请检查模型配置或引擎日志'}</span>
          </div>
        )}

        <div className="stage-chips">
          {steps.map((step) => {
            const status =
              step.status === 'running'
                ? 'active'
                : step.status === 'done'
                  ? 'done'
                  : step.status === 'failed'
                    ? 'failed'
                    : 'pending'
            return (
              <span key={step.id} className={`stage-chip ${status}`}>
                <i />
                {step.title}
              </span>
            )
          })}
        </div>
      </header>

      <div className="timeline">
        {steps.length === 0 && (
          <div className={`run-waiting${run.status === 'failed' ? ' failed' : ''}`}>
            {live || run.status === 'pending' ? (
              <span className="spinner" />
            ) : (
              <Icon name={run.status === 'failed' ? 'x' : 'clock'} size={15} />
            )}
            <span>
              {live || run.status === 'pending'
                ? '项目经理正在规划任务…'
                : run.status === 'failed' && run.summary
                  ? run.summary
                  : '本次运行没有产生执行步骤。'}
            </span>
          </div>
        )}

        {steps.map((step) => {
          const status =
            step.status === 'running'
              ? 'active'
              : step.status === 'done'
                ? 'done'
                : step.status === 'failed'
                  ? 'failed'
                  : 'pending'
          const agent = agents.find((item) => item.id === step.agentId)
          return (
            <article
              key={step.id}
              className={`stage-block ${status}`}
              ref={(el) => {
                stepRefs.current[step.id] = el
              }}
            >
              <div className="stage-rail">
                <span className={`stage-dot ${status}`}>
                  {step.status === 'done' ? (
                    <Icon name="check" size={11} />
                  ) : step.status === 'failed' ? (
                    <Icon name="x" size={11} />
                  ) : (
                    String(step.seq).padStart(2, '0')
                  )}
                </span>
                <i className="stage-line" />
              </div>

              <div className="stage-content">
                <div className="stage-header">
                  <div>
                    <h3>{step.title}</h3>
                    <p>第 {step.seq} 步 · {agent?.name ?? step.agentName}</p>
                  </div>
                  <span className={`stage-status ${status}`}>
                    {step.status === 'done'
                      ? '已完成'
                      : step.status === 'running'
                        ? '进行中'
                        : step.status === 'failed'
                          ? '失败'
                          : step.status === 'skipped'
                            ? '已跳过'
                            : '待执行'}
                  </span>
                </div>

                <div className="step-list">
                  <StepCard step={step} agent={agent} tools={tools[step.id] ?? []} />
                </div>
              </div>
            </article>
          )
        })}
      </div>

      {run.messages.length > 0 && (
        <section className="run-messages">
          <div className="run-section-head">
            <h3>Agent 消息</h3>
            <span>{run.messages.length} 条 · 任务分配 / 讨论 / 结果 / 总结</span>
          </div>
          <MessageFeed messages={run.messages} agents={agents} />
        </section>
      )}

      {finished && <SummaryPanel run={run} elapsed={elapsed} />}
    </section>
  )
}
