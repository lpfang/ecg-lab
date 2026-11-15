import cv2, numpy as np, csv, sys
src, out = sys.argv[1], sys.argv[2]
im = cv2.imread(src)
H, W = im.shape[:2]
gray = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
mask = np.zeros((H, W), np.uint8)
# OCR 词框（x, y, w, h），加上 OCR 漏掉的几处
boxes = [
 (777,189,92,28),(884,189,200,28),(757,230,89,36),(860,231,114,35),(988,230,118,36),
 (1505,398,206,29),(1486,441,241,28),(1510,482,201,28),
 (1672,869,193,28),(1672,911,201,28),(1678,952,182,35),(1662,994,213,35),(1713,1035,110,36),
 (1651,1148,193,28),(1683,1189,138,36),(1652,1231,182,35),(1612,1266,280,44),(1692,1314,110,35),
 (233,1030,193,28),(279,1072,98,35),(239,1113,182,36),(205,1151,250,45),
 (663,1683,447,29),(800,1725,172,28),(660,1767,183,35),(855,1767,257,35),
]
P = 5
for x, y, w, h in boxes:
    sub = gray[y-P:y+h+P, x-P:x+w+P]
    mask[y-P:y+h+P, x-P:x+w+P] |= (sub < 140).astype(np.uint8) * 255
# Start 框里的字（不碰边框）
x0,y0,x1,y1 = 552,368,716,404
mask[y0:y1, x0:x1] |= (gray[y0:y1, x0:x1] < 140).astype(np.uint8)*255
# 环上的四个词：按与圆心距离限定区域，不碰圆周线
cx, cy, R1, R2 = 1051.5, 1005, 206.5, 259.5  # 按像素量出的圆心和内外半径
yy, xx = np.mgrid[0:H, 0:W]
r = np.hypot(xx-cx, yy-cy)
dark = gray < 140
band = (r > R1+5) & (r < R2-5)
top = band & (yy < cy-150) & (xx > 938) & (xx < 1156); bot = band & (yy > cy+150) & (xx > 930) & (xx < 1175)
outer = (r > R2+5) & (r < R2+75) & (np.abs(yy-cy) < 170)
for region in (top, bot, outer):
    mask |= (region & dark).astype(np.uint8)*255
mask = cv2.dilate(mask, np.ones((5,5),np.uint8))
mask[1240:1340, 1560:1608] = 0  # 不碰左边心脏的轮廓
res = cv2.inpaint(im, mask, 6, cv2.INPAINT_TELEA)
cv2.imwrite(out, res, [cv2.IMWRITE_JPEG_QUALITY, 92])
cv2.imwrite(out.replace('.jpg','-mask.png'), mask)
