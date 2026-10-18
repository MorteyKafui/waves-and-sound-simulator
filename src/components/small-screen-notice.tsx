"use client";

import { useRef, useSyncExternalStore } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { Icon } from "./icon";

const NOTICE_KEY = "wavelab-small-screen-dismissed";
const NOTICE_EVENT = "wavelab-small-screen-notice";
const SMALL_SCREEN = "(max-width: 720px)";
let dismissedInMemory = false;

function subscribe(callback: () => void) {
  const media = window.matchMedia(SMALL_SCREEN);
  media.addEventListener("change", callback);
  window.addEventListener(NOTICE_EVENT, callback);
  return () => {
    media.removeEventListener("change", callback);
    window.removeEventListener(NOTICE_EVENT, callback);
  };
}

function shouldShowNotice() {
  if (dismissedInMemory || !window.matchMedia(SMALL_SCREEN).matches) return false;
  try { return sessionStorage.getItem(NOTICE_KEY) !== "1"; }
  catch { return true; }
}

function dismissNotice() {
  // The in-memory fallback also prevents repeat prompts when storage is blocked.
  dismissedInMemory = true;
  try { sessionStorage.setItem(NOTICE_KEY, "1"); } catch { /* Continuing never depends on storage access. */ }
  window.dispatchEvent(new Event(NOTICE_EVENT));
}

export function SmallScreenNotice() {
  const open = useSyncExternalStore(subscribe, shouldShowNotice, () => false);
  const continueRef = useRef<HTMLButtonElement>(null);

  return <Dialog open={open} onOpenChange={next => { if (!next) dismissNotice(); }}>
    <DialogContent className="small-screen-dialog" showCloseButton={false} initialFocus={continueRef}>
      <button type="button" className="small-screen-close" aria-label="Dismiss screen recommendation" onClick={dismissNotice}><Icon name="close" size={20}/></button>
      <div className="small-screen-art" aria-hidden="true">
        <div className="small-screen-monitor"><Icon name="waves" size={64}/><span/></div>
        <div className="small-screen-phone"><Icon name="waves" size={22}/><span/></div>
        <span className="small-screen-spark">+</span>
      </div>
      <span className="small-screen-eyebrow">A LITTLE MORE ROOM TO EXPLORE</span>
      <DialogTitle className="small-screen-title">Big waves. Better on a bigger screen.</DialogTitle>
      <DialogDescription className="small-screen-description">For the clearest view of the simulations, graphs and controls, try a tablet, laptop or desktop. You can still explore every topic on this device.</DialogDescription>
      <button type="button" className="small-screen-continue" ref={continueRef} onClick={dismissNotice}>Continue on this device<Icon name="arrow" size={18}/></button>
      <p className="small-screen-note">Your choice is remembered for this tab session.</p>
    </DialogContent>
  </Dialog>;
}
