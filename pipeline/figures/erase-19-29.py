# 图 19.29：抹去英文标注（底色是白色，直接涂白文字笔画）
import cv2, numpy as np, sys
src, out = sys.argv[1], sys.argv[2]
im = cv2.imread(src)
H, W = im.shape[:2]
gray = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
mask = np.zeros((H, W), np.uint8)
boxes = [  # x, y, w, h（OCR 词框）
 (933,5,94,28),(1039,5,86,28),(933,47,104,28),            # Aortic valve closes
 (363,140,94,28),(469,140,86,28),(363,189,101,28),        # Aortic valve opens
 (227,324,94,28),(335,331,142,28),                        # Aortic pressure
 (566,511,178,28),(757,518,142,28),                       # Ventricular pressure
 (983,554,86,28),(1083,554,85,28),(981,603,100,28),       # Mitral valve opens
 (331,618,87,28),(431,618,85,28),(329,660,105,28),        # Mitral valve closes
 (606,714,82,28),(703,721,142,28),                        # Atrial pressure
 (574,933,46,27),(948,932,59,28),(1170,932,51,28),        # 1st 2nd 3rd
 (3,1014,88,28),(103,1014,119,28),                        # Heart sounds
 (536,1138,85,28),(861,1138,92,28),                       # "Lub" "Dub"
 (31,292,36,300),                                         # Pressure (mm Hg)（竖排）
]
P = 4
for x, y, w, h in boxes:
    sub = gray[y-P:y+h+P, max(0,x-P):x+w+P]
    mask[y-P:y+h+P, max(0,x-P):x+w+P] |= (sub < 235).astype(np.uint8) * 255
mask = cv2.dilate(mask, np.ones((3,3),np.uint8))
im[mask > 0] = 255
cv2.imwrite(out, im, [cv2.IMWRITE_JPEG_QUALITY, 92])
