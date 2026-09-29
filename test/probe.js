const D=require('../js/sim.js'); const lv=require('../js/levels.js')[1]; const dt=1/120;
const w=D.build(lv); w.input.right=true; let jumped=false;
for(let i=0;i<120*6;i++){ D.step(w,dt); const p=w.player;
  if(i%12==0||p.dead) console.log((i*dt).toFixed(2),'x',p.x.toFixed(0),'y',p.y.toFixed(0),'vy',p.vy.toFixed(0),p.grounded?'G':'A',p.dead?'DEAD '+p.cause:'');
  if(p.dead) break; }
