import cv2
import numpy as np

def order_points(pts):
    rect = np.zeros((4, 2), dtype="float32")
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]
    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]
    rect[3] = pts[np.argmax(diff)]
    return rect

def get_perspective_transform(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    thresh = cv2.adaptiveThreshold(blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 11, 2)
    
    contours, _ = cv2.findContours(thresh.copy(), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    markers = []
    for c in contours:
        area = cv2.contourArea(c)
        if area < 1000 or area > 50000:
            continue
            
        (x, y, w, h) = cv2.boundingRect(c)
        ar = w / float(h)
        fill_ratio = area / (w * h)
        
        # Square markers have aspect ratio ~1 and fill ratio ~1
        if 0.6 <= ar <= 1.4 and fill_ratio > 0.7:
            markers.append(c)
                
    if len(markers) >= 4:
        # Sort markers by their centers
        centers = []
        for m in markers:
            M = cv2.moments(m)
            cX = int(M["m10"] / M["m00"])
            cY = int(M["m01"] / M["m00"])
            centers.append([cX, cY])
            
        centers = np.array(centers)
        ordered_centers = order_points(centers)
        
        # Standard A4 size at 200dpi
        maxWidth = 1650
        maxHeight = 2339
        
        dst = np.array([
            [0, 0],
            [maxWidth - 1, 0],
            [maxWidth - 1, maxHeight - 1],
            [0, maxHeight - 1]
        ], dtype="float32")
        
        M = cv2.getPerspectiveTransform(ordered_centers, dst)
        warped = cv2.warpPerspective(image, M, (maxWidth, maxHeight))
        return warped, True
    
    # Save debug image
    debug_img = image.copy()
    cv2.drawContours(debug_img, markers, -1, (0, 255, 0), 3)
    cv2.imwrite('debug_markers.jpg', debug_img)
    cv2.imwrite('debug_thresh.jpg', thresh)
    return image, False

def read_grid(warped, start_x, start_y, cols, rows, col_w, row_h, is_radio=True):
    # This is a generic grid reader.
    # We will refine this later.
    gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
    thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)[1]
    
    results = []
    for r in range(rows):
        row_res = []
        for c in range(cols):
            x = start_x + int(c * col_w)
            y = start_y + int(r * row_h)
            roi = thresh[y:y+int(row_h), x:x+int(col_w)]
            total = cv2.countNonZero(roi)
            row_res.append(total)
        
        if is_radio:
            # Only one bubble per row (or col, depending on orientation)
            max_val = max(row_res)
            # Threshold to consider "filled"
            if max_val > (int(col_w)*int(row_h) * 0.4): # 40% filled
                results.append(row_res.index(max_val))
            else:
                results.append(-1)
        else:
            results.append(row_res)
    return results

def process_omr_image(image, mcCount, tfCount, saCount):
    warped, success = get_perspective_transform(image)
    
    # Save warped image for debugging/calibration
    cv2.imwrite('debug_warped.jpg', warped)
    
    if not success:
        return {"error": "Không tìm thấy 4 điểm neo của phiếu. Vui lòng chụp rõ 4 góc."}
    
    # TODO: Refine coordinates after looking at debug_warped.jpg
    # Returning dummy data for now so we can test the pipeline
    return {
        "confidence": 100,
        "warnings": ["Đang trong quá trình calibration"],
        "studentId": "00000000",
        "examCode": "0000",
        "mc": ["A"] * mcCount,
        "tf": [["Đ", "S", "Đ", "S"] for _ in range(tfCount)],
        "sa": ["123"] * saCount
    }
