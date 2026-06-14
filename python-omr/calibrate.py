import cv2
import numpy as np
import sys

refPt = []
cropping = False

def click_and_crop(event, x, y, flags, param):
    global refPt, cropping, clone

    if event == cv2.EVENT_LBUTTONDOWN:
        refPt = [(x, y)]
        cropping = True

    elif event == cv2.EVENT_LBUTTONUP:
        refPt.append((x, y))
        cropping = False
        cv2.rectangle(image, refPt[0], refPt[1], (0, 255, 0), 2)
        cv2.imshow("image", image)
        
        # Calculate coordinates
        xmin = min(refPt[0][0], refPt[1][0])
        xmax = max(refPt[0][0], refPt[1][0])
        ymin = min(refPt[0][1], refPt[1][1])
        ymax = max(refPt[0][1], refPt[1][1])
        
        print(f"[{ymin}, {ymax}, {xmin}, {xmax}]")

image = cv2.imread("test_warped.jpg")
if image is None:
    # try debug_warped.jpg
    image = cv2.imread("debug_warped.jpg")

if image is None:
    print("Không tìm thấy ảnh warped. Hãy quét 1 ảnh trên web trước.")
    sys.exit()

clone = image.copy()
cv2.namedWindow("image", cv2.WINDOW_NORMAL)
cv2.resizeWindow("image", 800, 1000)
cv2.setMouseCallback("image", click_and_crop)

print("HƯỚNG DẪN:")
print("1. Kéo chuột để quét 1 vùng hình chữ nhật BAO TRỌN các bong bóng của khu vực (ví dụ SBD).")
print("2. Đừng quét sát quá, hãy để dư ra một chút xíu, nhưng KHÔNG ĐƯỢC CHẠM vào khung viền đen bên ngoài.")
print("3. Tọa độ sẽ hiện ra ở Terminal. Hãy copy gửi cho tôi.")
print("4. Nhấn phím 'r' để reset ảnh, phím 'q' để thoát.")

while True:
    cv2.imshow("image", image)
    key = cv2.waitKey(1) & 0xFF

    if key == ord("r"):
        image = clone.copy()
    elif key == ord("q"):
        break

cv2.destroyAllWindows()
