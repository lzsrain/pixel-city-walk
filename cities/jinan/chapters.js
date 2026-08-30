/* Jinan chapter catalog.
   Art files are replaceable contracts: keep these paths stable when artwork changes. */
(function(){
  const catalog={
    defaultId:'spring-old-city',
    overview:'cities/jinan/chapters/jinan-city-aerial-v3b.png',
    items:[
      {
        id:'spring-old-city',
        index:'01',
        title:'泉城老城',
        shortTitle:'泉城老城',
        subtitle:'沿泉水，穿过济南的城市中心',
        description:'从趵突泉出发，经泉城广场走到黑虎泉与护城河，认识泉水如何进入城市日常。',
        icon:'泉',
        status:'available',
        presentation:'aerial-hotspots',
        accent:'#43bdc2',
        map:'cities/jinan/chapters/oldcity-aerial-v3.png',
        geoData:'cities/jinan/geo/oldcity-map-real-v2.json',
        postcard:'cities/jinan/ticket-base.png',
        zoneIds:['baotu','square','heihu'],
        zoneGeoRefs:{baotu:'baotu',square:'square',heihu:'heihu'},
        sceneGeoRefs:{baotu:['baotu','baotu'],square:['square','square'],heihu:['heihu','heihu','heihu']},
        waters:[],
        zonePositions:{
          baotu:{x:255,y:650,scenes:[{x:235,y:620},{x:285,y:690}]},
          square:{x:890,y:650,scenes:[{x:880,y:620},{x:930,y:690}]},
          heihu:{x:1330,y:585,scenes:[{x:1330,y:585},{x:1410,y:555},{x:1450,y:520}]}
        },
        player:{startX:282,startY:648},
        mapCopy:{kicker:'第一章 · 泉城老城',title:'点击地标，跟着泉水走进老城',hint:'艺术化鸟瞰图 · 地标关系参考真实济南 · 不用于导航'},
        result:{kicker:'泉城老城篇 · 路线完成',title:'{name}，你的泉水线明信片做好了',description:'你走过的泉眼、广场和护城河，已经被收进这一章的像素明信片。'},
        downloadPrefix:'济南-泉城老城-像素明信片',
        release:'现已开放',
        routes:[
          {id:'springline',tag:'水脉',title:'泉水从城里经过',description:'趵突泉 → 泉城广场 → 黑虎泉',zoneIds:['baotu','square','heihu']},
          {id:'reverse',tag:'逆流',title:'从护城河寻找泉眼',description:'黑虎泉 → 泉城广场 → 趵突泉',zoneIds:['heihu','square','baotu']},
          {id:'free',tag:'自由',title:'按自己的顺序走',description:'任选地标，留下你的到访顺序',zoneIds:[]}
        ]
      },
      {
        id:'mingfu-lake',
        index:'02',
        title:'明府城与大明湖',
        shortTitle:'明府城与大明湖',
        subtitle:'从泉水街巷，走到一城湖光',
        description:'穿过曲水亭街与老城泉渠，抵达大明湖；在夜色亮起时，看超然楼成为湖城坐标。',
        icon:'湖',
        status:'available',
        presentation:'aerial-hotspots',
        accent:'#f4c64f',
        map:'cities/jinan/chapters/mingfu-aerial-v3.png',
        geoData:'cities/jinan/geo/mingfu-map-real-v2.json',
        postcard:'cities/jinan/ticket-base.png',
        zoneIds:['oldcity','daming'],
        zoneGeoRefs:{oldcity:'qushuiting',daming:'daming'},
        sceneGeoRefs:{oldcity:['qushuiting','baihuazhou'],daming:['daming','chaoran']},
        waters:[],
        zonePositions:{
          oldcity:{x:650,y:560,scenes:[{x:630,y:555},{x:650,y:420}]},
          daming:{x:700,y:165,scenes:[{x:700,y:165},{x:1140,y:135}]}
        },
        player:{startX:630,startY:578},
        mapCopy:{kicker:'第二章 · 明府城与大明湖',title:'点击地标，从泉水人家走到湖城夜色',hint:'艺术化鸟瞰图 · 地标关系参考真实济南 · 不用于导航'},
        result:{kicker:'明府城与大明湖篇 · 路线完成',title:'{name}，你的湖城夜游明信片做好了',description:'老城泉渠、湖岸荷花与夜色已经组合成这一章的像素明信片。'},
        downloadPrefix:'济南-明府城大明湖-像素明信片',
        release:'现已开放',
        routes:[
          {id:'lakewalk',tag:'湖城',title:'水最后去了哪里',description:'曲水亭街 → 大明湖',zoneIds:['oldcity','daming']},
          {id:'nightwalk',tag:'夜游',title:'等一场湖城亮灯',description:'大明湖 → 曲水亭街',zoneIds:['daming','oldcity']},
          {id:'free',tag:'自由',title:'按自己的顺序走',description:'任选地标，留下你的到访顺序',zoneIds:[]}
        ]
      },
      {
        id:'historic-commercial',index:'03',title:'百年商埠',shortTitle:'百年商埠',
        subtitle:'经三路、经四路与老济南的新生活',description:'洋行、影院、老商铺与梧桐街道。',icon:'埠',status:'locked',accent:'#cf7650',release:'下一期'
      },
      {
        id:'mountain-city',index:'04',title:'山城济南',shortTitle:'山城济南',
        subtitle:'从千佛山望见城、泉与湖',description:'千佛山、佛慧山与南部山林。',icon:'山',status:'locked',accent:'#75a66d',release:'即将开放'
      },
      {
        id:'yellow-river',index:'05',title:'黄河济南',shortTitle:'黄河济南',
        subtitle:'越过鹊华烟雨，走向北部大河',description:'黄河、鹊山、华山与湿地堤岸。',icon:'河',status:'locked',accent:'#d9a34a',release:'即将开放'
      },
      {
        id:'modern-city',index:'06',title:'新城济南',shortTitle:'新城济南',
        subtitle:'奥体、CBD 与今天的城市天际线',description:'从老城水脉走向东部新城。',icon:'新',status:'locked',accent:'#729bd0',release:'即将开放'
      }
    ]
  };

  window.CITY_CHAPTERS=catalog;
  window.PCW_CITY_CHAPTERS=window.PCW_CITY_CHAPTERS||{};
  window.PCW_CITY_CHAPTERS.jinan=catalog;
})();
