const colors = ['#ffd166', '#5de4c7', '#70a5ff', '#f48fb1'];
function acceleration(bodies, softening) {
  const out = bodies.map(() => ({ x: 0, y: 0 }));
  for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
    const dx = bodies[j].x - bodies[i].x, dy = bodies[j].y - bodies[i].y;
    const factor = 1 / (dx * dx + dy * dy + softening * softening) ** 1.5;
    out[i].x += bodies[j].mass * dx * factor; out[i].y += bodies[j].mass * dy * factor;
    out[j].x -= bodies[i].mass * dx * factor; out[j].y -= bodies[i].mass * dy * factor;
  }
  return out;
}
export function energy(world) {
  let value = world.bodies.reduce((n, b) => n + b.mass * (b.vx * b.vx + b.vy * b.vy) / 2, 0);
  for (let i = 0; i < world.bodies.length; i++) for (let j = i + 1; j < world.bodies.length; j++) {
    const a = world.bodies[i], b = world.bodies[j];
    value -= a.mass * b.mass / Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + world.softening ** 2);
  }
  return value;
}
export function createWorld({ preset = 'solar' } = {}) {
  if (!['solar', 'binary'].includes(preset)) throw new Error('preset must be solar or binary');
  const bodies = preset === 'solar' ? [{ name: 'Sun', mass: 20, x: 0, y: 0, vx: 0, vy: 0 }, ...[3, 5, 7].map((radius, i) => {
    const angle = i * 1.8, speed = Math.sqrt(20 / radius);
    return { name: `Planet ${i + 1}`, mass: 0.02, x: radius * Math.cos(angle), y: radius * Math.sin(angle), vx: -speed * Math.sin(angle), vy: speed * Math.cos(angle) };
  })] : [
    { name: 'Star A', mass: 8, x: -2, y: 0, vx: 0, vy: -1 },
    { name: 'Star B', mass: 8, x: 2, y: 0, vx: 0, vy: 1 },
    { name: 'Planet', mass: 0.02, x: 8, y: 0, vx: 0, vy: Math.sqrt(2) },
  ];
  const mass = bodies.reduce((n, b) => n + b.mass, 0);
  const center = Object.fromEntries(['x', 'y', 'vx', 'vy'].map(key => [key, bodies.reduce((n, b) => n + b.mass * b[key], 0) / mass]));
  bodies.forEach((b, i) => { for (const key of Object.keys(center)) b[key] -= center[key]; b.color = colors[i]; b.trail = [{ x: b.x, y: b.y }]; });
  const world = { preset, time: 0, steps: 0, dt: 0.01, softening: 0.03, bodies };
  world.initialEnergy = energy(world); return world;
}
export function step(world, count = 1) {
  if (!Number.isInteger(count) || count < 0 || count > 100000) throw new Error('step count must be an integer from 0 to 100000');
  for (let n = 0; n < count; n++) {
    const before = acceleration(world.bodies, world.softening), dt = world.dt;
    world.bodies.forEach((b, i) => { b.x += b.vx * dt + before[i].x * dt * dt / 2; b.y += b.vy * dt + before[i].y * dt * dt / 2; });
    const after = acceleration(world.bodies, world.softening);
    world.bodies.forEach((b, i) => {
      b.vx += (before[i].x + after[i].x) * dt / 2; b.vy += (before[i].y + after[i].y) * dt / 2;
      if ((world.steps + 1) % 5 === 0) { b.trail.push({ x: b.x, y: b.y }); if (b.trail.length > 240) b.trail.shift(); }
    });
    world.steps++; world.time = world.steps * world.dt;
  }
  return world;
}
export function analyze(world) {
  const currentEnergy = energy(world);
  return { preset: world.preset, steps: world.steps, time: world.time, energy: currentEnergy, relativeEnergyDrift: (currentEnergy - world.initialEnergy) / Math.abs(world.initialEnergy), bodies: world.bodies.map(({ trail, color, ...b }) => b) };
}
export function render(world, { width = 80, height = 24, extent = 10, color = false } = {}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 10 || height < 5 || width > 240 || height > 100 || !Number.isFinite(extent) || extent <= 0) throw new Error('invalid viewport');
  const grid = Array.from({ length: height }, () => Array.from({ length: width }, () => ({ char: ' ', color: 0 })));
  const scale = Math.min((width - 2) / (2 * extent), (height - 2) / extent);
  const plot = (point, char, i) => { const x = Math.round(width / 2 + point.x * scale), y = Math.round(height / 2 - point.y * scale / 2); if (grid[y]?.[x]) grid[y][x] = { char, color: i }; };
  for (let i = 0; i < world.bodies.length; i++) for (const point of world.bodies[i].trail) plot(point, '.', i);
  world.bodies.forEach((b, i) => plot(b, b.mass > 1 ? '*' : 'o', i));
  const codes = [33, 36, 34, 35];
  return grid.map(row => row.map(cell => color && cell.char !== ' ' ? `\x1b[${codes[cell.color]}m${cell.char}\x1b[0m` : cell.char).join('')).join('\n');
}
export function renderSVG(world) {
  const coord = point => [400 + point.x * 28, 310 - point.y * 28];
  const report = analyze(world), paths = world.bodies.map(b => {
    const [x, y] = coord(b);
    return `<polyline points="${b.trail.map(p => coord(p).join(',')).join(' ')}" fill="none" stroke="${b.color}" stroke-opacity="0.55" stroke-width="1.5"/><circle cx="${x}" cy="${y}" r="${b.mass > 1 ? 7 : 4}" fill="${b.color}"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="660" viewBox="0 0 800 660"><rect width="800" height="660" rx="20" fill="#0d1525"/><g font-family="monospace" fill="#e8edf8"><text x="32" y="44" font-size="24">TERMINAL ORBIT LAB</text><text x="32" y="74" fill="#93a4bc">${world.preset} / time ${report.time.toFixed(2)} / velocity Verlet</text></g><path d="M32 310H768M400 100V580" stroke="#1b2940"/>${paths}<text x="32" y="620" font-family="monospace" fill="#93a4bc">Energy drift: ${(report.relativeEnergyDrift * 100).toFixed(4)}%   p pause / r reset / 1,2 presets / q quit</text></svg>\n`;
}
