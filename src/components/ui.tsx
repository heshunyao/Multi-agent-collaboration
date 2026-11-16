import type { CSSProperties } from 'react'
import type { AgentIcon, AgentStatus, ModelId } from '../types'
import { modelOf } from '../data/presets'
import { Icon } from './Icon'

const AGENT_GLYPH: Record<AgentIcon, string> = {
  pm: 'sparkle',
  arch: 'layers',
  backend: 'server',
  frontend: 'code',
  qa: 'bug',
  reviewer: 'shield',
  generic: 'cpu',
}

export const STATUS_TEXT: Record<AgentStatus, string> = {
  waiting: '等待',
  working: '进行中',
  done: '已完成',
  failed: '失败',
  skipped: '未参与',
}

export function ModelBadge({ model, size = 'sm' }: { model: ModelId; size?: 'sm' | 'md' }) {
  const info = modelOf(model)
  return (
    <span
      className={`model-badge ${size}`}
      style={{ '--mc': info.color } as CSSProperties}
      title={`${info.vendor} · ${info.context}`}
    >
      <i className="model-dot" />
      {info.label}
    </span>
  )
}

export function AgentAvatar({
  icon,
  model,
  size = 34,
  muted,
}: {
  icon: AgentIcon
  model: ModelId
  size?: number
  muted?: boolean
}) {
  const info = modelOf(model)
  return (
    <span
      className={`agent-avatar ${muted ? 'muted' : ''}`}
      style={
        {
          '--mc': info.color,
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.3),
        } as CSSProperties
      }
    >
      <Icon name={AGENT_GLYPH[icon] ?? 'cpu'} size={Math.round(size * 0.52)} />
    </span>
  )
}

export function LiveDot({ active }: { active: boolean }) {
  return <span className={`live-dot ${active ? 'on' : ''}`} />
}

export function StatusPill({ status }: { status: AgentStatus }) {
  return <span className={`status-pill ${status}`}>{STATUS_TEXT[status]}</span>
}

export function timeAgo(ts: number): string {
  const diff = Math.max(0, Date.now() - ts)
  const m = Math.floor(diff / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return `${m} 分钟前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} 小时前`
  return `${Math.floor(h / 24)} 天前`
}
