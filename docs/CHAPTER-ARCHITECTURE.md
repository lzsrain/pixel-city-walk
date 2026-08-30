# Pixel City Walk 章节化架构（济南 MVP）

状态：章节骨架已采用，正式地理地图建设中  
更新时间：2026-08-13  
适用范围：济南六章节总览、首发两张区域地图、章节专属明信片

## 0. 与 PRD 和本轮交付的关系

产品范围与最终验收以 `docs/MVP-CHAPTERS-PRD.md` 为准；本文只定义怎样在现有代码上最快、最低风险地实现它。

为满足“快速推进”同时不把虚构地图公开为成品，交付拆成三档：

- **R0 安全章节骨架（当前）**：六章节目录可看；目标首发两章标为 `visualPending`，其余四章为 `locked`；鸟瞰热点交互尚未完成前不提前开放。
- **R1 正式可玩切片**：使用已确认的两张彩色 2.5D 鸟瞰图，完成 GIS 追溯、成图热点锚定和 `aerial-hotspots` 交互后，将两章改为 `available`，跑通章节切换与专属明信片；暂时复用旧 `zones/scenes` 数据。
- **R2 PRD 完整 MVP**：每章 6 个独立地标、5 个必收门槛、章节介绍卡、六卡槽城市册、按章完成与下载状态、12 个正式地标母稿。

R0 只能称“章节骨架”，不能称可玩成品。R1 可以称“首个正式可玩切片”，仍不能称作 PRD 完整成品。架构已经为 R2 留出 `zoneIds`、章级结果、明信片和存档扩展点，不需要二次重写引擎。

## 1. 结论

最快可交付的方案不是重写引擎，也不是把六章拆成六个 `city`，而是：

1. 保留现有 `city.json` 作为城市级公共数据与兼容入口；
2. 以 `cities/jinan/chapters.js` 的 `window.CITY_CHAPTERS` 作为本次 MVP 的章节运行配置；
3. 玩家先在六章节总览中选章，进入章节后，仍复用现有的地图、人物移动、景点、收藏和 Canvas 明信片逻辑；
4. 章节只替换地图、可用 `zoneIds`、出发点、路线、结果文案和明信片底图；
5. 两个首发章节只有在真实地理底图、坐标和碰撞通过验收后才改为 `available`；制作期间保持 `visualPending`，另外四章保持 `locked`；
6. 地标视觉先做独立母稿，再派生地图版和明信片版，避免地图、封面和下载图三套画风。

补充硬约束分两种呈现处理：`walkable` 自由行走地图的道路、水系、碰撞必须由真实地理数据确定性生成；`aerial-hotspots` 可以使用彩色 2.5D 鸟瞰插画作为点击界面，但必须明确它不是导航底图，不能在其透视空间中模拟自由行走。两种模式都以仓库内 GIS 数据作为地理事实来源。

这是一层很薄的“章节编排层”，不是第二套游戏引擎。

## 2. 为什么不采用其他结构

### 不把每章做成一个独立城市包

如果把章节做成 `?city=jinan-oldcity`、`?city=jinan-lake`：

- 城市名、主题、NPC、角色、UI 文案和景点故事会大量复制；
- 玩家跨章收藏与章节进度难以统一；
- 一处济南地标更新时需要修改多个包；
- 后续城市也会重复同样的问题。

章节属于城市内部内容，不应伪装成多个城市。

### 不立即把引擎改成场景路由器

当前引擎约 500 行，已经具备：加载城市、地图总览、进入区域、行走、收集、保存和生成明信片。首版只需要增加“选章”和“应用章配置”，没有必要引入框架、打包器、路由库或状态管理库。

### 不把六章全部做成可玩地图

首发只建设两章，既能验证章节模型，也能避免图片生产成为瓶颈：

- `spring-old-city`：泉城老城；
- `mingfu-lake`：明府城与大明湖；
- 泉城老城、明府城与大明湖在正式地图完成前为 `visualPending`，完成后才切换到 `available`；
- 商埠、山城、黄河、新城只在总览出现，状态为 `locked`。

## 3. 三层运行模型

```text
City（城市公共层）
  ├─ theme / npc / sprite / ui / 全量 zones
  └─ Chapters（章节编排层）
       ├─ 六章节总览与开放状态
       ├─ Chapter A：地图 + zoneIds + 路线 + 明信片
       └─ Chapter B：地图 + zoneIds + 路线 + 明信片

Chapter Runtime（运行时派生层）
  = City 公共字段
  + 当前 Chapter 覆盖字段
  + 按 zoneIds 筛选后的 zones
```

关键约束：不要永久改写原始 `city` 对象。切章时构造或应用一个“有效章节视图”，离开章节即可回到总览。

## 3.1 可行走地图的地理数据层

正式地图增加一个**离线构建层**，但浏览器运行时仍只加载 PNG 与 JSON，不增加后端：

```text
真实地理数据快照（GeoJSON）
  ├─ 道路 / 步道
  ├─ 河流 / 湖泊 / 泉池
  ├─ 建筑与绿地轮廓
  └─ 地标经纬度
          ↓ 固定投影、裁剪、简化、像素化
像素地图构建脚本
  ├─ 章节底图 1536×1024 PNG
  ├─ zone/scenes 像素坐标
  └─ 32px 碰撞矩形 waters
          ↓
叠加独立地标像素贴图（不改变地理骨架）
          ↓
浏览器沿用现有 engine.js 运行
```

地理数据是方位、距离关系、水系与道路的唯一真源；生成模型不得补画一条不存在的河、桥或街道。`walkable` 地图可以艺术化比例、颜色和建筑高度，但所有位置变化必须来自显式配置和可复现脚本。

## 3.2 彩色 2.5D 鸟瞰热点模式

### 3.2.1 产品与技术裁决

`oldcity-aerial-v3.png` 与 `mingfu-aerial-v3.png` 是斜俯视的章节鸟瞰插画。它们适合表达城市气质与地标关系，但屏幕坐标不是平面地理坐标，不能复用正射 GIS 的自由行走、距离、碰撞或轨迹。

因此两章采用：

```js
presentation: 'aerial-hotspots'
```

交互闭环改为：

```text
章节鸟瞰图常驻
  → 点击真实地标热点
  → 打开既有故事弹层
  → 收进手账
  → 高亮路线中的下一处
  → 达成路线/必收条件
  → 生成章节明信片
```

它仍然复用现有章节、路线、故事、`visited`、手账与 Canvas 明信片；只关闭角色移动这一层，不另建第二套页面。

### 3.2.2 数据契约

```js
{
  id: 'spring-old-city',
  status: 'available',
  presentation: 'aerial-hotspots',
  map: 'cities/jinan/chapters/oldcity-aerial-v3.png',
  geoData: 'cities/jinan/geo/oldcity-map-real-v2.json',
  mapDisclaimer: '艺术化鸟瞰图，仅用于城市文化漫游，不用于现实导航。',

  zoneIds: ['baotu', 'square', 'heihu'],
  hotspots: [
    {
      id: 'baotu-main-spring',
      zoneId: 'baotu',
      sceneIndex: 0,
      x: 282,
      y: 648,
      label: '趵突泉 · 三股泉眼',
      icon: '泉',
      geoRef: 'baotu-spring',
      required: true,
      hitRadius: 28
    }
  ],

  routes: [
    {
      id: 'springline',
      tag: '水脉',
      title: '泉水从城里经过',
      description: '趵突泉 → 泉城广场 → 黑虎泉',
      hotspotIds: [
        'baotu-main-spring',
        'quancheng-mark',
        'black-tiger-spring'
      ]
    }
  ],

  completion: {
    mode: 'all-required',
    requiredHotspotIds: [
      'baotu-main-spring',
      'quancheng-mark',
      'black-tiger-spring'
    ],
    freeRouteMinimum: 3
  }
}
```

字段约束：

- `presentation` 省略时默认 `walkable`，保证旧城市包兼容；
- `hotspot.id` 是稳定业务 ID，不得包含坐标或显示文案；
- `zoneId + sceneIndex` 必须唯一对应既有故事，继续使用 `visited` key：`${zoneId}:${sceneIndex}`；
- `x/y` 是最终 1536×1024 鸟瞰成图上的像素锚点，不是经纬度投影结果；
- `geoRef` 必须对应 `geoData` 中的真实地标 feature，用于事实追溯；
- 斜俯视透视下不能从经纬度自动计算 `x/y`，锚点需在最终图上人工标定并目视验收；
- `hitRadius` 只影响点击容错，渲染出的实际按钮仍不得小于 44×44 CSS px；
- 鸟瞰路线使用 `hotspotIds`；旧 `walkable` 路线继续使用 `zoneIds`；
- `waters`、`player`、`camera`、`zonePositions` 在 `aerial-hotspots` 运行时不参与移动逻辑，可暂时保留用于旧版回退。

### 3.2.3 引擎最小分支

建议只增加以下 helpers，不改写旧函数：

```js
const isAerialHotspots = () =>
  activeChapter?.presentation === 'aerial-hotspots';

const hotspotVisitedKey = hotspot =>
  `${hotspot.zoneId}:${hotspot.sceneIndex}`;

const hotspotById = id =>
  activeChapter?.hotspots?.find(item => item.id === id);
```

`activateChapter()`：

1. 给根节点设置 `data-presentation="aerial-hotspots"`；
2. 仍克隆本章 `zones/scenes`，再用热点 `x/y` 覆盖对应 scene 的运行时坐标，供故事卡裁图使用；
3. `waters=[]`、`trail=[]`、`player.target=null`，不启动任何移动状态；
4. 调用 `buildHotspots()` 代替 zone 级 `buildPins()`；
5. 调用 `showOverview()` 后始终保持 overview 可见。

`buildHotspots()`：

- 每个 `hotspot` 生成一个真实 `<button>`，位置为 `x/WORLD.w`、`y/WORLD.h`；
- 按 `visited` 添加 `collected`，按路线添加 `route-next/route-done`；
- 点击执行 `openHotspot(hotspot)`，不得调用 `enterZone()`。

`openHotspot()`：

```js
currentZone = hotspot.zoneId;
activeHotspotId = hotspot.id;
openScene(hotspot.sceneIndex);
```

打开故事不能隐藏 overview，不能修改 player 坐标，不能写入步数。点击“收进手账”后沿用现有 `visited.add()`，并刷新热点、路线进度、手账和完成按钮。

移动相关入口全部增加 aerial guard：

- `update()` 立即 return；
- WASD/方向键不写入 `keys`；
- canvas `pointerdown` 不设置 player target；
- dpad、`#look`、移动距离和碰撞逻辑不可达；
- `#startRoute` 改为打开或聚焦第一个未收热点，不调用 `enterZone()`。

路线推进以 `visited` 为真源，不必新增另一套存档：

```js
nextRouteHotspot = selectedRoute.hotspotIds
  .map(hotspotById)
  .find(hotspot => !visited.has(hotspotVisitedKey(hotspot)));
```

`route`/`trail` 不再代表鸟瞰模式的行走。当前章到访区域数可从已收热点的 `zoneId` 去重得到；收集顺序可从 `visited` Set 的插入顺序中过滤本章热点得到。

#### R0：zone-as-hotspot 快速兼容

首个可玩切片可以不立即引入独立 `hotspots[]`。当本章现有每个 zone 本身就是一个真实、可辨认的地标时，允许使用：

```js
{
  presentation: 'aerial-hotspots',
  zoneIds: ['baotu', 'square', 'heihu'],
  zonePositions: {
    baotu: { x: 255, y: 650, scenes: [...] },
    square: { x: 890, y: 650, scenes: [...] },
    heihu: { x: 1330, y: 585, scenes: [...] }
  },
  zoneGeoRefs: {
    baotu: 'baotu',
    square: 'square',
    heihu: 'heihu'
  },
  routes: [
    { id: 'springline', zoneIds: ['baotu', 'square', 'heihu'] }
  ]
}
```

此时每个 zone pin 就是一个鸟瞰热点：

- 点击调用 `openAerialZone(zoneId)`，不得进入 Canvas；
- 第一次打开该 zone 的第一则未收故事；重复点击依次打开下一则未收故事；
- 一条普通路线在每个 `zoneId` 至少收下一则故事后完成；
- `zoneGeoRefs[zoneId]` 必须存在且匹配 GIS JSON；
- 如果同一 zone 内的故事实际属于不同地标，增加 `sceneGeoRefs[zoneId][sceneIndex]`；
- 当后续扩到每章 5–6 个独立地标，或一个 zone 内需要多个同时可见按钮时，再无损迁移到 `hotspots[]/hotspotIds` 完整契约。

zone-as-hotspot 不是放宽真实性：普通街区、抽象区域或看不出主体的位置不能作为 zone hotspot。

### 3.2.4 UI 状态

| 状态 | 主画面 | 允许操作 | 禁止显示 |
|---|---|---|---|
| 章节初始 | 鸟瞰图 + 全部热点 + 路线卡 | 缩放、拖动、选路线、点热点 | 角色、WASD、dpad、米数 |
| 故事打开 | 鸟瞰图留在背景，故事弹层在前 | 收集、关闭 | 角色移动与碰撞反馈 |
| 收集后 | 当前热点盖章，下一热点脉冲 | 继续点图、看手账 | “走了多少步” |
| 路线完成 | 鸟瞰图 + 完成提示 | 生成明信片、补收集、换章 | 伪造的步行轨迹 |

文案必须改为：

- `点击地标，打开城市故事`；
- `下一处：黑虎泉`，不显示 `120m`；
- `已收集 2/5`；
- `按收集顺序完成本章`；
- 固定显示 `艺术化鸟瞰图，不用于现实导航`。

`finishTrip` 应由 `completion` 控制：选定普通路线时，该路线 `hotspotIds` 全部收集才可生成；自由路线达到 `freeRouteMinimum` 才可生成。未达标时按钮可见但 disabled，并明确还差几处，不能让用户误以为故障。

### 3.2.5 明信片语义

- 鸟瞰模式不得调用现有 player `trail` 绘制路线；
- 可在明信片上输出“收集顺序”文字，或用热点锚点绘制装饰性连接线；
- 若绘制连接线，必须标注为“本次漫游顺序”，不得称“实际步行轨迹”；
- `{steps}` 在该模式为空字符串或不渲染；
- `{route}` 使用已收热点 label，而不是玩家坐标；
- 章节、昵称、日期、收集数仍复用现有 overlay。

### 3.2.6 验收红线

满足以下全部条件，章节才能从 `visualPending` 改为 `available`：

1. 页面任何位置都看不到角色、WASD、dpad、米数或点击地面移动提示；
2. 点击热点只打开对应故事，overview 不消失，Canvas 自由行走从 UI 和键盘均不可达；
3. 每个热点指向画面中可辨认的真实地标，不能在普通屋顶上贴一个地标名称；
4. `geoRef` 能在本章 GIS JSON 中找到，地标间东西南北关系与真实资料一致；
5. 热点中心与目标建筑视觉主体误差不超过 24px；手机端点击目标不小于 44×44 CSS px；
6. 路线中的每个 `hotspotId` 均存在且一一对应 story；重复 ID、越界坐标或重复 `zoneId+sceneIndex` 必须阻止发布；
7. 路线推进只取决于收集状态，刷新后已收热点、下一站与完成态一致；
8. 未达完成条件不能生成章节完成明信片；达成后可以下载，且不包含步数或伪造的自由行走轨迹；
9. 桌面、390×844 竖屏、844×390 横屏均能缩放/拖图、点击全部热点和关闭故事；
10. 鸟瞰图显著位置或地图说明中存在“艺术化表达，不用于现实导航”；
11. `walkable` 旧城市包仍可自由行走，新增 presentation 分支不能破坏 legacy fallback；
12. 控制台无未捕获错误，图片与 `geoData` 无 404。

## 4. MVP 数据契约

### 4.1 脚本入口

当前 MVP 配置文件：

```text
cities/jinan/chapters.js
```

它同时暴露：

```js
window.CITY_CHAPTERS                 // 当前济南页面的主契约
window.PCW_CITY_CHAPTERS.jinan      // 为多城市预留的兼容入口
```

引擎读取优先级应为：

```js
city.chapters
  ?? window.PCW_CITY_CHAPTERS?.[city.id]
  ?? window.CITY_CHAPTERS
  ?? null
```

没有章节配置时，必须回退到现在的单地图玩法，保证其他城市包和旧链接继续工作。

### 4.2 Catalog 结构

```js
{
  defaultId: 'spring-old-city',
  overview: 'cities/jinan/chapters/overview.png',
  items: [Chapter, Chapter, ...]
}
```

字段说明：

| 字段 | 类型 | 作用 |
|---|---|---|
| `defaultId` | string | 希望优先进入的章节；运行时仍必须校验其状态为 `available` |
| `overview` | string | 济南六章节总览图 |
| `items` | Chapter[] | 六个章节，顺序即展示顺序 |

### 4.3 可玩 Chapter 结构

下面是 `presentation: 'walkable'` 的兼容结构；2.5D 鸟瞰章节使用 3.2.2 的 hotspot 契约。

```js
{
  id: 'spring-old-city',
  index: '01',
  title: '泉城老城',
  shortTitle: '泉城老城',
  subtitle: '沿泉水，穿过济南的城市中心',
  description: '...',
  icon: '泉',
  status: 'available',
  presentation: 'walkable',
  accent: '#43bdc2',

  map: 'cities/jinan/chapters/oldcity-map.png',
  postcard: 'cities/jinan/chapters/postcards/oldcity.png',
  zoneIds: ['baotu', 'square', 'heihu'],
  player: { startX: 300, startY: 510 },
  // 当新图没有沿用旧图地标坐标时，必须显式覆盖；不要改写 city.zones
  zonePositions: {
    baotu: { x: 380, y: 590 },
    square: { x: 875, y: 285 },
    heihu: { x: 1260, y: 860 }
  },
  // 必须由新图重新标定；R0 宁可设 []，也不能错误复用旧图碰撞
  waters: [],
  geography: {
    source: 'cities/jinan/geo/oldcity.source.geojson',
    bbox: [116.94, 36.64, 117.04, 36.69],
    projection: 'EPSG:3857',
    buildConfig: 'cities/jinan/geo/oldcity.map.json'
  },

  mapCopy: {
    kicker: '第一章 · 泉城老城',
    title: '跟着泉水走进老城',
    hint: '选择一条路线，从泉眼走到护城河。'
  },
  result: {
    kicker: '泉城老城篇 · 路线完成',
    title: '{name}，你的泉水线明信片做好了',
    description: '...'
  },
  downloadPrefix: '济南-泉城老城-像素明信片',
  routes: [
    {
      id: 'springline',
      tag: '水脉',
      title: '泉水从城里经过',
      description: '趵突泉 → 泉城广场 → 黑虎泉',
      zoneIds: ['baotu', 'square', 'heihu']
    }
  ]
}
```

### 4.4 章节状态机

`status` 只允许三种值：

| 状态 | 含义 | 能否进入 |
|---|---|---:|
| `available` | 当前 presentation 所需的视觉、锚点/坐标、交互与运行资产均通过验收；仅 `walkable` 要求碰撞 | 是 |
| `visualPending` | 产品结构/文案已就绪，但正式地理视觉仍在制作 | 否，只显示 `release` |
| `locked` | 后续章节，尚未进入首发制作范围 | 否，只显示预告 |

引擎开放判断必须使用正向白名单：

```js
const playable = chapter.status === 'available';
```

禁止用 `status !== 'locked'`，否则 `visualPending` 会被错误放行。当前若没有任何 `available` 章节，引擎必须安全展示章节目录，不初始化空白游戏地图、不白屏。

### 4.5 锁定 Chapter 结构

锁定章只需要总览展示字段，不应携带虚假的地图和路线：

```js
{
  id: 'yellow-river',
  index: '05',
  title: '黄河济南',
  shortTitle: '黄河济南',
  subtitle: '越过鹊华烟雨，走向北部大河',
  description: '黄河、鹊山、华山与湿地堤岸。',
  icon: '河',
  status: 'locked',
  accent: '#d9a34a',
  release: '即将开放'
}
```

### 4.6 校验规则

- 若存在 `available` 章节，`defaultId` 应指向其中一个；若 `defaultId` 仍为 `visualPending`，运行时回退到第一个 `available`，都不存在时保持章节目录安全态；
- `Chapter.id` 全局唯一，只使用稳定英文 slug；
- 可玩章的 `zoneIds` 必须全部存在于 `city.zones`；
- `walkable` 的 `Route.zoneIds` 必须是本章 `zoneIds` 的子集；`aerial-hotspots` 的 `Route.hotspotIds` 必须是本章 `hotspots.id` 的子集；
- MVP 的开放章节默认使用互不重叠的 `zoneIds`；若同一 `zoneId` 被多个章节复用，其场景收藏视为全城共享，不重复要求玩家收集；
- `map` 使用与城市世界一致的 1536×1024 画布；
- `postcard` 使用现有 Canvas 一致的 1600×900 画布；
- `walkable` 的 `player.startX/startY` 必须位于世界范围且不能落入 `waters`；
- `walkable` 新图若地标位置与旧图不同，必须提供 `zonePositions`（必要时一并覆盖 scene 坐标）；新水系必须重新提供 `waters`；
- `aerial-hotspots` 不校验 player/waters，但必须校验每个 `hotspot.x/y` 在画布内、`geoRef` 可追溯且落点指向可辨认主体；
- `walkable` 正式章必须提供可复现的 `geography.source/bbox/projection/buildConfig`；`aerial-hotspots` 必须提供 `geoData` 与 hotspot `geoRef`，并在 UI 明示它是艺术化鸟瞰图；
- `visualPending` 与 `locked` 章均不得被 URL 参数或恢复进度绕过；
- 图片替换时保持路径和尺寸不变，避免重新发版代码。

## 5. 引擎最小改造边界

现有 `js/engine.js` 保留以下逻辑，不重写：

- `loadCity()` / `applyCity()` 的城市加载；
- `enterZone()`、人物移动、镜头与碰撞；
- `visited`、`route`、`trail`；
- `openScene()` 与手账收藏；
- `drawTravelCard()`、动态叠字和 PNG 下载。

只新增四个职责：

### 5.1 读取章节目录

城市初始化后解析 catalog；不存在 catalog 时沿用旧单地图界面。

### 5.2 选择章节

总览显示六章卡片。只有 `status === 'available'` 才能调用 `selectChapter(id)`；点击 `visualPending` 或 `locked` 章只展示 `release`，不进入游戏。

### 5.3 应用章节

`applyChapter(chapter)` 做以下覆盖：

```text
worldImage.src       ← chapter.map
ticketImage.src      ← chapter.postcard
zones                ← city.zones 中 chapter.zoneIds 对应项
player start         ← chapter.player ?? city.player
地图标题             ← chapter.mapCopy
路线卡               ← chapter.routes
结果文案/文件名       ← chapter.result / chapter.downloadPrefix
```

之后按 `presentation` 分流：

```text
walkable
  → buildPins(zone)
  → enterZone
  → player/update/collision/trail

aerial-hotspots
  → buildHotspots(scene)
  → openHotspot/openScene
  → visited/route progress（无 player/collision/trail）
```

`WORLD`、`waters`、`camera` 可以继续使用城市级配置，**前提是新图严格沿用原坐标与水系**。当前图片若只保持 1536×1024 尺寸、但重新安排了地标和水系，则必须应用章级 `zonePositions` 与 `waters`：

```js
const baseZone = city.zones[zoneId];
const override = chapter.zonePositions?.[zoneId];
runtimeZone = {
  ...baseZone,
  ...override,
  scenes: baseZone.scenes.map((scene, index) => ({
    ...scene,
    ...(override?.scenes?.[index] || {})
  }))
};

waters = Object.hasOwn(chapter, 'waters')
  ? chapter.waters
  : city.waters || [];
```

覆盖时必须 clone zone/scenes，不能原地修改 `city.zones`，否则切回另一章会携带上一章坐标。

### 5.4 返回章节总览

“返回世界地图”在章节模式下应回到当前章的区域总览；额外提供“换个章节”返回六章节总览。两种返回不能混成一个状态，否则玩家容易丢失上下文。

建议只维护三个页面状态：

```text
chapter-overview → chapter-map → zone-play
       ↑                ↑           │
       └── 换章节 ───────┘← 返回地图 ┘
```

上述三段状态只适用于 `walkable`。`aerial-hotspots` 更简单：

```text
chapter-overview → aerial-chapter ↔ story-overlay → postcard
                         └──────────→ journal
```

## 6. 进度与 URL

### 6.1 URL

推荐支持：

```text
?city=jinan&chapter=spring-old-city
?city=jinan&chapter=mingfu-lake
```

规则：

- 无 `chapter`：打开六章节总览；
- 合法且 `status === 'available'`：直接打开该章地图；
- 不存在、`visualPending` 或 `locked`：回到章节总览并给出提示；
- 切章时使用 `history.replaceState()` 或 `pushState()`，不强制刷新页面。

### 6.2 本地存储

旧版键为 `pcw:jinan`。本次 MVP 已升级为版本 2，采用“全城收藏 + 当前章行走态”：

```js
{
  v: 2,
  name: '旅行者',
  chapterId: 'spring-old-city',
  visited: ['baotu:0', 'oldcity:0'],
  route: ['baotu'],
  steps: 120
}
```

隔离规则：

- `visited` 不在切章时物理清空，它是城市册级收藏；
- 手账、统计和明信片只读取当前 `active zones` 中的 `visited`，因此不会串章；
- `route`、`trail`、`currentZone`、`nearScene`、`activeScene` 在切章时清空；
- 这样玩家切回章节时，已收过的景点仍然存在，而上一章路线不会画到下一章明信片上；
- v1 记录可继续读取；升级时保留昵称、收藏和合法路线，不删除用户数据。

如果后续需要恢复“每章上次走到哪、每章独立步数和路线”，再升级为 v3 的 `chapters[chapterId]` 子状态；这不是首版交付的前置条件。

## 7. 明信片架构

章节明信片继续使用同一个 `#travelCard` 和 `drawTravelCard()`：

1. 底图由 `chapter.postcard` 决定；
2. 玩家昵称、日期、走过区域、收录数仍由 Canvas 动态绘制；
3. `walkable` 可绘制当前章 player `trail`；`aerial-hotspots` 禁止使用 player trail，只能输出热点收集顺序；
4. 结果弹窗文案使用 `chapter.result`；
5. 文件名使用 `chapter.downloadPrefix`；
6. 旧 `city.postcard.overlay` 先共用，若两张票面留白位置不同，再允许章级增加 `postcardOverlay` 覆盖。

首版图片应把动态文字留白放在相同坐标，避免立即引入两套 overlay 配置。

## 8. 视觉资产复用契约

### 8.0 地图/鸟瞰图来源红线（正式发布要求）

以下规则优先级高于视觉风格：

- `walkable` 的道路、水系、片区轮廓、地标锚点和碰撞必须由地理数据构建；
- 可使用 OpenStreetMap 或明确允许再利用的政府开放数据，但必须保存本次使用的离线快照、查询时间、许可与署名；
- 禁止把文生图/图生图产物作为 `walkable` 自由行走底图；
- 生成式彩色 2.5D 图可作为 `aerial-hotspots` 的正式章节鸟瞰插画，但不得提供自由行走、碰撞、距离或现实路线语义；
- 鸟瞰图的每个可交互地标必须有 GIS `geoRef`，最终热点以成图人工锚点为准，并通过真实相对方位与视觉主体双重验收；
- `walkable` 地标贴图叠加时以经纬度投影后的 anchor 为准，不得为了构图随意挪到别的街区；
- 若贴图比例被艺术化放大，anchor 不变，并在构建配置中记录 `scale/offset`；
- 任何没有 `presentation` 声明、GIS 追溯、热点锚点表和非导航说明的纯生成区域图都视为 concept，不得通过正式验收。

六章节总览不承担导航，但其中黄河、山体、老城、商埠与新城的相对位置仍应来自城市级地理骨架；可以简化，不可凭生成模型重新排布。

### 8.0.1 建议地理目录

```text
cities/jinan/
├── geo/
│   ├── SOURCES.md                   # 数据来源、查询日期、许可与署名
│   ├── overview.source.geojson      # 城市级南山—泉湖—黄河骨架
│   ├── overview.map.json            # 调色、图层、简化与输出参数
│   ├── oldcity.source.geojson       # 第一章离线地理快照
│   ├── oldcity.map.json
│   ├── mingfu.source.geojson        # 第二章离线地理快照
│   └── mingfu.map.json
├── landmarks/                       # 生成/手绘的透明地标贴图
└── chapters/                         # 构建产物，不手工决定地理
    ├── overview.png
    ├── oldcity-map.png
    └── mingfu-map.png
```

### 8.0.2 构建输入与输出

建议新增：

```text
scripts/build-jinan-maps.mjs
```

职责限定为：

1. 读取已落盘 GeoJSON，不在每次页面打开时请求地图服务；
2. 用固定 bbox 和投影将经纬度映射到 1536×1024；
3. 按固定图层顺序绘制水域、绿地、街区、道路、步道；
4. 将水域几何栅格化到 32px 网格，合并为引擎可用的 `waters` 矩形；
5. 将地标经纬度转换为 `zonePositions`；
6. 按 anchor 叠加透明地标贴图；
7. 生成 PNG、章级坐标片段和构建清单（含源文件哈希）；
8. 相同输入多次构建得到相同输出。

首版为了不改碰撞引擎，继续输出矩形 `waters`；后续若需要更精细的河道碰撞，再改成碰撞 mask，不作为 R0 前置。

### 8.1 目录

运行时路径已冻结：

```text
cities/jinan/
├── chapters.js
├── chapters/
│   ├── overview.png
│   ├── oldcity-map.png
│   ├── mingfu-map.png
│   └── postcards/
│       ├── oldcity.png
│       └── mingfu.png
└── landmarks/                 # 建议新增：可复用地标透明母稿
    ├── baotu-spring.png
    ├── spring-mark.png
    ├── black-tiger-spring.png
    ├── qushuiting-street.png
    ├── daming-lake.png
    └── chaoran-tower.png
```

### 8.2 一源三用

每个地标只维护一个透明背景母稿，至少 512×512，朝向和光源统一。由母稿派生：

```text
landmark master
  ├─ 总览图中的章节符号（小、剪影清楚）
  ├─ 区域地图中的地标（中、保留入口与朝向）
  └─ 明信片中的主视觉（大、保留建筑细节）
```

“复用”指复用同一个视觉母稿与识别特征，不是把 512px 图片机械缩小。小尺寸版本要重新清理像素轮廓。

这里的“一源三用”只适用于地标图形。`walkable` 底图的真源是 GeoJSON + map build config；`aerial-hotspots` 的地理真源是 GIS JSON，视觉载体是冻结的鸟瞰成图，交互真源是热点锚点表。

### 8.3 首发两章的资产归属

| 地标母稿 | 泉城老城地图 | 明府城地图 | 泉水线明信片 | 湖城明信片 |
|---|---:|---:|---:|---:|
| 趵突泉三股泉涌 | ✓ |  | ✓ |  |
| 泉城广场泉标 | ✓ |  | ✓ |  |
| 黑虎泉三虎吐水 | ✓ |  | ✓ |  |
| 曲水亭街泉渠石桥 |  | ✓ |  | ✓ |
| 大明湖荷花湖面 |  | ✓ |  | ✓ |
| 超然楼 |  | ✓ |  | ✓ |

超然楼可以在地图中作为大明湖景区内的视觉地标，但不必立即拆成新 `zone`；先作为 `daming` 的场景/明信片主视觉，减少数据改动。

### 8.4 图片验收

- 不看文字，济南用户能辨认章节主地标；
- 同一建筑在地图和明信片中屋顶层数、轮廓、主色一致；
- 地图不是通用江南水乡：趵突泉三股、黑虎泉三虎、超然楼重檐必须保留；
- `walkable` 随机抽查至少 5 个地标锚点，和地理投影位置误差不得超过 16px；
- `aerial-hotspots` 的锚点与成图主体误差不得超过 24px，并逐个核对 `geoRef` 与真实相对方位；
- `walkable` 的水系、主要道路和地标相对方位必须可由同一脚本重建；
- 所有运行图按像素整数倍输出，浏览器使用 nearest-neighbor，不出现模糊边缘；
- `walkable` 地标位置与 `zone.x/y` 对齐；`aerial-hotspots` 地标位置与 `hotspot.x/y` 对齐；
- 图片不得包含将由 Canvas 动态绘制的昵称、日期和路线；
- 新素材来源与许可同步写入 `ASSET_LICENSES.md`。

## 9. 文件清单

### 本次 MVP 必需

```text
M  index.html
   加载 chapters.js；增加六章节总览容器和换章入口

M  css/style.css
   章节卡片、锁定态、章节返回入口和移动端样式

M  js/engine.js
   章节读取、选章、应用章、章级路线与明信片切换

A  cities/jinan/chapters.js
   MVP 章节运行配置；六章元数据，两章可玩

A  cities/jinan/chapters/overview.png
A  cities/jinan/chapters/oldcity-map.png
A  cities/jinan/chapters/mingfu-map.png
A  cities/jinan/chapters/postcards/oldcity.png
A  cities/jinan/chapters/postcards/mingfu.png

A  cities/jinan/geo/*.source.geojson
A  cities/jinan/geo/*.map.json
A  cities/jinan/geo/SOURCES.md
A  scripts/build-jinan-maps.mjs

M  ASSET_LICENSES.md
   记录五张成图及其母稿/生成方式/许可
```

### 下一步建议

```text
A  cities/jinan/landmarks/*.png
   独立地标透明母稿，成为后续地图、明信片、周边的视觉真源

M  cities/jinan/city.json
   将 chapters.js 数据迁入顶层 chapters

M  cities/jinan/city-data.js
   由脚本从 city.json 生成，不再人工维护重复 JSON

A  scripts/build-city-bundle.mjs
   生成离线可用的 city-data.js，消除 index.html 内联大对象
```

## 10. 迁移步骤

### 阶段 A：当天可交付

1. 新增 `chapters.js`，先固定六章名称、状态、首发两章路线与图片路径；
2. 冻结两张已确认的 2.5D 鸟瞰图及对应 GIS JSON，逐个建立 `geoRef → hotspot x/y → story` 锚点表；
3. 两章配置 `presentation: 'aerial-hotspots'`、`hotspots`、`routes.hotspotIds` 与 `completion`；
4. `index.html` 在 `engine.js` 之前加载 `chapters.js`；
5. 引擎增加 presentation 分支：鸟瞰图常驻、点击 hotspot 开故事、全面禁用移动/碰撞/trail；
6. 完成路线下一站、收集进度、完成门槛和非导航说明；
7. 两章明信片沿用 1600×900 与同一动态叠字区域；
8. 验证切章后地图、路线、结果图和下载文件名同时切换。

### 阶段 B：稳定后去重

1. 把 `chapters.js` 中的 catalog 复制到 `city.json.chapters`；
2. 引擎保持现有读取优先级，因此无需改业务逻辑；
3. 用脚本从 `city.json` 生成 `city-data.js`；
4. 删除 `index.html` 内联的济南大对象，只加载生成 bundle；
5. 保留 `chapters.js` 一个版本作为兼容，然后在下个小版本移除。

### 阶段 C：扩章

新增一章只需要：

1. 在 `city.zones` 增加或复用地标数据；
2. 为 catalog 增加一个 `available` Chapter；
3. 补一张区域地图和一张明信片；
4. 按同一路径完成试玩与验收；
5. 不修改人物移动、收藏和 Canvas 下载逻辑。

## 11. 验收清单

### 功能

- 发布前必须先将目标两章从 `visualPending` 切换为 `available`；仅有章节骨架时，下列可玩验收项不适用，也不得宣称完成；
- 首屏能看见六个章节，两个开放、四个锁定；
- 锁定章点击后不会进入空白地图；
- 泉城老城只显示趵突泉、泉城广场、黑虎泉；
- 明府城与大明湖只显示曲水亭街、大明湖；
- 两章均保持鸟瞰图常驻，点击热点直接打开故事，角色自由走与碰撞不可达；
- 两章的路线卡、起点、地图标题不同；
- 完成不同章节，结果底图、结果文案和下载文件名不同；
- 切章后不残留上一章的路线、收藏统计和轨迹；全城 `visited` 会保留，但 UI 只展示当前章收藏；
- `?city=jinan`、`?city=jinan&chapter=...` 均可打开；
- 没有章节配置的城市仍走旧单地图流程。

### 视觉

- 总览图表达“南山—城中泉湖—北黄河”的章节格局，但不承担导航；
- 总览和区域鸟瞰图的地理事实均能追溯到仓库内 GIS JSON；每个可点击地标都有 `geoRef` 与成图锚点；
- 两张区域图看得出是不同济南片区，不是同一张图换滤镜；
- 超然楼、趵突泉和黑虎泉在地图与明信片中使用一致识别特征；
- 桌面端与手机横屏均无文字遮挡、拉伸或模糊；
- 下载 PNG 为 1600×900，昵称与当天日期可读。

## 12. 已知风险与控制

| 风险 | 影响 | MVP 控制 |
|---|---|---|
| 把斜俯视鸟瞰图当正射地图 | 角色穿楼、距离与碰撞失真 | 使用 `aerial-hotspots`，彻底禁用自由行走/碰撞/步数，只允许成图热点点击 |
| 鸟瞰图局部地理艺术化 | 用户误认为现实导航图 | GIS JSON 保留事实追溯；逐热点校验真实地标与相对方位；UI 固定非导航说明 |
| 热点与画面主体错位 | 点建筑 A 打开故事 B | 最终成图人工锚定，误差≤24px；不能复用正射 JSON 的 x/y |
| 切章后旧状态泄漏 | 明信片路线串章 | 清空路线/轨迹等章内运行态；`visited` 跨章保留并按 active zones 过滤 |
| `city.json`、`city-data.js`、HTML 内联数据三份重复 | 修改容易漏同步 | 本次不扩大重复；下一阶段用生成脚本收敛 |
| 两张明信片留白位置不同 | Canvas 动态文字错位 | 首版强制共用 1600×900 模板与 overlay 坐标 |
| AI 生图改变地标形态 | 济南识别度下降 | 先定独立母稿，再组合；按地标逐张人工验收 |
| 一次开放六章 | 图片质量与开发范围失控 | 只开放两章，其他章只承担未来预告 |

## 13. 架构完成标准

当新增第三章时，如果只需要增加章节配置、景点数据和两张成图，而无需复制页面或重写移动/收藏/下载逻辑，说明章节化架构成立。

本阶段最重要的不是“六张地图都能点”，而是跑通这条可复制链路：

```text
六章总览 → 选择开放章 → 鸟瞰图点击真实地标 → 收集本章故事
→ 生成本章专属明信片 → 回到总览继续收集
```
