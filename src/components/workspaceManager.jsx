import React, { useState, useEffect } from 'react';
import { Users, UserPlus, Settings, History, Share2, Crown, Shield, Edit, Eye, Trash2, Copy, Check, X } from 'lucide-react';

// Mock API calls - replace with actual imports
const PERMISSIONS = {
  OWNER: "owner",
  ADMIN: "admin",
  EDITOR: "editor",
  VIEWER: "viewer",
};

export default function WorkspaceManager({ 
  workspaceId, 
  currentUserId,
  onClose 
}) {
  const [activeTab, setActiveTab] = useState('members');
  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newInviteRole, setNewInviteRole] = useState(PERMISSIONS.EDITOR);
  const [showInviteLink, setShowInviteLink] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [copied, setCopied] = useState(false);

  // Mock data - replace with actual API calls
  useEffect(() => {
    loadData();
  }, [workspaceId]);

  async function loadData() {
    setLoading(true);
    // Simulate API calls
    setTimeout(() => {
      setMembers([
        {
          id: currentUserId,
          displayName: 'You',
          email: 'you@example.com',
          role: PERMISSIONS.OWNER,
          joinedAt: '2024-01-01',
          lastActive: '2024-01-06',
        }
      ]);
      setInvitations([]);
      setHistory([
        {
          id: '1',
          timestamp: '2024-01-06T10:30:00Z',
          description: 'Added 3 transactions',
        },
        {
          id: '2',
          timestamp: '2024-01-05T15:20:00Z',
          description: 'Updated budget categories',
        }
      ]);
      setLoading(false);
    }, 500);
  }

  async function createInvite() {
    // Mock invitation creation
    const mockLink = `https://yourdomain.com/invite/ABC123XYZ`;
    setInviteLink(mockLink);
    setShowInviteLink(true);
    
    // Refresh invitations list
    loadData();
  }

  function copyInviteLink() {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function getRoleIcon(role) {
    switch(role) {
      case PERMISSIONS.OWNER: return <Crown className="w-4 h-4 text-yellow-400" />;
      case PERMISSIONS.ADMIN: return <Shield className="w-4 h-4 text-purple-400" />;
      case PERMISSIONS.EDITOR: return <Edit className="w-4 h-4 text-cyan-400" />;
      case PERMISSIONS.VIEWER: return <Eye className="w-4 h-4 text-slate-400" />;
      default: return null;
    }
  }

  function getRoleColor(role) {
    switch(role) {
      case PERMISSIONS.OWNER: return 'text-yellow-400';
      case PERMISSIONS.ADMIN: return 'text-purple-400';
      case PERMISSIONS.EDITOR: return 'text-cyan-400';
      case PERMISSIONS.VIEWER: return 'text-slate-400';
      default: return 'text-slate-400';
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-slate-900 rounded-xl p-8">
          <div className="text-slate-300">Loading workspace...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-xl border border-white/10 w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <Settings className="w-6 h-6 text-cyan-400" />
            <h2 className="text-xl font-semibold text-white">Workspace Settings</h2>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white transition"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-2 bg-black/20 border-b border-white/5">
          <button
            onClick={() => setActiveTab('members')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
              activeTab === 'members'
                ? 'bg-cyan-500 text-black font-medium'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Users className="w-4 h-4" />
            Members
          </button>
          <button
            onClick={() => setActiveTab('invitations')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
              activeTab === 'invitations'
                ? 'bg-cyan-500 text-black font-medium'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Share2 className="w-4 h-4" />
            Invitations
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
              activeTab === 'history'
                ? 'bg-cyan-500 text-black font-medium'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <History className="w-4 h-4" />
            History
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Members Tab */}
          {activeTab === 'members' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-white">Team Members</h3>
                <button
                  onClick={() => setActiveTab('invitations')}
                  className="flex items-center gap-2 px-4 py-2 bg-cyan-500 text-black rounded-lg hover:bg-cyan-400 transition font-medium text-sm"
                >
                  <UserPlus className="w-4 h-4" />
                  Invite Member
                </button>
              </div>

              <div className="space-y-2">
                {members.map(member => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center text-white font-semibold">
                        {member.displayName[0]}
                      </div>
                      <div>
                        <div className="text-white font-medium">{member.displayName}</div>
                        <div className="text-sm text-slate-400">{member.email}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className={`flex items-center gap-1 text-sm font-medium ${getRoleColor(member.role)}`}>
                        {getRoleIcon(member.role)}
                        <span className="capitalize">{member.role}</span>
                      </div>
                      
                      {member.id !== currentUserId && (
                        <button className="text-slate-400 hover:text-red-400 transition">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Invitations Tab */}
          {activeTab === 'invitations' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-white mb-4">Create Invitation</h3>
                
                <div className="space-y-4 p-4 bg-white/5 rounded-lg border border-white/10">
                  <div>
                    <label className="block text-sm text-slate-300 mb-2">
                      Permission Level
                    </label>
                    <select
                      value={newInviteRole}
                      onChange={(e) => setNewInviteRole(e.target.value)}
                      className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-white focus:border-cyan-400 focus:outline-none"
                    >
                      <option value={PERMISSIONS.EDITOR}>Editor - Can edit budget & transactions</option>
                      <option value={PERMISSIONS.ADMIN}>Admin - Full access except deletion</option>
                      <option value={PERMISSIONS.VIEWER}>Viewer - Read-only access</option>
                    </select>
                  </div>

                  <button
                    onClick={createInvite}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-cyan-500 text-black rounded-lg hover:bg-cyan-400 transition font-medium"
                  >
                    <UserPlus className="w-4 h-4" />
                    Generate Invitation Link
                  </button>
                </div>

                {showInviteLink && (
                  <div className="mt-4 p-4 bg-emerald-500/10 border border-emerald-400/30 rounded-lg">
                    <div className="text-sm text-emerald-300 mb-2">Invitation link created!</div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={inviteLink}
                        readOnly
                        className="flex-1 px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-white text-sm"
                      />
                      <button
                        onClick={copyInviteLink}
                        className="px-4 py-2 bg-cyan-500 text-black rounded-lg hover:bg-cyan-400 transition font-medium text-sm flex items-center gap-2"
                      >
                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        {copied ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <div className="text-xs text-slate-400 mt-2">
                      Link expires in 7 days
                    </div>
                  </div>
                )}
              </div>

              {invitations.length > 0 && (
                <div>
                  <h3 className="text-lg font-medium text-white mb-4">Pending Invitations</h3>
                  <div className="space-y-2">
                    {invitations.map(invite => (
                      <div
                        key={invite.id}
                        className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10"
                      >
                        <div>
                          <div className="text-white">Invitation for {invite.role}</div>
                          <div className="text-sm text-slate-400">
                            Created {new Date(invite.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                        <button className="text-slate-400 hover:text-red-400 transition">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-white">Version History</h3>
              
              <div className="space-y-2">
                {history.map(version => (
                  <div
                    key={version.id}
                    className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 transition"
                  >
                    <div>
                      <div className="text-white font-medium">{version.description}</div>
                      <div className="text-sm text-slate-400">
                        {new Date(version.timestamp).toLocaleString()}
                      </div>
                    </div>
                    <button className="px-3 py-1 bg-cyan-500/20 text-cyan-300 rounded hover:bg-cyan-500/30 transition text-sm font-medium">
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}