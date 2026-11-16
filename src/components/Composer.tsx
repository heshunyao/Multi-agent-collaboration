import { useEffect, useRef, useState } from 'react'
import type { Team, TeamMode } from '../lib/teamApi'
import { TEAM_MODE_HINT, TEAM_MODE_LABEL } from '../lib/teamApi'
import { Icon } from './Icon'

interface ComposerProps {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  running: boolean
  onStop: () => void
  teams: Team[]
  teamId: string | null
  onTeam: (id: string) => void
  onManageTeams: () => void
  mode: TeamMode | null
  onMode: (mode: TeamMode) => void
  ready: boolean
}

export function Composer({
  value,
  onChange,
  onSubmit,
  running,
  onStop,
  teams,
  teamId,
  onTeam,
  onManageTeams,
  mode,
  onMode,
  ready,
}: ComposerProps) {
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const [menu, setMenu] = useState<'team' | 'mode' | null>(null)
  const [focused, setFocused] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const team = teams.find((item) => item.id === teamId)

  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 190) + 'px'
  }, [value])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setMenu(null)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const canSend = value.trim().length > 0 && !running && ready

  return (
    <div className="composer-shell" ref={wrapRef}>
      <div className={`composer ${focused ? 'focused' : ''}`}>
        <textarea
          ref={areaRef}
          value={value}
          rows={1}
          placeholder="描述你要开发的软件系统，例如：帮我开发一个在线商城，包含用户、商品、订单与支付管理…"
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              if (canSend) onSubmit()
            }
          }}
        />

        <div className="composer-bar">
          <div className="composer-left">
            <button className="icon-btn" title="添加附件（演示）">
              <Icon name="plus" size={17} />
            </button>

            <div className="popover-anchor">
              <button
                className={`chip-btn ${menu === 'team' ? 'open' : ''}`}
                onClick={() => setMenu(menu === 'team' ? null : 'team')}
              >
                <Icon name="users" size={14} />
                <span>{team?.name ?? '选择团队'}</span>
                <Icon name="chevronDown" size={13} />
              </button>
              {menu === 'team' && (
                <div className="popover up">
                  <div className="popover-title">Agent 团队</div>
                  {teams.map((item) => (
                    <button
                      key={item.id}
                      className={`popover-item ${item.id === teamId ? 'selected' : ''}`}
                      onClick={() => {
                        onTeam(item.id)
                        setMenu(null)
                      }}
                    >
                      <span>
                        <b>{item.name}</b>
                        <em>
                          {TEAM_MODE_LABEL[item.mode]} · {item.members.length} 个 Agent
                        </em>
                      </span>
                      {item.id === teamId && <Icon name="check" size={15} />}
                    </button>
                  ))}
                  {teams.length === 0 && <p className="popover-empty">还没有团队，先创建一个吧。</p>}
                  <button
                    className="popover-item manage"
                    onClick={() => {
                      onManageTeams()
                      setMenu(null)
                    }}
                  >
                    <span>
                      <b>管理 / 新建团队</b>
                      <em>选择 Agent、调整模式并保存到后端</em>
                    </span>
                    <Icon name="plus" size={15} />
                  </button>
                </div>
              )}
            </div>

            <div className="popover-anchor">
              <button
                className={`chip-btn ${menu === 'mode' ? 'open' : ''}`}
                onClick={() => setMenu(menu === 'mode' ? null : 'mode')}
                disabled={!team}
                title={team ? '切换协作模式' : '请先选择团队'}
              >
                <Icon name={mode === 'group' ? 'users' : 'branch'} size={14} />
                <span>{mode ? TEAM_MODE_LABEL[mode] : '协作模式'}</span>
                <Icon name="chevronDown" size={13} />
              </button>
              {menu === 'mode' && (
                <div className="popover up wide">
                  <div className="popover-title">协作模式</div>
                  {(['sequential', 'group'] as const).map((item) => (
                    <button
                      key={item}
                      className={`popover-item ${item === mode ? 'selected' : ''}`}
                      onClick={() => {
                        onMode(item)
                        setMenu(null)
                      }}
                    >
                      <span>
                        <b>{TEAM_MODE_LABEL[item]}</b>
                        <em>{TEAM_MODE_HINT[item]}</em>
                      </span>
                      {item === mode && <Icon name="check" size={15} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="composer-right">
            <span className="composer-tip">Enter 发送</span>
            {running ? (
              <button className="send-btn stop" onClick={onStop} title="终止协作">
                <Icon name="stop" size={16} />
              </button>
            ) : (
              <button
                className="send-btn"
                disabled={!canSend}
                onClick={onSubmit}
                title={ready ? '开始协作' : '请先选择至少包含 2 个 Agent 的团队'}
              >
                <Icon name="arrowUp" size={18} />
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="composer-hint">
        <span>
          <Icon name="sparkle" size={12} /> 真实多 Agent 协作，过程与消息由后端实时推送
        </span>
        <span className="hint-right">
          {team ? `${team.name} · ${TEAM_MODE_LABEL[team.mode]}` : '尚未选择团队'}
        </span>
      </div>
    </div>
  )
}
