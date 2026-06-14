import cv2
import sys
sys.stdout.reconfigure(encoding='utf-8')
from omr_engine import process_omr_image

img = cv2.imread(r'C:\Users\Linh\.gemini\antigravity-ide\brain\2887328d-9c27-42bd-b00f-e6da339f5a83\media__1781361258109.jpg')
res = process_omr_image(img, 12, 4, 6)
print("SBD:", res['studentId'])
print("MD:", res['examCode'])
print("MC:", res['mc'])
print("TF:", res['tf'])
print("SA:", res['sa'])
