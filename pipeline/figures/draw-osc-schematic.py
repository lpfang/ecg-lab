# 示波法示意图：上 = 袖带压力 + 动脉血压；中 = 动脉的三种状态；下 = 袖带里的抖动及其轮廓
# 数值为示意：血压 120/80，平均动脉压约 93；收缩压、舒张压按最大抖动的约 50%、70% 找（Babbs 2012 所述常用比例）
import math, sys
W, H = 1600, 1260
SBP, DBP = 120, 80
MAP = DBP + (SBP - DBP) / 3            # ≈ 93
P0, P1 = 150, 50                        # 袖带从 150 放到 50
X0, X1 = 200, 1540
STEP = 4                                # 每跳一下袖带降 4 毫米汞柱（示意）
def x_of(p): return X0 + (P0 - p) / (P0 - P1) * (X1 - X0)
# 上图
AY0, AY1, AP0, AP1 = 560, 70, 40, 160
def ya(p): return AY0 - (p - AP0) / (AP1 - AP0) * (AY0 - AY1)
# 抖动轮廓（左右不对称的钟形）：收缩压处 = 0.5，舒张压处 = 0.7
sL = (SBP - MAP) / math.sqrt(2 * math.log(2))
sR = (MAP - DBP) / math.sqrt(2 * math.log(1 / 0.7))
def env(p):
    d = p - MAP
    return math.exp(-d * d / (2 * (sL if d > 0 else sR) ** 2))
# 一次心跳的动脉压波形（0..1 → 80..120），上升快、下降慢、带降中峡
def beat(u):
    # 0–0.2 上升；之后回落，0.42 处有降中峡的小鼓包；接近 1 时平滑接回下一次的起点
    if u < 0.2: v = (1 - math.cos(u / 0.2 * math.pi)) / 2
    else:
        v = math.exp(-(u - 0.2) * 3.2) + 0.1 * math.exp(-((u - 0.45) / 0.06) ** 2)
        v -= math.exp(-0.8 * 3.2) * (u - 0.2) / 0.8
    return v
vals = [beat(i / 400) for i in range(400)]
lo, hi = min(vals), max(vals)
def art(u): return DBP + (beat(u) - lo) / (hi - lo) * (SBP - DBP)
nbeats = int((P0 - P1) / STEP)
bw = (X1 - X0) / ((P0 - P1) / STEP)
o = []
o.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" font-family="Helvetica, Arial, sans-serif">')
o.append(f'<rect width="{W}" height="{H}" fill="#fff"/>')
# 上图坐标轴
o.append(f'<path d="M{X0-40} {AY1-10} L{X0-40} {AY0} L{X1+20} {AY0}" fill="none" stroke="#111" stroke-width="3"/>')
for p in (60, 80, 100, 120, 140):
    o.append(f'<path d="M{X0-52} {ya(p):.1f} L{X0-40} {ya(p):.1f}" stroke="#111" stroke-width="3"/>')
    o.append(f'<text x="{X0-62}" y="{ya(p)+11:.1f}" font-size="32" text-anchor="end" fill="#111">{p}</text>')
# 动脉血压（红）
pts = []
for i in range(int(X1 - X0) + 1):
    x = X0 + i
    u = ((x - X0) / bw + 0.55) % 1
    pts.append(f'{x:.1f},{ya(art(u)):.1f}')
o.append(f'<polyline points="{" ".join(pts)}" fill="none" stroke="#cf2a1f" stroke-width="4.5" stroke-linejoin="round"/>')
# 袖带压力（灰）
o.append(f'<path d="M{X0} {ya(P0):.1f} L{X1} {ya(P1):.1f}" stroke="#8a8a8a" stroke-width="7"/>')
# 下图：袖带里的抖动
CY, CA = 1080, 150
o.append(f'<path d="M{X0-40} {CY} L{X1+20} {CY}" stroke="#bbb" stroke-width="2"/>')
pts, up, dn = [], [], []
for i in range(int(X1 - X0) + 1):
    x = X0 + i
    p = P0 - (x - X0) / (X1 - X0) * (P0 - P1)
    u = ((x - X0) / bw + 0.55) % 1
    a = env(p) * CA
    w = (beat(u) - lo) / (hi - lo) - 0.45
    pts.append(f'{x:.1f},{CY - a * w * 1.6:.1f}')
    up.append(f'{x:.1f},{CY - a * 0.55 * 1.6:.1f}'); dn.append(f'{x:.1f},{CY + a * 0.45 * 1.6:.1f}')
o.append(f'<polyline points="{" ".join(up)}" fill="none" stroke="#06675b" stroke-width="3" stroke-dasharray="10 8"/>')
o.append(f'<polyline points="{" ".join(dn)}" fill="none" stroke="#06675b" stroke-width="3" stroke-dasharray="10 8"/>')
o.append(f'<polyline points="{" ".join(pts)}" fill="none" stroke="#1a9bb0" stroke-width="3.5" stroke-linejoin="round"/>')
# 三条竖线：收缩压、平均动脉压、舒张压
keys = {}
for name, p, col in (('sbp', SBP, '#06675b'), ('map', MAP, '#111'), ('dbp', DBP, '#06675b')):
    x = x_of(p); keys[name] = (round(x), round(ya(p)))
    # 竖线在中间一段断开，不穿过动脉示意和文字
    o.append(f'<path d="M{x:.1f} 62 L{x:.1f} {AY0} M{x:.1f} 835 L{x:.1f} {CY + 30}" stroke="{col}" stroke-width="2.5" stroke-dasharray="7 7"/>')
    o.append(f'<circle cx="{x:.1f}" cy="{ya(p):.1f}" r="10" fill="#fff" stroke="{col}" stroke-width="4"/>')
    o.append(f'<circle cx="{x:.1f}" cy="{CY - env(p) * CA * 0.55 * 1.6:.1f}" r="9" fill="#fff" stroke="{col}" stroke-width="4"/>')
    o.append(f'<path d="M{X0-40} {ya(p):.1f} L{x:.1f} {ya(p):.1f}" stroke="{col}" stroke-width="1.5" stroke-dasharray="3 6"/>')
# 中间：动脉横截面的三种状态（红色），放在三个区间的中间
MY = 690
def artery(cx, kind):
    s = []
    if kind == 'closed':
        s.append(f'<ellipse cx="{cx}" cy="{MY}" rx="44" ry="5" fill="#cf2a1f"/>')
    elif kind == 'flap':
        s.append(f'<ellipse cx="{cx}" cy="{MY}" rx="44" ry="5" fill="#cf2a1f"/>')
        s.append(f'<ellipse cx="{cx}" cy="{MY}" rx="32" ry="30" fill="none" stroke="#cf2a1f" stroke-width="4" stroke-dasharray="8 6"/>')
        s.append(f'<path d="M{cx+56} {MY-24} L{cx+56} {MY+24} M{cx+48} {MY-14} L{cx+56} {MY-26} L{cx+64} {MY-14} M{cx+48} {MY+14} L{cx+56} {MY+26} L{cx+64} {MY+14}" stroke="#555" stroke-width="3" fill="none"/>')
    else:
        s.append(f'<circle cx="{cx}" cy="{MY}" r="30" fill="#cf2a1f"/>')
        s.append(f'<circle cx="{cx}" cy="{MY}" r="35" fill="none" stroke="#cf2a1f" stroke-width="3" stroke-dasharray="6 6"/>')
    return ''.join(s)
mids = {'closed': (x_of(P0) + x_of(SBP)) / 2, 'flap': (x_of(SBP) + x_of(DBP)) / 2, 'open': (x_of(DBP) + x_of(P1)) / 2}
for k, cx in mids.items():
    o.append(artery(round(cx), k)); keys['ic-' + k] = (round(cx), MY)
# 时间箭头
o.append(f'<path d="M{X1-260} {H-40} L{X1-40} {H-40}" stroke="#111" stroke-width="3"/><path d="M{X1-58} {H-52} L{X1-36} {H-40} L{X1-58} {H-28} Z" fill="#111"/>')
o.append('</svg>')
open(sys.argv[1], 'w').write('\n'.join(o))
print(keys, 'MAP', round(MAP, 1), 'beats', nbeats, 'x(150)', x_of(150))
