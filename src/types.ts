export type ModelId = string

export type AgentIcon = 'pm' | 'arch' | 'backend' | 'frontend' | 'qa' | 'reviewer' | 'generic'

export interface ModelInfo {
  id: ModelId
  label: string
  vendor: string
  modelName: string
  baseUrl: string
  apiKeyMasked?: string
  hasKey?: boolean
  color: string
  context: string
  price: string
  latency: string
  tags: string[]
  connected: boolean
  createdAt?: number
  updatedAt?: number
}

export interface ModelInput {
  label: string
  vendor: string
  modelName: string
  baseUrl: string
  apiKey: string
  context: string
  price: string
  tags: string[]
  connected: boolean
  color: string
}

export interface ModelTestResult {
  ok: boolean
  latency?: number
  detail?: string
  error?: string
}

export interface ModelOption {
  id: string
  ownedBy?: string
}

export interface ModelListResult {
  ok: boolean
  models: ModelOption[]
  error?: string
}

export type AgentStatus = 'waiting' | 'working' | 'done' | 'failed' | 'skipped'

export interface AgentDef {
  id: string
  name: string
  role: string
  model: ModelId
  icon: AgentIcon
  responsibilities: string[]
  tools: string[]
  systemPrompt: string
  temperature: number
  enabled: boolean
  createdAt?: number
  updatedAt?: number
}

export type View = 'chat' | 'team' | 'agents' | 'models' | 'agent-chat' | 'projects'

export interface AgentLiveState {
  status: AgentStatus
  progress: number
}

export type ChatRole = 'user' | 'assistant'

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  reasoning?: string
  modelId?: ModelId
  createdAt: number
  aborted?: boolean
  error?: boolean
}

export interface ConversationSummary {
  id: string
  agentId: string
  title: string
  createdAt: number
  updatedAt: number
  messageCount: number
  preview: string
}

export interface ConversationDetail extends ConversationSummary {
  messages: ChatMessage[]
}

export interface BootstrapData {
  agents: AgentDef[]
  models: ModelInfo[]
  conversations: ConversationSummary[]
}
