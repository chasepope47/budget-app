import React, { useEffect, useState } from "react";
import { AVATAR_CHOICES } from "../userMetadataApi.js";

function AvatarSwatch({ emoji, active, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(emoji)}
      className={`w-9 h-9 text-lg rounded-full border transition flex items-center justify-center
      ${
        active
          ? "border-cyan-400/80 bg-cyan-500/10"
          : "border-slate-600/60 bg-black/30 hover:border-cyan-400/40"
      }`}
    >
      {emoji}
    </button>
  );
}

function ProfileMenu({ profile, email, loading, onUpdateProfile }) {
  const [open, setOpen] = useState(false);
  const [draftName, setDraftName] = useState(profile?.username ?? "");
  const [draftAvatar, setDraftAvatar] = useState(
    profile?.avatar_emoji ?? AVATAR_CHOICES[0]
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraftName(profile?.username ?? "");
    setDraftAvatar(profile?.avatar_emoji ?? AVATAR_CHOICES[0]);
  }, [profile?.username, profile?.avatar_emoji]);

  async function handleSave(e) {
    e.preventDefault();
    if (!onUpdateProfile) return;
    setSaving(true);
    const ok = await onUpdateProfile({
      username: draftName,
      avatar_emoji: draftAvatar,
    });
    setSaving(false);
    if (ok) {
      setOpen(false);
    }
  }

  const avatarDisplay = profile?.avatar_emoji ?? "👤";
  const usernameDisplay = profile?.username || "Budgeteer";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-2 rounded-full border border-slate-600/70 bg-black/20 px-2 py-1 text-left hover:border-cyan-400/60 transition"
      >
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-cyan-500/10 text-lg">
          {avatarDisplay}
        </span>
        <span className="flex flex-col leading-tight text-xs text-slate-300">
          <span className="text-cyan-200">{usernameDisplay}</span>
          <span className="text-[10px] text-slate-500">
            {loading ? "Syncing..." : "Profile"}
          </span>
        </span>
      </button>

      <form
        className={`absolute right-0 mt-2 w-64 rounded-xl border border-slate-700/70 bg-[#05060F] p-4 text-xs shadow-xl transition-all duration-150 ${
          open
            ? "opacity-100 translate-y-0 pointer-events-auto"
            : "opacity-0 -translate-y-1 pointer-events-none"
        }`}
        onSubmit={handleSave}
      >
        <div className="space-y-2">
          <p className="text-[11px] text-slate-400">
            {email ? `Signed in as ${email}` : "Signed in"}
          </p>
          <label className="block">
            <span className="text-slate-300">Display name</span>
            <input
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="Budgeteer"
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
            />
          </label>
        </div>

        <div className="mt-3">
          <p className="mb-2 text-slate-300">Avatar</p>
          <div className="grid grid-cols-5 gap-2">
            {AVATAR_CHOICES.map((choice) => (
              <AvatarSwatch
                key={choice}
                emoji={choice}
                active={draftAvatar === choice}
                onSelect={setDraftAvatar}
              />
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            className="text-[11px] text-slate-500 hover:text-slate-200"
            onClick={() => setOpen(false)}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-cyan-500 px-3 py-1 text-[11px] font-semibold text-black transition hover:bg-cyan-400 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default ProfileMenu;
