import { useState } from 'react'
import type { User } from '../lib/supabase'

const AVATAR_CHOICES = ['💸', '🚀', '🌙', '🛡️', '📊', '⚡', '🧿', '🎯', '🛰️', '🎮']
export { AVATAR_CHOICES }

type Props = {
  user: User
  onSignOut: () => Promise<void>
  onUpdateProfile?: (patch: { username?: string; avatarEmoji?: string }) => void
}

export default function ProfileMenu({ user, onSignOut }: Props) {
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  const emailPrefix = user.email?.split('@')[0] ?? 'Budgeteer'

  async function handleSignOut() {
    setSigningOut(true)
    try { await onSignOut() } finally { setSigningOut(false) }
  }

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-2 rounded-full border border-slate-600/70 bg-black/20 px-2 py-1 hover:border-cyan-400/60 transition">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-cyan-500/10 text-base">
          💸
        </span>
        <span className="flex flex-col leading-tight text-xs text-slate-300">
          <span className="text-cyan-200">{emailPrefix}</span>
          <span className="text-[10px] text-slate-500">{user.email}</span>
        </span>
      </button>

      <div className={`absolute right-0 mt-2 w-56 rounded-xl border border-slate-700/70 bg-[#05060F] p-4 text-xs shadow-xl z-50 transition-all duration-150 ${open ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 -translate-y-1 pointer-events-none'}`}>
        <p className="text-[11px] text-slate-400 mb-3 break-all">{user.email}</p>
        <button type="button" onClick={handleSignOut} disabled={signingOut}
          className="w-full rounded-lg bg-rose-500/10 border border-rose-500/40 text-rose-300 hover:bg-rose-500/20 px-3 py-1.5 text-xs font-medium transition disabled:opacity-50">
          {signingOut ? 'Signing out…' : 'Sign Out'}
        </button>
        <button type="button" onClick={() => setOpen(false)}
          className="mt-2 w-full text-center text-[11px] text-slate-500 hover:text-slate-200">
          Close
        </button>
      </div>
    </div>
  )
}
