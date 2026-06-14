import cv2
import numpy as np

img = cv2.imread('test_warped.jpg')
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
gray = cv2.medianBlur(gray, 5)

circles = cv2.HoughCircles(gray, cv2.HOUGH_GRADIENT, 1, 20,
                           param1=50, param2=30, minRadius=10, maxRadius=25)

bubbles = []
if circles is not None:
    circles = np.uint16(np.around(circles))
    for i in circles[0, :]:
        # i[0]=x, i[1]=y, i[2]=r
        bubbles.append([i[0], i[1], i[2]])
        cv2.circle(img, (i[0], i[1]), i[2], (0, 255, 0), 2)

print(f"Found {len(bubbles)} bubbles using HoughCircles.")
cv2.imwrite('debug_hough.jpg', img)
