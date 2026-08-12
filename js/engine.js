/* Pixel City Walk engine — city-agnostic.
   Reads all content (zones, scenes, NPC copy, theme, assets, UI strings)
   from a city.json loaded at startup. No city-specific data lives here. */
(function(){
  'use strict';

  let city=null;            // loaded city data
  let WORLD={w:1536,h:1024};
  let zones={};
  let waters=[];
  const keys=new Set(),visited=new Set(),route=[],trail=[];

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
  let currentZone=null,nearScene=null,activeScene=null,playerName='旅行者',mapScale=1,mapX=0,mapY=0,mapDrag=null,last=performance.now();
  let selectedRoute='first';
  const routeDefs={first:['baotu','square','heihu'],lake:['daming','oldcity'],free:[]};

  /* ---- city loading ---- */
  async function loadCity(path){
    const cityId=path.split('/').at(-2);
    const bundled=window.PCW_CITY_PACKAGES?.[cityId];
    if(bundled)return bundled;
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
    // CSS background-image variables (must be url(...) strings).
    // Resolve to absolute URLs: when a stylesheet rule consumes these vars,
    // relative paths would otherwise resolve against the stylesheet's base
    // (e.g. /css/), which 404s. Absolute URLs are immune to that.
    const absUrl=p=>new URL(p,document.baseURI).href;
    set('--city-map-url',`url('${absUrl(c.assets.map)}')`);
    set('--sprite-url',`url('${absUrl(c.assets.sprite)}')`);

    // NPC sprite filter
    const npcSprite=document.querySelector('.npc-sprite');
    if(npcSprite&&c.npc.spriteFilter)npcSprite.style.filter=c.npc.spriteFilter;

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

  /* ---- progress persistence (per city) ---- */
  let saveKey='pcw';
  function saveProgress(){
    try{
      localStorage.setItem(saveKey,JSON.stringify({v:1,name:playerName,visited:[...visited],route:[...route],steps:Math.floor(player.steps)}));
    }catch(e){/* private mode / storage disabled: play without saving */}
  }
  function loadProgress(){
    try{
      const raw=localStorage.getItem(saveKey);
      if(!raw)return null;
      const s=JSON.parse(raw);
      return s&&s.v===1&&typeof s.name==='string'?s:null;
    }catch(e){return null}
  }
  function clearProgress(){try{localStorage.removeItem(saveKey)}catch(e){}}

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
    if(trail.length>1){ctx.save();ctx.strokeStyle=themeColor('red','#c24433');ctx.lineWidth=5/camera.zoom;ctx.lineCap='round';ctx.lineJoin='round';ctx.setLineDash([10/camera.zoom,7/camera.zoom]);ctx.beginPath();ctx.moveTo(trail[0].x,trail[0].y);trail.forEach(p=>ctx.lineTo(p.x,p.y));ctx.stroke();ctx.restore()}
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
  function setCurrentZone(id,record=true){if(!id||!zones[id])return;currentZone=id;const z=zones[id];$('#zoneName').textContent=z.name;$('#zoneIcon').textContent=z.icon;if(record&&route.at(-1)!==id){route.push(id);saveProgress()}}
  function enterZone(id){const z=zones[id];let tx=z.x,ty=z.y;if(inWater(tx,ty)){for(let r=20;r<200;r+=10){for(let a=0;a<360;a+=45){const rx=tx+Math.cos(a*Math.PI/180)*r,ry=ty+Math.sin(a*Math.PI/180)*r;if(!inWater(rx,ry)){tx=rx;ty=ry;break}}if(!inWater(tx,ty))break}}player.x=tx;player.y=ty;player.target=null;if(route.length===0)player.steps=0;player.dir='down';camera.x=tx-canvas.clientWidth/camera.zoom/2;camera.y=ty-canvas.clientHeight/camera.zoom/2;setCurrentZone(id,true);trail.push({x:tx,y:ty});overview.classList.add('hidden');$('#back').hidden=false;$('#finishTrip').hidden=false;updateProductUI();canvas.focus();draw()}
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
      const lastPoint=trail.at(-1);if(!lastPoint||Math.hypot(player.x-lastPoint.x,player.y-lastPoint.y)>12)trail.push({x:player.x,y:player.y});
      if(player.anim>=105){player.anim%=105;player.frame=(player.frame+1)%4}
      if(Math.abs(dx)>Math.abs(dy))player.dir=dx<0?'left':'right';else if(dy!==0)player.dir=dy<0?'up':'down';
      const nextZone=nearestZoneId(player.x,player.y);
      if(nextZone!==currentZone)setCurrentZone(nextZone,true);
      updateProductUI();
    }else{
      player.anim=0;player.frame=0;
    }
    const vw=canvas.clientWidth/camera.zoom,vh=canvas.clientHeight/camera.zoom;
    const tx=player.x-vw/2,ty=player.y-vh/2;
    camera.x+=(tx-camera.x)*Math.min(1,dt*.008);
    camera.y+=(ty-camera.y)*Math.min(1,dt*.008);
    detectScene();draw()
  }

  function routePlan(){return routeDefs[selectedRoute]||[]}
  function nextRouteZone(){return routePlan().find(id=>!route.includes(id))||null}
  function currentUnvisitedScene(){if(!currentZone)return null;return zones[currentZone].scenes.findIndex((_,i)=>!visited.has(currentZone+':'+i))}
  function updateProductUI(){
    const allScenes=Object.values(zones).flatMap(z=>z.scenes),zoneScenes=currentZone?zones[currentZone].scenes:[];
    const zoneDone=currentZone?zoneScenes.filter((_,i)=>visited.has(currentZone+':'+i)).length:0;
    $('#journalCount').textContent=visited.size;$('#journalTotal').textContent=allScenes.length;$('#zoneProgress').textContent=currentZone?`${zoneDone}/${zoneScenes.length}`:`${visited.size}/${allScenes.length}`;
    let label='自由探索';const nextScene=currentUnvisitedScene();
    if(currentZone&&nextScene>=0){const s=zoneScenes[nextScene],meters=Math.max(1,Math.round(Math.hypot(player.x-s.x,player.y-s.y)/3));label=`下一处：${s.name} · ${meters}m`}
    else if(nextRouteZone())label=`下一站：${zones[nextRouteZone()].name}`;
    else if(routePlan().length)label='路线完成，可以生成纪念卡';
    $('#nextTarget').textContent=label;refreshPins();
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
  function refreshPins(){document.querySelectorAll('[data-zone]').forEach(b=>{const id=b.dataset.zone;b.classList.toggle('route-done',route.includes(id));b.classList.toggle('route-next',id===nextRouteZone())})}

  function buildJournal(){
    const items=[];Object.entries(zones).forEach(([zoneId,z])=>z.scenes.forEach((s,i)=>{const done=visited.has(zoneId+':'+i);items.push(`<div class="journal-item ${done?'':'locked'}">${done?'<i class="journal-seal">泉</i>':'<i class="journal-seal">?</i>'}<b>${done?s.name:'待发现的风景'}</b><span>${z.name} · ${done?'已盖章':'沿路线继续寻找'}</span></div>`)}));
    $('#journalGrid').innerHTML=items.join('');$('#journalSummary').textContent=visited.size?`已经收下 ${visited.size} 处泉城风景`:'还没有盖下印章';
  }

  /* ---- postcard ---- */
  function collectedSceneNames(){return [...visited].map(key=>{const [zoneId,index]=key.split(':');return zones[zoneId]?.scenes[Number(index)]?.name}).filter(Boolean)}

  // Substitute {name}/{date}/{zones}/{finds}/{route}/{steps}/{city} tokens
  // in postcard overlay templates. All copy comes from city.json.
  function overlayText(tpl,data){return tpl.replace(/\{(\w+)\}/g,(_,k)=>data[k]??'')}

  // Fit text into maxWidth by shrinking the px size of the configured font.
  function fitText(g,text,font,maxWidth){
    const m=font.match(/(\d+(?:\.\d+)?)px/);
    if(!m)return font;
    let size=parseFloat(m[1]);
    g.font=font;
    while(size>10&&g.measureText(text).width>maxWidth){
      size-=1;g.font=font.replace(/\d+(?:\.\d+)?px/,size+'px');
    }
    return g.font;
  }

  function drawCardOverlay(g,card,uniqueZones,finds){
    const o=city.postcard.overlay;
    if(!o)return;
    const today=new Date();
    const mm=String(today.getMonth()+1).padStart(2,'0'),dd=String(today.getDate()).padStart(2,'0');
    const data={
      name:playerName,
      city:city.name,
      date:`${today.getFullYear()}-${mm}-${dd}`,
      mmdd:mm+dd,
      zones:uniqueZones.length,
      finds:finds.length,
      steps:Math.floor(player.steps),
      route:uniqueZones.map(id=>zones[id].name).join(' → ')
    };
    // caption band
    if(o.panel){
      const p=o.panel;
      g.save();
      g.fillStyle=p.bg;g.strokeStyle=p.border;g.lineWidth=p.borderWidth||3;
      if(g.roundRect){g.beginPath();g.roundRect(p.x,p.y,p.w,p.h,p.radius||14);g.fill();g.stroke()}
      else{g.fillRect(p.x,p.y,p.w,p.h);g.strokeRect(p.x,p.y,p.w,p.h)}
      g.restore();
    }
    g.save();
    g.textAlign='left';g.textBaseline='alphabetic';
    (o.lines||[]).forEach(line=>{
      const text=overlayText(line.text,data);
      if(!text.trim())return;
      g.fillStyle=line.color;
      if('letterSpacing' in g)g.letterSpacing=line.letterSpacing||'0px';
      g.font=line.maxWidth?fitText(g,text,line.font,line.maxWidth):line.font;
      if(line.align)g.textAlign=line.align;else g.textAlign='left';
      g.fillText(text,line.x,line.y);
    });
    if('letterSpacing' in g)g.letterSpacing='0px';
    if(o.footer){
      const f=o.footer;
      g.fillStyle=f.color;g.font=f.font;g.textAlign=f.align||'center';
      g.fillText(overlayText(f.text,data),f.x,f.y);
    }
    g.restore();
  }

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
    drawRouteOnCard(g);
    drawCardOverlay(g,card,uniqueZones,finds);
    $('#resultTitle').textContent=fmt(city.ui.resultTitle,playerName);
    $('#resultZones').textContent=uniqueZones.length;
    $('#resultFinds').textContent=finds.length;
    return card
  }

  function drawRouteOnCard(g){
    if(trail.length<2)return;const box={x:650,y:660,w:520,h:145},sx=box.w/WORLD.w,sy=box.h/WORLD.h;
    g.save();g.fillStyle='rgba(255,250,240,.86)';g.strokeStyle='#26352f';g.lineWidth=3;g.fillRect(box.x,box.y,box.w,box.h);g.strokeRect(box.x,box.y,box.w,box.h);g.beginPath();trail.forEach((p,i)=>{const x=box.x+p.x*sx,y=box.y+p.y*sy;i?g.lineTo(x,y):g.moveTo(x,y)});g.strokeStyle='#c24433';g.lineWidth=7;g.lineCap='round';g.lineJoin='round';g.stroke();const first=trail[0],end=trail.at(-1);[[first,'起'],[end,'终']].forEach(([p,t])=>{const x=box.x+p.x*sx,y=box.y+p.y*sy;g.fillStyle=t==='起'?'#75c6a3':'#f4c64f';g.beginPath();g.arc(x,y,13,0,Math.PI*2);g.fill();g.strokeStyle='#17241d';g.lineWidth=3;g.stroke();g.fillStyle='#17241d';g.font='900 15px sans-serif';g.textAlign='center';g.fillText(t,x,y+5)});g.restore()
  }

  async function finishTrip(){keys.clear();saveProgress();if(!ticketImage.complete)await ticketImage.decode().catch(()=>{});$('#resultName').value=playerName==='旅行者'?'':playerName;drawTravelCard();$('#tripEnd').classList.add('open')}

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

    function beginMapExperience(){onboarding.classList.remove('open');setTimeout(()=>{fit();resetMapView()},80)}
    $('#quickStart').onclick=beginMapExperience;$('#previewRoutes').onclick=beginMapExperience;
    document.querySelectorAll('[data-route]').forEach(b=>b.onclick=()=>{selectedRoute=b.dataset.route;document.querySelectorAll('[data-route]').forEach(x=>x.classList.toggle('selected',x===b));const first=routePlan()[0];$('#startRoute').textContent=first?`从${zones[first].name}出发`:'选择一个地标出发';refreshPins()});
    $('#startRoute').onclick=()=>{const first=routePlan()[0];if(first)enterZone(first)};

    $('#back').onclick=showOverview;
    $('#finishTrip').onclick=finishTrip;
    $('#continueTrip').onclick=()=>$('#tripEnd').classList.remove('open');
    $('#tripEnd').onclick=e=>{if(e.target.id==='tripEnd')$('#tripEnd').classList.remove('open')};
    $('#downloadCard').onclick=async()=>{if(!ticketImage.complete)await ticketImage.decode().catch(()=>{});const card=drawTravelCard();card.toBlob(blob=>downloadBlob(blob,`${playerName.replace(/[\\/:*?"<>|]/g,'_')}-${city.postcard.downloadPrefix}.png`),'image/png')};
    $('#resultName').oninput=e=>{playerName=e.target.value.trim()||'旅行者';drawTravelCard();saveProgress()};
    $('#shareCard').onclick=async()=>{const card=drawTravelCard(),blob=await new Promise(resolve=>card.toBlob(resolve,'image/png')),file=new File([blob],'我的泉城路线.png',{type:'image/png'});if(navigator.share&&navigator.canShare?.({files:[file]})){await navigator.share({title:'我的泉城像素路线',text:'我在像素济南散了个步',files:[file]}).catch(()=>{})}else{downloadBlob(blob,'我的泉城像素路线.png');navigator.clipboard?.writeText(location.href)}};
    $('#look').onclick=()=>openScene(nearScene);
    $('#close').onclick=()=>$('#story').classList.remove('open');
    $('#story').onclick=e=>{if(e.target.id==='story')$('#story').classList.remove('open')};
    $('#collect').onclick=()=>{if(activeScene===null)return;const s=zones[currentZone].scenes[activeScene];visited.add(currentZone+':'+activeScene);$('#collect').textContent='✓ 已盖下印章';$('#story').classList.remove('open');$('#stampToast span').textContent=`${s.name} · ${zones[currentZone].name}`;const toast=$('#stampToast');toast.classList.remove('show');void toast.offsetWidth;toast.classList.add('show');updateProductUI();buildJournal();saveProgress()};
    $('#openJournal').onclick=()=>{buildJournal();$('#journal').classList.add('open')};$('#closeJournal').onclick=()=>$('#journal').classList.remove('open');$('#journal').onclick=e=>{if(e.target.id==='journal')$('#journal').classList.remove('open')};$('#journalFinish').onclick=()=>{$('#journal').classList.remove('open');finishTrip()};
    $('#makeBead').onclick=()=>{drawBeadPattern();$('#beadMaker').classList.add('open')};$('#closeBead').onclick=()=>$('#beadMaker').classList.remove('open');$('#beadMaker').onclick=e=>{if(e.target.id==='beadMaker')$('#beadMaker').classList.remove('open')};$('#downloadBead').onclick=()=>$('#beadCanvas').toBlob(blob=>downloadBlob(blob,'泉城路线-29x29-拼豆章.png'),'image/png');

    addEventListener('resize',()=>{fit();draw();applyMapTransform()});

    function loop(now){const dt=Math.min(32,now-last);last=now;update(dt);requestAnimationFrame(loop)}
    fit();showOverview();resetMapView();requestAnimationFrame(loop);
  }

  function downloadBlob(blob,name){const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000)}
  function gridLine(grid,x0,y0,x1,y1,value){x0=Math.round(x0);y0=Math.round(y0);x1=Math.round(x1);y1=Math.round(y1);let dx=Math.abs(x1-x0),sx=x0<x1?1:-1,dy=-Math.abs(y1-y0),sy=y0<y1?1:-1,err=dx+dy;for(;;){if(grid[y0]?.[x0]!==undefined)grid[y0][x0]=value;if(x0===x1&&y0===y1)break;const e2=2*err;if(e2>=dy){err+=dy;x0+=sx}if(e2<=dx){err+=dx;y0+=sy}}}
  function drawBeadPattern(){
    const N=29,cell=20,grid=Array.from({length:N},()=>Array(N).fill(0));
    const palette=[
      {name:'空位',color:'#f7f1d7'},
      {name:'象牙白·章面',color:'#fff2ca'},
      {name:'墨绿·轮廓',color:'#17241d'},
      {name:'泉水绿·泉字',color:'#2f7d67'},
      {name:'湖水蓝·波纹',color:'#4a9ac3'},
      {name:'朱红·路线',color:'#c24433'},
      {name:'金黄·待到达',color:'#f4c64f'},
      {name:'薄荷·已到达',color:'#75c6a3'}
    ];

    // Connected round badge: every occupied bead belongs to one stable piece.
    for(let y=0;y<N;y++)for(let x=0;x<N;x++){
      const d=Math.hypot(x-14,y-14);
      if(d<=13)grid[y][x]=d>=11.8?2:1;
    }

    // Rasterize the city character into the bead grid. Sampling a real glyph
    // gives a recognisable “泉”, while the final output remains 29×29 beads.
    const glyph=document.createElement('canvas');glyph.width=N;glyph.height=N;
    const gg=glyph.getContext('2d');gg.clearRect(0,0,N,N);gg.fillStyle='#000';gg.textAlign='center';gg.textBaseline='middle';gg.font='900 18px "PingFang SC","Microsoft YaHei",sans-serif';gg.fillText('泉',14.5,14.5,19);
    const pixels=gg.getImageData(0,0,N,N).data;
    for(let y=5;y<=20;y++)for(let x=5;x<=23;x++)if(pixels[(y*N+x)*4+3]>72&&grid[y][x])grid[y][x]=3;

    // Three connected spring ripples anchor the badge and keep the motif local.
    [[8,20,20,20],[6,22,22,22],[9,24,19,24]].forEach(([x0,y0,x1,y1])=>{
      for(let x=x0;x<=x1;x++)if(grid[y0][x])grid[y0][x]=4;
      if(grid[y0-1]?.[x0])grid[y0-1][x0]=4;if(grid[y0-1]?.[x1])grid[y0-1][x1]=4;
    });

    // Route progress is a small, legible layer instead of the whole picture.
    const plan=routePlan().length?routePlan():route.slice(0,3),nodes=Math.max(2,Math.min(3,plan.length||3));
    const xs=nodes===2?[10,18]:[8,14,20];gridLine(grid,xs[0],4,xs.at(-1),4,5);
    xs.forEach((x,i)=>{const reached=plan[i]&&route.includes(plan[i]);for(let yy=-1;yy<=1;yy++)for(let xx=-1;xx<=1;xx++)if(grid[4+yy]?.[x+xx])grid[4+yy][x+xx]=reached?7:6});

    const c=$('#beadCanvas'),g=c.getContext('2d');g.clearRect(0,0,c.width,c.height);g.fillStyle=palette[0].color;g.fillRect(0,0,c.width,c.height);
    const counts=Array(palette.length).fill(0);
    grid.forEach((row,y)=>row.forEach((v,x)=>{
      g.strokeStyle='rgba(23,36,29,.11)';g.strokeRect(x*cell,y*cell,cell,cell);
      if(!v)return;counts[v]++;g.fillStyle=palette[v].color;g.beginPath();g.arc(x*cell+cell/2,y*cell+cell/2,8.7,0,Math.PI*2);g.fill();g.strokeStyle='rgba(23,36,29,.32)';g.stroke();g.fillStyle=palette[0].color;g.beginPath();g.arc(x*cell+cell/2,y*cell+cell/2,2.25,0,Math.PI*2);g.fill();
    }));
    const used=counts.reduce((n,v,i)=>n+(i&&v?1:0),0),total=counts.reduce((n,v,i)=>n+(i?v:0),0);
    $('#beadCount').textContent=total;$('#beadColorCount').textContent=used;
    $('#beadLegend').innerHTML=palette.map((p,i)=>i&&counts[i]?`<span><i style="background:${p.color}"></i>${p.name} · ${counts[i]}</span>`:'').join('');
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
      $('#storyKicker').textContent=ui.storyKicker;
      $('#finishTrip').textContent=ui.finishLabel;
      $('#back').textContent=ui.backLabel;
      $('#look').textContent=ui.lookLabel;
      $('#collect').textContent='盖下这枚印章';
      $('#close').textContent=ui.continueLabel;
      $('#continueTrip').textContent=ui.continueTripLabel;
      $('#downloadCard').textContent='保存路线纪念卡';
      $('#resultKicker').textContent=ui.resultKicker;
      $('#resultDesc').textContent=ui.resultDesc;
      $('#statZonesLabel').textContent=ui.statZonesLabel;
      $('#statFindsLabel').textContent=ui.statFindsLabel;
      $('#promptLabel').textContent=ui.promptLabel;
      $('#rotateKicker').textContent=ui.rotateKicker;
      $('#rotateTitle').textContent=ui.rotateTitle;
      $('#rotateText').textContent=ui.rotateText;
      $('#continuePortrait').textContent=ui.rotateButton;

      saveKey=`pcw:${cityId}`;

      // reset button: clears saved progress and restarts
      const resetBtn=$('#resetTrip');
      if(resetBtn){
        resetBtn.textContent=ui.resetLabel||resetBtn.textContent;
        resetBtn.onclick=()=>{clearProgress();location.reload()};
      }

      // restore saved progress: returning players skip onboarding
      const saved=loadProgress();
      if(saved){
        playerName=saved.name;
        (saved.visited||[]).forEach(k=>typeof k==='string'&&visited.add(k));
        (saved.route||[]).forEach(id=>{if(zones[id]&&route.at(-1)!==id)route.push(id)});
        player.steps=saved.steps||0;
        $('#playerGreeting').textContent=playerName+ui.greetingSuffix;
        $('#mapWelcome').textContent=fmt(ui.mapWaitTitle,playerName);
        onboarding.classList.remove('open');
        if(resetBtn)resetBtn.hidden=false;
      }

      buildPins();
      bindEvents();
      buildJournal();
      updateProductUI();
      if(saved){
        if(matchMedia('(max-width:850px) and (orientation:portrait)').matches)setMapZoom(1.5);
      }
    }catch(err){
      const warn=document.querySelector('#serverWarning');
      if(warn){warn.classList.add('open');const detail=warn.querySelector('p');if(detail)detail.textContent=`初始化失败：${err.message}`}
      console.error('Pixel City Walk initialization failed:',err);
    }
  }

  init();
})();
