import type { AgentDef, ModelId, ModelInfo } from '../types'

const FALLBACK_MODEL: ModelInfo = {
  id: 'unknown',
  label: '未配置模型',
  vendor: '—',
  modelName: '',
  baseUrl: '',
  color: '#6b7280',
  context: '—',
  price: '—',
  latency: '—',
  tags: [],
  connected: false,
}

let registry: Record<string, ModelInfo> = {}

export function setModelRegistry(list: ModelInfo[]) {
  registry = Object.fromEntries(list.map((m) => [m.id, m]))
}

export function modelOf(id: ModelId): ModelInfo {
  return registry[id] ?? { ...FALLBACK_MODEL, id }
}

export function allModels(): ModelInfo[] {
  return Object.values(registry)
}

export const MODEL_COLORS = [
  '#10b981',
  '#4d6bfe',
  '#8b5cf6',
  '#d97757',
  '#06b6d4',
  '#f59e0b',
  '#ec4899',
  '#84cc16',
]

export const TOOL_POOL = [
  '需求解析',
  '任务编排',
  '里程碑',
  '架构决策',
  'ER 建模',
  'OpenAPI',
  '代码生成',
  'Maven',
  'MySQL',
  'Redis',
  '组件生成',
  'Vite',
  'Playwright',
  'JUnit',
  '静态扫描',
  'SAST',
  'Docker',
  'CI/CD',
  '日志分析',
]

export const AGENT_FALLBACK: AgentDef = {
  id: 'unknown',
  name: '协作 Agent',
  role: '',
  model: 'unknown',
  icon: 'generic',
  responsibilities: [],
  tools: [],
  systemPrompt: '',
  temperature: 0.2,
  enabled: true,
}

export const SUGGESTIONS = [
  {
    title: '在线商城系统',
    desc: '用户、商品、订单与支付管理',
    prompt: '帮我开发一个在线商城系统，要求包含用户管理、商品管理、订单管理和支付管理。',
  },
  {
    title: 'SaaS 权限中台',
    desc: '多租户 RBAC 与审计日志',
    prompt: '设计并实现一个多租户 SaaS 的 RBAC 权限中台，支持菜单权限、数据权限与审计日志。',
  },
  {
    title: '实时协作文档',
    desc: '多人编辑与版本历史',
    prompt: '搭建一个实时协作文档编辑器，支持多人光标、评论与版本历史回滚。',
  },
  {
    title: '实时数据看板',
    desc: 'ClickHouse 指标与告警',
    prompt: '做一个运营实时数据看板，接入 ClickHouse 展示核心指标，并支持阈值告警。',
  },
]

export const AGENT_CHAT_SUGGESTIONS = [
  '介绍一下你的职责与工作方式',
  '帮我评审一段订单状态机设计',
  '针对高并发库存扣减给出实现方案',
  '列一份本周的研发任务拆解',
]
