import { useEffect, useState, type CSSProperties } from 'react'
import type { ModelInfo, ModelInput, ModelListResult, ModelOption, ModelTestResult } from '../types'
import { MODEL_COLORS } from '../data/presets'
import { Icon } from './Icon'

interface ModelDrawerProps {
  model: ModelInfo | null
  isNew: boolean
  onClose: () => void
  onSave: (input: ModelInput, id?: string) => Promise<void>
  onTest: (input: { id?: string; baseUrl?: string; modelName?: string; apiKey?: string }) => Promise<ModelTestResult>
  onListModels: (input: { id?: string; baseUrl?: string; apiKey?: string }) => Promise<ModelListResult>
}

export function ModelDrawer({ model, isNew, onClose, onSave, onTest, onListModels }: ModelDrawerProps) {
  const [draft, setDraft] = useState<ModelInput>({
    label: '',
    vendor: '',
    modelName: '',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    context: '128K tokens',
    price: '—',
    tags: [],
    connected: true,
    color: MODEL_COLORS[1],
  })
  const [tagText, setTagText] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<ModelTestResult | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [loadingModels, setLoadingModels] = useState(false)
  const [available, setAvailable] = useState<ModelOption[] | null>(null)
  const [modelError, setModelError] = useState('')
  const [modelFilter, setModelFilter] = useState('')

  useEffect(() => {
    if (model) {
      setDraft({
        label: model.label,
        vendor: model.vendor,
        modelName: model.modelName,
        baseUrl: model.baseUrl,
        apiKey: '',
        context: model.context,
        price: model.price,
        tags: model.tags,
        connected: model.connected,
        color: model.color,
      })
      setTagText(model.tags.join(', '))
    }
  }, [model])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const patch = <K extends keyof ModelInput>(key: K, value: ModelInput[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const runTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await onTest({
        id: isNew ? undefined : model?.id,
        baseUrl: draft.baseUrl,
        modelName: draft.modelName,
        apiKey: draft.apiKey || undefined,
      })
      setTestResult(result)
    } catch (err) {
      setTestResult({ ok: false, error: err instanceof Error ? err.message : '测试失败' })
    } finally {
      setTesting(false)
    }
  }

  const fetchModels = async () => {
    if (!draft.baseUrl.trim()) {
      setModelError('请先填写 Base URL')
      return
    }
    setLoadingModels(true)
    setModelError('')
    setAvailable(null)
    try {
      const result = await onListModels({
        id: isNew ? undefined : model?.id,
        baseUrl: draft.baseUrl,
        apiKey: draft.apiKey || undefined,
      })
      if (!result.ok) {
        setModelError(result.error || '获取模型列表失败')
        return
      }
      setAvailable(result.models)
      setModelFilter('')
      if (!result.models.length) setModelError('该账号下没有返回可用模型')
    } catch (err) {
      setModelError(err instanceof Error ? err.message : '获取模型列表失败')
    } finally {
      setLoadingModels(false)
    }
  }

  const submit = async () => {
    if (!draft.label.trim()) return setError('请填写模型名称')
    if (!draft.baseUrl.trim()) return setError('请填写 Base URL')
    if (!draft.modelName.trim()) return setError('请填写模型标识')
    setError('')
    setSaving(true)
    try {
      await onSave({ ...draft, tags: tagText.split(/[,，]/).map((t) => t.trim()).filter(Boolean) }, isNew ? undefined : model?.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="drawer-layer">
      <div className="drawer-scrim" onClick={onClose} />
      <div className="drawer">
        <header className="drawer-head">
          <div className="drawer-title">
            <span className="model-logo" style={{ background: draft.color }}>
              {(draft.label || 'M').slice(0, 1)}
            </span>
            <div>
              <h3>{isNew ? '接入新模型' : '模型配置'}</h3>
              <p>OpenAI 兼容协议 · /chat/completions</p>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose}>
            <Icon name="x" size={17} />
          </button>
        </header>

        <div className="drawer-body">
          <div className="field-grid">
            <label className="field">
              <span className="field-label">模型名称</span>
              <input value={draft.label} onChange={(e) => patch('label', e.target.value)} placeholder="例如：DeepSeek" />
            </label>
            <label className="field">
              <span className="field-label">供应商</span>
              <input value={draft.vendor} onChange={(e) => patch('vendor', e.target.value)} placeholder="例如：DeepSeek" />
            </label>
          </div>

          <label className="field">
            <div className="field-label-row">
              <span className="field-label">模型标识 model</span>
              <button
                type="button"
                className="link-btn"
                onClick={fetchModels}
                disabled={loadingModels || !draft.baseUrl.trim()}
              >
                {loadingModels ? '获取中…' : '获取可用模型'}
              </button>
            </div>
            <input
              value={draft.modelName}
              onChange={(e) => patch('modelName', e.target.value)}
              placeholder="例如：deepseek-chat / gpt-4.1 / qwen3-coder-plus"
            />
            {modelError && <p className="field-error">{modelError}</p>}
            {available && (
              <div className="model-picker">
                <input
                  className="model-picker-filter"
                  value={modelFilter}
                  onChange={(e) => setModelFilter(e.target.value)}
                  placeholder={`共 ${available.length} 个模型，输入关键词过滤`}
                />
                <div className="model-picker-list">
                  {available
                    .filter((m) => m.id.toLowerCase().includes(modelFilter.trim().toLowerCase()))
                    .map((m) => (
                      <button
                        type="button"
                        key={m.id}
                        className={`model-picker-item ${draft.modelName === m.id ? 'selected' : ''}`}
                        onClick={() => patch('modelName', m.id)}
                      >
                        <span>{m.id}</span>
                        {m.ownedBy && <em>{m.ownedBy}</em>}
                      </button>
                    ))}
                  {available.filter((m) => m.id.toLowerCase().includes(modelFilter.trim().toLowerCase()))
                    .length === 0 && <p className="model-picker-empty">没有匹配的模型</p>}
                </div>
              </div>
            )}
          </label>

          <label className="field">
            <span className="field-label">Base URL</span>
            <input
              value={draft.baseUrl}
              onChange={(e) => patch('baseUrl', e.target.value)}
              placeholder="https://api.openai.com/v1"
            />
            <p className="field-hint">需以 /v1 结尾，系统会请求 {'{baseUrl}'}/chat/completions</p>
          </label>

          <label className="field">
            <span className="field-label">API Key</span>
            <input
              type="password"
              value={draft.apiKey}
              onChange={(e) => patch('apiKey', e.target.value)}
              placeholder={model?.hasKey ? `已保存：${model.apiKeyMasked}（留空则不修改）` : 'sk-...'}
              autoComplete="off"
            />
            <p className="field-hint">Key 保存在 Java 业务服务的本地 H2 数据库（backend/data），不会回传到浏览器。</p>
          </label>

          <div className="field">
            <span className="field-label">连通性测试</span>
            <div className="test-row">
              <button className="btn" onClick={runTest} disabled={testing || !draft.baseUrl.trim()}>
                {testing ? <span className="spinner" /> : <Icon name="zap" size={14} />}
                {testing ? '测试中…' : '测试连接'}
              </button>
              {testResult && (
                <span className={`test-result ${testResult.ok ? 'ok' : 'fail'}`}>
                  <Icon name={testResult.ok ? 'check' : 'x'} size={12} />
                  {testResult.ok
                    ? `${testResult.detail || '连接成功'}${testResult.latency ? ` · ${testResult.latency}ms` : ''}`
                    : testResult.error}
                </span>
              )}
            </div>
            {!testResult && <p className="field-hint">会校验 Base URL、API Key 与模型是否可用。</p>}
          </div>

          <div className="field-grid">
            <label className="field">
              <span className="field-label">上下文窗口</span>
              <input value={draft.context} onChange={(e) => patch('context', e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">价格</span>
              <input value={draft.price} onChange={(e) => patch('price', e.target.value)} />
            </label>
          </div>

          <label className="field">
            <span className="field-label">能力标签（逗号分隔）</span>
            <input value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="代码生成, 长上下文" />
          </label>

          <div className="field">
            <span className="field-label">标识颜色</span>
            <div className="color-row">
              {MODEL_COLORS.map((c) => (
                <button
                  key={c}
                  className={`color-dot ${draft.color === c ? 'selected' : ''}`}
                  style={{ '--mc': c } as CSSProperties}
                  onClick={() => patch('color', c)}
                  aria-label={c}
                />
              ))}
            </div>
          </div>

          <div className="field switch-field">
            <div>
              <span className="field-label">启用该模型</span>
              <p className="field-hint">关闭后不可被 Agent 绑定。</p>
            </div>
            <button className={`switch ${draft.connected ? 'on' : ''}`} onClick={() => patch('connected', !draft.connected)}>
              <i />
            </button>
          </div>

          {error && <p className="form-error">{error}</p>}
        </div>

        <footer className="drawer-foot">
          <span className="field-hint">密钥仅存于本地</span>
          <div className="drawer-foot-right">
            <button className="btn" onClick={onClose}>
              取消
            </button>
            <button className="btn primary" onClick={submit} disabled={saving}>
              <Icon name="check" size={14} /> {saving ? '保存中…' : '保存模型'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
