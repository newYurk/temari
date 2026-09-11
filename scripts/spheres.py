#!/usr/bin/env python3
"""Orthographic sphere diagrams: front solid, back dashed."""
from __future__ import annotations

import math
from dataclasses import dataclass

R = 78.0
CX = 100.0
CY = 100.0
ALPHA = math.radians(20)  # look slightly down; north toward camera
FACE = math.radians(72)  # pole in the face of the ball
NSEG = 96
EPS = 1e-4
_cam = "hand"


def set_cam(name: str):
    global _cam
    _cam = name


def rot_x(p, a):
    x, y, z = p
    ca, sa = math.cos(a), math.sin(a)
    return (x, y * ca - z * sa, y * sa + z * ca)


def project(p):
    a = FACE if _cam == "face" else ALPHA
    x, y, z = rot_x(p, a)
    return CX + R * x, CY - R * y, z


def norm(p):
    l = math.hypot(p[0], p[1], p[2]) or 1.0
    return (p[0] / l, p[1] / l, p[2] / l)


def cross(a, b):
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def add(a, b, s=1.0):
    return (a[0] + s * b[0], a[1] + s * b[1], a[2] + s * b[2])


def scale(a, s):
    return (a[0] * s, a[1] * s, a[2] * s)


def basis(axis):
    axis = norm(axis)
    tmp = (1.0, 0.0, 0.0) if abs(axis[0]) < 0.9 else (0.0, 1.0, 0.0)
    u = norm(cross(axis, tmp))
    v = norm(cross(axis, u))
    return axis, u, v


def gc_samples(axis, n=NSEG):
    _, u, v = basis(axis)
    pts = []
    for i in range(n + 1):
        t = 2 * math.pi * i / n
        p = add(scale(u, math.cos(t)), scale(v, math.sin(t)))
        pts.append(project(p))
    return pts


def parallel_samples(pole, h, n=NSEG):
    """Small circle: plane pole·x = h, |h|<1, on the unit sphere."""
    pole = norm(pole)
    radius = math.sqrt(max(0.0, 1.0 - h * h))
    _, u, v = basis(pole)
    c = scale(pole, h)
    pts = []
    for i in range(n + 1):
        t = 2 * math.pi * i / n
        p = add(c, add(scale(u, radius * math.cos(t)), scale(v, radius * math.sin(t))))
        pts.append(project(norm(p)))
    return pts


def slerp(a, b, t):
    a, b = norm(a), norm(b)
    d = max(-1.0, min(1.0, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))
    th = math.acos(d)
    if th < 1e-6:
        return a
    s = math.sin(th)
    w0 = math.sin((1 - t) * th) / s
    w1 = math.sin(t * th) / s
    return (a[0] * w0 + b[0] * w1, a[1] * w0 + b[1] * w1, a[2] * w0 + b[2] * w1)


def arc_samples(a, b, n=36):
    return [project(slerp(a, b, i / n)) for i in range(n + 1)]


def split_front_back(pts):
    front, back = [], []
    cur_f, cur_b = [], []
    prev_z = None
    for x, y, z in pts:
        vis = z >= -0.02
        if vis:
            if prev_z is not None and prev_z < -0.02 and cur_f:
                front.append(cur_f)
                cur_f = []
            cur_f.append((x, y))
            if cur_b:
                back.append(cur_b)
                cur_b = []
        else:
            if prev_z is not None and prev_z >= -0.02 and cur_b:
                back.append(cur_b)
                cur_b = []
            cur_b.append((x, y))
            if cur_f:
                front.append(cur_f)
                cur_f = []
        prev_z = z
    if cur_f:
        front.append(cur_f)
    if cur_b:
        back.append(cur_b)
    return front, back


def dpath(chains):
    parts = []
    for ch in chains:
        if len(ch) < 2:
            continue
        x0, y0 = ch[0]
        d = [f"M{x0:.2f} {y0:.2f}"]
        for x, y in ch[1:]:
            d.append(f"L{x:.2f} {y:.2f}")
        parts.append(" ".join(d))
    return " ".join(parts)


def front_only(samples, cls, width=1.2):
    front, _ = split_front_back(samples)
    fp = dpath(front)
    if not fp:
        return ""
    return f'<path class="{cls}" d="{fp}" fill="none" stroke-width="{width}" />'


def circle_paths(samples, cls_front, cls_back, width=1.2):
    front, back = split_front_back(samples)
    out = []
    bp = dpath(back)
    fp = dpath(front)
    if bp:
        out.append(
            f'<path class="{cls_back}" d="{bp}" fill="none" stroke-width="{width}" />'
        )
    if fp:
        out.append(
            f'<path class="{cls_front}" d="{fp}" fill="none" stroke-width="{width}" />'
        )
    return "\n            ".join(out)


def pin(p, r=3.0):
    x, y, z = project(norm(p))
    if z < -0.12:
        return ""
    return f'<circle cx="{x:.2f}" cy="{y:.2f}" r="{r}" class="pin" />'


SHELL = """<circle cx="100" cy="100" r="78" fill="url(#g)" stroke="#0c0b09" stroke-width="1.15" />"""


def svg(label, body):
    return f'''          <svg class="ball" viewBox="0 0 200 200" aria-label="{label}">
            {SHELL}
            {body}
          </svg>'''


def meridian_axis(lam):
    # GC normal for meridian at longitude λ (untilted)
    return (math.cos(lam), 0.0, -math.sin(lam))


# --- diagrams ---

def great_circle():
    body = [
        circle_paths(gc_samples((0, 1, 0)), "ink-front", "ink-back", 2.15),
    ]
    body.append(pin((0, 1, 0), 3.2))
    body.append(pin((0, -1, 0), 3.2))
    return svg("Большой круг", "\n            ".join(x for x in body if x))


def small_circle():
    body = [
        circle_paths(parallel_samples((0, 1, 0), 0.62), "stone-front", "stone-back", 1.6),
        circle_paths(gc_samples((0, 1, 0)), "ink-front", "ink-back", 1.05),
    ]
    return svg("Малая окружность — нельзя", "\n            ".join(body))


def one_wrap():
    body = [
        circle_paths(gc_samples((0, 1, 0)), "beni-front", "beni-back", 2.3),
        pin((0, 1, 0), 3.2),
        pin((0, -1, 0), 3.2),
    ]
    return svg("Один виток", "\n            ".join(x for x in body if x))


def next_wrap():
    n1 = (0, 1, 0)
    n2 = norm((0.22, 0.97, 0.08))
    body = [
        circle_paths(gc_samples(n1), "beni-front", "beni-back", 1.15),
        circle_paths(gc_samples(n2), "beni-front", "beni-back", 2.3),
    ]
    return svg("Следующий виток чуть сдвинут", "\n            ".join(body))


def spiral_bad():
    # rhumb-ish: several small circles climbing
    bits = [circle_paths(gc_samples((0, 1, 0)), "stone-front", "stone-back", 0.9)]
    for h in (0.15, 0.38, 0.58, 0.75):
        bits.append(circle_paths(parallel_samples((0, 1, 0), h), "beni-front", "beni-back", 1.8))
    return svg("Спираль", "\n            ".join(bits))


def polar_hump():
    bits = []
    for lam in (0, math.pi / 4, math.pi / 2, 3 * math.pi / 4):
        bits.append(circle_paths(gc_samples(meridian_axis(lam)), "beni-front", "beni-back", 1.35))
    bits.append(pin((0, 1, 0), 3.2))
    return svg("Горб на полюсе", "\n            ".join(x for x in bits if x))


def kink():
    # front half of equator, then a meridian stub — broken
    eq = gc_samples((0, 1, 0))
    front, _ = split_front_back(eq)
    # only the lower-front of equator
    bits = []
    if front:
        bits.append(
            f'<path class="beni-front" d="{dpath(front)}" fill="none" stroke-width="2.2" />'
        )
    # a meridian fragment from equator toward NE, as a kink
    mer = gc_samples(meridian_axis(0.7))
    f2, _ = split_front_back(mer)
    if f2:
        # take a short middle chunk
        ch = f2[0]
        mid = ch[len(ch) // 3 : len(ch) // 3 + 18]
        bits.append(
            f'<path class="beni-front" d="{dpath([mid])}" fill="none" stroke-width="2.2" />'
        )
    bits.append(f'<circle cx="{CX}" cy="{CY}" r="2.4" class="pin" />')
    return svg("Излом в середине круга", "\n            ".join(bits))


def simple8():
    bits = [circle_paths(gc_samples((0, 1, 0)), "mark-front", "mark-back", 1.35)]
    for lam in (0.0, math.pi / 4, math.pi / 2, 3 * math.pi / 4):
        bits.append(circle_paths(gc_samples(meridian_axis(lam)), "mark-front", "mark-back", 1.2))
    bits.append(pin((0, 1, 0), 3.4))
    bits.append(pin((0, -1, 0), 3.4))
    for lam in (0, math.pi / 2, math.pi, 3 * math.pi / 2, math.pi / 4, 3 * math.pi / 4, 5 * math.pi / 4, 7 * math.pi / 4):
        bits.append(pin((math.sin(lam), 0.0, math.cos(lam)), 2.5))
    return svg("Простое 8", "\n            ".join(x for x in bits if x))


def c8():
    # Same camera as Simple 8, plus the spherical square around north
    # (northern cube vertices). That square is what C8 is, not another meridian.
    bits = [circle_paths(gc_samples((0, 1, 0)), "mark-front", "mark-back", 1.25)]
    for lam in (0.0, math.pi / 4, math.pi / 2, 3 * math.pi / 4):
        bits.append(circle_paths(gc_samples(meridian_axis(lam)), "mark-front", "mark-back", 1.1))
    cube_n = [norm((sx, 1.0, sz)) for sx in (-1, 1) for sz in (-1, 1)]
    _, u, v = basis((0, 1, 0))

    def ang(p):
        return math.atan2(
            p[0] * v[0] + p[1] * v[1] + p[2] * v[2],
            p[0] * u[0] + p[1] * u[1] + p[2] * u[2],
        )

    cube_n.sort(key=ang)
    for i, a in enumerate(cube_n):
        b = cube_n[(i + 1) % 4]
        bits.append(front_only(arc_samples(a, b, 32), "mark-front", 1.55))
        bits.append(pin(a, 2.55))
    for p in ((0, 1, 0), (0, -1, 0), (1, 0, 0), (-1, 0, 0), (0, 0, 1), (0, 0, -1)):
        bits.append(pin(p, 3.05))
    return svg("C8", "\n            ".join(x for x in bits if x))


def ico_verts():
    ph = (1 + math.sqrt(5)) / 2
    raw = []
    for s1 in (1, -1):
        for s2 in (1, -1):
            raw.append((0.0, s1, s2 * ph))
            raw.append((s1, s2 * ph, 0.0))
            raw.append((s2 * ph, 0.0, s1))
    return [norm(p) for p in raw]


def c10():
    verts = ico_verts()
    north0 = max(verts, key=lambda p: p[1])
    # put that vertex on +Y so the pentagon sits around the top, like a ball in hand
    axis = cross(north0, (0, 1, 0))
    if math.hypot(*axis) > 1e-6:
        axis = norm(axis)
        ang = math.acos(max(-1, min(1, north0[1])))
        ca, sa = math.cos(ang), math.sin(ang)

        def rot(p):
            return add(
                add(scale(p, ca), scale(cross(axis, p), sa)),
                scale(axis, (1 - ca) * (axis[0] * p[0] + axis[1] * p[1] + axis[2] * p[2])),
            )

        verts = [rot(v) for v in verts]
    north = max(verts, key=lambda p: p[1])
    dots = sorted(
        ((p[0] * north[0] + p[1] * north[1] + p[2] * north[2], p) for p in verts),
        reverse=True,
    )
    ring = [p for d, p in dots if d < 0.99][:5]
    # order ring around north
    _, u, v = basis(north)

    def ang(p):
        return math.atan2(
            p[0] * v[0] + p[1] * v[1] + p[2] * v[2],
            p[0] * u[0] + p[1] * u[1] + p[2] * u[2],
        )

    ring.sort(key=ang)
    bits = []
    # 5 meridians: plane through north and each neighbor (also through south)
    for p in ring:
        ax = norm(cross(north, p))
        bits.append(circle_paths(gc_samples(ax), "mark-front", "mark-back", 1.15))
    # pentagon: short arcs between adjacent neighbors only
    for i, a in enumerate(ring):
        b = ring[(i + 1) % 5]
        bits.append(front_only(arc_samples(a, b, 28), "mark-front", 1.35))
    bits.append(pin(north, 3.3))
    for p in ring:
        bits.append(pin(p, 2.6))
    south = min(verts, key=lambda p: p[1])
    bits.append(pin(south, 2.6))
    return svg("C10", "\n            ".join(x for x in bits if x))


def pins_simple():
    bits = [circle_paths(gc_samples((0, 1, 0)), "mark-front", "mark-back", 1.0)]
    bits.append(pin((0, 1, 0), 3.5))
    bits.append(pin((0, -1, 0), 3.5))
    for lam in (0, math.pi / 4, math.pi / 2, 3 * math.pi / 4, math.pi, 5 * math.pi / 4, 3 * math.pi / 2, 7 * math.pi / 4):
        bits.append(pin((math.sin(lam), 0.0, math.cos(lam)), 2.5))
    return svg("Булавки Simple 8", "\n            ".join(x for x in bits if x))


def thread_one_side():
    bits = [
        circle_paths(gc_samples((0, 1, 0)), "mark-front", "mark-back", 1.45),
        circle_paths(gc_samples(meridian_axis(0.0)), "mark-front", "mark-back", 1.45),
        pin((0, 1, 0), 3.3),
        pin((0, -1, 0), 3.3),
        pin((1, 0, 0), 2.6),
    ]
    return svg("Нить с одной стороны булавок", "\n            ".join(x for x in bits if x))


NORTH = (0.0, 1.0, 0.0)


def around_pole(pole, theta, phi):
    axis, u, v = basis(pole)
    ct, st = math.cos(theta), math.sin(theta)
    cp, sp = math.cos(phi), math.sin(phi)
    return add(scale(axis, ct), add(scale(u, cp * st), scale(v, sp * st)))


def kiku():
    set_cam("face")
    bits = []
    n = 8
    da = 2 * math.pi / n
    # One polar 8-petal motif on Simple 8. This is a motif silhouette,
    # not a stitch-order diagram; the detailed kagari bite is shown separately.
    bits.append(circle_paths(gc_samples((0, 1, 0)), "mark-front", "mark-back", 0.95))
    for i in range(n // 2):
        bits.append(
            circle_paths(gc_samples(meridian_axis(i * da)), "mark-front", "mark-back", 1.05)
        )
    # Two continuous four-point zigzag sets, offset by 45 degrees. Alternating
    # their rows creates the eight apparent petals; petals are not closed one by one.
    for r in range(3):
        inner = 0.09 + r * 0.035
        outer = 0.72 + r * 0.035
        for set_offset in (0, 1):
            ring = []
            for i in range(4):
                ring.append(around_pole(NORTH, outer, (2 * i + set_offset) * da))
                ring.append(around_pole(NORTH, inner, (2 * i + 1 + set_offset) * da))
            for i in range(len(ring)):
                bits.append(
                    front_only(arc_samples(ring[i], ring[(i + 1) % len(ring)], 14), "beni-front", 1.2)
                )
    # GT14 places one temporary lower-point pin on every Simple-8 line,
    # one third of the pole-to-equator distance up from the equator.
    for i in range(n):
        bits.append(pin(around_pole(NORTH, 0.72, i * da), 2.35))
    bits.append(pin(NORTH, 3.2))
    set_cam("hand")
    return svg("Кику от полюса", "\n            ".join(x for x in bits if x))


def hoshi():
    set_cam("face")
    # Hoshi kagari is specifically a five-point star: 1-3-5-2-4-1.
    n, skip, theta = 5, 2, 0.72
    pts = [around_pole(NORTH, theta, 2 * math.pi * i / n) for i in range(n)]
    bits = [
        circle_paths(gc_samples((0, 1, 0)), "mark-front", "mark-back", 0.9),
    ]
    # Five great circles give the ten rays of a Simple 10; the star uses every other ray.
    for i in range(n):
        bits.append(
            circle_paths(
                gc_samples(meridian_axis(i * math.pi / n)),
                "mark-front",
                "mark-back",
                0.95,
            )
        )
    bits.append(front_only(parallel_samples(NORTH, math.cos(theta)), "mark-front", 1.15))
    for i in range(n):
        bits.append(front_only(arc_samples(pts[i], pts[(i + skip) % n], 20), "beni-front", 1.4))
        bits.append(pin(pts[i], 2.4))
    bits.append(pin(NORTH, 3.0))
    set_cam("hand")
    return svg("Хоси — звезда", "\n            ".join(x for x in bits if x))


def hishi():
    set_cam("face")
    # Concrete C8 context. The 8-point pole is enclosed by a spherical square.
    # One adjacent 4-point center is enclosed by a diamond (hishi) whose corners
    # are two 8-centers and two 6-centers. This avoids inventing a diamond on an
    # isolated orthogonal cross.
    bits = [circle_paths(gc_samples((0, 1, 0)), "mark-front", "mark-back", 0.9)]
    for lam in (0.0, math.pi / 4, math.pi / 2, 3 * math.pi / 4):
        bits.append(circle_paths(gc_samples(meridian_axis(lam)), "mark-front", "mark-back", 0.85))

    cube_n = [norm((sx, 1.0, sz)) for sx in (-1, 1) for sz in (-1, 1)]
    _, u, v = basis(NORTH)

    def around_north(p):
        return math.atan2(
            p[0] * v[0] + p[1] * v[1] + p[2] * v[2],
            p[0] * u[0] + p[1] * u[1] + p[2] * u[2],
        )

    cube_n.sort(key=around_north)
    for i, a in enumerate(cube_n):
        bits.append(front_only(arc_samples(a, cube_n[(i + 1) % 4], 24), "mark-front", 1.25))

    diamond = [NORTH, norm((1, 1, 1)), (1, 0, 0), norm((1, 1, -1))]
    for i, a in enumerate(diamond):
        bits.append(front_only(arc_samples(a, diamond[(i + 1) % 4], 24), "beni-front", 2.0))
        bits.append(pin(a, 2.4))
    bits.append(pin(norm((1, 1, 0)), 2.6))
    set_cam("hand")
    return svg("Хиси — грань C8", "\n            ".join(x for x in bits if x))


def obi():
    bits = [
        circle_paths(gc_samples((0, 1, 0)), "mark-front", "mark-back", 1.2),
        circle_paths(gc_samples(meridian_axis(0.0)), "mark-front", "mark-back", 0.95),
        circle_paths(gc_samples(meridian_axis(math.pi / 2)), "mark-front", "mark-back", 0.95),
        circle_paths(parallel_samples((0, 1, 0), 0.045), "beni-front", "beni-back", 1.7),
        circle_paths(parallel_samples((0, 1, 0), 0.015), "beni-front", "beni-back", 1.7),
        circle_paths(parallel_samples((0, 1, 0), -0.015), "beni-front", "beni-back", 1.7),
        circle_paths(parallel_samples((0, 1, 0), -0.045), "beni-front", "beni-back", 1.7),
        pin((1, 0, 0), 2.8),
    ]
    return svg("Оби по экватору", "\n            ".join(bits))


def wrap_measure():
    # used in 220x150 view — skip, keep handmade paper drawings
    return ""


CSS = """
      .ink-front { stroke: #8f3d32; stroke-linecap: round; }
      .ink-back { stroke: #8f3d32; stroke-dasharray: 2.4 2.8; opacity: 0.28; stroke-linecap: round; }
      .beni-front { stroke: #8f3d32; stroke-linecap: round; }
      .beni-back { stroke: #8f3d32; stroke-dasharray: 2.4 2.8; opacity: 0.28; stroke-linecap: round; }
      .mark-front { stroke: #9a8b6a; stroke-linecap: round; }
      .mark-back { stroke: #9a8b6a; stroke-dasharray: 2.2 2.6; opacity: 0.32; stroke-linecap: round; }
      .stone-front { stroke: #8a847c; stroke-linecap: round; }
      .stone-back { stroke: #8a847c; stroke-dasharray: 2.4 2.8; opacity: 0.3; stroke-linecap: round; }
      svg.ball .pin { fill: #0c0b09; }
"""

if __name__ == "__main__":
    names = [
        ("great", great_circle()),
        ("small", small_circle()),
        ("one", one_wrap()),
        ("next", next_wrap()),
        ("spiral", spiral_bad()),
        ("hump", polar_hump()),
        ("kink", kink()),
        ("simple8", simple8()),
        ("c8", c8()),
        ("c10", c10()),
        ("pins", pins_simple()),
        ("oneside", thread_one_side()),
        ("kiku", kiku()),
        ("hoshi", hoshi()),
        ("hishi", hishi()),
        ("obi", obi()),
    ]
    out = "/tmp/spheres"
    import os
    os.makedirs(out, exist_ok=True)
    print(CSS)
    for name, s in names:
        path = f"{out}/{name}.svg"
        # wrap as full svg for preview
        inner = s.strip()
        open(path, "w").write(
            f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <defs>
    <radialGradient id="g" cx="36%" cy="30%">
      <stop offset="0%" stop-color="#f4efe7"/>
      <stop offset="72%" stop-color="#d5cec3"/>
      <stop offset="100%" stop-color="#b3aaa0"/>
    </radialGradient>
    <style>
      .ink-front,.beni-front {{ stroke:#8f3d32; fill:none; stroke-linecap:round; }}
      .ink-back,.beni-back {{ stroke:#8f3d32; fill:none; stroke-dasharray:2.4 2.8; opacity:.28; }}
      .mark-front {{ stroke:#9a8b6a; fill:none; stroke-linecap:round; }}
      .mark-back {{ stroke:#9a8b6a; fill:none; stroke-dasharray:2.2 2.6; opacity:.32; }}
      .stone-front {{ stroke:#8a847c; fill:none; }}
      .stone-back {{ stroke:#8a847c; fill:none; stroke-dasharray:2.4 2.8; opacity:.3; }}
      .pin {{ fill:#0c0b09; }}
    </style>
  </defs>
{inner[inner.find('<circle'):inner.rfind('</svg>')]}
</svg>
'''
        )
        print("wrote", path)
