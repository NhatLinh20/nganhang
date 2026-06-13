import cv2
import numpy as np

img = cv2.imread('test_warped.jpg')
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
blurred = cv2.GaussianBlur(gray, (5, 5), 0)
thresh = cv2.adaptiveThreshold(blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 15, 5)

contours, _ = cv2.findContours(thresh, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)

bubbles = []
for c in contours:
    (x, y, w, h) = cv2.boundingRect(c)
    ar = w / float(h)
    area = cv2.contourArea(c)
    if 0.8 <= ar <= 1.2 and 200 < area < 1000:
        bubbles.append(c)

cv2.drawContours(img, bubbles, -1, (0, 0, 255), 2)
print(f'Found {len(bubbles)} bubbles')
cv2.imwrite('test_thresh.jpg', thresh)
