#!/usr/bin/env python3
"""Build a clean pixel-tourism map from real Jinan OpenStreetMap geometry.

The renderer deliberately simplifies *which* OSM features are visible at this
zoom, but never moves, straightens, or invents geography.  Landmark anchors are
resolved from their OSM node/way/relation rather than hand-placed on the image.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from math import cos, radians
from pathlib import Path
from typing import Iterable
from xml.etree.ElementTree import iterparse
import json

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "cities/jinan/geo/jinan-core.osm"
OUTPUT = ROOT / "cities/jinan/chapters/real-core-map-v2.png"
META = ROOT / "cities/jinan/geo/jinan-core-map-v2.json"

# Work at half resolution and upscale once with nearest-neighbour.  Every mark
# therefore belongs to a consistent 2x2 screen-pixel grid.
CANVAS_W, CANVAS_H, UPSCALE = 768, 512, 2
OUTPUT_W, OUTPUT_H = CANVAS_W * UPSCALE, CANVAS_H * UPSCALE
MAP_FRAME = (286, 18, 754, 494)
MAP_INNER = (304, 40, 734, 472)
MIN_LON, MIN_LAT, MAX_LON, MAX_LAT = 117.003, 36.654, 117.032, 36.679

FONT_REGULAR = Path("/System/Library/Fonts/STHeiti Light.ttc")
FONT_BOLD = Path("/System/Library/Fonts/STHeiti Medium.ttc")

COLORS = {
    "outer": "#102923",
    "panel": "#17372f",
    "panel_line": "#315247",
    "paper": "#eee3c3",
    "land": "#e4d6b2",
    "residential": "#ddcca4",
    "commercial": "#d5be91",
    "education": "#d9c99d",
    "park": "#79975a",
    "garden": "#8cab63",
    "park_dark": "#496c48",
    "water": "#328f9c",
    "water_dark": "#176675",
    "water_light": "#62c4bd",
    "building": "#a59572",
    "building_dark": "#76664f",
    "heritage": "#a84b32",
    "heritage_dark": "#713323",
    "gold": "#efb64b",
    "road_case": "#806f58",
    "road_major": "#f6ebc8",
    "road_minor": "#c9b995",
    "road_walk": "#f2d89d",
    "spring": "#d8f4df",
    "spring_dark": "#167e83",
    "ink": "#172b27",
    "cream": "#f7edcf",
    "muted": "#a9bea9",
    "red": "#d9573d",
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
            [
                (m.attrib.get("type", ""), int(m.attrib["ref"]), m.attrib.get("role", ""))
                for m in elem.findall("member")
            ],
            {t.attrib["k"]: t.attrib["v"] for t in elem.findall("tag")},
        )
        relations.append(relation)
        relation_by_id[relation.osm_id] = relation
    if elem.tag in {"node", "way", "relation"}:
        elem.clear()


# Local equal-distance projection.  Longitude is corrected by cos(latitude),
# then the same scale is used for x and y.  The old renderer independently
# stretched both axes to the canvas; this one preserves real local proportions.
MID_LON = (MIN_LON + MAX_LON) / 2
MID_LAT = (MIN_LAT + MAX_LAT) / 2
LON_CORRECTION = cos(radians(MID_LAT))
INNER_W = MAP_INNER[2] - MAP_INNER[0]
INNER_H = MAP_INNER[3] - MAP_INNER[1]
PROJECTION_SCALE = min(
    INNER_W / ((MAX_LON - MIN_LON) * LON_CORRECTION),
    INNER_H / (MAX_LAT - MIN_LAT),
)
MAP_CX = (MAP_INNER[0] + MAP_INNER[2]) / 2
MAP_CY = (MAP_INNER[1] + MAP_INNER[3]) / 2


def xy(lon: float, lat: float) -> tuple[int, int]:
    return (
        round(MAP_CX + (lon - MID_LON) * LON_CORRECTION * PROJECTION_SCALE),
        round(MAP_CY - (lat - MID_LAT) * PROJECTION_SCALE),
    )


def way_points(way: Way) -> list[tuple[int, int]]:
    return [xy(*nodes[ref]) for ref in way.refs if ref in nodes]


def is_closed(points: list[tuple[int, int]]) -> bool:
    return len(points) >= 3 and points[0] == points[-1]


def polygon_area(points: list[tuple[int, int]]) -> float:
    if len(points) < 3:
        return 0.0
    return abs(
        sum(
            points[i][0] * points[(i + 1) % len(points)][1]
            - points[(i + 1) % len(points)][0] * points[i][1]
            for i in range(len(points))
        )
        / 2
    )


def polygon_centroid_geo(points: list[tuple[float, float]]) -> tuple[float, float]:
    """Centroid of a geographic polygon; falls back to the point average."""
    if not points:
        raise ValueError("Cannot find centroid of an empty polygon")
    if points[0] != points[-1]:
        points = points + [points[0]]
    twice_area = 0.0
    cx = cy = 0.0
    for i in range(len(points) - 1):
        cross = points[i][0] * points[i + 1][1] - points[i + 1][0] * points[i][1]
        twice_area += cross
        cx += (points[i][0] + points[i + 1][0]) * cross
        cy += (points[i][1] + points[i + 1][1]) * cross
    if abs(twice_area) < 1e-14:
        return (
            sum(p[0] for p in points[:-1]) / max(1, len(points) - 1),
            sum(p[1] for p in points[:-1]) / max(1, len(points) - 1),
        )
    return cx / (3 * twice_area), cy / (3 * twice_area)


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
    segments = [
        way_by_id[ref].refs
        for feature_type, ref, member_role in relation.members
        if feature_type == "way" and member_role == role and ref in way_by_id
    ]
    return join_segments(segments)


def refs_to_screen(refs: list[int]) -> list[tuple[int, int]]:
    return [xy(*nodes[ref]) for ref in refs if ref in nodes]


def refs_to_geo(refs: list[int]) -> list[tuple[float, float]]:
    return [nodes[ref] for ref in refs if ref in nodes]


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    path = FONT_BOLD if bold else FONT_REGULAR
    return ImageFont.truetype(str(path), size=size)


img = Image.new("RGB", (CANVAS_W, CANVAS_H), COLORS["outer"])
draw = ImageDraw.Draw(img)

# Left information panel.  It is outside the mapped geographic extent, so no
# decoration can be mistaken for a street, river, or building.
draw.rectangle((12, 18, 272, 494), fill=COLORS["panel"], outline=COLORS["panel_line"], width=2)
draw.rectangle(MAP_FRAME, fill=COLORS["paper"], outline=COLORS["gold"], width=2)
draw.rectangle(MAP_INNER, fill=COLORS["land"], outline=COLORS["ink"], width=1)


def fill_way_polygons(predicate, fill: str, outline: str | None = None) -> None:
    for way in ways:
        if not predicate(way.tags):
            continue
        points = way_points(way)
        if is_closed(points):
            draw.polygon(points, fill=fill, outline=outline)


# Broad real land-use blocks replace thousands of noisy building outlines.
fill_way_polygons(lambda t: t.get("landuse") == "residential", COLORS["residential"])
fill_way_polygons(
    lambda t: t.get("landuse") in {"commercial", "retail"}, COLORS["commercial"]
)
fill_way_polygons(
    lambda t: t.get("landuse") in {"education", "institutional"}
    or t.get("amenity") in {"school", "university", "hospital"},
    COLORS["education"],
)


def is_park(tags: dict[str, str]) -> bool:
    return tags.get("leisure") in {"park", "garden"} or tags.get("landuse") in {
        "grass",
        "forest",
        "recreation_ground",
        "flowerbed",
    } or tags.get("natural") in {"wood", "scrub"}


# Park multipolygons and ordinary park ways.
for relation in relations:
    if relation.tags.get("type") != "multipolygon" or not is_park(relation.tags):
        continue
    for ring in relation_rings(relation, "outer"):
        points = refs_to_screen(ring)
        if len(points) >= 3:
            draw.polygon(points, fill=COLORS["park"], outline=COLORS["park_dark"])
    for ring in relation_rings(relation, "inner"):
        points = refs_to_screen(ring)
        if len(points) >= 3:
            draw.polygon(points, fill=COLORS["land"])

for way in ways:
    if not is_park(way.tags):
        continue
    points = way_points(way)
    if is_closed(points):
        fill = COLORS["garden"] if way.tags.get("leisure") == "garden" else COLORS["park"]
        draw.polygon(points, fill=fill, outline=COLORS["park_dark"])


def is_water(tags: dict[str, str]) -> bool:
    return tags.get("natural") == "water" or bool(tags.get("water")) or tags.get(
        "waterway"
    ) == "riverbank"


# Water polygons and lake multipolygons.  Islands come directly from inner OSM rings.
for relation in relations:
    if relation.tags.get("type") != "multipolygon" or not is_water(relation.tags):
        continue
    for ring in relation_rings(relation, "outer"):
        points = refs_to_screen(ring)
        if len(points) >= 3:
            draw.polygon(points, fill=COLORS["water"], outline=COLORS["water_dark"])
    for ring in relation_rings(relation, "inner"):
        points = refs_to_screen(ring)
        if len(points) >= 3:
            draw.polygon(points, fill=COLORS["park"], outline=COLORS["park_dark"])

for way in ways:
    if not is_water(way.tags):
        continue
    points = way_points(way)
    if is_closed(points):
        draw.polygon(points, fill=COLORS["water"], outline=COLORS["water_dark"])

# Real rivers, canals, streams and named drains.  Unnamed drainage ditches are
# omitted at city scale, avoiding clutter without altering any visible line.
waterway_width = {"river": 4, "canal": 3, "stream": 2, "drain": 1, "ditch": 1}
for way in ways:
    waterway = way.tags.get("waterway")
    if not waterway:
        continue
    if waterway in {"drain", "ditch"} and not way.tags.get("name"):
        continue
    points = way_points(way)
    if len(points) < 2:
        continue
    width = waterway_width.get(waterway, 2)
    draw.line(points, fill=COLORS["water_dark"], width=width + 2, joint="curve")
    draw.line(points, fill=COLORS["water_light"], width=width, joint="curve")


# Building footprints remain exact.  The city-scale layer keeps only larger
# footprints; all tourism/historic buildings remain visible regardless of size.
important_buildings: list[tuple[Way, list[tuple[int, int]]]] = []
for way in ways:
    if "building" not in way.tags or way.tags.get("building") == "no":
        continue
    points = way_points(way)
    if not is_closed(points) or len(points) < 4:
        continue
    important = bool(
        way.tags.get("historic")
        or way.tags.get("tourism") in {"attraction", "museum", "gallery"}
        or (way.tags.get("name") and way.tags.get("building") not in {"yes", "apartments"})
    )
    if important:
        important_buildings.append((way, points))
    elif polygon_area(points) >= 26:
        draw.polygon(points, fill=COLORS["building"], outline=COLORS["building_dark"])

for way, points in important_buildings:
    draw.polygon(points, fill=COLORS["heritage"], outline=COLORS["heritage_dark"])
    if polygon_area(points) >= 8:
        # A one-pixel highlight stays inside the exact footprint boundary.
        draw.line(points[: max(2, len(points) // 2)], fill=COLORS["gold"], width=1)


# Roads: true polylines, visually ranked.  Service lanes and most footways are
# not legible at this scale; named pedestrian streets are retained.
road_rank = {
    "motorway": (7, COLORS["road_major"]),
    "trunk": (6, COLORS["road_major"]),
    "primary": (5, COLORS["road_major"]),
    "secondary": (4, COLORS["road_major"]),
    "tertiary": (3, COLORS["road_minor"]),
    "residential": (2, COLORS["road_minor"]),
    "living_street": (2, COLORS["road_minor"]),
    "unclassified": (2, COLORS["road_minor"]),
    "pedestrian": (2, COLORS["road_walk"]),
}
road_groups: dict[int, list[tuple[list[tuple[int, int]], str]]] = defaultdict(list)
for way in ways:
    highway = way.tags.get("highway")
    if highway not in road_rank:
        continue
    if highway == "pedestrian" and not way.tags.get("name") and way.tags.get("area") != "yes":
        continue
    points = way_points(way)
    if len(points) < 2:
        continue
    width, color = road_rank[highway]
    road_groups[width].append((points, color))

for width in sorted(road_groups):
    for points, _color in road_groups[width]:
        draw.line(points, fill=COLORS["road_case"], width=width + 2, joint="curve")
    for points, color in road_groups[width]:
        draw.line(points, fill=color, width=width, joint="curve")


# Exact OSM tree and spring points add Jinan character without decorative fake geography.
for osm_id, tags in node_tags.items():
    if osm_id not in nodes:
        continue
    px, py = xy(*nodes[osm_id])
    if tags.get("natural") == "tree":
        draw.rectangle((px - 1, py - 1, px + 1, py + 1), fill=COLORS["park_dark"])
    elif tags.get("natural") == "spring":
        draw.point((px, py), fill=COLORS["spring"])
        if tags.get("name"):
            draw.point((px, py + 1), fill=COLORS["spring_dark"])

for way in ways:
    if way.tags.get("natural") == "tree_row":
        points = way_points(way)
        if len(points) >= 2:
            draw.line(points, fill=COLORS["park_dark"], width=1)

# Clip the GIS layer to its cartographic frame.  Drawing directly with Pillow
# allows off-bbox line segments to extend beyond the rectangle; retaining only
# the exact inner crop prevents those strokes from becoming fake decoration in
# the title/legend area.
map_crop = img.crop((MAP_INNER[0], MAP_INNER[1], MAP_INNER[2] + 1, MAP_INNER[3] + 1))
draw.rectangle((0, 0, CANVAS_W - 1, CANVAS_H - 1), fill=COLORS["outer"])
draw.rectangle((12, 18, 272, 494), fill=COLORS["panel"], outline=COLORS["panel_line"], width=2)
draw.rectangle(MAP_FRAME, fill=COLORS["paper"], outline=COLORS["gold"], width=2)
draw.rectangle(MAP_INNER, fill=COLORS["land"], outline=COLORS["ink"], width=1)
img.paste(map_crop, (MAP_INNER[0], MAP_INNER[1]))
draw = ImageDraw.Draw(img)
draw.rectangle(MAP_FRAME, outline=COLORS["gold"], width=2)
draw.rectangle(MAP_INNER, outline=COLORS["ink"], width=1)


LANDMARK_SPECS = [
    {"id": "baotu", "name": "趵突泉", "kind": "spring", "feature": ("node", 5723485328)},
    {"id": "square", "name": "泉城广场", "kind": "square", "feature": ("way", 591478174)},
    {"id": "heihu", "name": "黑虎泉", "kind": "spring", "feature": ("node", 5723485330)},
    {"id": "jiefang", "name": "解放阁", "kind": "pavilion", "feature": ("way", 31781501)},
    {"id": "wulong", "name": "五龙潭", "kind": "lake", "feature": ("way", 482251967)},
    {"id": "furong", "name": "芙蓉街", "kind": "street", "feature": ("node", 8842243915)},
    {"id": "pearl", "name": "珍珠泉", "kind": "spring", "feature": ("node", 5530538384)},
    {"id": "qushuiting", "name": "曲水亭街", "kind": "street", "feature": ("way", 1140719131)},
    {"id": "baihuazhou", "name": "百花洲", "kind": "lake", "feature": ("way", 39723709)},
    {"id": "daming", "name": "大明湖", "kind": "lake", "feature": ("relation", 2616968)},
    {"id": "chaoran", "name": "超然楼", "kind": "pavilion", "feature": ("way", 578321008)},
]


def feature_anchor(feature: tuple[str, int]) -> tuple[float, float]:
    feature_type, osm_id = feature
    if feature_type == "node":
        return nodes[osm_id]
    if feature_type == "way":
        return polygon_centroid_geo(refs_to_geo(way_by_id[osm_id].refs))
    relation = relation_by_id[osm_id]
    outer_rings = relation_rings(relation, "outer")
    if not outer_rings:
        raise ValueError(f"Relation {osm_id} has no outer ring")
    largest = max(outer_rings, key=lambda refs: polygon_area(refs_to_screen(refs)))
    return polygon_centroid_geo(refs_to_geo(largest))


marker_fill = {
    "spring": COLORS["spring"],
    "square": "#4eb4c2",
    "pavilion": COLORS["gold"],
    "street": COLORS["red"],
    "lake": "#91d8c8",
}


def draw_marker(px: int, py: int, kind: str) -> None:
    color = marker_fill[kind]
    draw.rectangle((px - 4, py - 4, px + 4, py + 4), fill=COLORS["cream"], outline=COLORS["ink"])
    if kind == "spring":
        draw.polygon([(px, py - 3), (px + 3, py + 1), (px, py + 3), (px - 3, py + 1)], fill=color)
    elif kind == "pavilion":
        draw.polygon([(px - 3, py), (px, py - 3), (px + 3, py)], fill=color)
        draw.rectangle((px - 2, py, px + 2, py + 3), fill=COLORS["heritage"])
    elif kind == "street":
        draw.line((px - 3, py + 2, px + 3, py - 2), fill=color, width=2)
    elif kind == "lake":
        draw.line((px - 3, py - 1, px + 3, py - 1), fill=color, width=1)
        draw.line((px - 3, py + 2, px + 3, py + 2), fill=color, width=1)
    else:
        draw.rectangle((px - 2, py - 2, px + 2, py + 2), fill=color)


# Labels are placed near, but never substituted for, the exact marker anchor.
LABEL_OFFSETS = {
    "baotu": (-47, 9),
    "square": (10, 9),
    "heihu": (-50, 12),
    "jiefang": (10, -18),
    "wulong": (-47, -18),
    "furong": (-48, 9),
    "pearl": (10, 9),
    "qushuiting": (-57, -18),
    "baihuazhou": (10, 9),
    "daming": (-22, -6),
    "chaoran": (10, -18),
}

landmarks: list[dict] = []
label_font = font(10, bold=True)
for spec in LANDMARK_SPECS:
    lon, lat = feature_anchor(spec["feature"])
    px, py = xy(lon, lat)
    draw_marker(px, py, spec["kind"])
    dx, dy = LABEL_OFFSETS[spec["id"]]
    lx, ly = px + dx, py + dy
    box = draw.textbbox((lx, ly), spec["name"], font=label_font)
    pad_x, pad_y = 3, 2
    label_box = (box[0] - pad_x, box[1] - pad_y, box[2] + pad_x, box[3] + pad_y)
    if spec["id"] != "daming":
        edge_x = label_box[0] if lx >= px else label_box[2]
        edge_y = min(max(py, label_box[1]), label_box[3])
        draw.line((px, py, edge_x, edge_y), fill=COLORS["ink"], width=1)
    draw.rectangle(label_box, fill=COLORS["cream"], outline=COLORS["ink"])
    draw.text((lx, ly), spec["name"], fill=COLORS["ink"], font=label_font)
    landmarks.append(
        {
            "id": spec["id"],
            "name": spec["name"],
            "kind": spec["kind"],
            "osm": {"type": spec["feature"][0], "id": spec["feature"][1]},
            "lon": round(lon, 7),
            "lat": round(lat, 7),
            "x": px * UPSCALE,
            "y": py * UPSCALE,
            "labelBox": [value * UPSCALE for value in label_box],
        }
    )


# Information panel typography and honest map legend.
draw.text((32, 42), "济 南", font=font(31, bold=True), fill=COLORS["cream"])
draw.text((32, 82), "泉城核心 · 真实俯视图", font=font(15, bold=True), fill=COLORS["gold"])
draw.line((32, 108, 246, 108), fill=COLORS["panel_line"], width=2)
draw.text((32, 126), "北有大明湖，城中泉渠相连，", font=font(11), fill=COLORS["muted"])
draw.text((32, 144), "道路、水系、街廓均来自 OSM。", font=font(11), fill=COLORS["muted"])
draw.text((32, 162), "像素化只做取舍，不改变位置。", font=font(11), fill=COLORS["muted"])

draw.text((32, 204), "地图图层", font=font(13, bold=True), fill=COLORS["cream"])
legend = [
    ("water", "湖泊 / 泉渠"),
    ("park", "公园 / 园林"),
    ("road", "主次道路"),
    ("building", "真实建筑街廓"),
    ("spring", "已记录泉眼"),
]
for index, (kind, label) in enumerate(legend):
    y = 232 + index * 31
    if kind == "water":
        draw.rectangle((34, y + 2, 53, y + 10), fill=COLORS["water"], outline=COLORS["water_dark"])
        draw.line((36, y + 6, 51, y + 6), fill=COLORS["water_light"], width=1)
    elif kind == "park":
        draw.rectangle((34, y + 1, 53, y + 11), fill=COLORS["park"], outline=COLORS["park_dark"])
    elif kind == "road":
        draw.line((34, y + 6, 53, y + 6), fill=COLORS["road_case"], width=5)
        draw.line((34, y + 6, 53, y + 6), fill=COLORS["road_major"], width=3)
    elif kind == "building":
        draw.rectangle((36, y + 1, 51, y + 11), fill=COLORS["building"], outline=COLORS["building_dark"])
    else:
        draw.polygon([(44, y), (48, y + 6), (44, y + 12), (40, y + 6)], fill=COLORS["spring"])
    draw.text((64, y), label, font=font(11), fill=COLORS["cream"])

# North arrow and a projection-derived 500 m scale bar.
draw.text((34, 400), "N", font=font(12, bold=True), fill=COLORS["gold"])
draw.polygon([(40, 421), (35, 433), (40, 429), (45, 433)], fill=COLORS["gold"])
meters_per_pixel = 111_320 / PROJECTION_SCALE
scale_width = round(500 / meters_per_pixel)
scale_x, scale_y = 82, 427
draw.line((scale_x, scale_y, scale_x + scale_width, scale_y), fill=COLORS["cream"], width=3)
draw.line((scale_x, scale_y - 4, scale_x, scale_y + 4), fill=COLORS["cream"], width=1)
draw.line((scale_x + scale_width, scale_y - 4, scale_x + scale_width, scale_y + 4), fill=COLORS["cream"], width=1)
draw.text((scale_x, scale_y + 8), "500 m", font=font(9), fill=COLORS["muted"])

draw.line((32, 462, 246, 462), fill=COLORS["panel_line"], width=1)
draw.text((32, 472), "© OpenStreetMap contributors · ODbL", font=font(8), fill=COLORS["muted"])

# Final nearest-neighbour enlargement locks the complete output to the pixel grid.
img = img.resize((OUTPUT_W, OUTPUT_H), Image.Resampling.NEAREST)
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
img.save(OUTPUT, optimize=True)

metadata = {
    "version": 2,
    "image": {"width": OUTPUT_W, "height": OUTPUT_H, "pixelBlock": UPSCALE},
    "bbox": [MIN_LON, MIN_LAT, MAX_LON, MAX_LAT],
    "projection": {
        "type": "local-equirectangular-equal-scale",
        "center": [MID_LON, MID_LAT],
        "longitudeCorrection": round(LON_CORRECTION, 9),
        "metersPerOutputPixel": round(meters_per_pixel / UPSCALE, 3),
        "mapFrame": [value * UPSCALE for value in MAP_FRAME],
        "mapInner": [value * UPSCALE for value in MAP_INNER],
    },
    "source": {
        "file": str(SOURCE.relative_to(ROOT)),
        "provider": "OpenStreetMap contributors",
        "license": "ODbL 1.0",
    },
    "renderPolicy": {
        "geometry": "OSM geometry is projected without moving or straightening features",
        "included": [
            "water polygons and named waterways",
            "parks and gardens",
            "primary through residential roads plus named pedestrian streets",
            "large building footprints and all tagged tourism/historic buildings",
            "OSM-recorded tree rows, trees, and spring points",
        ],
        "omittedAtThisZoom": [
            "unnamed drains and ditches",
            "service roads",
            "unnamed footways",
            "small ordinary building footprints",
        ],
    },
    "landmarks": landmarks,
}
META.parent.mkdir(parents=True, exist_ok=True)
META.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

print(f"Rendered {OUTPUT} ({OUTPUT_W}x{OUTPUT_H})")
print(f"Wrote {META} with {len(landmarks)} OSM-derived landmark anchors")
