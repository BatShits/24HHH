"""Trail network for walking times: OpenStreetMap footways/roads in the canyon -> graph -> shortest walks.

build(osm, places) returns
  dist: {place: {place: metres}} shortest walk between every pair of places (walls, check-in)
  out:  data for the app: drawable trail lines plus a compact graph for drawing plan legs along trails
"""
import heapq, math

OFF_TRAIL = 1.3   # off-trail metres (wall to nearest trail, gaps between trail pieces) cost this much more
JOIN_GAP = 45     # join separate trail pieces whose ends are this close (m)


def metres(a, b):
    R = 6371000; t = math.pi / 180
    x = (b[1] - a[1]) * t * math.cos((a[0] + b[0]) / 2 * t); y = (b[0] - a[0]) * t
    return R * math.hypot(x, y)


def build(osm, places):
    nodes, index, adj = [], {}, []
    def nid(p):
        k = (round(p[0], 6), round(p[1], 6))
        if k not in index: index[k] = len(nodes); nodes.append(k); adj.append({})
        return index[k]
    def link(i, j, w):
        if i != j and (j not in adj[i] or adj[i][j] > w): adj[i][j] = w; adj[j][i] = w
    lines = []
    for w in osm['ways']:
        ids = [nid(p) for p in w['pts']]
        for i, j in zip(ids, ids[1:]): link(i, j, metres(nodes[i], nodes[j]))
        lines.append({'t': w['type'], 'pts': [list(p) for p in w['pts']]})
    # join pieces that don't share a node (OSM gaps)
    def comps():
        seen, out = [-1] * len(nodes), []
        for s in range(len(nodes)):
            if seen[s] >= 0: continue
            stack, c = [s], len(out); seen[s] = c; members = []
            while stack:
                u = stack.pop(); members.append(u)
                for v in adj[u]:
                    if seen[v] < 0: seen[v] = c; stack.append(v)
            out.append(members)
        return out
    while True:
        cs = comps()
        if len(cs) == 1: break
        cs.sort(key=len)
        small, rest = cs[0], set(x for c in cs[1:] for x in c)
        best = min(((metres(nodes[a], nodes[b]), a, b) for a in small for b in rest), default=None)
        if not best or best[0] > JOIN_GAP * 6: break  # truly separate piece; leave it
        link(best[1], best[2], best[0] * OFF_TRAIL)
    main = max(comps(), key=len)
    # attach each place to its nearest trail node
    snap = {}
    for k, p in places.items():
        d, n = min((metres(p, nodes[n]), n) for n in main)
        snap[k] = (n, d * OFF_TRAIL)
    # shortest walks
    def dijkstra(src):
        dist = {src: 0.0}; pq = [(0.0, src)]
        while pq:
            d, u = heapq.heappop(pq)
            if d > dist[u]: continue
            for v, w in adj[u].items():
                nd = d + w
                if nd < dist.get(v, 1e18): dist[v] = nd; heapq.heappush(pq, (nd, v))
        return dist
    dist = {}
    for a, (na, oa) in snap.items():
        dd = dijkstra(na); dist[a] = {}
        for b, (nb, ob) in snap.items():
            if a == b: continue
            straight = metres(places[a], places[b])
            via = oa + dd.get(nb, 1e18) + ob
            # short hops between neighbouring walls: walk the cliff base directly
            dist[a][b] = round(min(via, straight * OFF_TRAIL) if straight < 120 else via)
    # compact graph of the main network for drawing plan legs in the app
    keep = {n: i for i, n in enumerate(sorted(main))}
    gn = [list(nodes[n]) for n in sorted(main)]
    ge = sorted({(min(keep[u], keep[v]), max(keep[u], keep[v])) for u in main for v in adj[u] if v in keep})
    out = {'source': osm['source'], 'lines': lines, 'nodes': gn, 'edges': [list(e) for e in ge],
           'snap': {k: keep[n] for k, (n, _) in snap.items()}}
    return {'dist': dist, 'out': out}
