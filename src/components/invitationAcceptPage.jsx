import React, { useState, useEffect } from 'react';
import { Users, CheckCircle, XCircle, Loader } from 'lucide-react';

export default function InvitationAcceptPage({ 
  invitationId, 
  user, 
  onAccept 
}) {
  const [loading, setLoading] = useState(true);
  const [invitation, setInvitation] = useState(null);
  const [error, setError] = useState(null);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    loadInvitation();
  }, [invitationId]);

  async function loadInvitation() {
    setLoading(true);
    setError(null);

    try {
      // Simulate API call - replace with actual getInvitation call
      setTimeout(() => {
        const mockInvitation = {
          workspaceId: 'workspace123',
          workspaceName: 'Family Budget 2025',
          invitedBy: 'john@example.com',
          role: 'editor',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'pending',
        };
        setInvitation(mockInvitation);
        setLoading(false);
      }, 1000);
    } catch (err) {
      setError(err.message || 'Failed to load invitation');
      setLoading(false);
    }
  }

  async function handleAccept() {
    if (!user) {
      setError('You must be signed in to accept this invitation');
      return;
    }

    setAccepting(true);
    setError(null);

    try {
      // Simulate API call - replace with actual acceptInvitation call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setAccepted(true);
      
      // Redirect after 2 seconds
      setTimeout(() => {
        if (onAccept) {
          onAccept(invitation.workspaceId);
        }
      }, 2000);
    } catch (err) {
      setError(err.message || 'Failed to accept invitation');
      setAccepting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100">
        <div className="text-center space-y-4">
          <Loader className="w-12 h-12 text-cyan-400 animate-spin mx-auto" />
          <div className="text-slate-300">Loading invitation...</div>
        </div>
      </div>
    );
  }

  if (error && !invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 px-4">
        <div className="max-w-md w-full space-y-6 text-center">
          <XCircle className="w-16 h-16 text-red-400 mx-auto" />
          <div>
            <h1 className="text-2xl font-semibold text-white mb-2">Invalid Invitation</h1>
            <p className="text-slate-400">{error}</p>
          </div>
          <button
            onClick={() => window.location.href = '/'}
            className="w-full px-4 py-2 bg-cyan-500 text-black rounded-lg hover:bg-cyan-400 transition font-medium"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (accepted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 px-4">
        <div className="max-w-md w-full space-y-6 text-center">
          <CheckCircle className="w-16 h-16 text-emerald-400 mx-auto" />
          <div>
            <h1 className="text-2xl font-semibold text-white mb-2">Welcome to the team!</h1>
            <p className="text-slate-400">
              You now have access to <strong className="text-white">{invitation.workspaceName}</strong>
            </p>
          </div>
          <div className="text-sm text-slate-400">Redirecting to workspace...</div>
        </div>
      </div>
    );
  }

  const isExpired = invitation && new Date(invitation.expiresAt) < new Date();

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 px-4">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-cyan-500/10 border border-cyan-400/30 mb-4">
            <Users className="w-8 h-8 text-cyan-400" />
          </div>
          <p className="text-xs tracking-[0.4em] uppercase text-cyan-300">
            Workspace Invitation
          </p>
          <h1 className="text-2xl font-semibold text-white">
            Join {invitation?.workspaceName}
          </h1>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/30 p-6 shadow-[0_20px_50px_rgba(8,8,12,0.8)] space-y-4">
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Invited by</span>
              <span className="text-white">{invitation?.invitedBy}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Role</span>
              <span className="text-white capitalize">{invitation?.role}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Expires</span>
              <span className="text-white">
                {invitation && new Date(invitation.expiresAt).toLocaleDateString()}
              </span>
            </div>
          </div>

          {isExpired && (
            <div className="rounded border border-red-500/60 bg-red-500/10 px-3 py-2 text-sm text-red-100">
              This invitation has expired
            </div>
          )}

          {error && (
            <div className="rounded border border-red-500/60 bg-red-500/10 px-3 py-2 text-sm text-red-100">
              {error}
            </div>
          )}

          {!user && (
            <div className="rounded border border-yellow-500/60 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-100">
              Please sign in or create an account to accept this invitation
            </div>
          )}

          <div className="space-y-2 pt-2">
            <button
              onClick={handleAccept}
              disabled={accepting || isExpired || !user}
              className="w-full px-4 py-3 bg-cyan-500 text-black rounded-lg hover:bg-cyan-400 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {accepting ? 'Accepting...' : 'Accept Invitation'}
            </button>
            
            {!user && (
              <button
                onClick={() => window.location.href = '/?action=signin'}
                className="w-full px-4 py-3 bg-white/5 text-white rounded-lg hover:bg-white/10 transition font-medium border border-white/10"
              >
                Sign In to Accept
              </button>
            )}
          </div>
        </div>

        <div className="text-center">
          <button
            onClick={() => window.location.href = '/'}
            className="text-sm text-slate-400 hover:text-white transition"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}