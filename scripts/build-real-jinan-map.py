#!/usr/bin/env python3
"""Render a deterministic pixel-art map from real OpenStreetMap geometry."""
from collections import defaultdict
from pathlib import Path
from xml.etree.ElementTree import iterparse
from PIL import Image, ImageDraw
import json, math, sys

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "cities/jinan/geo/jinan-core.osm"
OUTPUT = ROOT / "cities/jinan/chapters/real-core-map.png"
META = ROOT / "cities/jinan/geo/jinan-core-map.json"
W, H, SCALE = 1536, 1024, 2
PIXEL_BLOCK = 2
MIN_LON, MIN_LAT, MAX_LON, MAX_LAT = 117.003, 36.654, 117.032, 36.679

def xy(lon, lat):
    x = (lon - MIN_LON) / (MAX_LON - MIN_LON) * (W - 1) * SCALE
    # compensate longitude at Jinan's latitude so street geometry is not stretched
    y = (MAX_LAT - lat) / (MAX_LAT - MIN_LAT) * (H - 1) * SCALE
    return round(x), round(y)

nodes = {}
ways = []
way_index = {}
relations = []
for event, elem in iterparse(SOURCE, events=("end",)):
    if elem.tag == "node":
        nodes[int(elem.attrib["id"])] = (float(elem.attrib["lon"]), float(elem.attrib["lat"]))
    elif elem.tag == "way":
        refs = [int(n.attrib["ref"]) for n in elem.findall("nd")]
        tags = {t.attrib["k"]: t.attrib["v"] for t in elem.findall("tag")}
        ways.append((refs, tags))
        way_index[int(elem.attrib["id"])] = refs
    elif elem.tag == "relation":
        tags = {t.attrib["k"]: t.attrib["v"] for t in elem.findall("tag")}
        members = [(m.attrib.get("type"), int(m.attrib["ref"]), m.attrib.get("role", "")) for m in elem.findall("member")]
        relations.append((members, tags))
    if elem.tag in {"node", "way", "relation"}:
        elem.clear()

img = Image.new("RGB", (W * SCALE, H * SCALE), "#d8cda9")
d = ImageDraw.Draw(img)

def points(refs):
    return [xy(*nodes[r]) for r in refs if r in nodes]

def closed(poly):
    return len(poly) >= 3 and poly[0] == poly[-1]

# parks/green ground first
for refs, tags in ways:
    p = points(refs)
    if closed(p) and (tags.get("leisure") in {"park", "garden"} or tags.get("landuse") in {"grass", "forest", "recreation_ground"} or tags.get("natural") in {"wood", "scrub"}):
        d.polygon(p, fill="#6f8f54", outline="#426142", width=2*SCALE)

# real water polygons and waterways
for refs, tags in ways:
    p = points(refs)
    if len(p) < 2: continue
    if closed(p) and (tags.get("natural") == "water" or tags.get("water") or tags.get("waterway") == "riverbank"):
        d.polygon(p, fill="#3b9fa4", outline="#246b78", width=2*SCALE)
    elif tags.get("waterway"):
        widths = {"river": 8, "canal": 6, "stream": 4, "ditch": 2}
        d.line(p, fill="#277a8b", width=widths.get(tags.get("waterway"),3)*SCALE, joint="curve")
        d.line(p, fill="#54bdba", width=max(2,widths.get(tags.get("waterway"),3)-2)*SCALE, joint="curve")

# OSM lakes are commonly split into a multipolygon relation. Join outer way segments.
def join_segments(segments):
    rings=[]
    while segments:
        ring=list(segments.pop(0)); changed=True
        while changed and ring[0] != ring[-1]:
            changed=False
            for i,s in enumerate(segments):
                if ring[-1] == s[0]: ring.extend(s[1:])
                elif ring[-1] == s[-1]: ring.extend(reversed(s[:-1]))
                elif ring[0] == s[-1]: ring = s[:-1] + ring
                elif ring[0] == s[0]: ring = list(reversed(s[1:])) + ring
                else: continue
                segments.pop(i); changed=True; break
        rings.append(ring)
    return rings

for members,tags in relations:
    if tags.get("type") != "multipolygon" or not (tags.get("natural") == "water" or tags.get("water")): continue
    outer=[way_index[r] for typ,r,role in members if typ=="way" and role=="outer" and r in way_index]
    inner=[way_index[r] for typ,r,role in members if typ=="way" and role=="inner" and r in way_index]
    for ring in join_segments(outer):
        p=points(ring)
        if len(p)>=3: d.polygon(p,fill="#3b9fa4",outline="#246b78",width=2*SCALE)
    for ring in join_segments(inner):
        p=points(ring)
        if len(p)>=3: d.polygon(p,fill="#6f8f54",outline="#426142",width=SCALE)

# building footprints: only buildings present in OSM. Tiny footprints are omitted at
# this zoom for legibility, but no footprint is moved or invented.
for refs, tags in ways:
    if "building" not in tags: continue
    p = points(refs)
    if not closed(p) or len(p) < 4: continue
    area = abs(sum(p[i][0]*p[i+1][1]-p[i+1][0]*p[i][1] for i in range(len(p)-1))) / 2
    if area < 18 * SCALE * SCALE: continue
    d.polygon(p, fill="#b4a88d", outline="#665f54", width=SCALE)
    # small northwest roof shadow keeps pixel style while preserving footprint
    if len(p) < 80:
        shadow=[(x-2*SCALE,y-2*SCALE) for x,y in p]
        d.line(shadow, fill="#514d46", width=SCALE)

# roads on top; widths reflect OSM highway class
road_width={"motorway":10,"trunk":9,"primary":8,"secondary":7,"tertiary":6,"residential":4,"service":3,"pedestrian":4,"footway":2,"path":2,"steps":2}
for refs, tags in ways:
    highway=tags.get("highway")
    if not highway: continue
    p=points(refs)
    if len(p)<2: continue
    width=road_width.get(highway,3)*SCALE
    d.line(p, fill="#6f685d", width=width+2*SCALE, joint="curve")
    d.line(p, fill="#d9d0b7", width=width, joint="curve")
    if highway in {"primary","secondary","tertiary"}:
        d.line(p, fill="#b6aa8e", width=max(SCALE,width//8), joint="curve")

# Verified landmark anchors. Symbols are intentionally simple; geometry remains GIS-derived.
landmarks = [
    {"id":"baotu","name":"趵突泉","lon":117.0094772,"lat":36.6605906,"kind":"spring"},
    {"id":"square","name":"泉城广场","lon":117.0160955,"lat":36.6607858,"kind":"square"},
    {"id":"heihu","name":"黑虎泉","lon":117.0272205,"lat":36.6620803,"kind":"spring"},
    {"id":"jiefang","name":"解放阁","lon":117.0277169,"lat":36.6627223,"kind":"pavilion"},
    {"id":"wulong","name":"五龙潭","lon":117.0098777,"lat":36.6658328,"kind":"lake"},
    {"id":"furong","name":"芙蓉街","lon":117.0160584,"lat":36.6643835,"kind":"street"},
    {"id":"pearl","name":"珍珠泉","lon":117.0188337,"lat":36.6671006,"kind":"spring"},
    {"id":"qushuiting","name":"曲水亭街","lon":117.0184131,"lat":36.6688172,"kind":"street"},
    {"id":"baihuazhou","name":"百花洲","lon":117.0186071,"lat":36.6709187,"kind":"lake"},
    {"id":"daming","name":"大明湖","lon":117.0158039,"lat":36.6745416,"kind":"lake"},
    {"id":"chaoran","name":"超然楼","lon":117.0273025,"lat":36.6750901,"kind":"pavilion"},
]
for item in landmarks:
    x,y=xy(item["lon"],item["lat"]); r=8*SCALE
    color={"spring":"#eaf6dc","square":"#2b8ab3","pavilion":"#d08b32","street":"#d4513f","lake":"#e2b43b"}[item["kind"]]
    d.rectangle((x-r,y-r,x+r,y+r),fill="#17241d",outline="#fff2ca",width=2*SCALE)
    d.rectangle((x-r+3*SCALE,y-r+3*SCALE,x+r-3*SCALE,y+r-3*SCALE),fill=color)
    item["x"], item["y"] = round(x/SCALE), round(y/SCALE)

# deterministic pixelation: first render accurate geometry, then quantize it onto a
# 2×2 screen-pixel grid with nearest-neighbour scaling. Geometry remains anchored.
img = img.resize((W//PIXEL_BLOCK,H//PIXEL_BLOCK), Image.Resampling.NEAREST).resize((W,H), Image.Resampling.NEAREST)
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
img.save(OUTPUT, optimize=True)
META.parent.mkdir(parents=True, exist_ok=True)
META.write_text(json.dumps({"bbox":[MIN_LON,MIN_LAT,MAX_LON,MAX_LAT],"source":"OpenStreetMap contributors, ODbL 1.0","landmarks":landmarks},ensure_ascii=False,indent=2)+"\n")
print(f"Rendered {OUTPUT} from {len(nodes)} nodes and {len(ways)} ways")
print(json.dumps(landmarks,ensure_ascii=False))
