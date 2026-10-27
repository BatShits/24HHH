import re, json, sys, html
x = open(sys.argv[1]).read()
KEYS = ['pre','first','ahead','wayAhead','slipping','onPlan','behind','wayBehind','catchUp','idle','ticked','dusk','night','sunrise','checkin','hard','goal','lastHour','over']
V = {'demon': {}, 'angel': {}}
sec = None; who = None; key = None
for m in re.finditer(r"<paragraph([^>]*)>(.*?)</paragraph>|<paragraph[^>]*/>", x, re.S):
    attrs, body = m.group(1) or '', m.group(2) or ''
    text = html.unescape(''.join(re.findall(r"<text[^>]*>(.*?)</text>", body, re.S))).replace('&#32;', ' ').strip()
    h = re.search(r"heading='(\d)'", attrs)
    if h and h.group(1) == '2':
        n = re.match(r'(\d+)\.', text); sec = int(n.group(1)) if n else None; who = None; continue
    if h and h.group(1) == '3':
        t = text.lower()
        who = 'demon' if t.startswith('demon') else 'angel' if t.startswith('angel') else None
        if sec == 20:
            key = 'switch_off' if ('off' in t or 'to the demon' in t) else 'switch_on'
        elif sec and 1 <= sec <= 19: key = KEYS[sec - 1]
        continue
    # list item paragraphs have no heading; only take those inside a list under a known section
    if who and key and text and m.start() > 0 and x.rfind('<listItem', 0, m.start()) > x.rfind('</list>', 0, m.start()):
        V[who].setdefault(key, []).append(re.sub(r'\s{2,}', ' ', text))
json.dump(V, open(sys.argv[2], 'w'), indent=1, ensure_ascii=False)
print(sum(len(v) for w in V.values() for v in w.values()), 'lines')
