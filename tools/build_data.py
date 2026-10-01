"""Build app/data/routes.json and areas.json from data-src/.
Run: python3 tools/build_data.py
"""
import csv, json, re, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'data-src'); OUT = os.path.join(ROOT, 'docs', 'data')
sys.path.insert(0, SRC)
from aspects import MP_AREA, SHADY, MP_GPS, MP_GPS_EST, ZONE_OF, ZONE_CONFIRMED, ZONE_PROVISIONAL_WALLS, SPECIALS, NF_SPLIT, CHECKIN
import trails

def units(g):
    m = re.match(r'^5\.(\d+)([abcd](/[abcd])?|[+-])?', g or '')
    if not m: return None
    n, s = int(m.group(1)), m.group(2) or ''
    if n >= 10:
        L = dict(a=0, b=1, c=2, d=3)
        u = 1.5 if not s else .5 if s == '-' else 2.5 if s == '+' else (L[s[0]] + L[s[2]]) / 2 if '/' in s else L[s]
        return (n - 10) * 4 + u
    return round(n - 10 + (.33 if s == '+' else -.33 if s == '-' else 0), 2)

def num(v, f=float):
    try: return f(v)
    except: return None

SIDE = {**{a:'North' for a in ['North Forty Routes','Kindergarten Boulder','The Land Beyond Routes']}, **{a:'Valley' for a in ['The Park','The Carrion Cube']}}
EAST = {'Roman Wall','New Roman Wall','Warthog Wall','Mexican Pillar','Goat Cave','The Far East','Magoo Rock','Mullet Buttress','Land of the Lost','Cliffs of Insanity','Wrangler Wall','The Tool Buttress',"Rosie's Cantina Area",'Nipple Stimulation Alcove','Super Slab','Jungle Cliff'}
def side(a): return 'North' if a.startswith('North Forty') else SIDE.get(a) or ('East' if a in EAST else 'West' if a else '')
tgt = {r['route']: r for r in csv.DictReader(open(os.path.join(SRC, 'hcr_target_list.csv')))}
routes = []
for i, r in enumerate(csv.DictReader(open(os.path.join(SRC, 'hcr_routes_master.csv')))):
    t = tgt.get(r['route']) if r['comp_num'] else None
    grade = r['comp_grade'] or r['mp_rating']
    if r['area'] == 'North Forty Routes' and r['comp_num'] and r['comp_zone'] in NF_SPLIT: r['area'] = NF_SPLIT[r['comp_zone']][0]
    routes.append({k: v for k, v in {
        'id': ('c' + r['comp_num']) if r['comp_num'] else ('m' + r['mp_url'].rsplit('/', 1)[-1]),
        'n': num(r['comp_num'], int), 'name': r['route'], 'zone': r['comp_zone'] if r['comp_num'] else '', 'area': r['area'],
        'side': side(r['area']), 'g': grade, 'gu': units(grade), 'pts': num(r['comp_points'], int),
        'mpg': r['mp_rating'], 'type': r['comp_style'] or (r['mp_type'].split(',')[0].strip().lower() if r['mp_type'] else ''),
        'ht': num(r['comp_height_ft'], int) or num(r['length_ft'], int), 'stars': num(r['mp_stars']),
        'z26': 1 if r['zack_2026'] else 0, 'votes': num(r['grade_votes'], int), 'dg': num(r['crowd_grade_delta']),
        'ft': num(r['first_try_rate']), 'ftp': num(r['first_try_vs_peers']),
        'soft': num(r['soft_mentions'], int), 'stiff': num(r['stiff_mentions'], int), 'pol': num(r['polish_mentions'], int),
        'reach': num(r['reach_mentions'], int), 'bar': num(r['points_bargain'], int), 'sc': num(r['softness_score']),
        'v': r['verdict'], 'mp': r['mp_url'].rsplit('/', 1)[-1] if r['mp_url'] else '', 'walk': num(r['walk_order']),
        'tier': t['tier'] if t else '', 'tnote': t['note'] if t else '',
        'sunflag': 1 if r.get('route_sun_notes') else 0,
        'zn': ZONE_OF.get(r['comp_zone']) if r['comp_num'] else None,
        'zp': 1 if r['comp_num'] and (ZONE_OF.get(r['comp_zone']) not in ZONE_CONFIRMED or r['comp_zone'] in ZONE_PROVISIONAL_WALLS) else 0,
        'sp': SPECIALS.get(int(r['comp_num'])) if r['comp_num'] else None,
    }.items() if v not in (None, '')})
areas = {}
for zone, (name, g) in NF_SPLIT.items():
    if g: MP_AREA.setdefault(name, MP_AREA['North Forty Routes']); MP_GPS_EST.setdefault(name, g)
for name, (asp, basis, note) in MP_AREA.items():
    g = MP_GPS.get(name) or MP_GPS_EST.get(name)
    areas[name] = {'aspect': asp, 'basis': basis, 'note': note, 'shady': name in SHADY, 'est': name in MP_GPS_EST,
                   'lat': g[0] if g else None, 'lon': g[1] if g else None,
                   'count': sum(1 for x in routes if x.get('area') == name)}
# walking distances along the trails (OpenStreetMap) between every pair of walls and to check-in
net = trails.build(json.load(open(os.path.join(SRC, 'trails_osm.json'))), {**{k: (a['lat'], a['lon']) for k, a in areas.items() if a['lat'] is not None}, '__checkin': CHECKIN})
for k, a in areas.items():
    if k in net['dist']: a['d'] = net['dist'][k]
os.makedirs(OUT, exist_ok=True)
json.dump(net['out'], open(os.path.join(OUT, 'trails.json'), 'w'), separators=(',', ':'))
json.dump(routes, open(os.path.join(OUT, 'routes.json'), 'w'), separators=(',', ':'))
json.dump(areas, open(os.path.join(OUT, 'areas.json'), 'w'), separators=(',', ':'))
print(len(routes), 'routes', len(areas), 'areas', os.path.getsize(os.path.join(OUT, 'routes.json')) // 1024, 'KB')

# stamp version into service worker + app
import datetime, hashlib
h = hashlib.sha1()
for f in ['index.html','styles.css','sun.js','map.js','plan.js','app.js','data/routes.json','data/areas.json','data/trails.json']:
    h.update(open(os.path.join(ROOT,'docs',f),'rb').read())
ver = datetime.date.today().isoformat() + '-' + h.hexdigest()[:7]
open(os.path.join(ROOT,'docs','version.js'),'w').write(f"window.HHH_VERSION='{ver}';\n")
open(os.path.join(ROOT,'docs','sw.js'),'w').write(open(os.path.join(ROOT,'docs','sw.template.js')).read().replace('__VERSION__', ver))
print('version', ver)
