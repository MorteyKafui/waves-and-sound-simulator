import type { CSSProperties } from "react";

export type IconName = "waves" | "lab" | "book" | "help" | "arrow" | "chevron" | "play" | "pause" | "reset" | "step" | "grid" | "layers" | "download" | "plus" | "check" | "close" | "sun" | "moon" | "info" | "settings" | "target" | "reflection" | "refraction" | "diffraction" | "interference" | "flask" | "external" | "menu" | "speed" | "string" | "medium" | "doppler";
const paths: Record<IconName, React.ReactNode> = {
  waves: <><path d="M2 8c3-7 5 7 8 0s5 7 8 0 4 0 4 0M2 15c3-7 5 7 8 0s5 7 8 0 4 0 4 0"/></>,
  lab: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
  book: <><path d="M4 4h7a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H4zM14 7a3 3 0 0 1 3-3h4v15h-3a4 4 0 0 0-4 2"/></>,
  help: <><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .7-1.5 1-1.5 2.5M12 17h.01"/></>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>,
  chevron: <path d="m9 5 7 7-7 7"/>,
  play: <path d="m9 5 11 7-11 7z" fill="currentColor" strokeWidth="0"/>,
  pause: <><path d="M8 5v14M16 5v14" strokeWidth="3.4"/></>,
  reset: <><path d="M3 9a9 9 0 1 1 .8 8M3 3v6h6"/></>,
  step: <><path d="m5 5 10 7-10 7z"/><path d="M19 5v14"/></>,
  grid: <><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></>,
  layers: <><path d="m12 3 10 6-10 6L2 9zM2 14l10 6 10-6"/></>,
  download: <><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  check: <path d="m5 12 4 4L19 6"/>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5"/></>,
  moon: <path d="M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z"/>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></>,
  settings: <><path d="M5 3v18M12 3v18M19 3v18"/><path d="M2 8h6M9 16h6M16 8h6" strokeWidth="3"/></>,
  target: <><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/></>,
  reflection: <><path d="M19 3v18M3 5l14 7L3 19M5 4l-2 1 1 2M4 17l-1 2 2 1"/></>,
  refraction: <><path d="M12 2v20M3 6l9 6 9 2M17 10l4 4-5 2"/><path d="M8 12h8" strokeDasharray="1 3"/></>,
  diffraction: <><path d="M10 2v7m0 6v7M3 5v14M6 5v14M14 7c4 2 4 8 0 10M17 4c7 5 7 11 0 16"/></>,
  interference: <><circle cx="8" cy="12" r="5"/><circle cx="16" cy="12" r="5"/><path d="M8 12h.01M16 12h.01" strokeWidth="3"/></>,
  flask: <><path d="M9 3h6M10 3v7L4 20a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1l-6-10V3M7 16h10"/></>,
  external: <><path d="M14 3h7v7M21 3 10 14M10 4H4v16h16v-6"/></>,
  menu: <path d="M4 6h16M4 12h16M4 18h16"/>,
  speed: <><path d="M4 19a9 9 0 1 1 16 0M12 12l5-5M6 12H4m8-6V4m6 8h2"/><circle cx="12" cy="12" r="2"/></>,
  string: <><path d="M3 4v16M21 4v16M3 12c3-11 6-11 9 0s6 11 9 0"/><circle cx="3" cy="12" r="1"/><circle cx="21" cy="12" r="1"/></>,
  medium: <><path d="m3 8 9-5 9 5v9l-9 5-9-5zM3 8l9 5 9-5M12 13v9"/><path d="M7 10V6m10 4V6M7 19v-9m10 9v-9"/></>,
  doppler: <><circle cx="9" cy="12" r="2"/><path d="M5 5a9 9 0 0 0 0 14M13 6a7 7 0 0 1 0 12M16 4a10 10 0 0 1 0 16M19 2a13 13 0 0 1 0 20M3 12h2"/></>,
};
export function Icon({ name, size = 20, className, style }: { name: IconName; size?: number; className?: string; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden="true">{paths[name]}</svg>;
}
