import assert from 'node:assert/strict';
import {
  DEFAULT_FIT_MODE,
  DEFAULT_IDLE_DIM,
  DISPLAY_FIT_MODES,
  IDLE_DIM_OPTIONS,
  parseFitMode,
  parseIdleDim,
} from './settings.ts';

assert.equal(DEFAULT_FIT_MODE, 'contain', 'Default must be contain per AC1');
assert.equal(DISPLAY_FIT_MODES.length, 3);
assert.deepEqual(DISPLAY_FIT_MODES, ['contain', 'cover', 'fullscreen']);

assert.equal(parseFitMode('contain'), 'contain');
assert.equal(parseFitMode('cover'), 'cover');
assert.equal(parseFitMode('fullscreen'), 'fullscreen');

assert.equal(parseFitMode(null), 'contain', 'null must fall back to default');
assert.equal(parseFitMode(undefined), 'contain', 'undefined must fall back to default');
assert.equal(parseFitMode(''), 'contain', 'empty string must fall back to default');
assert.equal(parseFitMode('garbage'), 'contain', 'unknown value must fall back to default');
assert.equal(parseFitMode('CONTAIN'), 'contain', 'uppercase must fall back (case-sensitive)');

// --- idle dim ------------------------------------------------------------
assert.equal(DEFAULT_IDLE_DIM, 60, 'Default idle dim gap is 60s');
assert.deepEqual([...IDLE_DIM_OPTIONS], [0, 30, 60, 120, 300]);

assert.equal(parseIdleDim('0'), 0, '0 is a valid value: dimming off');
assert.equal(parseIdleDim('30'), 30);
assert.equal(parseIdleDim('300'), 300);

assert.equal(parseIdleDim(null), 60, 'null must fall back to default');
assert.equal(parseIdleDim(undefined), 60, 'undefined must fall back to default');
assert.equal(parseIdleDim(''), 60, 'empty string must fall back (Number("") is 0)');
assert.equal(parseIdleDim('garbage'), 60, 'unknown value must fall back to default');
assert.equal(parseIdleDim('45'), 60, 'value outside the option set must fall back');
