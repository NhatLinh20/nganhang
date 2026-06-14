import cv2

img = cv2.imread('test_warped.jpg')

# TF
tf_rois = [
    [1375, 1515, 200, 315], # Câu 1
    [1375, 1515, 330, 445], # Câu 2
    [1375, 1515, 540, 655], # Câu 3
    [1375, 1515, 670, 785], # Câu 4
]
for r in tf_rois:
    cv2.rectangle(img, (r[2], r[0]), (r[3], r[1]), (0, 0, 255), 2)

# SA
sa_rois = [
    [1690, 2140, 190, 380], # Câu 1
    [1690, 2140, 410, 580], # Câu 2
    [1690, 2140, 630, 800], # Câu 3
    [1690, 2140, 845, 1015], # Câu 4
    [1690, 2140, 1065, 1235], # Câu 5
    [1690, 2140, 1285, 1455], # Câu 6
]
for r in sa_rois:
    cv2.rectangle(img, (r[2], r[0]), (r[3], r[1]), (255, 0, 0), 2)

cv2.imwrite('debug_rois_2.jpg', img)
