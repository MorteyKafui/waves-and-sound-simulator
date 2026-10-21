"use client";

import { useCallback } from "react";
import { ColorFigure } from "./colorfigures/figure";
import { buildWaveBench, type WaveBenchModel } from "./colorfigures/wave-bench";
import type { WaveProperties } from "@/lib/wave-properties";

/**
 * The wave bench: the physical embodiment of the scope's trace. It shares the
 * page's clock, so the bench and the calibrated graph below it are always the
 * same instant.
 */
export function WaveBenchFigure({ model, timeSource }: {
  model: WaveProperties | null;
  timeSource: () => number;
}) {
  const bench = model
    ? { amplitude: model.amplitude, wavelength: model.wavelength, period: model.period, frequency: model.frequency }
    : null;
  const build = useCallback((value: unknown, time: number) => buildWaveBench(value as WaveBenchModel | null, time), []);
  return <ColorFigure
    build={build}
    model={bench}
    timeSource={timeSource}
    width={840}
    height={330}
    hint="Drag to turn the bench · See-through opens the drive unit · Labels name the parts"
    ariaLabel="A wave indicator bench. A row of markers on a guide rail shows the travelling displacement wave; a fixed probe stands at two metres."/>;
}
