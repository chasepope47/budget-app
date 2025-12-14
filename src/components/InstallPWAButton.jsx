import React from "react";

function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone() {
  // iOS: navigator.standalone
  // Others: display-mode media query
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
    // If already installed/running as an app, never show prompts
    if (isStandalone()) {
      setCanInstall(false);
      setShowIOSHint(false);
      return;
    }

    // iOS Safari has no beforeinstallprompt
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

    // Prompt can only be used once
    setDeferredPrompt(null);
    setCanInstall(false);
  }

  // iOS helper (optional)
  if (showIOSHint) {
    return (
      <div className="px-3 py-2 rounded-lg border border-white/15 bg-white/10 text-xs text-slate-200">
        On iPhone: tap <span className="font-semibold">Share</span> →{" "}
        <span className="font-semibold">Add to Home Screen</span>
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
