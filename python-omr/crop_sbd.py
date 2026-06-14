import cv2
img = cv2.imread('test_warped.jpg')
sbd_roi = [240, 685, 1045, 1340]
crop = img[sbd_roi[0]:sbd_roi[1], sbd_roi[2]:sbd_roi[3]]
cv2.imwrite('sbd_crop.jpg', crop)
