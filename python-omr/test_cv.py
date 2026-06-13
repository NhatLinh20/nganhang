import cv2
from omr_engine import get_perspective_transform

image_path = r'C:\Users\Linh\.gemini\antigravity-ide\brain\2887328d-9c27-42bd-b00f-e6da339f5a83\media__1781361258109.jpg'
img = cv2.imread(image_path)
if img is None:
    print("Could not read image.")
else:
    warped, success = get_perspective_transform(img)
    if success:
        cv2.imwrite('test_warped.jpg', warped)
        print("Success! test_warped.jpg created.")
    else:
        print("Failed to find 4 markers.")
