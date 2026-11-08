import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';

const arenaEl = document.querySelector('#arena');
const loading = document.querySelector('.loading');
const modal = document.querySelector('#gameModal');
const modalTitle = document.querySelector('#modalTitle');
const modalEyebrow = document.querySelector('#modalEyebrow');
const modalText = document.querySelector('#modalText');
const playButton = document.querySelector('#playButton');
const toast = document.querySelector('#toast');
const knob = document.querySelector('#controlKnob');
const moveControl = document.querySelector('#moveControl');
const livesLabel = document.querySelector('#playerLives');
const scoreLabel = document.querySelector('#scoreLabel');
const speedLabel = document.querySelector('#speedLabel');
const pauseButton = document.querySelector('#pauseButton');
const soundButton = document.querySelector('#soundButton');

const COLORS = { player: 0x53e6ff, top: 0xff6485, left: 0xffcb69, right: 0x9b83ff };
const SIDE = 4.55;
const LIMIT = 4.72;
const PADDLE_LIMIT = 3.34;
const SHIP_WIDTH = 1.18;
const sides = [
  { id: 'player', name: 'TÚ', axis: 'x', fixed: 4.16, sign: 1, angle: Math.PI, color: COLORS.player, lives: 10, pos: 0, target: 0 },
  { id: 'top', name: 'NOVA', axis: 'x', fixed: -4.16, sign: -1, angle: 0, color: COLORS.top, lives: 10, pos: 0, target: 0 },
  { id: 'left', name: 'KAI', axis: 'z', fixed: -4.16, sign: -1, angle: Math.PI / 2, color: COLORS.left, lives: 10, pos: 0, target: 0 },
  { id: 'right', name: 'VEX', axis: 'z', fixed: 4.16, sign: 1, angle: -Math.PI / 2, color: COLORS.right, lives: 10, pos: 0, target: 0 }
];
let renderer, scene, camera, ball, ballGlow, coreLight, clock;
let running = false, started = false, gameOver = false, paused = false;
let ballVelocity = new THREE.Vector3(), ballSpeed = 4.5, elapsed = 0, launchTimer = 0, round = 1;
let audioOn = false, audioCtx, toastTimer, lastHit = 0;
const player = sides[0];
const shipMeshes = new Map(), shipMaterials = new Map(), sideMeshes = new Map();
const ballRadius = .24;

function init3D() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x080d1b);
  scene.fog = new THREE.FogExp2(0x080d1b, .025);
  camera = new THREE.OrthographicCamera(-5.8, 5.8, 5.8, -5.8, .1, 100);
  camera.position.set(0, 18, 7);
  camera.lookAt(0, 0, 0);
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
  renderer.setSize(arenaEl.clientWidth, arenaEl.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.16;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  arenaEl.insertBefore(renderer.domElement, arenaEl.firstChild);

  scene.add(new THREE.HemisphereLight(0x9bc7ff, 0x090d1d, 2.15));
  const key = new THREE.DirectionalLight(0xe4f0ff, 2.3);
  key.position.set(-3, 9, 5); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = -7; key.shadow.camera.right = 7; key.shadow.camera.top = 7; key.shadow.camera.bottom = -7;
  scene.add(key);
  coreLight = new THREE.PointLight(0x53e6ff, 4, 7); coreLight.position.set(0, 1.4, 0); scene.add(coreLight);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial({ color: 0x0b1429, metalness: .48, roughness: .55 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -.12; ground.receiveShadow = true; scene.add(ground);
  const floorGrid = new THREE.GridHelper(10, 20, 0x25506c, 0x1b2b48); floorGrid.position.y = -.105;
  floorGrid.material.transparent = true; floorGrid.material.opacity = .3; scene.add(floorGrid);
  const centerRing = new THREE.Mesh(new THREE.TorusGeometry(1.33, .013, 8, 72), new THREE.MeshBasicMaterial({ color: 0x4c88bd, transparent: true, opacity: .43 }));
  centerRing.rotation.x = Math.PI / 2; centerRing.position.y = .005; scene.add(centerRing);
  const innerRing = new THREE.Mesh(new THREE.TorusGeometry(.74, .009, 8, 72), new THREE.MeshBasicMaterial({ color: 0x398db0, transparent: true, opacity: .38 }));
  innerRing.rotation.x = Math.PI / 2; innerRing.position.y = .01; scene.add(innerRing);
  addArenaFrame(); addStars();

  for (const side of sides) createShip(side);
  const sphere = new THREE.SphereGeometry(ballRadius, 24, 18);
  ball = new THREE.Mesh(sphere, new THREE.MeshStandardMaterial({ color: 0xf1fdff, emissive: 0x58ddff, emissiveIntensity: 1.6, metalness: .35, roughness: .18 }));
  ball.position.set(0, .45, 0); ball.castShadow = true; scene.add(ball);
  ballGlow = new THREE.Mesh(new THREE.SphereGeometry(.4, 16, 12), new THREE.MeshBasicMaterial({ color: 0x41dfff, transparent: true, opacity: .13 }));
  ball.add(ballGlow);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(.37, .018, 6, 32), new THREE.MeshBasicMaterial({ color: 0x9cf6ff, transparent: true, opacity: .65 }));
  halo.rotation.x = Math.PI / 2; halo.position.y = -.18; ball.add(halo);
  clock = new THREE.Clock();
  window.addEventListener('resize', resize);
  resize(); loading.remove();
  renderer.setAnimationLoop(animate);
}

function addArenaFrame() {
  const floorEdge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(10.03, .15, 10.03)), new THREE.LineBasicMaterial({ color: 0x5280b0, transparent: true, opacity: .4 }));
  floorEdge.position.y = .02; scene.add(floorEdge);
  for (const side of sides) {
    const horizontal = side.axis === 'x';
    const geom = new THREE.BoxGeometry(horizontal ? 8.85 : .07, .16, horizontal ? .07 : 8.85);
    const mat = new THREE.MeshStandardMaterial({ color: side.color, emissive: side.color, emissiveIntensity: .65, metalness: .3, roughness: .35, transparent: true, opacity: .8 });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(horizontal ? 0 : side.fixed, .05, horizontal ? side.fixed : 0); scene.add(mesh); sideMeshes.set(side.id, mesh);
  }
  for (let x of [-4.94, 4.94]) for (let z of [-4.94, 4.94]) {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(.11, .13, .52, 8), new THREE.MeshStandardMaterial({ color: 0x253d62, metalness: .55, roughness: .28, emissive: 0x12223c }));
    pillar.position.set(x, .18, z); pillar.castShadow = true; scene.add(pillar);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(.12, 12, 8), new THREE.MeshBasicMaterial({ color: 0x53e6ff })); cap.position.set(x, .47, z); scene.add(cap);
  }
}

function addStars() {
  const positions = [];
  for (let i = 0; i < 360; i++) {
    const radius = 8 + Math.random() * 18, a = Math.random() * Math.PI * 2;
    positions.push(Math.cos(a) * radius, 1 + Math.random() * 11, Math.sin(a) * radius - 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0x8db7f5, size: .035, transparent: true, opacity: .6, sizeAttenuation: true })));
}

function createShip(side) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: side.color, emissive: side.color, emissiveIntensity: .72, metalness: .58, roughness: .24 });
  shipMaterials.set(side.id, bodyMat);
  const body = new THREE.Mesh(new THREE.ConeGeometry(.45, .78, 4), bodyMat);
  body.rotation.x = Math.PI / 2; body.rotation.z = Math.PI / 4;
  // custom low-profile arrow ship; tip faces inward
  body.geometry.dispose();
  body.geometry = new THREE.BufferGeometry();
  const verts = new Float32Array([0,.31,.52, -.36,.31,-.27, .36,.31,-.27, 0,.31,-.12, 0,.17,.12, -.36,.17,-.27, .36,.17,-.27]);
  body.geometry.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  body.geometry.setIndex([0,1,3, 0,3,2, 4,5,6, 0,4,1, 0,2,4, 1,5,3, 2,3,6]); body.geometry.computeVertexNormals();
  group.add(body);
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(.105, 12, 8), new THREE.MeshBasicMaterial({ color: 0xe7fcff })); cockpit.scale.set(.85,.45,1.35); cockpit.position.set(0,.34,.02); group.add(cockpit);
  const wingline = new THREE.Mesh(new THREE.BoxGeometry(.83,.035,.06), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent:true, opacity:.7 })); wingline.position.set(0,.32,-.17); group.add(wingline);
  const engine = new THREE.PointLight(side.color, 1.3, 1.3); engine.position.set(0,.18,-.34); group.add(engine);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(.65, 20), new THREE.MeshBasicMaterial({ color: side.color, transparent:true, opacity:.09 })); shadow.rotation.x=-Math.PI/2; shadow.position.y=.015; group.add(shadow);
  group.rotation.y = side.angle;
  scene.add(group); shipMeshes.set(side.id, group); side.pos = 0; setShipPosition(side);
  addNameplate(side);
}

function addNameplate(side) {
  const canvas = document.createElement('canvas'); canvas.width=256; canvas.height=64;
  const ctx=canvas.getContext('2d'); ctx.font='600 25px Arial'; ctx.textAlign='center'; ctx.fillStyle=`#${side.color.toString(16).padStart(6,'0')}`; ctx.shadowColor=ctx.fillStyle; ctx.shadowBlur=14; ctx.fillText(side.name,128,40);
  const texture=new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,opacity:.85,depthWrite:false}));
  sprite.scale.set(1.2,.3,1);
  if(side.axis==='x') sprite.position.set(0,.2,side.fixed<0?-4.72:4.7); else sprite.position.set(side.fixed<0?-4.7:4.7,.2,0);
  scene.add(sprite); side.nameplate=sprite;
}

function setShipPosition(side) {
  const obj=shipMeshes.get(side.id); if(!obj) return;
  if(side.axis==='x') obj.position.set(side.pos,.12,side.fixed); else obj.position.set(side.fixed,.12,side.pos);
  if(side.nameplate) {
    const status=side.lives>0;
    side.nameplate.visible=status;
  }
  const material=shipMaterials.get(side.id);
  if(material) { material.transparent=side.lives<=0; material.opacity=side.lives<=0?.16:1; material.emissiveIntensity=side.lives<=0?0:.72; }
}

function resize() {
  if(!renderer||!camera) return;
  const w=Math.max(1,arenaEl.clientWidth),h=Math.max(1,arenaEl.clientHeight);
  renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix();
}

function resetBall() {
  ball.position.set(0,.48,0); ball.rotation.set(0,0,0); ballSpeed=Math.min(4.5+(round-1)*.18,6.6);
  const alive=sides.filter(s=>s.lives>0);
  if(!alive.length) return;
  const target=alive[Math.floor(Math.random()*alive.length)];
  let tx=0,tz=0;
  if(target.axis==='x'){tx=(Math.random()-.5)*5;tz=target.fixed<0?-4.7:4.7}
  else{tx=target.fixed<0?-4.7:4.7;tz=(Math.random()-.5)*5}
  const dir=new THREE.Vector3(tx,0,tz).normalize();
  ballVelocity.set(dir.x*ballSpeed,0,dir.z*ballSpeed);
  launchTimer=.9;
}

function startGame() {
  sides.forEach(s=>{s.lives=10;s.pos=0;s.target=0;setShipPosition(s)});
  document.querySelector('.arena-wrap').classList.remove('eliminated');
  round=1;elapsed=0;gameOver=false;paused=false;started=true;running=true;
  document.querySelector('#roundLabel').textContent=`ARENA ${String(round).padStart(2,'0')}`;
  pauseButton.innerHTML='<span class="pause-icon">Ⅱ</span>'; updateHud(); resetBall(); modal.classList.add('hidden'); showToast('¡QUE COMIENCE EL COMBATE!');
}

function finishGame(win) {
  running=false;gameOver=true;paused=false;
  modalEyebrow.textContent=win?'VICTORIA · ÚLTIMO PILOTO EN PIE':'FIN DE LA PARTIDA';
  modalTitle.innerHTML=win?'¡Arena <span>conquistada!</span>':'Te han <span>eliminado.</span>';
  modalText.textContent=win?`Has sobrevivido a los tres rivales en ${formatTime(elapsed)}. La arena es tuya, piloto.`:`Tu nave se quedó sin vidas tras ${formatTime(elapsed)}. Reagrúpate y vuelve a intentarlo.`;
  document.querySelector('.howto').style.display='none';
  playButton.innerHTML=win?'JUGAR DE NUEVO <span>↗</span>':'REINTENTAR <span>↗</span>';
  document.querySelector('.modal-tip').textContent='CONSEJO · ANTICIPA HACIA DÓNDE VA EL NÚCLEO';
  modal.classList.remove('hidden');playButton.focus();
  if(!win)document.querySelector('.arena-wrap').classList.add('eliminated');
}

function pauseGame() {
  if(!started||gameOver)return;
  paused=!paused;
  if(paused){running=false;modalEyebrow.textContent='PARTIDA EN PAUSA';modalTitle.innerHTML='Tómate un <span>respiro.</span>';modalText.textContent='La arena está congelada. Cuando quieras, vuelve al combate.';document.querySelector('.howto').style.display='none';playButton.innerHTML='CONTINUAR <span>↗</span>';document.querySelector('.modal-tip').textContent='';modal.classList.remove('hidden');pauseButton.innerHTML='<span class="pause-icon">▶</span>'}
  else{running=true;modal.classList.add('hidden');pauseButton.innerHTML='<span class="pause-icon">Ⅱ</span>';clock.getDelta()}
}

function updateHud() {
  livesLabel.innerHTML=`${String(player.lives).padStart(2,'0')} <span>♥</span>`;
  scoreLabel.innerHTML=`SUPERVIVENCIA <b>${formatTime(elapsed)}</b>`;
  speedLabel.textContent=`VELOCIDAD ${(ballSpeed/4.5).toFixed(1)}×`;
  sides.filter(s=>s.id!=='player').forEach(side=>{
    const n=document.querySelector(`#${side.id}Lives`);
    if(n)n.textContent=side.lives;
    const badge=document.querySelector(`#${side.id}Status`);
    if(badge)badge.classList.toggle('out',side.lives<=0);
  });
}
function formatTime(seconds){const m=Math.floor(seconds/60),s=Math.floor(seconds%60);return`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`}
function showToast(text){toast.textContent=text;toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),1350)}

function loseLife(side) {
  side.lives=Math.max(0,side.lives-1);setShipPosition(side);sound(side.lives===0?140:230,.12);
  if(side.id==='player'){
    updateHud();showToast(side.lives===0?'NAVE ELIMINADA':'¡VIDA PERDIDA!');
    if(side.lives<=0){running=false;setTimeout(()=>finishGame(false),450);return}
  } else showToast(side.lives===0?`${side.name} ELIMINADO`:`${side.name} PIERDE UNA VIDA`);
  updateHud();
  const remaining=sides.filter(s=>s.lives>0);
  if(remaining.length===1){running=false;setTimeout(()=>finishGame(remaining[0].id==='player'),650);return}
  round++;document.querySelector('#roundLabel').textContent=`ARENA ${String(round).padStart(2,'0')}`;
  resetBall();
}

function impact(side, coord) {
  const offset=THREE.MathUtils.clamp((coord-side.pos)/.62,-1,1);
  side.target=THREE.MathUtils.clamp(side.pos,-PADDLE_LIMIT,PADDLE_LIMIT);
  setShipPosition(side);
  const sign=side.sign;
  if(side.axis==='x'){
    ball.position.z=side.fixed>0?SIDE-ballRadius:SIDE*-1+ballRadius;
    ballVelocity.z=-sign*(ballSpeed*.85);
    ballVelocity.x=(offset*.82+(Math.random()-.5)*.24)*ballSpeed;
  }else{
    ball.position.x=side.fixed>0?SIDE-ballRadius:SIDE*-1+ballRadius;
    ballVelocity.x=-sign*(ballSpeed*.85);
    ballVelocity.z=(offset*.82+(Math.random()-.5)*.24)*ballSpeed;
  }
  ballVelocity.y=0;ballVelocity.normalize().multiplyScalar(ballSpeed);ballSpeed=Math.min(ballSpeed+.12,7.2);
  ball.position.y=.48;lastHit=performance.now();sound(510,.045);showToast('¡BUEN REBOTE!');
  const flash=shipMaterials.get(side.id);if(flash){flash.emissiveIntensity=2;setTimeout(()=>{if(side.lives>0)flash.emissiveIntensity=.72},130)}
}

function handleEdge(axis,sign) {
  const side=sides.find(s=>s.lives>0&&((axis==='z'&&s.axis==='x'&&s.sign===sign)||(axis==='x'&&s.axis==='z'&&s.sign===sign)));
  const coord=axis==='z'?ball.position.x:ball.position.z;
  const coordVelocity=axis==='z'?ballVelocity.x:ballVelocity.z;
  if(side){
    if(Math.abs(coord-side.pos)<=SHIP_WIDTH/2+.24){impact(side,coord)}else loseLife(side);
  }else{
    if(axis==='z'){ball.position.z=sign*(LIMIT-ballRadius);ballVelocity.z*=-1}else{ball.position.x=sign*(LIMIT-ballRadius);ballVelocity.x*=-1}
    ballSpeed=Math.min(ballSpeed+.07,7.2);ballVelocity.normalize().multiplyScalar(ballSpeed);sound(270,.04);
  }
}

function updateBots(dt) {
  for(const side of sides.slice(1)){
    if(side.lives<=0)continue;
    let desired=side.pos;
    const toward=side.axis==='x'?ballVelocity.z*side.sign>0:ballVelocity.x*side.sign>0;
    if(toward){
      const remaining=side.axis==='x'?Math.abs(side.fixed-ball.position.z):Math.abs(side.fixed-ball.position.x);
      const axisVel=side.axis==='x'?ballVelocity.z:ballVelocity.x;
      const t=THREE.MathUtils.clamp(remaining/Math.max(.5,Math.abs(axisVel)),0,1.2);
      const predicted=(side.axis==='x'?ball.position.x+ballVelocity.x*t:ball.position.z+ballVelocity.z*t);
      desired=THREE.MathUtils.clamp(predicted,-PADDLE_LIMIT,PADDLE_LIMIT);
    }else if(Math.random()<dt*.22){desired=(Math.random()-.5)*4.8}
    side.target=desired;
    const agility=side.id==='top'?3.1:side.id==='left'?2.8:3.3;
    side.pos=THREE.MathUtils.damp(side.pos,side.target,agility,dt);setShipPosition(side);
  }
}

function animate() {
  const dt=Math.min(clock.getDelta(),.045);
  if(running){
    elapsed+=dt;
    if(launchTimer>0){launchTimer=Math.max(0,launchTimer-dt);ball.position.y=.45+Math.sin((.9-launchTimer)*8)*.1}
    else{
      ball.position.x+=ballVelocity.x*dt;ball.position.z+=ballVelocity.z*dt;
      ball.position.y=.47+Math.abs(Math.sin(elapsed*8))*.12;
      ball.rotation.x+=ballVelocity.z*dt*.3;ball.rotation.z-=ballVelocity.x*dt*.3;
      if(ball.position.z>LIMIT-ballRadius)handleEdge('z',1);
      else if(ball.position.z<-(LIMIT-ballRadius))handleEdge('z',-1);
      else if(ball.position.x>LIMIT-ballRadius)handleEdge('x',1);
      else if(ball.position.x<-(LIMIT-ballRadius))handleEdge('x',-1);
    }
    updateBots(dt);updateHud();
  }
  ballGlow.material.opacity=.1+Math.sin(performance.now()*.006)*.035;
  coreLight.intensity=3.4+Math.sin(performance.now()*.004)*.8;
  renderer.render(scene,camera);
}

function movePlayer(value){player.target=THREE.MathUtils.clamp(value,-PADDLE_LIMIT,PADDLE_LIMIT);player.pos=player.target;setShipPosition(player);knob.style.left=`${50+(player.pos/PADDLE_LIMIT)*45}%`;moveControl.setAttribute('aria-valuenow',String(Math.round(50+(player.pos/PADDLE_LIMIT)*50)))}
function pointerPosition(event){const rect=moveControl.getBoundingClientRect();const buttonWidth=44;const p=THREE.MathUtils.clamp((event.clientX-rect.left-buttonWidth)/(rect.width-buttonWidth*2),0,1);movePlayer((p-.5)*PADDLE_LIMIT*2)}
moveControl.addEventListener('pointerdown',e=>{e.preventDefault();moveControl.setPointerCapture(e.pointerId);pointerPosition(e)});
moveControl.addEventListener('pointermove',e=>{if(e.buttons||e.pressure>0)pointerPosition(e)});
moveControl.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();movePlayer(player.pos+(e.key==='ArrowLeft'?-0.4:.4))}});
document.querySelector('#leftButton').addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();movePlayer(player.pos-.55)});
document.querySelector('#rightButton').addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();movePlayer(player.pos+.55)});
window.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key.toLowerCase()==='a')movePlayer(player.pos-.32);if(e.key==='ArrowRight'||e.key.toLowerCase()==='d')movePlayer(player.pos+.32);if(e.key==='Escape'||e.key.toLowerCase()==='p')pauseGame()});
playButton.addEventListener('click',()=>{document.querySelector('.howto').style.display='flex';document.querySelector('.modal-tip').textContent='TAMBIÉN PUEDES USAR ← → O A / D';if(paused){paused=false;running=true;modal.classList.add('hidden');pauseButton.innerHTML='<span class="pause-icon">Ⅱ</span>';clock.getDelta()}else startGame()});
pauseButton.addEventListener('click',pauseGame);
soundButton.addEventListener('click',()=>{audioOn=!audioOn;soundButton.classList.toggle('sound-off',!audioOn);soundButton.setAttribute('aria-label',audioOn?'Desactivar sonido':'Activar sonido');if(audioOn)sound(420,.08)});
function sound(freq,duration){if(!audioOn)return;try{audioCtx??=new AudioContext();const osc=audioCtx.createOscillator(),gain=audioCtx.createGain();osc.type='sine';osc.frequency.value=freq;gain.gain.setValueAtTime(.055,audioCtx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+duration);osc.connect(gain);gain.connect(audioCtx.destination);osc.start();osc.stop(audioCtx.currentTime+duration)}catch{}}

init3D();