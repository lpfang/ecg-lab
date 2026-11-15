# 心梗定位示意图：左 = 水平切面（从脚往头看，胸前导联）；右 = 额面（正面看，肢体导联六轴系统）
# 部位与导联的对应同 web/src/content/mi.js（AHA 2009 第六部分、第四版全球心肌梗死定义的分组；前间壁 / 高侧壁 / 低侧壁为教学上的习惯分组）
# 示意图，不是精确解剖：电极、心脏的位置与心肌壁的分段边界都做了简化。
# 左图心肌壁的分段边界不手画：按"从左心室中心看各电极的方向"取相邻两组电极方向的中点，保证每个电极正对它所属的部位。
import math, sys

W, H = 1600, 1130
FONT = "PingFang SC, Hiragino Sans GB, Microsoft YaHei, Noto Sans CJK SC, Source Han Sans SC, sans-serif"
C = {  # 部位颜色（避开网页里表示 ST 抬高 / 压低的红、蓝）
    "septal": "#f59e0b",    # 前间壁
    "anterior": "#eab308",  # 前壁
    "lateral": "#16a34a",   # 侧壁
    "inferior": "#9333ea",  # 下壁
    "posterior": "#0d9488", # 后壁（下基底部）
    "rv": "#64748b",        # 右心室
}
FILL = {  # 浅色填充
    "septal": "#fde3b0", "anterior": "#fdf0a6", "lateral": "#bfe9cd",
    "inferior": "#e4cdfa", "posterior": "#b9e8e2", "rv": "#e2e8f0",
}
o = []
o.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" font-family="{FONT}">')
o.append(f'<rect width="{W}" height="{H}" fill="#fff"/>')


def text(x, y, s, size=30, fill="#111", anchor="middle", weight="normal"):
    o.append(f'<text x="{x:.1f}" y="{y:.1f}" font-size="{size}" fill="{fill}" text-anchor="{anchor}" font-weight="{weight}">{s}</text>')


def ang(dx, dy):  # 屏幕坐标里的方向 → 数学角（度，向右 0°，向上 90°，0–360）
    return math.degrees(math.atan2(-dy, dx)) % 360


def ring_sector(cx, cy, r0, r1, a0, a1, fill, stroke):
    """圆环扇区，a0 → a1 逆时针（数学角）"""
    span = (a1 - a0) % 360
    n = max(8, int(span / 3))
    pts = []
    for i in range(n + 1):
        a = math.radians(a0 + span * i / n)
        pts.append((cx + r1 * math.cos(a), cy - r1 * math.sin(a)))
    for i in range(n, -1, -1):
        a = math.radians(a0 + span * i / n)
        pts.append((cx + r0 * math.cos(a), cy - r0 * math.sin(a)))
    d = "M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in pts) + " Z"
    o.append(f'<path d="{d}" fill="{fill}" stroke="{stroke}" stroke-width="2.5" stroke-linejoin="round"/>')


def mid_angle(a, b):  # a → b 逆时针的中点
    return (a + ((b - a) % 360) / 2) % 360


# ---------------------------------------------------------------- 左图：水平切面
text(420, 62, "胸导联与附加导联：水平切面", 38, weight="bold")
text(420, 102, "（想象从脚往头看：图的上方是胸前，右侧是病人的左侧）", 25, "#555")
TX, TY, RX, RY = 420, 480, 330, 245          # 胸廓
o.append(f'<ellipse cx="{TX}" cy="{TY}" rx="{RX}" ry="{RY}" fill="#fafafa" stroke="#9ca3af" stroke-width="3"/>')
# 胸骨、脊柱
o.append(f'<rect x="{TX-16}" y="{TY-RY+6}" width="32" height="40" rx="8" fill="#e5e7eb" stroke="#9ca3af" stroke-width="2"/>')
text(TX - 60, TY - RY + 34, "胸骨", 22, "#6b7280", anchor="end")
o.append(f'<circle cx="{TX}" cy="{TY+RY-48}" r="30" fill="#e5e7eb" stroke="#9ca3af" stroke-width="2"/>')
text(TX, TY + RY - 40, "脊柱", 22, "#6b7280")
# 心脏：偏前、偏左（图的右侧）
LX, LY, R0, R1 = 515, 455, 50, 104
# 右心室：在左心室的右前方（图的左上方），画成新月形


def torso_pt(deg, out=0):
    a = math.radians(deg)
    return TX + (RX + out) * math.cos(a), TY - (RY + out) * math.sin(a)


# 电极在胸廓轮廓上的位置（数学角，以胸廓中心为准；示意）
ELEC = {"V4R": 128, "V1": 97, "V2": 83, "V3": 67, "V4": 53, "V5": 30, "V6": 2, "V7": -24, "V8": -50, "V9": -80}
GROUP = {"V1": "septal", "V2": "septal", "V3": "anterior", "V4": "anterior", "V5": "lateral", "V6": "lateral",
         "V7": "posterior", "V8": "posterior", "V9": "posterior", "V4R": "rv"}
# 从左心室中心看各电极的方向
dirs = {k: ang(torso_pt(v)[0] - LX, torso_pt(v)[1] - LY) for k, v in ELEC.items()}
order = ["septal", "anterior", "lateral", "posterior"]  # 顺时针（数学角递减）依次相邻
span = {g: [dirs[k] for k in dirs if GROUP[k] == g] for g in order}
# 相邻两组的分界 = 两组最近电极方向的中点
bounds = {
    ("septal", "anterior"): mid_angle(dirs["V3"], dirs["V2"]),
    ("anterior", "lateral"): mid_angle(dirs["V5"], dirs["V4"]),
    ("lateral", "posterior"): mid_angle(dirs["V7"], dirs["V6"]),
    ("posterior", "septal"): mid_angle(dirs["V1"], dirs["V9"]),   # 经过病人右后方（图的左下方）
}
sectors = {
    "septal": (bounds[("septal", "anterior")], bounds[("posterior", "septal")]),
    "anterior": (bounds[("anterior", "lateral")], bounds[("septal", "anterior")]),
    "lateral": (bounds[("lateral", "posterior")], bounds[("anterior", "lateral")]),
    "posterior": (bounds[("posterior", "septal")], bounds[("lateral", "posterior")]),
}
for k, d in dirs.items():  # 自检：每个电极的方向落在它所属的扇区里
    g = GROUP[k]
    if g in sectors:
        a0, a1 = sectors[g]
        assert (d - a0) % 360 <= (a1 - a0) % 360, (k, d, sectors[g])
# 视线（虚线）：从电极指向左心室
for k, deg in ELEC.items():
    ex, ey = torso_pt(deg)
    g = GROUP[k]
    tx_, ty_ = (LX - 120, LY) if g == "rv" else (LX, LY)
    dx, dy = tx_ - ex, ty_ - ey
    L = math.hypot(dx, dy)
    stop = L - (40 if g == "rv" else R1 + 6)
    o.append(f'<path d="M{ex:.1f} {ey:.1f} L{ex + dx / L * stop:.1f} {ey + dy / L * stop:.1f}" '
             f'stroke="{C[g]}" stroke-width="2.5" stroke-dasharray="7 6" opacity="0.85"/>')
# 右心室：紧贴左心室右前方（图的左上方）的新月形，室间隔夹在两者之间
ring_sector(LX, LY, R1, R1 + 46, 98, 205, FILL["rv"], C["rv"])
a = math.radians(178)
text(LX + (R1 + 92) * math.cos(a), LY - (R1 + 92) * math.sin(a) + 7, "右心室", 22, "#334155", weight="bold")
for g in order:
    a0, a1 = sectors[g]
    ring_sector(LX, LY, R0, R1, a0, a1, FILL[g], C[g])
o.append(f'<circle cx="{LX}" cy="{LY}" r="{R0}" fill="#fff" stroke="#9ca3af" stroke-width="2"/>')
text(LX, LY - 4, "左心室", 22, "#374151")
text(LX, LY + 22, "心腔", 18, "#9ca3af")
# 心肌壁名称：写在各扇区中间（环带上）
NAMES = {"septal": "前间壁", "anterior": "前壁", "lateral": "侧壁", "posterior": "后壁"}
for g, name in NAMES.items():
    a = math.radians(mid_angle(*sectors[g]))
    rm = (R0 + R1) / 2
    text(LX + rm * math.cos(a), LY - rm * math.sin(a) + 8, name, 23, "#1f2937", weight="bold")
text(LX, LY + R1 + 30, "（下基底部）", 20, C["posterior"])
# 电极
for k, deg in ELEC.items():
    ex, ey = torso_pt(deg)
    g = GROUP[k]
    o.append(f'<circle cx="{ex:.1f}" cy="{ey:.1f}" r="22" fill="#fff" stroke="{C[g]}" stroke-width="4"/>')
    lx, ly = torso_pt(deg, 46)
    text(lx, ly + 10, k, 26, C[g], weight="bold")

# ---------------------------------------------------------------- 右图：额面
FX, FY = 1170, 450
text(FX + 20, 62, "肢体导联：额面", 38, weight="bold")
text(FX + 20, 102, "（正面看病人：图的右侧是病人的左侧）", 25, "#555")
LEADS = {"I": 0, "aVL": -30, "II": 60, "aVF": 90, "III": 120, "aVR": -150}   # 心电图惯例：向下为正
LG = {"I": "lateral", "aVL": "lateral", "II": "inferior", "aVF": "inferior", "III": "inferior", "aVR": None}
RL = 250
o.append('<defs>')
for g in ("lateral", "inferior"):
    o.append(f'<marker id="ah-{g}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">'
             f'<path d="M0 0 L10 5 L0 10 Z" fill="{C[g]}"/></marker>')
o.append('<marker id="ah-avr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">'
         '<path d="M0 0 L10 5 L0 10 Z" fill="#9ca3af"/></marker>')
o.append('</defs>')


def bez(p0, p1, p2, p3, n=40):
    out = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        out.append((u**3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t**3 * p3[0],
                    u**3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t**3 * p3[1]))
    return out


def band(pts, g, w=22):
    d = "M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in pts)
    o.append(f'<path d="{d}" fill="none" stroke="{C[g]}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>')


# 心脏额面轮廓（示意）：右缘 = 右心房；下缘贴着膈肌；左缘斜向左下到心尖（图的右下）
P_TOP = (FX - 70, FY - 125)
RIGHT = ((FX - 135, FY - 70), (FX - 140, FY + 60), (FX - 112, FY + 102))
INFER = ((FX - 20, FY + 122), (FX + 120, FY + 126), (FX + 215, FY + 112))
LEFT = ((FX + 205, FY + 30), (FX + 150, FY - 90), (FX + 40, FY - 128))
o.append(f'<path d="M{P_TOP[0]} {P_TOP[1]} C {RIGHT[0][0]} {RIGHT[0][1]}, {RIGHT[1][0]} {RIGHT[1][1]}, {RIGHT[2][0]} {RIGHT[2][1]} '
         f'C {INFER[0][0]} {INFER[0][1]}, {INFER[1][0]} {INFER[1][1]}, {INFER[2][0]} {INFER[2][1]} '
         f'C {LEFT[0][0]} {LEFT[0][1]}, {LEFT[1][0]} {LEFT[1][1]}, {LEFT[2][0]} {LEFT[2][1]} '
         f'C {FX - 5} {FY - 140}, {FX - 45} {FY - 135}, {P_TOP[0]} {P_TOP[1]} Z" fill="#f8fafc" stroke="#9ca3af" stroke-width="3"/>')
# 膈肌：托在心脏下缘
o.append(f'<path d="M{FX-260} {FY+175} Q {FX+40} {FY+100} {FX+330} {FY+175}" fill="none" stroke="#c4b5a5" stroke-width="5"/>')
text(FX + 300, FY + 205, "膈肌", 22, "#a8977f")
# 下壁：心脏下缘（膈面）；高侧壁：左缘的上段
inf = bez(RIGHT[2], *INFER)
band(inf[int(len(inf) * 0.25):], "inferior")
lat = bez(INFER[2], *LEFT)
band(lat[int(len(lat) * 0.38):int(len(lat) * 0.92)], "lateral")
# 六轴：中心放在心脏中部，只画正极一侧的箭头
OX, OY = FX + 35, FY
for k, a in LEADS.items():
    r = math.radians(a)
    x1, y1 = OX + RL * math.cos(r), OY + RL * math.sin(r)
    g = LG[k]
    col = C[g] if g else "#9ca3af"
    mk = f"ah-{g}" if g else "ah-avr"
    o.append(f'<path d="M{OX} {OY} L{x1:.1f} {y1:.1f}" stroke="{col}" stroke-width="4" '
             f'stroke-dasharray="{"none" if g else "8 7"}" marker-end="url(#{mk})"/>')
    lx, ly = OX + (RL + 36) * math.cos(r), OY + (RL + 36) * math.sin(r)
    text(lx, ly + 11, k, 30, col, weight="bold")
o.append(f'<circle cx="{OX}" cy="{OY}" r="6" fill="#6b7280"/>')
text(FX - 190, FY + 148, "下壁", 28, C["inferior"], weight="bold")
text(FX + 248, FY - 60, "高侧壁", 28, C["lateral"], weight="bold")
text(FX - 250, FY - 256, "aVR 从右上方看向心腔，常规定位一般不用它；", 21, "#6b7280", anchor="start")
text(FX - 250, FY - 230, "但它的 ST 段抬高可能提示左主干", 21, "#6b7280", anchor="start")
text(FX - 250, FY - 204, "或多支血管病变，不能忽略", 21, "#6b7280", anchor="start")

# ---------------------------------------------------------------- 下方：对应表
TY0 = 860
o.append(f'<line x1="60" y1="{TY0-46}" x2="{W-60}" y2="{TY0-46}" stroke="#e5e7eb" stroke-width="2"/>')
ROWS = [
    ("septal", "前间壁", "V1、V2（也有把 V3 算进来的）"),
    ("anterior", "前壁", "V3、V4"),
    ("lateral", "侧壁", "I、aVL（高侧壁）；V5、V6（低侧壁）"),
    ("inferior", "下壁", "II、III、aVF"),
    ("posterior", "后壁（下基底部）", "V7–V9；常规 12 导联没有电极正对这里，可能只表现为 V1–V3 的 ST 段压低（不特异）"),
    ("rv", "右心室", "右胸导联 V3R、V4R（图中只画了 V4R）"),
]
for i, (g, name, leads) in enumerate(ROWS):
    x, y = 120, TY0 + i * 50
    o.append(f'<rect x="{x}" y="{y-24}" width="30" height="30" rx="6" fill="{FILL[g]}" stroke="{C[g]}" stroke-width="3"/>')
    text(x + 46, y, name, 27, C[g], anchor="start", weight="bold")
    text(x + 330, y, leads, 26, "#374151", anchor="start")
o.append('</svg>')

out = sys.argv[1] if len(sys.argv) > 1 else "mi-regions.svg"
with open(out, "w", encoding="utf-8") as f:
    f.write("\n".join(o) + "\n")
print("wrote", out, {g: tuple(round(x) for x in s) for g, s in sectors.items()})
