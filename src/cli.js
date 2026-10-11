#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { createWorld, step, analyze, render, renderSVG } from './index.js';
const args = process.argv.slice(2);
if (args.includes('--help')) { console.log('Usage: terminal-orbit-lab [--preset solar|binary] [--steps N] [--frames N] [--json] [--svg FILE] [--no-color]\nLive controls: p pause, r reset, 1/2 preset, +/- speed, [/] zoom, q quit'); process.exit(0); }
let restore = () => {};
try {
  const options = {}; const flags = new Set(['--json', '--no-color']), takes = new Set(['--preset', '--steps', '--frames', '--svg']);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (flags.has(arg)) options[arg] = true;
    else if (takes.has(arg)) { const value = args[++i]; if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`); options[arg] = value; }
    else throw new Error(`unknown option: ${arg}`);
  }
  const integer = (name, fallback, max) => { const raw = options[name]; if (raw === undefined) return fallback; if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) > max) throw new Error(`${name} must be an integer from 0 to ${max}`); return Number(raw); };
  let world = createWorld({ preset: options['--preset'] || 'solar' });
  step(world, integer('--steps', 0, 100000));
  if (options['--json'] || options['--svg']) {
    if (options['--frames'] !== undefined) throw new Error('--frames is only for terminal output');
    if (options['--svg']) await writeFile(options['--svg'], renderSVG(world));
    if (options['--json']) console.log(JSON.stringify(analyze(world), null, 2));
  } else {
    const live = !!(process.stdout.isTTY && process.stdin.isTTY), frames = integer('--frames', live ? Infinity : 1, 100000);
    let paused = false, speed = 4, extent = 10, running = true;
    const input = data => {
      for (const key of data.toString()) {
        if (key === 'q' || key === '\x03') running = false;
        else if (key === 'p' || key === ' ') paused = !paused;
        else if (key === 'r') world = createWorld({ preset: world.preset });
        else if (key === '1' || key === '2') world = createWorld({ preset: key === '1' ? 'solar' : 'binary' });
        else if (key === '+' || key === '=') speed = Math.min(64, speed * 2);
        else if (key === '-') speed = Math.max(1, speed / 2);
        else if (key === ']') extent = Math.max(2, extent / 1.2);
        else if (key === '[') extent = Math.min(100, extent * 1.2);
      }
    };
    const stop = () => { running = false; };
    if (live) {
      const wasRaw = process.stdin.isRaw; process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.on('data', input); process.on('SIGINT', stop); process.on('SIGTERM', stop);
      process.stdout.write('\x1b[?1049h\x1b[?25l');
      restore = () => { process.stdin.off('data', input); process.stdin.setRawMode(!!wasRaw); process.stdin.pause(); process.off('SIGINT', stop); process.off('SIGTERM', stop); process.stdout.write('\x1b[?25h\x1b[?1049l'); };
    }
    for (let frame = 0; running && frame < frames; frame++) {
      if (!paused) step(world, speed);
      const width = Math.max(10, Math.min(120, (process.stdout.columns || 80) - 1)), height = Math.max(5, Math.min(36, (process.stdout.rows || 28) - 4));
      const report = analyze(world), picture = render(world, { width, height, extent, color: live && !options['--no-color'] && !process.env.NO_COLOR });
      const text = `ORBIT LAB | ${world.preset} | t=${world.time.toFixed(2)} | ${speed} steps/frame${paused ? ' | PAUSED' : ''}\n${picture}\nenergy drift ${(report.relativeEnergyDrift * 100).toFixed(4)}% | p pause r reset 1/2 presets +/- speed [/] zoom q quit\n`;
      process.stdout.write(live ? `\x1b[H\x1b[J${text}` : text);
      if (live && running && frame + 1 < frames) await new Promise(resolve => setTimeout(resolve, 40));
    }
    restore(); restore = () => {};
  }
} catch (error) { restore(); console.error(`terminal-orbit-lab: ${error.message}`); process.exitCode = 2; }
