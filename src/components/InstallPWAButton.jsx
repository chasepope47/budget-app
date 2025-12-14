import React from "react";

function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator?.standalone === true
  );
}

export default function InstallPWAButton() {
  const [deferredPrompt, setDeferredPrompt] = React.useState(null);
  const [canInstall, setCanInstall] = React.useState(false);
  const [showIOSHint, setShowIOSHint] = React.useState(false);

  React.useEffect(() => {
    if (isStandalone()) return;

    if (isIOS()) {
      setShowIOSHint(true);
      return;
    }

    function onBeforeInstallPrompt(e) {
      e.preventDefault();
      setDeferredPrompt(e);
      setCanInstall(true);
    }

    function onAppInstalled() {
      setDeferredPrompt(null);
      setCanInstall(false);
      setShowIOSHint(false);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  async function handleInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setCanInstall(false);
  }

  if (showIOSHint) {
    return (
      <div className="px-3 py-2 rounded-lg border border-white/15 bg-white/10 text-xs text-slate-200">
        On iPhone: tap <strong>Share</strong> →{" "}
        <strong>Add to Home Screen</strong>
        <button
          className="ml-3 underline text-slate-300 hover:text-white"
          onClick={() => setShowIOSHint(false)}
          type="button"
        >
          Dismiss
        </button>
      </div>
    );
  }

  if (!canInstall) return null;

  return (
    <button
      onClick={handleInstall}
      type="button"
      className="px-3 py-2 rounded-lg border border-white/15 bg-white/10 hover:bg-white/15"
    >
      Install App
    </button>
  );
}
