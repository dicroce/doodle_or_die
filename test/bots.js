// Sanity check for rival skaters: run each level headless for a while and report deaths / finishes.
const D = require('../js/sim.js'); const levels = require('../js/levels.js'); require('../js/bots.js');
const t0 = Date.now(); const secs = +(process.argv[2] || 300), dt = 1/120;
levels.forEach((lv, i) => {
  const bots = D.Bots.create(lv, 4);
  for (let n = 0; n < secs / dt; n++) D.Bots.step(bots, dt, {});
  console.log(lv.name.padEnd(12), bots.map(b => `${b.name}: ☠${b.w.deaths} ✓${b.finishes}`).join('   '));
});
console.log('cpu', ((Date.now() - t0) / 1000).toFixed(1) + 's for ' + secs * levels.length + 's of simulated play x4 rivals');
