const D = require('../js/sim.js');
const dt = 1/120;
function mk(objs){ return D.build({name:'t',w:5000,h:540,start:{x:100,y:400},finish:{x:4900},objects:[{type:'solid',x:0,y:400,w:5000,h:300},...objs]}); }
function run(w, secs, fn){ for(let i=0;i<secs/dt;i++){ fn&&fn(i*dt,w); D.step(w,dt);} }
// full speed
let w=mk([]); w.input.right=true; run(w,3);
console.log('top speed', w.player.vx.toFixed(0));
// ollie held
let minY=1e9,x0,x1; w.input.jumpPressed=true; w.input.jump=true; x0=w.player.x;
run(w,1.2,(t,w)=>{ if(t>0.9) w.input.jump=false; minY=Math.min(minY,w.player.y); });
console.log('held ollie height', (400-minY).toFixed(0), 'airborne?', !w.player.grounded);
// tap ollie
w=mk([]); w.input.right=true; run(w,3); minY=1e9; w.input.jumpPressed=true; w.input.jump=true;
let landX=null, airStart=w.player.x;
run(w,1.2,(t,w)=>{ if(t>0.03) w.input.jump=false; minY=Math.min(minY,w.player.y); });
console.log('tap ollie height', (400-minY).toFixed(0));
// gap distance: how wide a gap can be cleared at full speed
for (const gap of [200,240,260,280,300,330]) {
  const ww=D.build({name:'t',w:5000,h:540,start:{x:100,y:400},finish:{x:4900},objects:[{type:'solid',x:0,y:400,w:1500,h:300},{type:'solid',x:1500+gap,y:400,w:3000,h:300}]});
  ww.input.right=true; ww.input.jump=false; let jumped=false;
  run(ww,6,(t,w)=>{ const p=w.player; if(!jumped&&p.x>=1500-14){ w.input.jumpPressed=true; w.input.jump=true; jumped=true;} });
  console.log('gap',gap, ww.player.dead?'FELL':'made it', 'x',ww.player.x.toFixed(0));
}
// curb: 24px, no ollie -> should bonk; with ollie fine
for (const useJump of [false,true]) {
  const ww=mk([{type:'solid',x:900,y:370,w:80,h:30}]); ww.input.right=true; let j=false;
  run(ww,5,(t,w)=>{ const p=w.player; if(useJump&&!j&&p.x>=900-60){ w.input.jumpPressed=true; w.input.jump=true; j=true;} if(j&&t>0) {} });
  console.log('30px curb, ollie?',useJump,'x',ww.player.x.toFixed(0),'y',ww.player.y.toFixed(0));
}
// ramp launch
{ const ww=mk([{type:'ramp',x:1000,y:352,w:120,h:48,dir:1}]); ww.input.right=true; let apex=1e9, spd;
  run(ww,4,(t,w)=>{ apex=Math.min(apex,w.player.y); if(w.player.x>1118&&w.player.x<1122) spd=w.player.vx; });
  console.log('ramp: speed at lip',spd&&spd.toFixed(0),'apex height above ground',(400-apex).toFixed(0));
}

// grind: ollie over a spike bed that is too wide to clear, grind across it
{ const mk=(g)=>{ const ww=D.build({name:'t',w:5000,h:540,start:{x:100,y:400},finish:{x:4900},objects:[{type:'solid',x:0,y:400,w:5000,h:300},{type:'spikes',x:700,y:378,w:400,h:22,facing:'up'}]});
    ww.input.right=true; let j=false,gr=false,minY=1e9;
    run(ww,6,(t,w)=>{ const p=w.player; if(!j&&p.x>=700-60){w.input.jumpPressed=true;w.input.jump=true;j=true;} if(j&&p.airT>0.3)w.input.jump=false; if(g&&j&&!gr&&p.airT>0.25){w.input.grindPressed=true;gr=true;} });
    return ww; };
  console.log('spike bed 400px wide, no grind ->', mk(false).player.dead?'DEAD':'alive', '| with grind ->', mk(true).player.dead?'DEAD':'alive'); }
