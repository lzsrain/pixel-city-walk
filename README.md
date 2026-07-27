# Pixel City Walk｜像素漫游

[![License: MIT](https://img.shields.io/badge/Code-MIT-2ea44f.svg)](./LICENSE)
[![Artwork: CC BY 4.0](https://img.shields.io/badge/AI%20map-CC%20BY%204.0-8a63d2.svg)](./ASSET_LICENSES.md)
[![No build step](https://img.shields.io/badge/build-none-f4c64f.svg)](#快速运行)
[![Live Demo](https://img.shields.io/badge/在线试玩-泉城漫游记-d85b44.svg)](https://jinan.airo.siphot.com/)
[![GitHub stars](https://img.shields.io/github/stars/lzsrain/pixel-city-walk?style=social)](https://github.com/lzsrain/pixel-city-walk/stargazers)

一个由 AI 协助完成的开源像素城市漫游网页游戏。

它希望让任何人都能把自己的城市、景区、校园或园区做成一个可以行走、打卡、阅读故事并生成旅行纪念卡的像素世界。

> 🎮 **[立即在线试玩济南示例](https://jinan.airo.siphot.com/)** · ⭐ **[觉得有趣，欢迎点个 Star](https://github.com/lzsrain/pixel-city-walk)** · 🏙️ **[用 AI 改成你的城市](./CITY_CUSTOMIZATION_GUIDE.md)**

Build a walkable pixel world for any city, campus, scenic area or community — no backend and no build step required.

## 30 秒体验

1. 输入你的名字，从一处济南景点出发；
2. 用键盘、鼠标或触屏控制人物游览；
3. 查看景点故事，把喜欢的风景收进旅行手账；
4. 结束漫游，生成并下载带昵称、路线和当天日期的旅行明信片。

## 首个示例：泉城漫游记

仓库当前自带济南示例。玩家可以在抽象的济南像素世界中选择出发地点、控制人物游览、查看景点介绍、记录打卡路线，并生成带昵称的旅行纪念卡。

![泉城漫游记示例地图](./cities/jinan/map.png)

## 当前功能

- 济南像素世界总览
- 键盘、鼠标与触屏移动
- 千佛山、趵突泉、大明湖、泉城广场、黑虎泉与护城河等区域
- NPC 新手引导
- 景点介绍与旅行手账
- 本地浏览器进度保存（昵称、路线、手账自动保存，老玩家跳过引导并可重新开始）
- 16:9 像素旅行明信片生成与 PNG 下载（票面绘制昵称、日期、漫游路线与统计）
- 桌面端和移动端适配

## 快速运行

项目没有构建步骤，也不依赖后端。

```bash
python -m http.server 8080
```

然后访问：

```text
http://127.0.0.1:8080/
```

也可以使用任意静态文件服务器运行。由于浏览器对 `file://` 下的本地存储行为不完全一致，不建议直接双击 `index.html` 作为正式使用方式。

## 项目结构

```text
pixel-city-walk/
├── index.html                 # HTML 骨架，引用外部 CSS/JS
├── css/
│   └── style.css              # 全部样式
├── js/
│   └── engine.js              # 引擎逻辑（城市无关，只读取 city.json）
├── cities/
│   └── jinan/
│       ├── city.json          # 济南专属数据（区域、景点、坐标、NPC、配色、文案）
│       ├── map.png            # 城市像素地图
│       └── ticket-base.png    # 旅行票根底图
├── assets/
│   └── character/
│       ├── james.png          # 玩家精灵（通用，不随城市变化）
│       └── LICENSE.txt
├── ASSET_LICENSES.md
├── CITY_CUSTOMIZATION_GUIDE.md
├── CHANGELOG.md
├── CONTRIBUTING.md
├── LICENSE
└── README.md
```

引擎与城市内容已分离：`js/engine.js` 不含任何城市专属数据，所有区域、景点、坐标、NPC 文案、配色和 UI 文本都由 `cities/<城市>/city.json` 提供。换城市时只需新建一个 `cities/<城市>/` 目录并修改其中的 `city.json` 与图片，无需改动引擎代码。

## 关于“原创”

Pixel City Walk 参考了像素城市地图、城市漫游和数字集章等通用产品创意，但没有复制 8-Bit Cities、Isometric NYC 或其他城市地图项目的源码与美术素材。

本仓库中的页面实现、交互流程、济南场景组织、打卡体验和旅行名片由项目作者在 AI 协助下独立完成。第三方角色素材与 AI 生成地图不属于“纯手工原创”，其来源和许可单独记录在 [ASSET_LICENSES.md](./ASSET_LICENSES.md)。

## 改造成其他城市

当前版本已将城市内容从引擎代码中拆出。要创建自己的城市，只需要：

1. 复制 `cities/jinan/` 目录为 `cities/你的城市名/`；
2. 修改其中的 `city.json`：城市名、区域坐标、景点介绍、NPC 文案、配色和 UI 文本；
3. 替换 `map.png`（城市地图）和 `ticket-base.png`（旅行票根底图）；
4. 在浏览器访问 `http://127.0.0.1:8080/?city=你的城市名` 即可加载。

引擎代码（`js/engine.js`）不需要改动。`city.json` 中的 `world`、`player`、`camera`、`theme`、`npc`、`zones`、`ui` 等字段决定了游戏的所有内容和外观。

如果你不会写代码，可以直接阅读 [《用 AI 把示例改成你的城市》](./CITY_CUSTOMIZATION_GUIDE.md)。里面提供了可复制给 Codex、WorkBuddy、ZCode、Hermes 或 OpenClaw 的完整提示词，包括城市资料核对、固定景点坐标、地图生图、票根视觉和发布前检查。

## 许可

除另有说明外，本项目原创源代码采用 [MIT License](./LICENSE)。

美术素材不自动适用 MIT，必须遵守 [ASSET_LICENSES.md](./ASSET_LICENSES.md) 中分别列出的条款。

简要范围：

- 原创代码与文档：MIT
- AI 生成的济南像素地图：CC BY 4.0
- James 像素角色：CC0 1.0

## 参与贡献

欢迎提交问题、改进移动端体验、补充无障碍支持，以及贡献新的城市适配方案。请先阅读 [CONTRIBUTING.md](./CONTRIBUTING.md) 和 [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)。

发现安全问题时，请按照 [SECURITY.md](./SECURITY.md) 通过 GitHub 私密渠道报告，不要在公开 Issue 中披露敏感细节。

## 非官方声明

本项目不是济南市政府、文化和旅游部门、景区或地图服务商的官方产品，也不代表任何官方推荐路线。像素地图属于抽象艺术表达，不应用于导航。景点信息可能随时间变化，实际游览请以相关机构的最新官方信息为准。

## AI 使用说明

项目在视觉生成、代码实现、调试和文档整理过程中使用了 AI 工具。AI 协助不改变第三方素材原有许可，也不代表项目与任何 AI 服务提供方存在官方合作或背书关系。
