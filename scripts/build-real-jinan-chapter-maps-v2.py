#!/usr/bin/env python3
"""Render two walkable, full-frame Jinan chapter maps from real OSM data.

North stays up; x/y share one locally corrected scale.  The renderer chooses
which real features are legible at each zoom, but never moves or invents one.
Landmark text stays in the companion JSON so game UI can place it without
covering roads.  The PNG contains exact-coordinate compact markers only.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from math import cos, radians
from pathlib import Path
from typing import Iterable
from xml.etree.ElementTree import iterparse
import json

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "cities/jinan/geo/jinan-core.osm"
OUT_DIR = ROOT / "cities/jinan/chapters"
META_DIR = ROOT / "cities/jinan/geo"
WORK_W, WORK_H, UPSCALE = 768, 512, 2
OUT_W, OUT_H = WORK_W * UPSCALE, WORK_H * UPSCALE
PAD = 10

COLORS = {
    "land": "#e7dab7",
    "residential": "#decca2",
    "commercial": "#d7bd8d",
    "education": "#d9c99b",
    "park": "#769658",
    "garden": "#91ae68",
    "park_dark": "#456744",
    "water": "#328f9d",
    "water_dark": "#176674",
    "water_light": "#65c6be",
    "building": "#a59572",
    "building_dark": "#75654f",
    "heritage": "#ac4d32",
    "heritage_dark": "#733422",
    "gold": "#f0b84d",
    "road_case": "#806f58",
    "road_major": "#f6ebc9",
    "road_minor": "#cbbb98",
    "road_walk": "#f1d596",
    "road_path": "#d6c798",
    "spring": "#d9f4de",
    "spring_dark": "#157f83",
    "ink": "#172b27",
    "cream": "#f8edce",
}


@dataclass
class Way:
    osm_id: int
    refs: list[int]
    tags: dict[str, str]


@dataclass
class Relation:
    osm_id: int
    members: list[tuple[str, int, str]]
    tags: dict[str, str]


@dataclass(frozen=True)
class Chapter:
    chapter_id: str
    filename: str
    bbox: tuple[float, float, float, float]
    landmark_ids: tuple[str, ...]


CHAPTERS = [
    Chapter(
        "oldcity",
        "oldcity-map-real-v2.png",
        (117.0050, 36.6575, 117.0302, 36.6673),
        ("baotu", "wulong", "square", "heihu", "jiefang"),
    ),
    Chapter(
        "mingfu",
        "mingfu-map-real-v2.png",
        (117.0120, 36.6624, 117.0300, 36.6772),
        ("furong", "pearl", "qushuiting", "baihuazhou", "daming", "chaoran"),
    ),
]

LANDMARKS = {
    "baotu": {"name": "趵突泉", "kind": "spring", "feature": ("node", 5723485328)},
    "wulong": {"name": "五龙潭", "kind": "lake", "feature": ("way", 482251967)},
    "square": {"name": "泉城广场", "kind": "square", "feature": ("way", 591478174)},
    "heihu": {"name": "黑虎泉", "kind": "spring", "feature": ("node", 5723485330)},
    "jiefang": {"name": "解放阁", "kind": "pavilion", "feature": ("way", 31781501)},
    "furong": {"name": "芙蓉街", "kind": "street", "feature": ("node", 8842243915)},
    "pearl": {"name": "珍珠泉", "kind": "spring", "feature": ("node", 5530538384)},
    "qushuiting": {"name": "曲水亭街", "kind": "street", "feature": ("way", 1140719131)},
    "baihuazhou": {"name": "百花洲", "kind": "lake", "feature": ("way", 39723709)},
    "daming": {"name": "大明湖", "kind": "lake", "feature": ("relation", 2616968)},
    "chaoran": {"name": "超然楼", "kind": "pavilion", "feature": ("way", 578321008)},
}


nodes: dict[int, tuple[float, float]] = {}
node_tags: dict[int, dict[str, str]] = {}
ways: list[Way] = []
way_by_id: dict[int, Way] = {}
relations: list[Relation] = []
relation_by_id: dict[int, Relation] = {}

for _event, elem in iterparse(SOURCE, events=("end",)):
    if elem.tag == "node":
        osm_id = int(elem.attrib["id"])
        nodes[osm_id] = (float(elem.attrib["lon"]), float(elem.attrib["lat"]))
        node_tags[osm_id] = {t.attrib["k"]: t.attrib["v"] for t in elem.findall("tag")}
    elif elem.tag == "way":
        way = Way(
            int(elem.attrib["id"]),
            [int(nd.attrib["ref"]) for nd in elem.findall("nd")],
            {t.attrib["k"]: t.attrib["v"] for t in elem.findall("tag")},
        )
        ways.append(way)
        way_by_id[way.osm_id] = way
    elif elem.tag == "relation":
        relation = Relation(
            int(elem.attrib["id"]),
            [(m.attrib.get("type", ""), int(m.attrib["ref"]), m.attrib.get("role", "")) for m in elem.findall("member")],
            {t.attrib["k"]: t.attrib["v"] for t in elem.findall("tag")},
        )
        relations.append(relation)
        relation_by_id[relation.osm_id] = relation
    if elem.tag in {"node", "way", "relation"}:
        elem.clear()


def join_segments(segments: Iterable[list[int]]) -> list[list[int]]:
    remaining = [list(segment) for segment in segments if len(segment) >= 2]
    rings: list[list[int]] = []
    while remaining:
        ring = remaining.pop(0)
        changed = True
        while changed and ring[0] != ring[-1]:
            changed = False
            for index, segment in enumerate(remaining):
                if ring[-1] == segment[0]:
                    ring.extend(segment[1:])
                elif ring[-1] == segment[-1]:
                    ring.extend(reversed(segment[:-1]))
                elif ring[0] == segment[-1]:
                    ring = segment[:-1] + ring
                elif ring[0] == segment[0]:
                    ring = list(reversed(segment[1:])) + ring
                else:
                    continue
                remaining.pop(index)
                changed = True
                break
        rings.append(ring)
    return rings


def relation_rings(relation: Relation, role: str) -> list[list[int]]:
    return join_segments(
        way_by_id[ref].refs
        for feature_type, ref, member_role in relation.members
        if feature_type == "way" and member_role == role and ref in way_by_id
    )


def centroid(points: list[tuple[float, float]]) -> tuple[float, float]:
    if not points:
        raise ValueError("Empty geometry")
    if points[0] != points[-1]:
        points = points + [points[0]]
    twice_area = 0.0
    cx = cy = 0.0
    for index in range(len(points) - 1):
        cross = points[index][0] * points[index + 1][1] - points[index + 1][0] * points[index][1]
        twice_area += cross
        cx += (points[index][0] + points[index + 1][0]) * cross
        cy += (points[index][1] + points[index + 1][1]) * cross
    if abs(twice_area) < 1e-14:
        usable = points[:-1]
        return sum(p[0] for p in usable) / len(usable), sum(p[1] for p in usable) / len(usable)
    return cx / (3 * twice_area), cy / (3 * twice_area)


def feature_anchor(feature: tuple[str, int], renderer) -> tuple[float, float]:
    feature_type, osm_id = feature
    if feature_type == "node":
        return nodes[osm_id]
    if feature_type == "way":
        return centroid([nodes[ref] for ref in way_by_id[osm_id].refs if ref in nodes])
    relation = relation_by_id[osm_id]
    rings = relation_rings(relation, "outer")
    largest = max(
        rings,
        key=lambda refs: renderer.area(
            [renderer.xy(*nodes[ref]) for ref in refs if ref in nodes]
        ),
    )
    return centroid([nodes[ref] for ref in largest if ref in nodes])


class Renderer:
    def __init__(self, chapter: Chapter):
        self.chapter = chapter
        self.min_lon, self.min_lat, self.max_lon, self.max_lat = chapter.bbox
        self.mid_lon = (self.min_lon + self.max_lon) / 2
        self.mid_lat = (self.min_lat + self.max_lat) / 2
        self.lon_correction = cos(radians(self.mid_lat))
        self.scale = min(
            (WORK_W - 2 * PAD) / ((self.max_lon - self.min_lon) * self.lon_correction),
            (WORK_H - 2 * PAD) / (self.max_lat - self.min_lat),
        )
        self.img = Image.new("RGB", (WORK_W, WORK_H), COLORS["land"])
        self.draw = ImageDraw.Draw(self.img)

    def xy(self, lon: float, lat: float) -> tuple[int, int]:
        return (
            round(WORK_W / 2 + (lon - self.mid_lon) * self.lon_correction * self.scale),
            round(WORK_H / 2 - (lat - self.mid_lat) * self.scale),
        )

    def points(self, refs: list[int]) -> list[tuple[int, int]]:
        return [self.xy(*nodes[ref]) for ref in refs if ref in nodes]

    @staticmethod
    def closed(points: list[tuple[int, int]]) -> bool:
        return len(points) >= 3 and points[0] == points[-1]

    @staticmethod
    def area(points: list[tuple[int, int]]) -> float:
        if len(points) < 3:
            return 0.0
        return abs(sum(
            points[i][0] * points[(i + 1) % len(points)][1]
            - points[(i + 1) % len(points)][0] * points[i][1]
            for i in range(len(points))
        ) / 2)

    @staticmethod
    def in_water_rects(x: int, y: int, waters: list[dict[str, int]], radius: int = 10) -> bool:
        return any(
            x + radius > water["x"]
            and x - radius < water["x"] + water["w"]
            and y + radius > water["y"]
            and y - radius < water["y"] + water["h"]
            for water in waters
        )

    @staticmethod
    def merge_grid_cells(cells: set[tuple[int, int]], grid: int) -> list[dict[str, int]]:
        """Merge occupied grid cells into stable axis-aligned rectangles."""
        rows: dict[int, list[int]] = defaultdict(list)
        for gx, gy in cells:
            rows[gy].append(gx)
        runs_by_row: dict[int, list[tuple[int, int]]] = {}
        for gy, xs in rows.items():
            ordered = sorted(xs)
            runs: list[tuple[int, int]] = []
            start = previous = ordered[0]
            for gx in ordered[1:]:
                if gx == previous + 1:
                    previous = gx
                    continue
                runs.append((start, previous))
                start = previous = gx
            runs.append((start, previous))
            runs_by_row[gy] = runs

        active: dict[tuple[int, int], dict[str, int]] = {}
        rectangles: list[dict[str, int]] = []
        for gy in range((OUT_H + grid - 1) // grid):
            current = set(runs_by_row.get(gy, []))
            for run in list(active):
                if run not in current:
                    rectangles.append(active.pop(run))
            for run in current:
                if run in active:
                    active[run]["h"] += grid
                else:
                    active[run] = {
                        "x": run[0] * grid,
                        "y": gy * grid,
                        "w": (run[1] - run[0] + 1) * grid,
                        "h": grid,
                    }
        rectangles.extend(active.values())
        for rectangle in rectangles:
            rectangle["w"] = min(rectangle["w"], OUT_W - rectangle["x"])
            rectangle["h"] = min(rectangle["h"], OUT_H - rectangle["y"])
        return sorted(rectangles, key=lambda rectangle: (rectangle["y"], rectangle["x"]))

    def build_water_collisions(self, grid: int = 16) -> list[dict[str, int]]:
        """Rasterise real OSM water, clear real bridges, and emit engine AABBs.

        Polygon water is eroded six output pixels to keep a small forgiving
        shoreline.  Narrow named waterways use a separate mask so erosion does
        not erase them.  Only OSM features tagged bridge=yes cut crossings.
        """
        polygon_mask = Image.new("L", (OUT_W, OUT_H), 0)
        polygon_draw = ImageDraw.Draw(polygon_mask)
        line_mask = Image.new("L", (OUT_W, OUT_H), 0)
        line_draw = ImageDraw.Draw(line_mask)

        def output_points(refs: list[int]) -> list[tuple[int, int]]:
            return [(x * UPSCALE, y * UPSCALE) for x, y in self.points(refs)]

        for relation in relations:
            if relation.tags.get("type") != "multipolygon" or not self.is_water(relation.tags):
                continue
            for ring in relation_rings(relation, "outer"):
                points = output_points(ring)
                if len(points) >= 3:
                    polygon_draw.polygon(points, fill=255)
            for ring in relation_rings(relation, "inner"):
                points = output_points(ring)
                if len(points) >= 3:
                    polygon_draw.polygon(points, fill=0)

        for way in ways:
            if self.is_water(way.tags):
                points = output_points(way.refs)
                if self.closed(points):
                    polygon_draw.polygon(points, fill=255)

        line_widths = {"river": 10, "canal": 8, "stream": 6, "drain": 4, "ditch": 2}
        for way in ways:
            kind = way.tags.get("waterway")
            if not kind or (kind in {"drain", "ditch"} and not way.tags.get("name")):
                continue
            points = output_points(way.refs)
            if len(points) >= 2:
                line_draw.line(points, fill=255, width=line_widths.get(kind, 5), joint="curve")

        # MinFilter erodes white water and expands black land by six pixels.
        polygon_mask = polygon_mask.filter(ImageFilter.MinFilter(13))
        polygon_draw = ImageDraw.Draw(polygon_mask)

        # Real OSM bridges stay usable. A 48 px clearance accommodates the
        # 20 px player diameter plus a grid-cell edge on either side.
        for way in ways:
            if way.tags.get("bridge") != "yes" or not way.tags.get("highway"):
                continue
            points = output_points(way.refs)
            if len(points) < 2:
                continue
            highway = way.tags.get("highway")
            clearance = 56 if highway in {"motorway", "trunk", "primary", "secondary"} else 48
            polygon_draw.line(points, fill=0, width=clearance, joint="curve")
            line_draw.line(points, fill=0, width=clearance, joint="curve")

        occupied: set[tuple[int, int]] = set()
        polygon_pixels = polygon_mask.load()
        line_pixels = line_mask.load()
        for y in range(0, OUT_H, grid):
            for x in range(0, OUT_W, grid):
                x2, y2 = min(x + grid, OUT_W), min(y + grid, OUT_H)
                total = (x2 - x) * (y2 - y)
                polygon_count = line_count = 0
                for py in range(y, y2):
                    for px in range(x, x2):
                        polygon_count += polygon_pixels[px, py] > 0
                        line_count += line_pixels[px, py] > 0
                # Eroded polygons need substantial cell coverage; thin real
                # waterways intentionally use a lower threshold.
                if polygon_count / total >= 0.30 or line_count / total >= 0.12:
                    occupied.add((x // grid, y // grid))
        return self.merge_grid_cells(occupied, grid)

    def choose_player_start(
        self,
        preferred_landmark_id: str,
        waters: list[dict[str, int]],
    ) -> dict[str, int | str]:
        spec = LANDMARKS[preferred_landmark_id]
        preferred_lon, preferred_lat = feature_anchor(spec["feature"], self)
        preferred_x, preferred_y = self.xy(preferred_lon, preferred_lat)
        preferred_x *= UPSCALE
        preferred_y *= UPSCALE
        walkable = {
            "footway", "path", "pedestrian", "living_street", "residential", "steps"
        }
        candidates: list[tuple[float, int, int, int]] = []
        for way in ways:
            if way.tags.get("highway") not in walkable:
                continue
            for ref in way.refs:
                if ref not in nodes:
                    continue
                x, y = self.xy(*nodes[ref])
                x *= UPSCALE
                y *= UPSCALE
                if not (24 <= x <= OUT_W - 24 and 24 <= y <= OUT_H - 24):
                    continue
                if self.in_water_rects(x, y, waters):
                    continue
                candidates.append(((x - preferred_x) ** 2 + (y - preferred_y) ** 2, x, y, way.osm_id))
        if not candidates:
            raise RuntimeError(f"No safe walking start near {preferred_landmark_id}")
        _distance, x, y, way_id = min(candidates)
        return {"x": x, "y": y, "osmWayId": way_id, "near": preferred_landmark_id}

    @staticmethod
    def is_park(tags: dict[str, str]) -> bool:
        return tags.get("leisure") in {"park", "garden"} or tags.get("landuse") in {
            "grass", "forest", "recreation_ground", "flowerbed"
        } or tags.get("natural") in {"wood", "scrub"}

    @staticmethod
    def is_water(tags: dict[str, str]) -> bool:
        return tags.get("natural") == "water" or bool(tags.get("water")) or tags.get("waterway") == "riverbank"

    def fill_polygons(self, predicate, fill: str, outline: str | None = None) -> None:
        for way in ways:
            if not predicate(way.tags):
                continue
            points = self.points(way.refs)
            if self.closed(points):
                self.draw.polygon(points, fill=fill, outline=outline)

    def render(self) -> tuple[Path, Path]:
        # Real land-use blocks.
        self.fill_polygons(lambda t: t.get("landuse") == "residential", COLORS["residential"])
        self.fill_polygons(lambda t: t.get("landuse") in {"commercial", "retail"}, COLORS["commercial"])
        self.fill_polygons(
            lambda t: t.get("landuse") in {"education", "institutional"}
            or t.get("amenity") in {"school", "university", "hospital"},
            COLORS["education"],
        )

        # Real parks, including multipolygons.
        for relation in relations:
            if relation.tags.get("type") != "multipolygon" or not self.is_park(relation.tags):
                continue
            for ring in relation_rings(relation, "outer"):
                points = self.points(ring)
                if len(points) >= 3:
                    self.draw.polygon(points, fill=COLORS["park"], outline=COLORS["park_dark"])
            for ring in relation_rings(relation, "inner"):
                points = self.points(ring)
                if len(points) >= 3:
                    self.draw.polygon(points, fill=COLORS["land"])
        for way in ways:
            if self.is_park(way.tags):
                points = self.points(way.refs)
                if self.closed(points):
                    fill = COLORS["garden"] if way.tags.get("leisure") == "garden" else COLORS["park"]
                    self.draw.polygon(points, fill=fill, outline=COLORS["park_dark"])

        # Real lakes/ponds and islands.
        for relation in relations:
            if relation.tags.get("type") != "multipolygon" or not self.is_water(relation.tags):
                continue
            for ring in relation_rings(relation, "outer"):
                points = self.points(ring)
                if len(points) >= 3:
                    self.draw.polygon(points, fill=COLORS["water"], outline=COLORS["water_dark"])
            for ring in relation_rings(relation, "inner"):
                points = self.points(ring)
                if len(points) >= 3:
                    self.draw.polygon(points, fill=COLORS["park"], outline=COLORS["park_dark"])
        for way in ways:
            if self.is_water(way.tags):
                points = self.points(way.refs)
                if self.closed(points):
                    self.draw.polygon(points, fill=COLORS["water"], outline=COLORS["water_dark"])

        # Named drains plus every river/canal/stream in the chapter.
        widths = {"river": 5, "canal": 4, "stream": 3, "drain": 2, "ditch": 1}
        for way in ways:
            kind = way.tags.get("waterway")
            if not kind or (kind in {"drain", "ditch"} and not way.tags.get("name")):
                continue
            points = self.points(way.refs)
            if len(points) < 2:
                continue
            width = widths.get(kind, 2)
            self.draw.line(points, fill=COLORS["water_dark"], width=width + 2, joint="curve")
            self.draw.line(points, fill=COLORS["water_light"], width=width, joint="curve")

        # Exact building footprints, with a lower threshold than the overview.
        important: list[tuple[Way, list[tuple[int, int]]]] = []
        for way in ways:
            if "building" not in way.tags or way.tags.get("building") == "no":
                continue
            points = self.points(way.refs)
            if not self.closed(points) or len(points) < 4:
                continue
            is_important = bool(
                way.tags.get("historic")
                or way.tags.get("tourism") in {"attraction", "museum", "gallery"}
                or (way.tags.get("name") and way.tags.get("building") not in {"yes", "apartments"})
            )
            if is_important:
                important.append((way, points))
            elif self.area(points) >= 14:
                self.draw.polygon(points, fill=COLORS["building"], outline=COLORS["building_dark"])
        for _way, points in important:
            self.draw.polygon(points, fill=COLORS["heritage"], outline=COLORS["heritage_dark"])
            if self.area(points) >= 8:
                self.draw.line(points[: max(2, len(points) // 2)], fill=COLORS["gold"], width=1)

        # True roads and walkable path network. Roads are drawn over landcover and
        # buildings so the game can detect/navigate them from the map image.
        road_rank = {
            "motorway": (8, COLORS["road_major"]),
            "trunk": (7, COLORS["road_major"]),
            "primary": (6, COLORS["road_major"]),
            "secondary": (5, COLORS["road_major"]),
            "tertiary": (4, COLORS["road_minor"]),
            "residential": (3, COLORS["road_minor"]),
            "living_street": (3, COLORS["road_minor"]),
            "unclassified": (3, COLORS["road_minor"]),
            "pedestrian": (3, COLORS["road_walk"]),
            "footway": (2, COLORS["road_path"]),
            "path": (2, COLORS["road_path"]),
            "steps": (2, COLORS["road_path"]),
        }
        groups: dict[int, list[tuple[list[tuple[int, int]], str]]] = defaultdict(list)
        for way in ways:
            highway = way.tags.get("highway")
            if highway not in road_rank:
                continue
            points = self.points(way.refs)
            if len(points) < 2:
                continue
            width, color = road_rank[highway]
            groups[width].append((points, color))
        for width in sorted(groups):
            for points, _color in groups[width]:
                self.draw.line(points, fill=COLORS["road_case"], width=width + 2, joint="curve")
            for points, color in groups[width]:
                self.draw.line(points, fill=color, width=width, joint="curve")

        # OSM tree rows and named spring points only—no decorative fake vegetation.
        for way in ways:
            if way.tags.get("natural") == "tree_row":
                points = self.points(way.refs)
                if len(points) >= 2:
                    self.draw.line(points, fill=COLORS["park_dark"], width=1)
        for osm_id, tags in node_tags.items():
            if osm_id not in nodes:
                continue
            px, py = self.xy(*nodes[osm_id])
            if tags.get("natural") == "tree":
                self.draw.rectangle((px - 1, py - 1, px + 1, py + 1), fill=COLORS["park_dark"])
            elif tags.get("natural") == "spring":
                self.draw.point((px, py), fill=COLORS["spring"])
                if tags.get("name"):
                    self.draw.point((px, py + 1), fill=COLORS["spring_dark"])

        landmark_meta = []
        for landmark_id in self.chapter.landmark_ids:
            spec = LANDMARKS[landmark_id]
            lon, lat = feature_anchor(spec["feature"], self)
            px, py = self.xy(lon, lat)
            self.draw_marker(px, py, spec["kind"])
            landmark_meta.append({
                "id": landmark_id,
                "name": spec["name"],
                "kind": spec["kind"],
                "osm": {"type": spec["feature"][0], "id": spec["feature"][1]},
                "lon": round(lon, 7), "lat": round(lat, 7),
                "x": px * UPSCALE, "y": py * UPSCALE,
            })

        waters = self.build_water_collisions(grid=16)
        preferred_start = "baotu" if self.chapter.chapter_id == "oldcity" else "qushuiting"
        player_start = self.choose_player_start(preferred_start, waters)

        image = self.img.resize((OUT_W, OUT_H), Image.Resampling.NEAREST)
        output = OUT_DIR / self.chapter.filename
        output.parent.mkdir(parents=True, exist_ok=True)
        image.save(output, optimize=True)
        meters_per_output_pixel = 111_320 / self.scale / UPSCALE
        meta = {
            "version": 2,
            "chapter": self.chapter.chapter_id,
            "image": {"file": output.name, "width": OUT_W, "height": OUT_H, "pixelBlock": UPSCALE},
            "bbox": list(self.chapter.bbox),
            "projection": {
                "type": "local-equirectangular-equal-scale", "northUp": True,
                "center": [self.mid_lon, self.mid_lat],
                "longitudeCorrection": round(self.lon_correction, 9),
                "metersPerPixel": round(meters_per_output_pixel, 3),
            },
            "source": {"file": str(SOURCE.relative_to(ROOT)), "provider": "OpenStreetMap contributors", "license": "ODbL 1.0"},
            "renderPolicy": "only real OSM geometry; omitted features are a zoom-level choice, never invented or moved",
            "walkableHighways": sorted(road_rank),
            "collision": {
                "type": "axis-aligned-rectangles",
                "grid": 16,
                "playerRadius": 10,
                "shoreTolerance": 6,
                "bridgeClearance": 48,
            },
            "waters": waters,
            "playerStart": player_start,
            "player": {"startX": player_start["x"], "startY": player_start["y"]},
            "landmarks": landmark_meta,
        }
        meta_path = META_DIR / self.chapter.filename.replace(".png", ".json")
        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return output, meta_path

    def draw_marker(self, px: int, py: int, kind: str) -> None:
        self.draw.rectangle((px - 5, py - 5, px + 5, py + 5), fill=COLORS["cream"], outline=COLORS["ink"])
        if kind == "spring":
            self.draw.polygon([(px, py - 4), (px + 4, py + 1), (px, py + 4), (px - 4, py + 1)], fill=COLORS["spring"])
        elif kind == "pavilion":
            self.draw.polygon([(px - 4, py), (px, py - 4), (px + 4, py)], fill=COLORS["gold"])
            self.draw.rectangle((px - 3, py, px + 3, py + 4), fill=COLORS["heritage"])
        elif kind == "street":
            self.draw.line((px - 4, py + 3, px + 4, py - 3), fill=COLORS["heritage"], width=2)
        elif kind == "lake":
            self.draw.line((px - 4, py - 2, px + 4, py - 2), fill=COLORS["water"], width=2)
            self.draw.line((px - 4, py + 2, px + 4, py + 2), fill=COLORS["water"], width=2)
        else:
            self.draw.rectangle((px - 3, py - 3, px + 3, py + 3), fill=COLORS["water"])


if __name__ == "__main__":
    for chapter in CHAPTERS:
        output, meta = Renderer(chapter).render()
        print(f"Rendered {output}")
        print(f"Wrote {meta}")
