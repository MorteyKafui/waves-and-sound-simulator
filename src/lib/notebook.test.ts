import { describe, expect, test } from 'bun:test';
import { createObservation, NOTEBOOK_KEY, observationsToCsv, parseObservations, type Observation } from './notebook';
import { DEFAULT_PARAMETERS, deriveWave, waveHeight, type Experiment, type WaveParameters } from './wave-physics';

const EXPERIMENTS: Experiment[] = ['reflection', 'refraction', 'diffraction', 'interference'];
const HEADER = 'id,created_at,experiment,frequency_hz,amplitude_mm,depth_mm,second_depth_mm,angle_deg,slit_width_mm,separation_mm,phase_deg,probe_x_mm,probe_y_mm,time_s,elevation_mm,note';

function stored(overrides: Partial<Observation> = {}): Observation {
  return {
    id: '9abb6e44-23b0-48df-b12a-f6d4e6ef88f9',
    createdAt: '2026-10-18T12:34:56.789Z',
    experiment: 'refraction',
    parameters: { ...DEFAULT_PARAMETERS.refraction },
    probe: { x: 25, y: -17 },
    time: 0.125,
    elevation: -0.25,
    note: '',
    ...overrides,
  };
}

function restore(value: unknown): Observation[] {
  return parseObservations(JSON.stringify(value) ?? null);
}

function expectRejected(value: unknown): void {
  expect(restore([value])).toEqual([]);
}

describe('createObservation', () => {
  test('exports the versioned storage key', () => {
    expect(NOTEBOOK_KEY).toBe('wavelab-notebook-v1');
  });

  test('generates independent UUIDs, ISO timestamps and a default empty note', () => {
    const before = Date.now();
    const first = createObservation('reflection', DEFAULT_PARAMETERS.reflection, { x: 0, y: 0 }, 0);
    const second = createObservation('reflection', DEFAULT_PARAMETERS.reflection, { x: 0, y: 0 }, 0);
    const after = Date.now();
    expect(first.id).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i);
    expect(second.id).not.toBe(first.id);
    for (const record of [first, second]) {
      expect(new Date(record.createdAt).toISOString()).toBe(record.createdAt);
      expect(Date.parse(record.createdAt)).toBeGreaterThanOrEqual(before);
      expect(Date.parse(record.createdAt)).toBeLessThanOrEqual(after);
      expect(record.note).toBe('');
    }
  });

  for (const experiment of EXPERIMENTS) {
    test(`${experiment}: records physical elevation in mm, with amplitude and time`, () => {
      const parameters = { ...DEFAULT_PARAMETERS[experiment], amplitude: 1.7, phase: 73 };
      const probe = { x: 25, y: -17 };
      const time = 0.137;
      const record = createObservation(experiment, parameters, probe, time, 'Measured crest');
      expect(record).toMatchObject({ experiment, parameters, probe, time, note: 'Measured crest' });
      expect(record.elevation).toBe(waveHeight(experiment, parameters, probe.x, probe.y, time));
      const doubled = createObservation(experiment, { ...parameters, amplitude: 3.4 }, probe, time);
      expect(doubled.elevation).toBeCloseTo(2 * record.elevation, 12);
      expect(restore([record])).toEqual([record]);
    });
  }

  test('snapshots both nested inputs and never retains unrelated properties', () => {
    const parameters = { ...DEFAULT_PARAMETERS.interference, metadata: { label: 'not schema' } };
    const probe = { x: 25, y: -17, label: 'not schema' };
    const record = createObservation('interference', parameters, probe, 0.123, 'Original note');
    const snapshot = JSON.stringify(record);
    expect(record.parameters).not.toBe(parameters);
    expect(record.probe).not.toBe(probe);
    expect(Object.keys(record.parameters).sort()).toEqual(Object.keys(DEFAULT_PARAMETERS.interference).sort());
    expect(record.probe).toEqual({ x: 25, y: -17 });
    Object.assign(parameters, { frequency: 3, amplitude: 4, depth: 20, phase: 180 });
    Object.assign(probe, { x: -50, y: 42 });
    expect(JSON.stringify(record)).toBe(snapshot);
    record.parameters.amplitude = 9;
    record.probe.x = 10;
    expect(parameters.amplitude).toBe(4);
    expect(probe.x).toBe(-50);
  });

  test('accepts frozen inputs and captures zero amplitude without visual scaling', () => {
    const parameters = Object.freeze({ ...DEFAULT_PARAMETERS.reflection, amplitude: 0 });
    const probe = Object.freeze({ x: -100, y: 0 });
    expect(Math.abs(createObservation('reflection', parameters, probe, 0).elevation)).toBe(0);
  });

  test('rejects invalid creation inputs instead of saving NaN or silently truncating', () => {
    const p = DEFAULT_PARAMETERS.refraction;
    expect(() => createObservation('unknown' as Experiment, p, { x: 0, y: 0 }, 0)).toThrow(RangeError);
    expect(() => createObservation('refraction', { ...p, frequency: 0 }, { x: 0, y: 0 }, 0)).toThrow(RangeError);
    expect(() => createObservation('refraction', p, { x: NaN, y: 0 }, 0)).toThrow(RangeError);
    expect(() => createObservation('refraction', p, { x: 0, y: Infinity }, 0)).toThrow(RangeError);
    for (const time of [-1, NaN, Infinity, -Infinity]) {
      expect(() => createObservation('refraction', p, { x: 0, y: 0 }, time)).toThrow(RangeError);
    }
    expect(() => createObservation('refraction', p, { x: 0, y: 0 }, 0, 'a'.repeat(4097))).toThrow(RangeError);
    expect(() => createObservation('refraction', p, { x: 0, y: 0 }, 0, null as unknown as string)).toThrow(RangeError);
  });

  test('rejects finite inputs whose physical elevation overflows', () => {
    const parameters = { ...DEFAULT_PARAMETERS.reflection, amplitude: Number.MAX_VALUE, angle: 0 };
    const time = deriveWave(parameters).k * 0.1 / (2 * Math.PI * parameters.frequency);
    expect(() => createObservation('reflection', parameters, { x: 100, y: 0 }, time)).toThrow(RangeError);
    expectRejected(stored({ experiment: 'reflection', parameters, probe: { x: 100, y: 0 }, time }));
  });
});

describe('parseObservations', () => {
  test('returns [] for missing storage, malformed JSON and unsupported top-level schemas', () => {
    const corrupt = [null, '', ' ', 'not JSON', '[', '{', '[NaN]', '[Infinity]', 'null', 'true', '42',
      '"text"', '{}', '{"observations":[]}', '{"version":1,"records":[]}', '[{"id":"incomplete"}]'];
    for (const raw of corrupt) {
      expect(() => parseObservations(raw)).not.toThrow();
      expect(parseObservations(raw)).toEqual([]);
    }
  });

  test('keeps valid entries in order when individual records are corrupt', () => {
    const first = stored({ id: 'first', note: 'original elevation is preserved' });
    const last = stored({ id: 'last', elevation: 123.456 });
    expect(restore([null, first, false, 5, [], {}, { ...first, parameters: null }, last]))
      .toEqual([first, last]);
  });

  test('requires every observation, parameter and probe field, without defaults or coercion', () => {
    const base = stored();
    for (const key of Object.keys(base)) {
      const incomplete: Record<string, unknown> = { ...base };
      delete incomplete[key];
      expectRejected(incomplete);
    }
    for (const key of Object.keys(base.parameters)) {
      const parameters: Record<string, unknown> = { ...base.parameters };
      delete parameters[key];
      expectRejected({ ...base, parameters });
    }
    for (const key of ['x', 'y']) {
      const probe: Record<string, unknown> = { ...base.probe };
      delete probe[key];
      expectRejected({ ...base, probe });
    }
  });

  test('rejects wrong nested shapes and nonnumeric, null or nonfinite parameter values', () => {
    const base = stored();
    for (const invalid of [null, [], '', 1, true]) {
      expectRejected({ ...base, parameters: invalid });
      expectRejected({ ...base, probe: invalid });
    }
    for (const key of Object.keys(base.parameters)) {
      for (const invalid of [null, '8', true, [], {}, NaN, Infinity, -Infinity]) {
        expectRejected({ ...base, parameters: { ...base.parameters, [key]: invalid } });
      }
    }
    for (const key of ['x', 'y']) {
      for (const invalid of [null, '1', false, [], {}, NaN, Infinity, -Infinity]) {
        expectRejected({ ...base, probe: { ...base.probe, [key]: invalid } });
      }
    }
  });

  test('rejects out-of-domain and unrepresentable physics inputs', () => {
    const base = stored();
    const invalid: Partial<WaveParameters>[] = [
      { frequency: 0 }, { frequency: -8 }, { amplitude: -0.1 },
      { depth: 0 }, { depth: -10 }, { secondDepth: 0 }, { secondDepth: -1 },
      { slitWidth: 0 }, { slitWidth: -1 }, { separation: 0 }, { separation: -1 },
      { angle: -90.01 }, { angle: 90.01 },
      { frequency: Number.MAX_VALUE }, { frequency: Number.MIN_VALUE },
      { depth: Number.MIN_VALUE }, { secondDepth: Number.MIN_VALUE },
      { separation: Number.MIN_VALUE },
    ];
    for (const patch of invalid) expectRejected({ ...base, parameters: { ...base.parameters, ...patch } });
  });

  test('validates scalar types, finite times/elevations and safe string lengths', () => {
    const base = stored();
    const invalid: Record<string, unknown[]> = {
      id: ['', '   ', 'a'.repeat(129), 1, null],
      createdAt: ['', 'not a date', '2026-02-30T00:00:00.000Z', '2026-10-18',
        '2026-10-18T12:34:56.789+00:00', 'a'.repeat(1000), 123, null],
      experiment: ['', 'unknown', 'constructor', '__proto__', 'toString', 1, null],
      time: [-0.1, '0', null, false, {}, NaN, Infinity, -Infinity],
      elevation: ['0', null, false, [], {}, NaN, Infinity, -Infinity],
      note: ['a'.repeat(4097), null, false, 42, {}, []],
    };
    for (const [key, values] of Object.entries(invalid)) {
      for (const value of values) expectRejected({ ...base, [key]: value });
    }
  });

  test('rejects JSON numeric overflow, which JSON.parse represents as Infinity', () => {
    const raw = JSON.stringify([stored({ time: 12345678 })]);
    expect(parseObservations(raw.replace('"time":12345678', '"time":1e999'))).toEqual([]);
    const elevation = JSON.stringify([stored({ elevation: 12345678 })]);
    expect(parseObservations(elevation.replace('"elevation":12345678', '"elevation":-1e999'))).toEqual([]);
    const parameters = JSON.stringify([stored()]);
    expect(parseObservations(parameters.replace('"frequency":8', '"frequency":1e999'))).toEqual([]);
    expect(parseObservations(parameters.replace('"x":25', '"x":1e999'))).toEqual([]);
  });

  test('accepts domain boundaries, signed coordinates/phases and large finite simulation times', () => {
    for (const experiment of EXPERIMENTS) {
      for (const angle of [-90, 90]) {
        const record = stored({
          experiment,
          parameters: { ...DEFAULT_PARAMETERS[experiment], amplitude: 0, angle, phase: -720 },
          probe: { x: -400, y: 300 },
          time: 1e200,
          elevation: 0,
        });
        expect(restore([record])).toEqual([record]);
      }
    }
    const boundary = stored({ id: 'a'.repeat(128), note: 'a'.repeat(4096), time: 0,
      createdAt: '+010000-01-01T00:00:00.000Z' });
    expect(restore([boundary])).toEqual([boundary]);
  });

  test('copies only schema fields and cannot import prototype-pollution payloads', () => {
    const record = stored();
    const raw = JSON.stringify([{
      ...record,
      extra: { untrusted: true },
      ['__proto__']: { notebookPolluted: true },
      constructor: { prototype: { notebookPolluted: true } },
      parameters: { ...record.parameters, ['__proto__']: { notebookPolluted: true }, extra: 'discard' },
      probe: { ...record.probe, ['__proto__']: { notebookPolluted: true }, extra: 'discard' },
    }]);
    const parsed = parseObservations(raw);
    expect(parsed).toEqual([record]);
    expect(Object.getPrototypeOf(parsed[0])).toBe(Object.prototype);
    expect(Object.getPrototypeOf(parsed[0].parameters)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(parsed[0].probe)).toBe(Object.prototype);
    expect(Object.prototype).not.toHaveProperty('notebookPolluted');
    const again = parseObservations(raw);
    parsed[0].parameters.amplitude = 99;
    parsed[0].probe.x = 99;
    expect(again).toEqual([record]);
  });

  test('retains the first 100 valid records, ignoring invalid entries before the limit', () => {
    const records = Array.from({ length: 105 }, (_, index) => stored({ id: `record-${index}` }));
    expect(restore([null, {}, ...records.flatMap((record) => [record, { bad: true }])]))
      .toEqual(records.slice(0, 100));
  });

  test('bounds raw storage input without rejecting 100 maximum-length escaped notes', () => {
    expect(parseObservations(' '.repeat(3_000_001))).toEqual([]);
    const record = stored({ note: '\u0000'.repeat(4096) });
    const records = Array.from({ length: 100 }, (_, index) => ({ ...record, id: `record-${index}` }));
    expect(restore(records)).toEqual(records);
  });
});

describe('observationsToCsv', () => {
  test('emits the exact header for an empty notebook', () => {
    expect(observationsToCsv([])).toBe(HEADER);
  });

  test('exports every column in order with CRLF rows, retaining empty notes and record order', () => {
    const first = stored();
    const second = stored({ id: 'second', note: 'Crest' });
    expect(observationsToCsv([first, second])).toBe(
      `${HEADER}\r\n${first.id},2026-10-18T12:34:56.789Z,refraction,8,0.5,10,4,30,20,50,0,25,-17,0.125,-0.25,`
      + '\r\nsecond,2026-10-18T12:34:56.789Z,refraction,8,0.5,10,4,30,20,50,0,25,-17,0.125,-0.25,Crest',
    );
  });

  test('quotes commas, doubles embedded quotes, and preserves CR/LF and Unicode', () => {
    const record = stored({ id: 'id,"quoted"', note: 'Crest, "then"\ntrough\r\n水波' });
    const csv = observationsToCsv([record]);
    expect(csv).toContain('\r\n"id,""quoted""",');
    expect(csv).toEndWith(',"Crest, ""then""\ntrough\r\n水波"');
    expect(observationsToCsv([stored({ note: 'one\rtwo' })])).toEndWith(',"one\rtwo"');
  });

  test('neutralizes formula text including whitespace, control and locale bypasses', () => {
    const cases: [string, string][] = [
      ['=1+1', "'=1+1"],
      ['+SUM(1,2)', '"\'+SUM(1,2)"'],
      ['-42', "'-42"],
      ['@SUM(A1:A2)', "'@SUM(A1:A2)"],
      ['   =1', "'   =1"],
      ['\uFEFF=1', "'\uFEFF=1"],
      ['\t=1', "'\t=1"],
      [' \t=1', "' \t=1"],
      ['\r=1', '"\'\r=1"'],
      ['\n=1', '"\'\n=1"'],
      ['\u0000=1', "'\u0000=1"],
      ['\u007f=1', "'\u007f=1"],
      [' \u0085=1', "' \u0085=1"],
      ['＝1+1', "'＝1+1"],
      ['＋1', "'＋1"],
      ['－1', "'－1"],
      ['＠SUM(A1)', "'＠SUM(A1)"],
      ['=HYPERLINK("https://example.test","click")', '"\'=HYPERLINK(""https://example.test"",""click"")"'],
    ];
    for (const [note, expected] of cases) {
      expect(observationsToCsv([stored({ note })])).toEndWith(`,${expected}`);
    }
  });

  test('protects every string field, not just notes', () => {
    const record = stored({ id: '=1', createdAt: '+1', experiment: '@text' as Experiment, note: '-text' });
    expect(observationsToCsv([record])).toContain("\r\n'=1,'+1,'@text,");
    expect(observationsToCsv([record])).toEndWith(",'-text");
  });

  test('never prefixes actual negative numbers or harmless text', () => {
    const record = stored({
      parameters: { ...DEFAULT_PARAMETERS.refraction, angle: -30, phase: -90 },
      probe: { x: -25, y: -17 },
      note: 'Crest = positive; trough - negative; email a@b',
    });
    expect(observationsToCsv([record])).toContain(',8,0.5,10,4,-30,20,50,-90,-25,-17,0.125,-0.25,');
    expect(observationsToCsv([record])).toEndWith(`,${record.note}`);
    expect(observationsToCsv([stored({ note: "'already text" })])).toEndWith(",'already text");
    expect(observationsToCsv([stored({ note: '  ordinary text' })])).toEndWith(',  ordinary text');
    expect(observationsToCsv([stored({ note: '",=1' })])).toEndWith(',""",=1"');
  });

  test('does not mutate records or export nonfinite numeric cells', () => {
    const record = stored({ note: '=1+1' });
    const before = JSON.stringify(record);
    observationsToCsv([record]);
    expect(JSON.stringify(record)).toBe(before);
    for (const elevation of [NaN, Infinity, -Infinity]) {
      expect(() => observationsToCsv([stored({ elevation })])).toThrow(RangeError);
    }
  });
});
