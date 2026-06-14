import fitz
import cv2
import numpy as np

# Convert PDF to image at 200 DPI
doc = fitz.open(r"d:\OneDrive\Máy tính\1.pdf")
page = doc.load_page(0)
pix = page.get_pixmap(dpi=200)
pix.save("template.png")

img = cv2.imread("template.png")
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
thresh = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY_INV)[1]

contours, _ = cv2.findContours(thresh, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
for c in contours:
    area = cv2.contourArea(c)
    (x, y, w, h) = cv2.boundingRect(c)
    ar = w / float(h)
    fill_ratio = area / (w * h)
    if 0.6 <= ar <= 1.4 and fill_ratio > 0.7 and area > 1000:
        print(f"Marker found at X={x}, Y={y}, w={w}, h={h}")

bubbles = []
for c in contours:
    (x, y, w, h) = cv2.boundingRect(c)
    ar = w / float(h)
    area = cv2.contourArea(c)
    if 0.8 <= ar <= 1.2 and 150 <= area <= 1500:
        perimeter = cv2.arcLength(c, True)
        if perimeter > 0:
            circularity = 4 * np.pi * (area / (perimeter * perimeter))
            if circularity > 0.7:
                bubbles.append([x, y, w, h])

print(f"Found {len(bubbles)} bubbles in template.")

bubbles = np.array(bubbles)
# Sort bubbles by Y, then X
sorted_bubbles = bubbles[np.lexsort((bubbles[:,0], bubbles[:,1]))]

# We can group them by their Y position. If Y difference < 20, they are in the same row.
rows = []
current_row = [sorted_bubbles[0]]
for b in sorted_bubbles[1:]:
    if abs(b[1] - current_row[-1][1]) < 20:
        current_row.append(b)
    else:
        current_row.sort(key=lambda x: x[0]) # sort by X
        rows.append(current_row)
        current_row = [b]
rows.append(current_row)

print(f"Grouped into {len(rows)} rows.")

for i, row in enumerate(rows):
    x_coords = [b[0] for b in row]
    if i == 0:
        print(f"Row {i}: Y={row[0][1]}, X coords ({len(x_coords)}): {x_coords}")

cv2.imwrite("debug_template_thresh.jpg", thresh)
