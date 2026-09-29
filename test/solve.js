// Beam-search bot: proves each level is beatable and reports the solution time.
const D = require('../js/sim.js'); const levels = require('../js/levels.js');
const dt = 1/120, CH = 6; // 0.05s per decision
const ACTIONS = ['run','tap','hold','coast','brake','holdcoast'];
function clone(n){ return { w: structuredClone(n.w), hold: n.hold, plan: n.plan }; }
function advance(n, a){
  const w=n.w, inp=w.input; const deaths0=w.deaths;
  for(let i=0;i<CH;i++){
    inp.right = a!=='coast'&&a!=='brake'&&a!=='holdcoast'; inp.left = a==='brake';
    if(i===0 && (a==='tap'||a==='hold'||a==='holdcoast')){ inp.jumpPressed=true; n.hold = a==='tap'?0.06: 0.5; }
    inp.jump = n.hold>0; n.hold=Math.max(0,n.hold-dt);
    D.step(w,dt); if(w.player.dead||w.finished) break;
  }
}
function solve(level, width=300){
  const w0=D.build(level); let beam=[{w:w0,hold:0,plan:[]}]; let depth=0;
  while(depth<900){
    const next=new Map();
    for(const n of beam){ for(const a of ACTIONS){ const c=clone(n); advance(c,a); c.plan=n.plan.concat(a[0]);
      if(c.w.player.dead) continue; if(c.w.finished) return {ok:true,time:(depth+1)*CH*dt,plan:c.plan};
      const p=c.w.player; const key=[Math.round(p.x/(+process.env.XB||5)),Math.round(p.y/8),Math.round(p.vx/(+process.env.VB||40)),p.grounded?1:0,Math.round(p.vy/150),c.hold>0?1:0].join();
      const score=p.x + (p.grounded?3:0); const ex=next.get(key); if(!ex||score>ex.score){ c.score=score; next.set(key,c);} } }
    beam=[...next.values()].sort((a,b)=>b.score-a.score).slice(0,width); depth++;
    if(!beam.length) return {ok:false,depth,bestX:'none'};
  }
  return {ok:false,depth,bestX:beam[0].w.player.x};
}
const only = process.argv[2];
levels.forEach((lv,i)=>{ if(only && +only!==i) return; const t=Date.now(); const r=solve(lv, +(process.argv[3]||300)); console.log(lv.name, r.ok?`SOLVED in ${r.time.toFixed(1)}s (sim)`:`FAILED depth=${r.depth} bestX=${r.bestX}`, `[${((Date.now()-t)/1000).toFixed(1)}s]`); });
