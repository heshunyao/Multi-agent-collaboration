import type { ChatMessage, ConversationSummary } from '../types'

interface MetaPayload {
  conversationId: string
  userMessage: ChatMessage
  conversation: ConversationSummary
}

interface DonePayload {
  message: ChatMessage
  conversation: ConversationSummary
}

export interface StreamHandlers {
  onMeta?: (payload: MetaPayload) => void
  onDelta?: (text: string) => void
  onReasoning?: (text: string) => void
  onDone?: (payload: DonePayload) => void
  onError?: (message: string) => void
  onAborted?: () => void
}

export async function streamChat(
  conversationId: string,
  content: string,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId, content }),
    signal,
  })

  if (!res.ok || !res.body) {
    let message = `请求失败（${res.status}）`
    try {
      const data = await res.json()
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
    let payload: unknown = null
    try {
      payload = JSON.parse(dataLines.join('\n'))
    } catch {
      return
    }
    const data = payload as Record<string, unknown>
    switch (event) {
      case 'meta':
        handlers.onMeta?.(data as unknown as MetaPayload)
        break
      case 'delta':
        handlers.onDelta?.(String(data.text ?? ''))
        break
      case 'reasoning':
        handlers.onReasoning?.(String(data.text ?? ''))
        break
      case 'done':
        handlers.onDone?.(data as unknown as DonePayload)
        break
      case 'error':
        handlers.onError?.(String(data.message ?? '模型调用失败'))
        break
      case 'aborted':
        handlers.onAborted?.()
        break
      default:
        break
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const blocks = buffer.split('\n\n')
    buffer = blocks.pop() || ''
    blocks.forEach(dispatch)
  }
  if (buffer.trim()) dispatch(buffer)
}
