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
    
    contours, _ = cv2.findContours(thresh.copy(), cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    
    markers = []
    for c in contours:
        area = cv2.contourArea(c)
        # In a 750x1000 photo, a 43x43 marker is ~400 area.
        if area < 100 or area > 10000:
            continue
            
        (x, y, w, h) = cv2.boundingRect(c)
        ar = w / float(h)
        fill_ratio = area / (w * h)
        
        # Square markers have aspect ratio ~1 and fill ratio ~1
        if 0.5 <= ar <= 1.5 and fill_ratio > 0.6:
            markers.append(c)
                
    if len(markers) >= 4:
        # Sort markers by their centers
        centers = []
        for m in markers:
            M = cv2.moments(m)
            if M["m00"] != 0:
                cX = int(M["m10"] / M["m00"])
                cY = int(M["m01"] / M["m00"])
                centers.append([cX, cY])
            
        centers = np.array(centers)
        
        # We need the 4 absolute corners of the page.
        # order_points picks the extremes of x+y and x-y.
        ordered_centers = order_points(centers)
        print("Ordered centers picked from photo:")
        print(ordered_centers)
        
        maxWidth = 1650
        maxHeight = 2339
        
        # Top-left, Top-right, Bottom-right, Bottom-left
        # In the PDF, the markers are 43x43. Their top-lefts are at X=81,1528 and Y=79,2216.
        # So their centers are at X=102,1549 and Y=100,2237.
        dst = np.array([
            [102, 100],
            [1549, 100],
            [1549, 2237],
            [102, 2237]
        ], dtype="float32")
        
        M = cv2.getPerspectiveTransform(ordered_centers, dst)
        warped = cv2.warpPerspective(image, M, (maxWidth, maxHeight))
        return warped, True
    
    return image, False

# ═══════════════════════════════════════════════════════════════
# MARKER DETECTION — Tìm các ô vuông đen phân vùng trên ảnh warped
# ═══════════════════════════════════════════════════════════════

def find_all_markers(gray):
    """Tìm tất cả ô vuông đen (marker) trên ảnh warped đã nắn.
    Trả về danh sách (center_x, center_y, area) cho mỗi marker.
    Dùng RETR_LIST để tìm cả marker bên trong viền ô, rồi loại bỏ trùng lặp."""
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    thresh = cv2.adaptiveThreshold(blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                   cv2.THRESH_BINARY_INV, 11, 2)
    contours, _ = cv2.findContours(thresh, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    
    candidates = []
    for c in contours:
        area = cv2.contourArea(c)
        if area < 200 or area > 3000:
            continue
        x, y, w, h = cv2.boundingRect(c)
        if h == 0:
            continue
        ar = w / float(h)
        fill = area / (w * h)
        # fill > 0.8 loại bỏ hình tròn (fill ≈ 0.785) và chữ in
        if 0.7 <= ar <= 1.3 and fill > 0.8:
            M_mom = cv2.moments(c)
            if M_mom["m00"] != 0:
                cX = int(M_mom["m10"] / M_mom["m00"])
                cY = int(M_mom["m01"] / M_mom["m00"])
                candidates.append((cX, cY, area))
    
    # Loại bỏ trùng lặp: nếu 2 marker cách nhau < 15px, giữ marker có area lớn hơn
    candidates.sort(key=lambda c: -c[2])  # Sắp xếp giảm dần theo area
    filtered = []
    for c in candidates:
        is_dup = False
        for f in filtered:
            if abs(c[0] - f[0]) < 15 and abs(c[1] - f[1]) < 15:
                is_dup = True
                break
        if not is_dup:
            filtered.append(c)
    return filtered

def find_nearest_marker(candidates, expected_x, expected_y, max_dist=30, min_area=0):
    """Tìm marker gần nhất với vị trí dự kiến (expected_x, expected_y).
    max_dist=30: sau perspective transform, marker nên nằm trong ~15px của vị trí dự kiến.
    min_area: chỉ xét marker có area >= min_area.
    Trả về (actual_x, actual_y). Fallback về vị trí dự kiến nếu không tìm thấy."""
    best = None
    best_d = max_dist
    for cx, cy, area in candidates:
        if area < min_area:
            continue
        d = ((cx - expected_x)**2 + (cy - expected_y)**2)**0.5
        if d < best_d:
            best = (cx, cy)
            best_d = d
    return best if best else (expected_x, expected_y)

def map_roi(template_roi, t_p1, t_p2, a_p1, a_p2):
    """Ánh xạ ROI từ tọa độ template sang tọa độ thực tế dựa trên 2 cặp điểm neo.
    
    template_roi: [ymin, ymax, xmin, xmax] trên template
    t_p1, t_p2: (x, y) vị trí 2 marker trên template  
    a_p1, a_p2: (x, y) vị trí thực tế tương ứng trên ảnh warped
    Trả về: [ymin, ymax, xmin, xmax] đã hiệu chỉnh
    """
    dx_t = t_p2[0] - t_p1[0]
    dy_t = t_p2[1] - t_p1[1]
    
    sx = (a_p2[0] - a_p1[0]) / dx_t if dx_t != 0 else 1.0
    sy = (a_p2[1] - a_p1[1]) / dy_t if dy_t != 0 else 1.0
    
    ymin = int(a_p1[1] + (template_roi[0] - t_p1[1]) * sy)
    ymax = int(a_p1[1] + (template_roi[1] - t_p1[1]) * sy)
    xmin = int(a_p1[0] + (template_roi[2] - t_p1[0]) * sx)
    xmax = int(a_p1[0] + (template_roi[3] - t_p1[0]) * sx)
    
    return [ymin, ymax, xmin, xmax]

# ═══════════════════════════════════════════════════════════════
# BUBBLE READING — Đọc bong bóng trong từng ROI
# ═══════════════════════════════════════════════════════════════

def find_and_cluster_bubbles(gray, roi, expected_cols, expected_rows, is_vertical=True, threshold=150, apply_morph=False, debug_img=None, draw_limit=None):
    ymin, ymax, xmin, xmax = roi
    region = gray[ymin:ymax, xmin:xmax]
    
    thresh = cv2.threshold(region, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)[1]
    
    if apply_morph:
        kernel = np.ones((5, 5), np.uint8)
        thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)
        
    h, w = thresh.shape
    col_w = w / expected_cols
    row_h = h / expected_rows
    
    results = []
    
    if is_vertical: # Like SBD, where each COLUMN is a question
        for c in range(expected_cols):
            col_res = []
            col_coords = []
            for r in range(expected_rows):
                # Inset by 20% to avoid borders
                inset_x = int(col_w * 0.20)
                inset_y = int(row_h * 0.20)
                x = int(c * col_w) + inset_x
                y = int(r * row_h) + inset_y
                w_cell = int(col_w) - 2 * inset_x
                h_cell = int(row_h) - 2 * inset_y
                
                cell = thresh[y:y+h_cell, x:x+w_cell]
                valid_area = cv2.countNonZero(cell)
                col_res.append(valid_area)
                col_coords.append((x + xmin, y + ymin, w_cell, h_cell)) # absolute coords
                
            max_val = max(col_res)
            
            selected_idx = -1
            if max_val > threshold: 
                selected_idx = col_res.index(max_val)
            results.append(selected_idx)
            
            if debug_img is not None:
                if draw_limit is None or c < draw_limit:
                    for r in range(expected_rows):
                        ax, ay, aw, ah = col_coords[r]
                        area = col_res[r]
                        color = (0, 255, 0) if r == selected_idx else (0, 0, 255)
                        cv2.rectangle(debug_img, (ax, ay), (ax+aw, ay+ah), color, 2)
                        # Put area text
                        cv2.putText(debug_img, str(area), (ax, ay - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1)

    else: # Like MC, where each ROW is a question
        for r in range(expected_rows):
            row_res = []
            row_coords = []
            for c in range(expected_cols):
                inset_x = int(col_w * 0.20)
                inset_y = int(row_h * 0.20)
                x = int(c * col_w) + inset_x
                y = int(r * row_h) + inset_y
                w_cell = int(col_w) - 2 * inset_x
                h_cell = int(row_h) - 2 * inset_y
                
                cell = thresh[y:y+h_cell, x:x+w_cell]
                valid_area = cv2.countNonZero(cell)
                row_res.append(valid_area)
                row_coords.append((x + xmin, y + ymin, w_cell, h_cell))
                
            max_val = max(row_res)
            
            selected_idx = -1
            if max_val > threshold:
                selected_idx = row_res.index(max_val)
            results.append(selected_idx)
            
            if debug_img is not None:
                if draw_limit is None or r < draw_limit:
                    for c in range(expected_cols):
                        ax, ay, aw, ah = row_coords[c]
                        area = row_res[c]
                        color = (0, 255, 0) if c == selected_idx else (0, 0, 255)
                        cv2.rectangle(debug_img, (ax, ay), (ax+aw, ay+ah), color, 2)
                        cv2.putText(debug_img, str(area), (ax, ay - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1)
                
    return results

# ═══════════════════════════════════════════════════════════════
# VỊ TRÍ MARKER TRÊN TEMPLATE (1654×2339 px)
# Đo từ file template.png gốc
# ═══════════════════════════════════════════════════════════════

# SBD row markers (medium 29×30, area~650) — 10 hàng, trái và phải
SBD_ROW_MARKERS = {
    'left':  [(1075, 260), (1075, 305), (1075, 350), (1075, 396), (1075, 441),
              (1075, 486), (1075, 531), (1075, 577), (1075, 622), (1075, 667)],
    'right': [(1554, 260), (1554, 305), (1554, 350), (1554, 396), (1554, 441),
              (1554, 486), (1554, 531), (1554, 577), (1554, 622), (1554, 667)],
    'div_top': (1375, 464),    # Chia SBD / Mã đề (trên)
    'div_bot': (1375, 692),    # Chia SBD / Mã đề (dưới)
}

# Template ROIs (bubble areas measured from template)
TEMPLATE_ROIS = {
    'sbd': [240, 685, 1100, 1353],    # SBD: 8 cột, bubble x=1100-1353
    'md':  [240, 685, 1400, 1526],    # Mã đề: 4 cột, bubble x=1400-1526
}

# ═══════════════════════════════════════════════════════════════
# LOCAL ANCHOR: Marker positions + offsets to bubble area
# Mỗi section dùng marker CỤC BỘ để tính ROI chính xác
# ═══════════════════════════════════════════════════════════════

# MC: 3 cặp marker (top/bottom), mỗi cặp bao quanh 1 cột MC
# Offset: từ marker → vùng bong bóng (đo trên template)
MC_MARKERS = {
    'top': [(486, 837), (826, 837), (1166, 837)],
    'bot': [(486, 1243), (826, 1243), (1166, 1243)],
}
MC_OFFSETS = {'dx_left': -281, 'dx_right': -31, 'dy_top': 33, 'dy_bottom': -13}

# TF: 3 cặp marker, tf1+tf2 dùng cặp 0, tf3+tf4 dùng cặp 1
TF_MARKERS = {
    'top': [(486, 1300), (826, 1300), (1166, 1300)],
    'bot': [(486, 1539), (826, 1539), (1166, 1539)],
}
# Mỗi marker bao quanh 2 block TF (câu hỏi bên trái + bên phải)
TF_OFFSETS_LEFT  = {'dx_left': -286, 'dx_right': -150, 'dy_top': 75, 'dy_bottom': -24}
TF_OFFSETS_RIGHT = {'dx_left': -150, 'dx_right':  -14, 'dy_top': 75, 'dy_bottom': -24}

# SA: 5 marker (top) + 5 marker (bottom), mỗi cặp bao quanh 1 cột SA
# sa6 không có marker riêng → tính offset từ marker cuối (1261)
SA_MARKERS = {
    'top': [(389, 1570), (607, 1570), (825, 1570), (1043, 1570), (1261, 1570)],
    'bot': [(389, 2183), (607, 2183), (825, 2183), (1043, 2183), (1261, 2183)],
}
# Lưu ý: sa3 (825) không có top marker trên template → fallback ước lượng
SA_OFFSETS = {'dx_left': -199, 'dx_right': -11, 'dy_top': 125, 'dy_bottom': -50}
# sa6: offset từ marker cuối (1261) + thêm ~218px sang phải
SA6_OFFSETS = {'dx_left': 20, 'dx_right': 208, 'dy_top': 125, 'dy_bottom': -50}

def roi_from_marker(top_marker, bot_marker, offsets):
    """Tính ROI [ymin, ymax, xmin, xmax] từ cặp marker top/bot + offsets cố định."""
    return [
        top_marker[1] + offsets['dy_top'],     # ymin
        bot_marker[1] + offsets['dy_bottom'],   # ymax
        top_marker[0] + offsets['dx_left'],     # xmin
        top_marker[0] + offsets['dx_right'],    # xmax
    ]

# ═══════════════════════════════════════════════════════════════
# MAIN PROCESSING
# ═══════════════════════════════════════════════════════════════

def draw_found_markers(debug_img, markers_found):
    """Vẽ tất cả marker đã tìm thấy lên ảnh debug (vòng tròn cam)."""
    for (ax, ay) in markers_found:
        cv2.circle(debug_img, (ax, ay), 10, (0, 165, 255), 2)  # Cam (BGR)

def find_bubbles_with_row_markers(gray, sbd_a1, sbd_a2, actual_left, actual_right, template_xmin, template_xmax, expected_cols, expected_rows, debug_img=None):
    """Tìm bong bóng cho SBD và Mã đề bằng cách nội suy Y từ 10 row markers."""
    sx = (sbd_a2[0] - sbd_a1[0]) / (1549 - 1082) if (1549 - 1082) != 0 else 1.0
    sy = (sbd_a2[1] - sbd_a1[1]) / (734 - 101) if (734 - 101) != 0 else 1.0
    
    col_w_t = (template_xmax - template_xmin) / expected_cols
    actual_row_h = 44.5 * sy  # Chiều cao template là 44.5px/row
    
    # Local threshold: crop vùng SBD trước, rồi OTSU trên vùng đó
    sbd_ymin = min(p[1] for p in actual_left) - 10
    sbd_ymax = max(p[1] for p in actual_left) + 10
    sbd_xmin = int(sbd_a1[0]) - 10
    sbd_xmax = int(sbd_a2[0]) + 10
    # Clamp to image bounds
    h_img, w_img = gray.shape
    sbd_ymin = max(0, sbd_ymin)
    sbd_ymax = min(h_img, sbd_ymax)
    sbd_xmin = max(0, sbd_xmin)
    sbd_xmax = min(w_img, sbd_xmax)
    
    local_gray = gray[sbd_ymin:sbd_ymax, sbd_xmin:sbd_xmax]
    local_thresh = cv2.threshold(local_gray, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)[1]
    kernel = np.ones((5, 5), np.uint8)
    local_thresh = cv2.morphologyEx(local_thresh, cv2.MORPH_OPEN, kernel)
    
    # Tạo full-size thresh (chỉ vùng SBD có giá trị, còn lại = 0)
    thresh = np.zeros_like(gray)
    thresh[sbd_ymin:sbd_ymax, sbd_xmin:sbd_xmax] = local_thresh
    
    results = []
    for c in range(expected_cols):
        c_xmin_t = template_xmin + c * col_w_t
        c_xmax_t = template_xmin + (c+1) * col_w_t
        c_xmin_a = sbd_a1[0] + (c_xmin_t - 1082) * sx
        c_xmax_a = sbd_a1[0] + (c_xmax_t - 1082) * sx
        actual_col_w = c_xmax_a - c_xmin_a
        
        c_center_t = (c_xmin_t + c_xmax_t) / 2
        t = (c_center_t - 1075) / (1554 - 1075) # Nội suy X giữa 2 marker trái phải
        
        col_res = []
        col_coords = []
        for r in range(expected_rows):
            ly = actual_left[r][1]
            ry = actual_right[r][1]
            y_center = ly + t * (ry - ly)
            
            y_min_a = int(y_center - actual_row_h/2)
            y_max_a = int(y_center + actual_row_h/2)
            x_min_a = int(c_xmin_a)
            x_max_a = int(c_xmax_a)
            
            inset_x = int(actual_col_w * 0.20)
            inset_y = int(actual_row_h * 0.20)
            
            cell_bin = thresh[y_min_a+inset_y : y_max_a-inset_y, x_min_a+inset_x : x_max_a-inset_x]
            valid_area = cv2.countNonZero(cell_bin)
            
            col_res.append(valid_area)
            col_coords.append((x_min_a+inset_x, y_min_a+inset_y, x_max_a-inset_x - (x_min_a+inset_x), y_max_a-inset_y - (y_min_a+inset_y)))
            
        max_val = max(col_res)
        selected_idx = -1
        if max_val > 100:
            selected_idx = col_res.index(max_val)
                
        results.append(selected_idx)
        
        if debug_img is not None:
            for r in range(expected_rows):
                ax, ay, aw, ah = col_coords[r]
                area = col_res[r]
                color = (0, 255, 0) if r == selected_idx else (0, 0, 255)
                cv2.rectangle(debug_img, (ax, ay), (ax+aw, ay+ah), color, 2)
                cv2.putText(debug_img, str(area), (ax, ay - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1)

    return results

def process_omr_image(image, mcCount, tfCount, saCount, include_debug=False):
    import time
    t0 = time.time()
    
    warped, success = get_perspective_transform(image)
    
    if not success:
        return {"error": "Không tìm thấy 4 điểm neo của phiếu. Vui lòng chụp rõ 4 góc."}
        
    gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
    debug_img = warped.copy() if include_debug else None
    
    # ═══════════════════════════════════════════════
    # BƯỚC 2: Tìm tất cả marker trên ảnh warped
    # ═══════════════════════════════════════════════
    all_markers = find_all_markers(gray)
    all_found = []  # Danh sách marker đã match để vẽ debug
    
    def find_and_record(expected_x, expected_y, max_dist=30, min_area=0):
        """Tìm marker gần nhất và ghi lại để vẽ debug."""
        actual = find_nearest_marker(all_markers, expected_x, expected_y, max_dist, min_area)
        all_found.append(actual)
        return actual
    
    # ═══════════════════════════════════════════════
    # SBD + Mã đề
    # Ref: dùng 2 marker GÓC LỚN (42×42) của box SBD — đáng tin cậy hơn row markers nhỏ
    # ═══════════════════════════════════════════════
    SBD_T1 = (1082, 101)   # SBD box top-left corner (large 42x42)
    SBD_T2 = (1549, 734)   # SBD box bottom-right corner (large 42x42)
    sbd_a1 = find_and_record(*SBD_T1, min_area=800)
    sbd_a2 = find_and_record(*SBD_T2, min_area=800)
    
    # Tìm và lưu 10 row markers để nội suy chính xác (chống lens distortion)
    actual_left = []
    actual_right = []
    for pos in SBD_ROW_MARKERS['left']:
        actual_left.append(find_and_record(*pos))
    for pos in SBD_ROW_MARKERS['right']:
        actual_right.append(find_and_record(*pos))
    
    find_and_record(*SBD_ROW_MARKERS['div_top'])
    find_and_record(*SBD_ROW_MARKERS['div_bot'])
    
    sbd_res = find_bubbles_with_row_markers(gray, sbd_a1, sbd_a2, actual_left, actual_right, TEMPLATE_ROIS['sbd'][2], TEMPLATE_ROIS['sbd'][3], 8, 10, debug_img)
    
    sbd_chars = []
    for x in sbd_res:
        if x == -2:
            sbd_chars.append("*")
        elif x != -1:
            sbd_chars.append(str(x))
    sbd_str = "".join(sbd_chars)
    
    md_res = find_bubbles_with_row_markers(gray, sbd_a1, sbd_a2, actual_left, actual_right, TEMPLATE_ROIS['md'][2], TEMPLATE_ROIS['md'][3], 4, 10, debug_img)
    md_chars = []
    for x in md_res:
        if x == -2:
            md_chars.append("*")
        elif x != -1:
            md_chars.append(str(x))
    md_str = "".join(md_chars)
    
    # ═══════════════════════════════════════════════
    # Phần I — Trắc nghiệm (MC)
    # LOCAL ANCHOR: mỗi cột MC dùng cặp marker CỤC BỘ riêng
    # ═══════════════════════════════════════════════
    mc_tops = [find_and_record(*pos) for pos in MC_MARKERS['top']]
    mc_bots = [find_and_record(*pos) for pos in MC_MARKERS['bot']]
    
    mc_answers = []
    opts = ['A', 'B', 'C', 'D']
    
    for col_idx in range(3):
        roi = roi_from_marker(mc_tops[col_idx], mc_bots[col_idx], MC_OFFSETS)
        draw_lim = max(0, mcCount - len(mc_answers))
        res = find_and_cluster_bubbles(gray, roi, 4, 10, is_vertical=False, debug_img=debug_img, draw_limit=draw_lim)
        mc_answers.extend([opts[i] if i >= 0 else ("*" if i == -2 else "") for i in res])
    
    mc_answers = mc_answers[:mcCount]
    
    # ═══════════════════════════════════════════════
    # Phần II — Đúng/Sai (TF)
    # LOCAL ANCHOR: mỗi cặp TF dùng marker CỤC BỘ riêng
    # ═══════════════════════════════════════════════
    tf_tops = [find_and_record(*pos) for pos in TF_MARKERS['top']]
    tf_bots = [find_and_record(*pos) for pos in TF_MARKERS['bot']]
    
    # TF block layout: [tf1, tf2] dùng marker 0, [tf3, tf4] dùng marker 1
    tf_block_config = [
        (0, TF_OFFSETS_LEFT),   # tf1: marker cặp 0, bên trái
        (0, TF_OFFSETS_RIGHT),  # tf2: marker cặp 0, bên phải
        (1, TF_OFFSETS_LEFT),   # tf3: marker cặp 1, bên trái
        (1, TF_OFFSETS_RIGHT),  # tf4: marker cặp 1, bên phải
    ]
    
    tf_answers = []
    for i in range(tfCount):
        if i < len(tf_block_config):
            marker_idx, offsets = tf_block_config[i]
            roi = roi_from_marker(tf_tops[marker_idx], tf_bots[marker_idx], offsets)
            res = find_and_cluster_bubbles(gray, roi, 2, 4, is_vertical=False, apply_morph=True, debug_img=debug_img)
            ans = []
            for val in res:
                if val == -2:
                    ans.append("*")
                elif val == 0:
                    ans.append("Đ")
                elif val == 1:
                    ans.append("S")
                else:
                    ans.append("")
            tf_answers.append(ans)
        else:
            tf_answers.append(["", "", "", ""])
            
    # ═══════════════════════════════════════════════
    # Phần III — Trả lời ngắn (SA)
    # LOCAL ANCHOR: mỗi cột SA dùng cặp marker CỤC BỘ riêng
    # ═══════════════════════════════════════════════
    sa_tops = [find_and_record(*pos) for pos in SA_MARKERS['top']]
    sa_bots = [find_and_record(*pos) for pos in SA_MARKERS['bot']]
    
    sa_answers = []
    for i in range(saCount):
        if i < 5:  # sa1-sa5: mỗi cột có marker riêng
            roi = roi_from_marker(sa_tops[i], sa_bots[i], SA_OFFSETS)
            res = find_and_cluster_bubbles(gray, roi, 4, 12, is_vertical=True, apply_morph=True, debug_img=debug_img)
        elif i == 5:  # sa6: dùng marker cuối + offset đặc biệt
            roi = roi_from_marker(sa_tops[4], sa_bots[4], SA6_OFFSETS)
            res = find_and_cluster_bubbles(gray, roi, 4, 12, is_vertical=True, apply_morph=True, debug_img=debug_img)
        else:
            sa_answers.append("")
            continue
        
        ans = ""
        for val in res:
            if val == -2:
                ans += "*"
            elif val == 0:
                ans += "-"
            elif val == 1:
                ans += ","
            elif val >= 2:
                ans += str(val - 2)
        sa_answers.append(ans)

    # ═══════════════════════════════════════════════
    # Vẽ marker lên ảnh debug & encode base64 (chỉ khi được yêu cầu)
    # ═══════════════════════════════════════════════
    elapsed_ms = int((time.time() - t0) * 1000)
    print(f"[OMR] Processing took {elapsed_ms}ms (debug={'ON' if include_debug else 'OFF'})")
    
    result = {
        "confidence": 95,
        "warnings": ["Hệ thống đang hoạt động với OpenCV (Beta)"],
        "studentId": sbd_str if sbd_str else "00000000",
        "examCode": md_str if md_str else "0000",
        "mc": mc_answers if len(mc_answers) > 0 else [""] * mcCount,
        "tf": tf_answers,
        "sa": sa_answers,
        "python_processing_ms": elapsed_ms
    }
    
    if include_debug and debug_img is not None:
        draw_found_markers(debug_img, all_found)
        import base64
        debug_small = cv2.resize(debug_img, (825, int(825 * debug_img.shape[0] / debug_img.shape[1])))
        _, buffer = cv2.imencode('.jpg', debug_small, [cv2.IMWRITE_JPEG_QUALITY, 70])
        debug_base64 = base64.b64encode(buffer).decode('utf-8')
        result["debug_image_base64"] = f"data:image/jpeg;base64,{debug_base64}"
    
    return result
