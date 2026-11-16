import type { RunStatus } from '../lib/teamApi'
import { RUN_STATUS_LABEL } from '../lib/teamApi'
import { Icon } from './Icon'

export interface RunControlsValue {
  status: RunStatus | null
  busy: boolean
  onPause: () => void
  onResume: () => void
  onCancel: () => void
}

interface RunControlsProps {
  value: RunControlsValue
  compact?: boolean
}

export function RunControls({ value, compact = false }: RunControlsProps) {
  const { status, busy } = value
  const canPause = status === 'running' && !busy
  const canResume = status === 'paused' && !busy
  const canCancel = (status === 'pending' || status === 'running' || status === 'paused') && !busy

  return (
    <div className={`run-controls ${compact ? 'compact' : ''}`}>
      <span className={`run-status ${status ?? 'idle'}`}>
        <i />
        {status ? RUN_STATUS_LABEL[status] : '未开始'}
      </span>
      <div className="run-control-btns">
        <button className="btn small" disabled={!canPause} onClick={value.onPause} title="暂停协作">
          <Icon name="pause" size={13} /> 暂停
        </button>
        <button className="btn small" disabled={!canResume} onClick={value.onResume} title="继续协作">
          <Icon name="play" size={13} /> 继续
        </button>
        <button className="btn small danger" disabled={!canCancel} onClick={value.onCancel} title="终止协作">
          <Icon name="stop" size={13} /> 终止
        </button>
      </div>
    </div>
  )
}
