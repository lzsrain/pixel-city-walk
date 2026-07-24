/* Pixel City Walk engine — city-agnostic.
   Reads all content (zones, scenes, NPC copy, theme, assets, UI strings)
   from a city.json loaded at startup. No city-specific data lives here. */
(function(){
  'use strict';

  let city=null;            // loaded city data
  let WORLD={w:1536,h:1024};
  let zones={};
  let waters=[];
  const keys=new Set(),visited=new Set(),route=[];

  const worldImage=new Image();
  const ticketImage=new Image();
  const sprite=new Image();

  const canvas=document.querySelector('#game');
  const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
  const overview=document.querySelector('#overview');
  const onboarding=document.querySelector('#onboarding');
  const mapViewport=document.querySelector('#mapViewport');
  const mapCanvas=document.querySelector('#mapCanvas');

  const player={x:760,y:575,dir:'down',frame:1,anim:0,steps:0,moving:false,target:null};
  const camera={x:0,y:0,zoom:1.65};
  let currentZone=null,nearScene=null,activeScene=null,playerName='旅行者',guideIndex=0,mapScale=1,mapX=0,mapY=0,mapDrag=null,last=performance.now();

  /* ---- city loading ---- */
  async function loadCity(path){
    const res=await fetch(path);
    if(!res.ok)throw new Error('city.json '+res.status);
    return res.json();
  }

  function applyCity(c){
    city=c;
    WORLD=c.world;
    zones=c.zones;
    waters=c.waters||[];
    player.x=c.player.startX;
    player.y=c.player.startY;
    camera.zoom=c.camera.zoom;
    worldImage.src=c.assets.map;
    ticketImage.src=c.assets.ticketBase;
    sprite.src=c.assets.sprite;

    // theme variables -> :root
    const root=document.documentElement;
    const t=c.theme;
    const set=(k,v)=>root.style.setProperty(k,v);
    set('--ink',t.ink);set('--paper',t.paper);set('--deep',t.deep);
    set('--jade',t.jade);set('--mint',t.mint);set('--gold',t.gold);
    set('--red',t.red);set('--water',t.water);
    // CSS background-image variables (must be url(...) strings)
    set('--city-map-url',`url('${c.assets.map}')`);
    set('--sprite-url',`url('${c.assets.sprite}')`);

    // NPC sprite filter
    const npcSprite=document.querySelector('.npc-sprite');
    if(c.npc.spriteFilter)npcSprite.style.filter=c.npc.spriteFilter;

    // brandmark + title
    document.querySelector('.brandmark').textContent=c.brandmark;
    document.title=`${c.subtitle} · ${c.name}像素世界`;

    // map image
    const mapImg=mapCanvas.querySelector('img');
    mapImg.src=c.assets.map;
    mapImg.alt=`抽象${c.name}像素世界地图`;

    // asset credit
    const credit=document.querySelector('.asset-credit');
    if(c.ui.assetCredit)credit.textContent=c.ui.assetCredit;
  }

  /* ---- helpers ---- */
  const $=s=>document.querySelector(s);
  const fmt=(tpl,name)=>tpl.replace(/\{name\}/g,name);
  const themeColor=(k,fallback)=>city?city.theme[k]||fallback:fallback;

  /* ---- map transforms ---- */
  function clampMapPosition(){const maxX=Math.max(0,(mapCanvas.offsetWidth*mapScale-mapViewport.clientWidth)/2),maxY=Math.max(0,(mapCanvas.offsetHeight*mapScale-mapViewport.clientHeight)/2);mapX=Math.max(-maxX,Math.min(maxX,mapX));mapY=Math.max(-maxY,Math.min(maxY,mapY))}
  function applyMapTransform(){clampMapPosition();mapCanvas.style.transform=`translate3d(${mapX}px,${mapY}px,0) scale(${mapScale})`;$('.map-drag-tip').textContent=mapScale>1?city.pins.tipDrag:city.pins.tipZoom}
  function setMapZoom(value){mapScale=Math.max(1,Math.min(2.4,value));if(mapScale===1){mapX=0;mapY=0}applyMapTransform()}
  function resetMapView(){mapScale=1;mapX=0;mapY=0;applyMapTransform()}
  function fit(){const r=canvas.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(r.width*d);canvas.height=Math.round(r.height*d);ctx.setTransform(d,0,0,d,0,0);ctx.imageSmoothingEnabled=false}
  function view(){const w=canvas.clientWidth/camera.zoom,h=canvas.clientHeight/camera.zoom;return{x:Math.max(0,Math.min(WORLD.w-w,camera.x)),y:Math.max(0,Math.min(WORLD.h-h,camera.y)),w,h}}

  /* ---- drawing ---- */
  function drawMarker(s,i,v){
    const gold=themeColor('gold','#f4c64f'),mint=themeColor('mint','#75c6a3'),ink=themeColor('ink','#17241d'),paper=themeColor('paper','#fff2ca');
    const pulse=1+Math.sin(performance.now()/220+i)*.08;
    ctx.save();ctx.translate(s.x,s.y);ctx.scale(pulse,pulse);
    ctx.fillStyle=visited.has(currentZone+':'+i)?mint:gold;
    ctx.strokeStyle=ink;ctx.lineWidth=3/camera.zoom;
    ctx.beginPath();ctx.arc(0,0,14/camera.zoom,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.fillStyle=ink;ctx.font=`900 ${13/camera.zoom}px sans-serif`;ctx.textAlign='center';ctx.fillText('✦',0,4/camera.zoom);
    ctx.restore();
    ctx.font=`900 ${10/camera.zoom}px sans-serif`;ctx.textAlign='center';
    const tw=ctx.measureText(s.name).width+12/camera.zoom;
    ctx.fillStyle=paper;ctx.strokeStyle=ink;ctx.lineWidth=2/camera.zoom;
    ctx.fillRect(s.x-tw/2,s.y+18/camera.zoom,tw,20/camera.zoom);
    ctx.strokeRect(s.x-tw/2,s.y+18/camera.zoom,tw,20/camera.zoom);
    ctx.fillStyle=ink;ctx.fillText(s.name,s.x,s.y+32/camera.zoom)
  }

  function drawPlayer(){
    const row=player.moving?(player.dir==='down'?1:player.dir==='up'?2:3):0;
    const frame=player.moving?player.frame:0;
    const spriteW=24/camera.zoom,spriteH=48/camera.zoom,bob=player.moving&&frame%2===0?-1/camera.zoom:0;
    ctx.save();ctx.translate(Math.round(player.x),Math.round(player.y+bob));
    if(player.dir==='left')ctx.scale(-1,1);
    ctx.fillStyle='rgba(3,12,8,.3)';ctx.beginPath();ctx.ellipse(0,8/camera.zoom,8/camera.zoom,3/camera.zoom,0,0,Math.PI*2);ctx.fill();
    ctx.imageSmoothingEnabled=false;
    ctx.drawImage(sprite,frame*8,row*16,8,16,-spriteW/2,-spriteH+9/camera.zoom,spriteW,spriteH);
    ctx.restore()
  }

  function draw(){
    const cw=canvas.clientWidth,ch=canvas.clientHeight;ctx.clearRect(0,0,cw,ch);
    if(!currentZone||!worldImage.complete)return;
    const v=view();ctx.save();ctx.scale(camera.zoom,camera.zoom);ctx.translate(-v.x,-v.y);
    ctx.drawImage(worldImage,0,0,WORLD.w,WORLD.h);
    ctx.fillStyle='rgba(8,36,23,.05)';ctx.fillRect(0,0,WORLD.w,WORLD.h);
    zones[currentZone].scenes.forEach((s,i)=>drawMarker(s,i,v));
    drawPlayer();ctx.restore()
  }

  /* ---- zones ---- */
  /* ---- water collision: blocks movement into water rectangles ---- */
  const PLAYER_RADIUS=10;
  function inWater(x,y){
    for(let i=0;i<waters.length;i++){
      const w=waters[i];
      if(x+PLAYER_RADIUS>w.x&&x-PLAYER_RADIUS<w.x+w.w&&y+PLAYER_RADIUS>w.y&&y-PLAYER_RADIUS<w.y+w.h)return true;
    }
    return false;
  }

  function nearestZoneId(x,y){return Object.entries(zones).reduce((best,[id,z])=>{const distance=(z.x-x)**2+(z.y-y)**2;return distance<best.distance?{id,distance}:best},{id:null,distance:Infinity}).id}
  function setCurrentZone(id,record=true){if(!id||!zones[id])return;currentZone=id;const z=zones[id];$('#zoneName').textContent=z.name;$('#zoneIcon').textContent=z.icon;if(record&&route.at(-1)!==id)route.push(id)}
  function enterZone(id){const z=zones[id];let tx=z.x,ty=z.y;if(inWater(tx,ty)){for(let r=20;r<200;r+=10){for(let a=0;a<360;a+=45){const rx=tx+Math.cos(a*Math.PI/180)*r,ry=ty+Math.sin(a*Math.PI/180)*r;if(!inWater(rx,ry)){tx=rx;ty=ry;break}}if(!inWater(tx,ty))break}}player.x=tx;player.y=ty;player.target=null;if(route.length===0)player.steps=0;player.dir='down';camera.x=tx-canvas.clientWidth/camera.zoom/2;camera.y=ty-canvas.clientHeight/camera.zoom/2;setCurrentZone(id,true);overview.classList.add('hidden');$('#back').hidden=false;$('#finishTrip').hidden=false;canvas.focus();draw()}
  function showOverview(){overview.classList.remove('hidden');currentZone=null;player.target=null;nearScene=null;$('#back').hidden=true;$('#finishTrip').hidden=route.length===0;$('#zoneName').textContent=city.ui.zoneWaitName;$('#zoneIcon').textContent=city.ui.zoneWaitIcon}

  /* ---- update loop ---- */
  function update(dt){
    if(!currentZone)return;
    let dx=0,dy=0;
    if(keys.has('w')||keys.has('arrowup'))dy--;
    if(keys.has('s')||keys.has('arrowdown'))dy++;
    if(keys.has('a')||keys.has('arrowleft'))dx--;
    if(keys.has('d')||keys.has('arrowright'))dx++;
    if(!dx&&!dy&&player.target){dx=player.target.x-player.x;dy=player.target.y-player.y;if(Math.hypot(dx,dy)<7){player.target=null;dx=dy=0}}
    player.moving=!!(dx||dy);
    if(player.moving){
      const len=Math.hypot(dx,dy),dist=Math.min(2.8,dt*.16);
      dx=dx/len*dist;dy=dy/len*dist;
      // 分轴碰撞：分别尝试 x 和 y 方向移动，被水挡住的轴不移动
      const nextX=Math.max(24,Math.min(WORLD.w-24,player.x+dx));
      const nextY=Math.max(24,Math.min(WORLD.h-24,player.y+dy));
      if(!inWater(nextX,player.y))player.x=nextX;else dx=0;
      if(!inWater(player.x,nextY))player.y=nextY;else dy=0;
      // 如果两个方向都被挡，清除点击移动目标，避免卡住
      if(dx===0&&dy===0)player.target=null;
      player.steps+=dist/3;player.anim+=dt;
      if(player.anim>=105){player.anim%=105;player.frame=(player.frame+1)%4}
      if(Math.abs(dx)>Math.abs(dy))player.dir=dx<0?'left':'right';else if(dy!==0)player.dir=dy<0?'up':'down';
      const nextZone=nearestZoneId(player.x,player.y);
      if(nextZone!==currentZone)setCurrentZone(nextZone,true);
      $('#walkState').textContent='行走中';$('#steps').textContent=Math.floor(player.steps);$('#frameNo').textContent=player.frame+1
    }else{
      player.anim=0;player.frame=0;
      $('#walkState').textContent='站立';$('#frameNo').textContent='1'
    }
    const vw=canvas.clientWidth/camera.zoom,vh=canvas.clientHeight/camera.zoom;
    const tx=player.x-vw/2,ty=player.y-vh/2;
    camera.x+=(tx-camera.x)*Math.min(1,dt*.008);
    camera.y+=(ty-camera.y)*Math.min(1,dt*.008);
    detectScene();draw()
  }

  function detectScene(){
    let best=null,min=Infinity;
    zones[currentZone].scenes.forEach((s,i)=>{const d=Math.hypot(player.x-s.x,player.y-s.y);if(d<min){min=d;best=i}});
    nearScene=min<46?best:null;
    $('#prompt').classList.toggle('show',nearScene!==null);
    $('#look').style.opacity=nearScene!==null?'1':'.45'
  }

  function openScene(i){
    if(i===null||i===undefined||!currentZone)return;
    activeScene=i;const s=zones[currentZone].scenes[i];
    $('#storyTitle').textContent=s.name;$('#storyText').textContent=s.text;
    $('#factA').textContent=s.a;$('#factAText').textContent=s.at;
    $('#factB').textContent=s.b;$('#factBText').textContent=s.bt;
    // 精确定位：用景点坐标占地图百分比作为 background-position，
    // 放大 background-size 让局部细节清晰，以景点为中心显示。
    const art=$('#storyArt');
    art.style.backgroundSize='300% auto';
    art.style.backgroundPosition=`${s.x/WORLD.w*100}% ${s.y/WORLD.h*100}%`;
    art.style.backgroundImage=`var(--city-map-url)`;
    $('#collect').textContent=visited.has(currentZone+':'+i)?city.ui.collectedLabel:city.ui.collectLabel;
    $('#story').classList.add('open')
  }

  /* ---- map pins ---- */
  function buildPins(){
    $('#pins').innerHTML=Object.entries(zones).map(([id,z])=>`<button class="pin" data-zone="${id}" style="left:${z.x/WORLD.w*100}%;top:${z.y/WORLD.h*100}%"><span>${z.icon}</span><b>${z.name}</b></button>`).join('');
    document.querySelectorAll('[data-zone]').forEach(b=>b.onclick=()=>enterZone(b.dataset.zone));
  }

  /* ---- postcard ---- */
  function collectedSceneNames(){return [...visited].map(key=>{const [zoneId,index]=key.split(':');return zones[zoneId]?.scenes[Number(index)]?.name}).filter(Boolean)}

  function drawTravelCard(){
    const card=$('#travelCard'),g=card.getContext('2d');
    const uniqueZones=[...new Set(route)].filter(id=>zones[id]),finds=collectedSceneNames();
    g.clearRect(0,0,card.width,card.height);
    if(ticketImage.complete&&ticketImage.naturalWidth){
      g.drawImage(ticketImage,0,0,card.width,card.height);
    }else{
      g.fillStyle='#fffaf0';g.fillRect(0,0,card.width,card.height);
      g.fillStyle='#26352f';g.textAlign='center';
      g.font='800 34px "Microsoft YaHei",sans-serif';
      g.fillText(city.postcard.loadingText,card.width/2,card.height/2);
    }
    $('#resultTitle').textContent=fmt(city.ui.resultTitle,playerName);
    $('#resultZones').textContent=uniqueZones.length;
    $('#resultFinds').textContent=finds.length;
    return card
  }

  async function finishTrip(){keys.clear();if(!ticketImage.complete)await ticketImage.decode().catch(()=>{});drawTravelCard();$('#tripEnd').classList.add('open')}

  /* ---- guide ---- */
  function renderGuide(){
    const g=city.npc.guide[guideIndex];
    $('#guideTitle').textContent=fmt(g.title,playerName);
    $('#guideText').textContent=fmt(g.text,playerName);
    $('#guideProgress').innerHTML=city.npc.guide.map((_,i)=>`<i class="${i<=guideIndex?'active':''}"></i>`).join('');
    $('#guideNext').textContent=guideIndex===city.npc.guide.length-1?city.npc.guideStartLabel:city.npc.guideNextLabel;
  }

  /* ---- events ---- */
  function bindEvents(){
    $('#mapZoomIn').onclick=()=>setMapZoom(mapScale+.35);
    $('#mapZoomOut').onclick=()=>setMapZoom(mapScale-.35);
    $('#mapReset').onclick=resetMapView;

    mapViewport.addEventListener('pointerdown',e=>{if(e.target.closest('.pin,.map-controls'))return;if(mapScale<=1)return;mapDrag={pointerId:e.pointerId,x:e.clientX,y:e.clientY,mapX,mapY};mapCanvas.classList.add('dragging');mapViewport.setPointerCapture?.(e.pointerId)});
    mapViewport.addEventListener('pointermove',e=>{if(!mapDrag||mapDrag.pointerId!==e.pointerId)return;mapX=mapDrag.mapX+e.clientX-mapDrag.x;mapY=mapDrag.mapY+e.clientY-mapDrag.y;applyMapTransform()});
    function endMapDrag(e){if(!mapDrag||e.pointerId!==mapDrag.pointerId)return;mapDrag=null;mapCanvas.classList.remove('dragging')}
    mapViewport.addEventListener('pointerup',endMapDrag);
    mapViewport.addEventListener('pointercancel',endMapDrag);
    mapViewport.addEventListener('wheel',e=>{if(!overview.classList.contains('hidden')){e.preventDefault();setMapZoom(mapScale+(e.deltaY<0?.2:-.2))}},{passive:false});

    addEventListener('keydown',e=>{if(onboarding.classList.contains('open'))return;const k=e.key.toLowerCase();if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(k)){keys.add(k);player.target=null;e.preventDefault()}if(k==='e'&&nearScene!==null)openScene(nearScene)});
    addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
    addEventListener('blur',()=>keys.clear());

    canvas.addEventListener('pointerdown',e=>{if(!currentZone)return;const r=canvas.getBoundingClientRect(),v=view(),worldX=v.x+(e.clientX-r.left)/camera.zoom,worldY=v.y+(e.clientY-r.top)/camera.zoom,touchRadius=(innerWidth<=850?56:34)/camera.zoom;let hit=null,min=Infinity;zones[currentZone].scenes.forEach((scene,index)=>{const distance=Math.hypot(worldX-scene.x,worldY-scene.y);if(distance<min){min=distance;hit=index}});if(hit!==null&&min<=touchRadius){player.target=null;openScene(hit);return}player.target={x:worldX,y:worldY};canvas.focus()});

    document.querySelectorAll('.dpad button').forEach(b=>{const k=b.dataset.key;b.onpointerdown=e=>{e.preventDefault();keys.add(k);player.target=null};b.onpointerup=b.onpointercancel=b.onpointerleave=()=>keys.delete(k)});

    $('#nameForm').onsubmit=e=>{e.preventDefault();playerName=$('#playerName').value.trim()||'旅行者';$('#nameStep').hidden=true;$('#guideStep').hidden=false;$('#playerGreeting').textContent=playerName+city.ui.greetingSuffix;$('#mapWelcome').textContent=fmt(city.ui.mapWaitTitle,playerName);renderGuide()};

    const portraitPhone=matchMedia('(max-width:850px) and (orientation:portrait)');
    function beginMapExperience(){$('#rotateHint').classList.remove('open');if(portraitPhone.matches)setMapZoom(1.5);else resetMapView();setTimeout(()=>{fit();canvas.focus()},80)}
    $('#guideNext').onclick=()=>{if(guideIndex<city.npc.guide.length-1){guideIndex++;renderGuide();return}onboarding.classList.remove('open');if(portraitPhone.matches)$('#rotateHint').classList.add('open');else beginMapExperience()};
    $('#continuePortrait').onclick=beginMapExperience;
    portraitPhone.addEventListener?.('change',e=>{if(!e.matches&&$('#rotateHint').classList.contains('open'))beginMapExperience()});

    $('#back').onclick=showOverview;
    $('#finishTrip').onclick=finishTrip;
    $('#continueTrip').onclick=()=>$('#tripEnd').classList.remove('open');
    $('#tripEnd').onclick=e=>{if(e.target.id==='tripEnd')$('#tripEnd').classList.remove('open')};
    $('#downloadCard').onclick=async()=>{if(!ticketImage.complete)await ticketImage.decode().catch(()=>{});const card=drawTravelCard();card.toBlob(blob=>{const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`${playerName.replace(/[\\/:*?"<>|]/g,'_')}-${city.postcard.downloadPrefix}.png`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000)},'image/png')};
    $('#look').onclick=()=>openScene(nearScene);
    $('#close').onclick=()=>$('#story').classList.remove('open');
    $('#story').onclick=e=>{if(e.target.id==='story')$('#story').classList.remove('open')};
    $('#collect').onclick=()=>{if(activeScene===null)return;visited.add(currentZone+':'+activeScene);$('#collect').textContent=city.ui.collectedLabel};

    addEventListener('resize',()=>{fit();draw();applyMapTransform()});

    function loop(now){const dt=Math.min(32,now-last);last=now;update(dt);requestAnimationFrame(loop)}
    fit();showOverview();resetMapView();requestAnimationFrame(loop);
  }

  /* ---- bootstrap ---- */
  async function init(){
    // determine city path: ?city=xxx or default jinan
    const params=new URLSearchParams(location.search);
    const cityId=params.get('city')||'jinan';
    const path=`cities/${cityId}/city.json`;
    try{
      const c=await loadCity(path);
      applyCity(c);
      // static UI strings that depend on city
      const ui=c.ui;
      $('#playerGreeting').textContent=`一个抽象的${c.name}像素世界`;
      $('#mapWaitKicker').textContent=ui.mapWaitKicker;
      $('#mapWelcome').textContent=fmt(ui.mapWaitTitle,'旅行者');
      $('#mapWaitHint').textContent=ui.mapWaitHint;
      $('#npcName').textContent=c.npc.name;
      $('#npcRole').textContent=c.npc.role;
      $('#welcomeKicker').textContent=c.npc.welcome.kicker;
      $('#welcomeTitle').textContent=c.npc.welcome.title;
      $('#welcomeText').textContent=c.npc.welcome.text;
      $('#playerName').placeholder=c.npc.welcome.inputPlaceholder;
      $('#nameSubmit').textContent=c.npc.welcome.submitLabel;
      $('#storyKicker').textContent=ui.storyKicker;
      $('#finishTrip').textContent=ui.finishLabel;
      $('#back').textContent=ui.backLabel;
      $('#look').textContent=ui.lookLabel;
      $('#collect').textContent=ui.collectLabel;
      $('#close').textContent=ui.continueLabel;
      $('#continueTrip').textContent=ui.continueTripLabel;
      $('#downloadCard').textContent=ui.downloadLabel;
      $('#resultKicker').textContent=ui.resultKicker;
      $('#resultDesc').textContent=ui.resultDesc;
      $('#statZonesLabel').textContent=ui.statZonesLabel;
      $('#statFindsLabel').textContent=ui.statFindsLabel;
      $('#promptLabel').textContent=ui.promptLabel;
      $('#rotateKicker').textContent=ui.rotateKicker;
      $('#rotateTitle').textContent=ui.rotateTitle;
      $('#rotateText').textContent=ui.rotateText;
      $('#continuePortrait').textContent=ui.rotateButton;

      buildPins();
      bindEvents();
      setTimeout(()=>$('#playerName').focus(),120);
    }catch(err){
      // fetch failed — likely opened via file:// without a static server
      const warn=document.querySelector('#serverWarning');
      if(warn){warn.classList.add('open')}
      console.error('Failed to load city.json:',err);
    }
  }

  init();
})();
