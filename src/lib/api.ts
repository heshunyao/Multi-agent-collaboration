import type {
  AgentDef,
  BootstrapData,
  ConversationDetail,
  ConversationSummary,
  ModelInfo,
  ModelInput,
  ModelListResult,
  ModelTestResult,
} from '../types'

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch('/api' + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  const text = await res.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  if (!res.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : `请求失败（${res.status}）`
    const error = new Error(message) as Error & { payload?: unknown; status?: number }
    error.payload = body
    error.status = res.status
    throw error
  }
  return body as T
}

export const api = {
  bootstrap: () => request<BootstrapData>('/bootstrap'),

  listAgents: (q = '') => request<AgentDef[]>(`/agents${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  createAgent: (agent: Partial<AgentDef>) =>
    request<AgentDef>('/agents', { method: 'POST', body: JSON.stringify(agent) }),
  updateAgent: (id: string, agent: Partial<AgentDef>) =>
    request<AgentDef>(`/agents/${id}`, { method: 'PUT', body: JSON.stringify(agent) }),
  deleteAgent: (id: string) => request<{ ok: boolean }>(`/agents/${id}`, { method: 'DELETE' }),

  listModels: () => request<ModelInfo[]>('/models'),
  createModel: (model: ModelInput) =>
    request<ModelInfo>('/models', { method: 'POST', body: JSON.stringify(model) }),
  updateModel: (id: string, model: Partial<ModelInput> & { apiKey?: string }) =>
    request<ModelInfo>(`/models/${id}`, { method: 'PUT', body: JSON.stringify(model) }),
  deleteModel: (id: string) => request<{ ok: boolean }>(`/models/${id}`, { method: 'DELETE' }),
  testModel: (input: { id?: string; baseUrl?: string; modelName?: string; apiKey?: string }) =>
    request<ModelTestResult>('/models/test', { method: 'POST', body: JSON.stringify(input) }),
  listAvailableModels: (input: { id?: string; baseUrl?: string; apiKey?: string }) =>
    request<ModelListResult>('/models/available', { method: 'POST', body: JSON.stringify(input) }),

  listConversations: (agentId?: string) =>
    request<ConversationSummary[]>(`/conversations${agentId ? `?agentId=${encodeURIComponent(agentId)}` : ''}`),
  createConversation: (agentId: string, title?: string) =>
    request<ConversationDetail>('/conversations', {
      method: 'POST',
      body: JSON.stringify({ agentId, title }),
    }),
  getConversation: (id: string) => request<ConversationDetail>(`/conversations/${id}`),
  deleteConversation: (id: string) => request<{ ok: boolean }>(`/conversations/${id}`, { method: 'DELETE' }),
}

export { request as apiRequest }
