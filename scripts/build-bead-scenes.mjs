import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root=resolve(import.meta.dirname,'..');
const scenes=[
  ['baotu','趵突泉 · 三股泉涌','泺源堂、垂柳、石栏和三股翻涌的泉水共同入画。','baotu','Baotu Spring, Jinan in Oct 2013.jpg'],
  ['chaoran','大明湖 · 超然楼','夜色中的重檐楼阁占据主体，保留金色灯光与深蓝天空。','daming','Chaoran Tower, Daming Lake, Jinan in October 2019.jpg'],
  ['qianfo','千佛山 · 万佛洞','以洞窟主佛、胁侍和红色背光表现千佛山的佛教石刻景观。','qianfo','Buddha Grotto Qianfo Mountain.jpg'],
  ['heihu','黑虎泉 · 三虎吐水','保留三只石雕虎头、白色水柱、泉池与岸边石栏。','heihu','Black tiger spring.jpg'],
  ['quancheng','泉城广场 · 泉标','蓝色泉标、城市天际线和广场地面形成清晰纵深。','square','济南泉城广场泉标2019.jpg'],
  ['qushuiting','曲水亭街 · 泉水人家','泉渠作为透视主线，两侧老屋、石岸和柳树共同构成街巷。','oldcity','曲水亭街.jpg'],
  ['jiefang','解放阁 · 护城河','完整保留解放阁楼体、城墙、垂柳与护城河前景。','heihu','Jinan Liberation Pavilion 20191001.jpg'],
  ['wulong','五龙潭 · 水榭锦鲤','水榭、飞檐、临水木柱和大面积锦鲤池共同入画。','baotu','Five dragon pool pavilion 2008 09.jpg'],
  ['hongjialou','洪家楼教堂 · 双塔','双尖塔、十字架、玫瑰窗和哥特立面保持完整比例。','square','Sacred-Heart-Cathedral-Jinan.JPG'],
  ['lingyan','灵岩寺 · 塔林','用密集古塔、松柏和石塔层次表现灵岩寺塔林。','qianfo','Stupas at Lingyan Si.jpg']
];

function imageData(slug){
  const formalFile=resolve(root,`assets/beads/formal/${slug}-pattern.json`);
  if(existsSync(formalFile)){
    const formal=JSON.parse(readFileSync(formalFile,'utf8'));
    const colors=formal.palette.map(item=>({name:`MARD ${item.code}`,color:item.hex,code:item.code}));
    const index=new Map(colors.map((item,i)=>[item.code,i]));
    return {width:formal.width,height:formal.height,colors,rows:formal.pattern.map(row=>row.map(code=>index.get(code))),formal:true,focus:formal.focus};
  }
  const file=resolve(root,`assets/beads/pixel/${slug}.png`);
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','json',file],{encoding:'utf8'}));
  const {width,height}=probe.streams[0];
  const raw=execFileSync('ffmpeg',['-v','error','-i',file,'-f','rawvideo','-pix_fmt','rgb24','pipe:1']);
  const colors=[],indices=new Map(),rows=[];
  for(let y=0;y<height;y++){
    let row='';
    for(let x=0;x<width;x++){
      const at=(y*width+x)*3;
      const hex='#'+[raw[at],raw[at+1],raw[at+2]].map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase();
      if(!indices.has(hex)){indices.set(hex,colors.length);colors.push(hex)}
      row+=indices.get(hex).toString(36);
    }
    rows.push(row);
  }
  return {width,height,colors,rows,formal:false};
}

const items=scenes.map(([slug,title,description,zoneId,sourceFile])=>{
  const {width,height,colors,rows,formal,focus}=imageData(slug);
  return {id:slug,width,height,title,shortTitle:title.split('·')[0].trim(),unlockLabel:formal?'MARD 景点明信片 · 双底板正式图纸':'实景照片像素化 · 拼豆风景画',description:formal?`识别点：${focus}。`:description,downloadLabel:`下载「${title}」${width}×${height}图纸`,downloadName:`济南-${title.replace(/[·\s]/g,'')}-${width}x${height}-拼豆图纸.png`,productType:`${width}×${height}景点拼豆画`,zoneId,backgroundIsBead:true,renderStyle:'tile',sourceFile,sourceUrl:`https://commons.wikimedia.org/wiki/File:${encodeURIComponent(sourceFile)}`,palette:formal?colors:colors.map((color,i)=>({name:`参考色 ${String(i+1).padStart(2,'0')}`,color})),pattern:rows};
});

const output=`/* Generated from credited Wikimedia Commons photographs. */\n(function(){\n  const city=window.PCW_CITY_PACKAGES?.jinan;\n  if(!city)return;\n  city.beadCollectibles=${JSON.stringify(items,null,2)};\n})();\n`;
writeFileSync(resolve(root,'cities/jinan/bead-scenes.js'),output);
console.log(`Built ${items.length} photo-based bead scenes.`);
