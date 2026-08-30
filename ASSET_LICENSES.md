# 素材来源与许可

顶层 `LICENSE` 仅适用于项目作者有权许可的原创源代码和明确标注的文档，不会自动覆盖本文件列出的素材。

## 济南景点拼豆母版照片

`assets/beads/pixel/` 中的十张低分辨率像素母版由 Wikimedia Commons 景点照片转换而来，仅用于生成拼豆图纸。原照片作者及具体 CC 许可请以对应文件页为准：

- [趵突泉](https://commons.wikimedia.org/wiki/File:Baotu_Spring,_Jinan_in_Oct_2013.jpg)
- [超然楼](https://commons.wikimedia.org/wiki/File:Chaoran_Tower,_Daming_Lake,_Jinan_in_October_2019.jpg)
- [千佛山万佛洞](https://commons.wikimedia.org/wiki/File:Buddha_Grotto_Qianfo_Mountain.jpg)
- [黑虎泉](https://commons.wikimedia.org/wiki/File:Black_tiger_spring.jpg)
- [泉城广场泉标](https://commons.wikimedia.org/wiki/File:济南泉城广场泉标2019.jpg)
- [曲水亭街](https://commons.wikimedia.org/wiki/File:曲水亭街.jpg)
- [解放阁](https://commons.wikimedia.org/wiki/File:Jinan_Liberation_Pavilion_20191001.jpg)
- [五龙潭水榭](https://commons.wikimedia.org/wiki/File:Five_dragon_pool_pavilion_2008_09.jpg)
- [洪家楼教堂](https://commons.wikimedia.org/wiki/File:Sacred-Heart-Cathedral-Jinan.JPG)
- [灵岩寺塔林](https://commons.wikimedia.org/wiki/File:Stupas_at_Lingyan_Si.jpg)

正式版黑虎泉 87×87 图纸另使用济南市政府英文网站公开景点图，以确保三处出水口同框、主体可辨识：

- 文件：`assets/beads/source/heihu-front.jpg`
- 来源：[Jinan, a City of Springs](https://english.jinan.gov.cn/art/2018/12/4/art_29569_2729051.html)
- 说明：该来源页面未在图片旁给出可复用许可，现阶段只作为内部产品样稿；项目正式开源发布前应替换成兼容许可证的同构图照片，或取得书面授权。

## 济南真实地理底图

- 原始数据：`cities/jinan/geo/jinan-core.osm`
- 覆盖范围：117.003–117.032°E，36.654–36.679°N
- 来源：[OpenStreetMap contributors](https://www.openstreetmap.org/copyright)
- 许可：Open Data Commons Open Database License（ODbL）1.0
- 处理方式：项目脚本 `scripts/build-real-jinan-map.py` 根据真实道路、水系、公园、建筑轮廓和地标经纬度确定性渲染；像素化仅改变视觉表现，不移动或虚构地理要素。
- 署名要求：发布使用该数据生成的地图时保留 `© OpenStreetMap contributors` 及 ODbL 链接。

## 济南像素地图

- 文件：`cities/jinan/map.png`
- 类型：AI 生成内容，经项目作者选择并用于抽象游戏地图
- 生成工具：OpenAI `gpt-image 2.0`
- 来源证据：原始 PNG 内嵌 C2PA 内容凭证，标记 `trainedAlgorithmicMedia` 与 `OpenAI Media Service API`
- 使用范围：本项目中的非官方、非精确地理表达
- 许可：[Creative Commons Attribution 4.0 International（CC BY 4.0）](https://creativecommons.org/licenses/by/4.0/)
- 建议署名：`Jinan pixel map by Kairo, generated with OpenAI gpt-image 2.0, CC BY 4.0`

在项目作者依法享有相关权利的范围内，允许复制、修改、再发布和商业使用该地图，但须按 CC BY 4.0 提供合理署名、许可证链接，并标明是否修改。不得声称该地图为济南官方地图，不得暗示济南市政府、景区或 OpenAI 对衍生项目提供背书。该图片可能与其他生成输出存在相似之处，使用者应自行评估具体使用场景、当地法律及第三方权利风险。

## 济南旅行票根明信片

- 文件：`cities/jinan/ticket-base.png`
- 类型：AI 生成的济南旅行纪念票根插画（经项目修改，见下）
- 生成工具：OpenAI `gpt-image 2.0`
- 用途：玩家结束漫游后的固定下载底图
- 使用范围：济南景点的非官方、艺术化相对方位表达
- 许可：[Creative Commons Attribution 4.0 International（CC BY 4.0）](https://creativecommons.org/licenses/by/4.0/)
- 建议署名：`Jinan travel ticket artwork by Kairo, generated with OpenAI gpt-image 2.0, CC BY 4.0`
- 修改说明（依 CC BY 4.0 标明修改）：2026-07-27 由项目在 AI 协助下对原始成图做了图像修复处理，移除了右侧票根上原本画死的编号"0721"、副标题"我的泉城足迹"、日期"2026-07-21"和"宜：看泉 忌：赶路"文字，相应区域按周围奶油纸张的颜色与颗粒纹理修复为留白；印章、"济南漫游"标题、指南针、荷花、英文与条码等装饰未改动。留白区域的文字改由游戏引擎按 `cities/jinan/city.json` 的 `postcard.overlay` 配置在运行时动态绘制。

该插画中的景点比例、街道和水系经过艺术化处理，不应用于现实导航。用于其他城市时，建议按照 `CITY_CUSTOMIZATION_GUIDE.md` 重新核对景点相对方位并生成自己的票根底图。

## James 像素角色

- 文件：`assets/character/james.png`
- 作者：ImogiaGames
- 来源：[Pixel Character 02 - James](https://opengameart.org/content/pixel-character-02-james)
- 许可：[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)
- 说明：原发布页说明该角色是 Frozenen 的 CC0 作品 `Random Pixel Characters` 的 remix

CC0 不强制署名，但本项目保留作者、来源和许可证记录，便于溯源。不得暗示素材作者或 OpenGameArt 对本项目提供官方背书。

角色目录内的原始许可记录同时保存在 `assets/character/LICENSE.txt`。
