// Waypoint bot: plays each level stage by stage (row entries, gap far-sides, stair steps, finish) using a
// small beam search per stage, so "right, up, left, up..." routes work. Proves levels are beatable and, on
// failure, names the waypoint it could not reach.
// usage: node test/solve.js [levelIndex] [beamWidth]
const D = require('../js/sim.js'); const levels = require('../js/levels.js');
const dt = 1/120, CH = 6; // one decision = 0.05s
// action: [right, left, jumpPress, holdSeconds]
const ACT = { run:[1,0,0,0], tap:[1,0,1,0.06], hold:[1,0,1,0.5], coast:[0,0,0,0], L:[0,1,0,0], Lt:[0,1,1,0.06], Lh:[0,1,1,0.5] };
const NAMES = Object.keys(ACT);
const clone = (n) => ({ w: structuredClone(n.w), hold: n.hold, t: n.t });
function advance(n, name){
  const [r,l,j,h]=ACT[name], w=n.w, inp=w.input;
  for(let i=0;i<CH;i++){
    inp.right=!!r; inp.left=!!l;
    if(i===0 && j){ inp.jumpPressed=true; n.hold=h; }
    inp.jump = n.hold>0; n.hold=Math.max(0,n.hold-dt);
    D.step(w,dt); if(w.player.dead||w.finished) break;
  }
  n.t += CH*dt;
}
require('../js/bots.js'); const route = D.Bots.route;
const reached = (p,g) => p.grounded && Math.abs(p.x-g.x)<28 && Math.abs(p.y-g.y)<8;
function stage(starts, g, width, maxDepth){
  const deaths={}; globalThis.lastDeaths=deaths;
  let beam = starts, found = [], firstDepth=-1;
  for (let depth=0; depth<maxDepth; depth++){
    const next = new Map();
    for (const n of beam) for (const a of NAMES){
      const c=clone(n); advance(c,a); c.plan={a,prev:n.plan};
      if (c.w.player.dead) { const k=c.w.player.cause+'@'+Math.round(c.w.player.x/20)*20; deaths[k]=(deaths[k]||0)+1; continue; }
      if (c.w.finished) return { done:true, states:[c] };
      const p=c.w.player;
      if (reached(p,g)) { found.push(c); if(firstDepth<0) firstDepth=depth; continue; }
      const key=[Math.round(p.x/25),Math.round(p.y/8),Math.round(p.vx/150),p.grounded?1:0,Math.round(p.vy/150),c.hold>0?1:0].join();
      const score=-(Math.abs(p.x-g.x)+3*Math.abs(p.y-g.y))-(p.grounded?0:60);
      const ex=next.get(key); if(!ex||score>ex.score){ c.score=score; next.set(key,c); }
    }
    if (firstDepth>=0 && depth>=firstDepth+4) break;
    beam=[...next.values()].sort((a,b)=>b.score-a.score).slice(0,width);
    if(!beam.length && !found.length) return { fail:'all lines died '+JSON.stringify(Object.entries(deaths).sort((a,b)=>b[1]-a[1]).slice(0,6)) };
  }
  if (!found.length) return { fail:'timed out' };
  // keep a spread of arrival states for the next stage (different speeds/timings)
  const seen=new Set(), out=[];
  for (const c of found.sort((a,b)=>a.t-b.t)) { const k=Math.round(c.w.player.vx/60)+':'+Math.round(c.t*10); if(!seen.has(k)){ seen.add(k); out.push(c); } if(out.length>=24) break; }
  return { states: out };
}
function solve(lv, width){
  const wp = route(lv); let states=[{ w:D.build(lv), hold:0, t:0, plan:null }];
  for (let k=0;k<wp.length;k++){
    const r = stage(states, wp[k], width, 500);
    if (r.done) { const plan=[]; for(let q=r.states[0].plan;q;q=q.prev) plan.push(q.a); return { ok:true, time:r.states[0].t, plan:plan.reverse() }; }
    if (r.fail) return { ok:false, at:`waypoint ${k}/${wp.length} "${wp[k].tag}" (${wp[k].x},${wp[k].y}): ${r.fail}` };
    states = r.states;
  }
  return { ok:false, at:'ran out of waypoints without finishing' };
}
module.exports = { solve, ACT, CH, dt };
if (require.main === module) {
const only = process.argv[2];
levels.forEach((lv,i)=>{ if(only!==undefined && +only!==i) return; const t=Date.now(); const r=solve(lv, +(process.argv[3]||60));
  console.log(lv.name, r.ok?`SOLVED in ${r.time.toFixed(1)}s (sim)`:`FAILED at ${r.at}`, `[${((Date.now()-t)/1000).toFixed(1)}s]`); });
}
