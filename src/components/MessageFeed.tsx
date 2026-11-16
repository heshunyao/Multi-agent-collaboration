import { useMemo } from 'react'
import type { AgentDef, AgentIcon } from '../types'
import type { AgentMessage, MessageKind } from '../lib/teamApi'
import { MESSAGE_KIND_LABEL } from '../lib/teamApi'
import { AgentAvatar } from './ui'

const ICONS: AgentIcon[] = ['pm', 'arch', 'backend', 'frontend', 'qa', 'reviewer', 'generic']

function asIcon(icon: string | undefined): AgentIcon {
  return ICONS.includes(icon as AgentIcon) ? (icon as AgentIcon) : 'generic'
}

function timeLabel(ts?: number): string {
  if (!ts) return ''
  const date = new Date(ts)
  return date.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

interface MessageFeedProps {
  messages: AgentMessage[]
  agents: AgentDef[]
  kinds?: MessageKind[]
  limit?: number
  compact?: boolean
  empty?: string
}

export function MessageFeed({
  messages,
  agents,
  kinds,
  limit,
  compact = false,
  empty = '暂无 Agent 消息。',
}: MessageFeedProps) {
  const list = useMemo(() => {
    const filtered = kinds ? messages.filter((m) => kinds.includes(m.kind)) : messages
    const sorted = [...filtered].sort((a, b) => a.seq - b.seq)
    return limit ? sorted.slice(-limit) : sorted
  }, [messages, kinds, limit])

  if (list.length === 0) {
    return <p className="insp-empty">{empty}</p>
  }

  return (
    <div className={`msg-feed ${compact ? 'compact' : ''}`}>
      {list.map((message) => {
        const agent = agents.find((item) => item.id === message.fromAgentId)
        return (
          <article key={message.id} className={`agent-msg kind-${message.kind}`}>
            <header className="agent-msg-head">
              <AgentAvatar
                icon={asIcon(agent?.icon)}
                model={agent?.model ?? ''}
                size={compact ? 20 : 26}
              />
              <b>{message.fromName || '协作 Agent'}</b>
              <span className="agent-msg-arrow">→</span>
              <span className="agent-msg-to">{message.toName || '全体成员'}</span>
              <span className={`agent-msg-kind ${message.kind}`}>{MESSAGE_KIND_LABEL[message.kind]}</span>
              {message.createdAt ? <time>{timeLabel(message.createdAt)}</time> : null}
            </header>
            <p className="agent-msg-body">{message.content}</p>
          </article>
        )
      })}
    </div>
  )
}
