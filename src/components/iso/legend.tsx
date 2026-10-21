import type { ReactNode } from "react";
import "./legend.css";

/*
 * The labels for every figure live here, under the card — never inside the
 * drawing. That is the Anatomy rule: words stay out of the picture, so the
 * apparatus itself carries at most one tiny engraved plate and everything else
 * is a keyed row the reader can read without squinting at a leader line.
 */

export type FigureKeyMark = "raised" | "flat" | "lit" | "edge" | "dim" | "dotted" | "dashed";

export interface FigureKey {
  mark: FigureKeyMark;
  label: string;
}

export interface FigureAssembly {
  id: string;
  label: string;
}

function Swatch({ mark }: { mark: FigureKeyMark }) {
  if (mark === "raised" || mark === "flat" || mark === "lit") {
    const body = mark === "flat" ? "M2 6.5 8 3.5 14 6.5 8 9.5Z" : "M2 4.5 8 1.5 14 4.5 14 6 8 9 2 6Z";
    return <svg className="figure-swatch" data-mark={mark} viewBox="0 0 16 10" aria-hidden="true">
      <path d={body}/>
      {mark === "flat" ? null : <path className="figure-swatch-crease" d="M2 4.5 8 7.5 14 4.5"/>}
    </svg>;
  }
  return <svg className="figure-swatch" data-mark={mark} viewBox="0 0 16 10" aria-hidden="true"><path d="M1.5 5h13"/></svg>;
}

/** Keyed legend: what each mark in the drawing means. */
export function FigureKeys({ keys }: { keys: FigureKey[] }) {
  if (!keys.length) return null;
  return <ul className="figure-keys">
    {keys.map(key => <li key={key.label}><Swatch mark={key.mark}/><span>{key.label}</span></li>)}
  </ul>;
}

/** Numbered assembly buttons: the same job as hovering a part, but readable. */
export function FigureAssemblies({ assemblies, active, onSelect }: {
  assemblies: FigureAssembly[]; active: string | null; onSelect: (id: string) => void;
}) {
  if (!assemblies.length) return null;
  return <ul className="figure-assemblies">
    {assemblies.map((assembly, index) => <li key={assembly.id}>
      <button type="button" data-active={active === assembly.id} aria-pressed={active === assembly.id}
        onClick={() => onSelect(active === assembly.id ? "" : assembly.id)}>
        <span className="figure-assembly-index" aria-hidden="true">{(index + 1).toString().padStart(2, "0")}</span>
        <span>{assembly.label}</span>
      </button>
    </li>)}
  </ul>;
}

export function FigureLegend({ keys, assemblies, active, onSelect, caption }: {
  keys?: FigureKey[];
  assemblies?: FigureAssembly[];
  active?: string | null;
  onSelect?: (id: string) => void;
  caption?: ReactNode;
}) {
  const hasKeys = Boolean(keys?.length);
  const hasAssemblies = Boolean(assemblies?.length && onSelect);
  if (!hasKeys && !hasAssemblies && !caption) return null;
  return <div className="figure-legend">
    {hasAssemblies && <FigureAssemblies assemblies={assemblies!} active={active ?? null} onSelect={onSelect!}/>}
    {hasKeys && <FigureKeys keys={keys!}/>}
    {caption && <p className="figure-legend-caption">{caption}</p>}
  </div>;
}
