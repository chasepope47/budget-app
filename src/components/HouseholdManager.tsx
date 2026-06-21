import { useEffect, useState } from 'react'
import {
  getHousehold,
  getMembers,
  createInviteCode,
  joinByCode,
  removeMember,
  leaveHousehold,
  renameHousehold,
} from '../api/householdApi'
import type { Household, HouseholdMember } from '../lib/supabase'
import { useAuth } from '../SupabaseAuthProvider'

type Props = {
  householdId: string
  currentUserId: string
  onClose: () => void
  onHouseholdChanged: (newId: string) => void
}

export default function HouseholdManager({ householdId, currentUserId, onClose, onHouseholdChanged }: Props) {
  const { user } = useAuth()
  const [household, setHousehold] = useState<Household | null>(null)
  const [members, setMembers] = useState<HouseholdMember[]>([])
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [joinCode, setJoinCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const isOwner = members.find((m) => m.user_id === currentUserId)?.role === 'owner'

  useEffect(() => {
    Promise.all([
      getHousehold(householdId),
      getMembers(householdId),
    ]).then(([h, ms]) => {
      setHousehold(h)
      setMembers(ms)
    })
  }, [householdId])

  async function handleGenerateCode() {
    setLoading(true)
    try {
      const code = await createInviteCode(householdId, currentUserId)
      setInviteCode(code)
    } catch { setMessage('Failed to generate code.') }
    finally { setLoading(false) }
  }

  async function handleJoin() {
    if (!user) return
    setLoading(true)
    try {
      const { result, householdId: newId } = await joinByCode(joinCode, user.id, user.email ?? '')
      if (result === 'ok' && newId) {
        setMessage('Joined! Reloading your workspace…')
        onHouseholdChanged(newId)
        onClose()
      } else if (result === 'already_member') {
        setMessage('You are already a member of this household.')
      } else if (result === 'expired') {
        setMessage('This invite code has expired.')
      } else {
        setMessage('Invalid invite code.')
      }
    } catch { setMessage('Failed to join.') }
    finally { setLoading(false) }
  }

  async function handleRemoveMember(userId: string) {
    if (!window.confirm('Remove this member?')) return
    await removeMember(householdId, userId)
    setMembers((prev) => prev.filter((m) => m.user_id !== userId))
  }

  async function handleLeave() {
    if (!window.confirm('Leave this household? A new solo workspace will be created for you.')) return
    setLoading(true)
    try {
      const newId = await leaveHousehold(householdId, currentUserId)
      onHouseholdChanged(newId)
      onClose()
    } catch { setMessage('Failed to leave.') }
    finally { setLoading(false) }
  }

  async function handleRename() {
    const name = window.prompt('New household name:', household?.name ?? '')
    if (!name) return
    await renameHousehold(householdId, name)
    setHousehold((h) => h ? { ...h, name } : h)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-100">
            {household?.name ?? 'Workspace'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-lg">✕</button>
        </div>

        {message && (
          <p className="text-xs text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 rounded-lg px-3 py-2">
            {message}
          </p>
        )}

        {/* Members */}
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-widest text-slate-500">Members</div>
          {members.map((m) => (
            <div key={m.user_id} className="flex items-center justify-between text-sm">
              <span className="text-slate-200">{m.email ?? m.user_id.slice(0, 8)}</span>
              <span className="flex items-center gap-2">
                <span className="text-xs text-slate-500 capitalize">{m.role}</span>
                {isOwner && m.user_id !== currentUserId && (
                  <button onClick={() => handleRemoveMember(m.user_id)}
                    className="text-xs text-rose-400 hover:text-rose-300">Remove</button>
                )}
              </span>
            </div>
          ))}
        </div>

        {/* Invite */}
        {isOwner && (
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-widest text-slate-500">Invite</div>
            <button onClick={handleGenerateCode} disabled={loading}
              className="px-3 py-1.5 text-xs rounded-md border border-cyan-400/60 text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 disabled:opacity-50">
              {inviteCode ? 'Regenerate code' : 'Generate invite code'}
            </button>
            {inviteCode && (
              <div className="flex items-center gap-2">
                <code className="text-lg font-mono tracking-[0.25em] text-cyan-300 bg-cyan-500/10 px-4 py-1 rounded-lg">
                  {inviteCode}
                </code>
                <button onClick={() => navigator.clipboard.writeText(inviteCode).then(() => setMessage('Copied!'))}
                  className="text-xs text-slate-400 hover:text-slate-200">Copy</button>
              </div>
            )}
          </div>
        )}

        {/* Join */}
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-widest text-slate-500">Join a household</div>
          <div className="flex gap-2">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Enter 6-char code"
              maxLength={6}
              className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
            />
            <button onClick={handleJoin} disabled={loading || joinCode.length < 6}
              className="px-3 py-1.5 text-xs rounded-lg border border-emerald-400/60 text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-50">
              Join
            </button>
          </div>
        </div>

        {/* Danger zone */}
        <div className="border-t border-slate-800 pt-4 flex items-center justify-between">
          {isOwner && (
            <button onClick={handleRename} className="text-xs text-slate-400 hover:text-slate-200">
              Rename household
            </button>
          )}
          <button onClick={handleLeave} disabled={loading}
            className="text-xs text-rose-400 hover:text-rose-300 disabled:opacity-50 ml-auto">
            Leave household
          </button>
        </div>
      </div>
    </div>
  )
}
