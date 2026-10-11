import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWorld, step, analyze, render, renderSVG } from '../src/index.js';
const cli = args => spawnSync(process.execPath, ['src/cli.js', ...args], { encoding: 'utf8' });
const momentum = w => w.bodies.reduce((p, b) => [p[0] + b.mass * b.vx, p[1] + b.mass * b.vy], [0, 0]);
const angular = w => w.bodies.reduce((n, b) => n + b.mass * (b.x * b.vy - b.y * b.vx), 0);
test('presets are deterministic and centered with zero total momentum', () => {
  for (const preset of ['solar', 'binary']) {
    const w = createWorld({ preset }); assert.deepEqual(w, createWorld({ preset }));
    for (const value of momentum(w)) assert.ok(Math.abs(value) < 1e-12);
    for (const key of ['x', 'y']) assert.ok(Math.abs(w.bodies.reduce((n, b) => n + b.mass * b[key], 0)) < 1e-12);
  }
  assert.throws(() => createWorld({ preset: 'unknown' }));
});
test('long simulations preserve energy, linear momentum, and angular momentum', () => {
  for (const preset of ['solar', 'binary']) {
    const w = createWorld({ preset }), before = angular(w); step(w, 10000);
    const report = analyze(w);
    assert.equal(report.time, 100); assert.ok(Math.abs(report.relativeEnergyDrift) < 1e-5);
    for (const value of momentum(w)) assert.ok(Math.abs(value) < 1e-9);
    assert.ok(Math.abs(angular(w) - before) < 1e-9);
    assert.ok(w.bodies.every(b => b.trail.length <= 240 && ['x', 'y', 'vx', 'vy'].every(k => Number.isFinite(b[k]))));
  }
});
test('batch stepping and single stepping agree, with no-op and validation support', () => {
  const a = createWorld(), b = createWorld(); step(a, 200); for (let i = 0; i < 200; i++) step(b);
  assert.deepEqual(a, b); const before = structuredClone(a); step(a, 0); assert.deepEqual(a, before);
  for (const count of [-1, 1.5, Infinity, 100001]) assert.throws(() => step(a, count));
});
test('terminal rendering has exact dimensions and optional colors; SVG is portable', () => {
  const w = createWorld(); step(w, 200);
  const rows = render(w, { width: 40, height: 16 }).split('\n');
  assert.equal(rows.length, 16); assert.ok(rows.every(row => row.length === 40)); assert.match(rows.join(''), /[o*]/);
  assert.ok(render(w, { color: true }).includes('\x1b[')); assert.match(renderSVG(w), /^<svg/);
  assert.throws(() => render(w, { width: 0 }));
});
test('CLI works without a TTY and validates flags and limits', () => {
  const r = cli(['--preset', 'binary', '--steps', '100', '--json']);
  assert.equal(r.status, 0); assert.equal(JSON.parse(r.stdout).steps, 100); assert.equal(r.stdout.includes('\x1b'), false);
  const frame = cli(['--frames', '1']); assert.equal(frame.status, 0); assert.match(frame.stdout, /ORBIT LAB/); assert.equal(frame.stdout.includes('\x1b'), false);
  for (const args of [['--preset'], ['--steps', '-1'], ['--steps', '1.5'], ['--wat'], ['--preset', 'bad'], ['--frames', '2', '--json']]) assert.equal(cli(args).status, 2);
  assert.equal(cli(['--help']).status, 0);
});
test('CLI writes SVG artifacts and reports filesystem errors', () => {
  const dir = mkdtempSync(join(tmpdir(), 'orbit-test-'));
  try { const file = join(dir, 'orbit.svg'); assert.equal(cli(['--steps', '300', '--svg', file]).status, 0); assert.match(readFileSync(file, 'utf8'), /TERMINAL ORBIT LAB/); assert.equal(cli(['--svg', join(dir, 'missing', 'x.svg')]).status, 2); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});
