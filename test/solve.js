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
// Route: [{x,y,tag}] in order.
function route(lv){
  const { rows, gap, step, cuts } = lv.meta, Y0 = lv.start.y, wp = []; HZ = hazardRanges(lv);
  const push = (x,y,tag) => wp.push({x,y,tag});
  for (let i=0;i<rows;i++){
    const d = i%2===0?1:-1, Y = Y0-gap*i;
    if (i===0) push(lv.start.x+60,Y,'row0 start'); else push(d>0?195:1075,Y,`row${i} arrival`);
    const gaps = (cuts[i]||[]).slice().sort((a,b)=>d*(a[0]-b[0]));
    let cx = wp[wp.length-1].x;
    for (const [c0,c1] of gaps){ const fx = d>0? c1+30 : c0-30; densify(wp,cx,fx,Y,d,`row${i}`); push(fx,Y,`row${i} past gap ${c0}-${c1}`); cx=fx; }
    if (i<rows-1){
      const end = d>0? 1090 : 230; densify(wp,cx,end,Y,d,`row${i}`);
      if (d>0){ push(1150,Y-step,`row${i} stair1`); push(1235,Y-2*step,`row${i} stair2`); }
      else { push(130,Y-step,`row${i} stair1`); push(50,Y-2*step,`row${i} stair2`); }
    } else push(lv.finish.x,lv.finish.y,'FINISH');
  }
  return wp;
}
let HZ=[]; // x-ranges swept by moving hazards: never park a waypoint inside one
function hazardRanges(lv){ return lv.objects.flatMap(o=>{
  if(o.type==='pendulum'){ const r=o.len*Math.sin(o.amp*Math.PI/180)+(o.r||22)+40; return [[o.x-r,o.x+r]]; }
  if(o.type==='saw') return [[o.x-o.r-40,o.x+o.r+40+Math.max(0,(o.path&&o.path.dx)||0)]];
  if(o.type==='crusher') return [[o.x-40,o.x+o.w+40]];
  if(o.type==='grinder') return [[o.x-o.r*2-40,o.x+o.r*2+40]];
  return []; }); }
function densify(wp,x0,x1,Y,d,tag){ for(let x=x0+d*250; d*(x1-x)>120; x+=d*250) if(!HZ.some(([a,b])=>x>a&&x<b)) wp.push({x,y:Y,tag:tag+' run'}); }
const reached = (p,g) => p.grounded && Math.abs(p.x-g.x)<28 && Math.abs(p.y-g.y)<8;
function stage(starts, g, width, maxDepth){
  const deaths={}; globalThis.lastDeaths=deaths;
  let beam = starts, found = [], firstDepth=-1;
  for (let depth=0; depth<maxDepth; depth++){
    const next = new Map();
    for (const n of beam) for (const a of NAMES){
      const c=clone(n); advance(c,a);
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
  const wp = route(lv); let states=[{ w:D.build(lv), hold:0, t:0 }];
  for (let k=0;k<wp.length;k++){
    const r = stage(states, wp[k], width, 500);
    if (r.done) return { ok:true, time:r.states[0].t };
    if (r.fail) return { ok:false, at:`waypoint ${k}/${wp.length} "${wp[k].tag}" (${wp[k].x},${wp[k].y}): ${r.fail}` };
    states = r.states;
  }
  return { ok:false, at:'ran out of waypoints without finishing' };
}
const only = process.argv[2];
levels.forEach((lv,i)=>{ if(only!==undefined && +only!==i) return; const t=Date.now(); const r=solve(lv, +(process.argv[3]||60));
  console.log(lv.name, r.ok?`SOLVED in ${r.time.toFixed(1)}s (sim)`:`FAILED at ${r.at}`, `[${((Date.now()-t)/1000).toFixed(1)}s]`); });
