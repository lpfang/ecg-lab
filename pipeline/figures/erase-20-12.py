# 图 20.12：抹去英文标注（底色是白色，直接涂白文字笔画）
import cv2, numpy as np, sys
src, out = sys.argv[1], sys.argv[2]
im = cv2.imread(src)
H, W = im.shape[:2]
gray = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
mask = np.zeros((H, W), np.uint8)
boxes = [  # x, y, w, h（OCR 词框）
 (220,20,384,77),      # Systolic blood pressure (first sound heard)
 (1155,20,396,77),     # Diastolic blood pressure (last sound heard)
 (1419,617,221,36),    # Cuff pressure
 (777,764,81,28),      # Time（保留箭头）
 (166,939,276,77),     # Korotkoff sounds in stethoscope
 (13,268,36,301),      # Pressure (mm Hg)（竖排）
]
P = 4
for x, y, w, h in boxes:
    sub = gray[y-P:y+h+P, max(0,x-P):x+w+P]
    mask[y-P:y+h+P, max(0,x-P):x+w+P] |= (sub < 235).astype(np.uint8) * 255
mask = cv2.dilate(mask, np.ones((3,3),np.uint8))
im[mask > 0] = 255
cv2.imwrite(out, im, [cv2.IMWRITE_JPEG_QUALITY, 92])
