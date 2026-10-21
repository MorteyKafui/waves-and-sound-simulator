"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { renderScene, type Camera, type Scene } from "./core";
import "./colorfigures.css";

export interface ColorFigureProps {
  /** Builds the scene for the current time, in seconds. */
  build: (model: unknown, time: number) => Scene;
  /** The model the figure draws from; a change redraws it. */
  model?: unknown;
  /** Playback rate; 0 holds the figure still. */
  rate?: number;
  /** Reads the time from elsewhere, so the figure and the page share one clock. */
  timeSource?: () => number;
  /** Bumping this restarts the figure's clock. */
  resetKey?: number;
  width?: number;
  height?: number;
  /** Short line under the figure that tells the reader what to do. */
  hint?: string;
  ariaLabel: string;
  className?: string;
}

const PALETTE = {
  paper: "var(--cf-paper)",
  ink: "var(--cf-ink)",
  shadow: "var(--cf-shadow)",
};

/**
 * A turnable figure. Drag the object to walk around it, or use the arrow
 * keys; the camera is the only thing that moves when you do that, so the
 * mechanism keeps running exactly as it was.
 */
export function ColorFigure({
  build, model, rate = 0, timeSource, resetKey = 0, width = 760, height = 460, hint, ariaLabel, className = "",
}: ColorFigureProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const camera = useRef<Camera>({ yaw: 24, pitch: 21, zoom: 1 });
  const time = useRef(0);
  const last = useRef<number | null>(null);
  const frame = useRef(0);
  const modelRef = useRef(model);
  const rateRef = useRef(rate);
  const clockRef = useRef(timeSource);
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const [seeThrough, setSeeThrough] = useState(false);
  const [labels, setLabels] = useState(false);
  const [turntable, setTurntable] = useState(false);
  const spin = useRef(0);

  useEffect(() => { modelRef.current = model; }, [model]);
  useEffect(() => { rateRef.current = rate; }, [rate]);
  useEffect(() => { clockRef.current = timeSource; }, [timeSource]);

  const draw = useCallback(() => {    const node = svgRef.current;
    if (!node) return;
    const scene = build(modelRef.current, time.current);
    node.innerHTML = renderScene(scene, camera.current, {
      width, height,
      ...PALETTE,
      seeThrough: seeThrough ? 1 : 0,
      labels,
      inkWeight: 1.6,
    });
  }, [build, width, height, seeThrough, labels]);

  useEffect(() => { draw(); }, [draw, model, resetKey]);

  useEffect(() => {
    const node = svgRef.current;
    if (!node) return;
    const loop = (now: number) => {
      frame.current = requestAnimationFrame(loop);
      const previous = last.current;
      last.current = now;
      const delta = previous === null ? 0 : Math.min((now - previous) / 1000, 1 / 12);
      if (turntable) {
        spin.current += delta * 14;
        camera.current = { ...camera.current, yaw: camera.current.yaw + delta * 14 };
        draw();
      }
      const clock = clockRef.current;
      if (clock) {
        // The page owns the clock; the figure only redraws when it moves.
        const shared = clock();
        if (shared !== time.current) { time.current = shared; draw(); }
      } else if (rateRef.current > 0) {
        time.current += delta * rateRef.current;
        draw();
      }
    };
    frame.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame.current);
  }, [draw, turntable]);

  useEffect(() => {
    if (resetKey === 0) return;
    time.current = 0;
    draw();
  }, [resetKey, draw]);

  function handleDown(event: React.PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, yaw: camera.current.yaw, pitch: camera.current.pitch };
  }

  function handleMove(event: React.PointerEvent<SVGSVGElement>) {
    const start = drag.current;
    if (!start) return;
    camera.current = {
      ...camera.current,
      yaw: start.yaw + (event.clientX - start.x) * 0.45,
      pitch: Math.max(-4, Math.min(66, start.pitch - (event.clientY - start.y) * 0.3)),
    };
    draw();
  }

  function handleUp(event: React.PointerEvent<SVGSVGElement>) {
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleKey(event: React.KeyboardEvent<SVGSVGElement>) {
    const step = event.shiftKey ? 12 : 4;
    if (event.key === "ArrowLeft") camera.current = { ...camera.current, yaw: camera.current.yaw - step };
    else if (event.key === "ArrowRight") camera.current = { ...camera.current, yaw: camera.current.yaw + step };
    else if (event.key === "ArrowUp") camera.current = { ...camera.current, pitch: Math.min(66, camera.current.pitch + step) };
    else if (event.key === "ArrowDown") camera.current = { ...camera.current, pitch: Math.max(-4, camera.current.pitch - step) };
    else return;
    event.preventDefault();
    draw();
  }

  return <div className={`colorfigure ${className}`}>
    <svg ref={svgRef} className="colorfigure-svg" viewBox={`0 0 ${width} ${height}`}
      role="img" aria-label={ariaLabel} tabIndex={0}
      onPointerDown={handleDown} onPointerMove={handleMove} onPointerUp={handleUp} onPointerCancel={handleUp}
      onKeyDown={handleKey}/>
    <div className="colorfigure-bar">
      <span className="colorfigure-hint">{hint ?? "Drag to turn the figure · arrow keys work too"}</span>
      <div className="colorfigure-switches">
        <button type="button" aria-pressed={turntable} onClick={() => setTurntable(value => !value)}>Turntable</button>
        <button type="button" onClick={() => { camera.current = { ...camera.current, yaw: 0, pitch: 0 }; draw(); }}>Front</button>
        <button type="button" aria-pressed={seeThrough} onClick={() => setSeeThrough(value => !value)}>See-through</button>
        <button type="button" aria-pressed={labels} onClick={() => setLabels(value => !value)}>Labels</button>
      </div>
    </div>
  </div>;
}
