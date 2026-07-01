from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from omr_engine import process_omr_image
import numpy as np
import cv2
import os
import shutil
import subprocess
import tempfile
import zipfile

app = FastAPI(title="Ngân Hàng Toán OMR Service")

# Allow CORS for Next.js
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    # Kiểm tra pandoc có sẵn không
    pandoc_ok = shutil.which("pandoc") is not None
    pandoc_ver = ""
    if pandoc_ok:
        try:
            r = subprocess.run(["pandoc", "--version"], capture_output=True, text=True, timeout=5)
            pandoc_ver = r.stdout.split("\n")[0] if r.returncode == 0 else "unknown"
        except Exception:
            pass
    return {
        "status": "ok",
        "message": "OMR Service is running",
        "pandoc": pandoc_ver if pandoc_ok else "NOT INSTALLED",
    }

@app.post("/scan")
async def scan_omr(
    file: UploadFile = File(...),
    mcCount: int = Form(12),
    tfCount: int = Form(4),
    saCount: int = Form(6),
    debug: int = Form(0)
):
    try:
        import time
        t0 = time.time()
        
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            return {"error": "Invalid image file"}

        print(f"[OMR] Received image: {img.shape[1]}x{img.shape[0]}, size={len(contents)//1024}KB, debug={'ON' if debug else 'OFF'}")
        
        # Process the image with the OpenCV engine
        result = process_omr_image(img, mcCount, tfCount, saCount, include_debug=bool(debug))
        
        elapsed = int((time.time() - t0) * 1000)
        print(f"[OMR] Total endpoint time: {elapsed}ms")
        
        return result

    except Exception as e:
        return {"error": f"OMR processing failed: {str(e)}"}


# ─────────────────────────────────────────────────────────────────
# /convert-to-docx  — Nhận ZIP(document.tex + images/ + reference.docx?)
#                     Chạy pandoc, trả về .docx
# ─────────────────────────────────────────────────────────────────

@app.post("/convert-to-docx")
async def convert_to_docx(file: UploadFile = File(...)):
    """
    Nhận file input.zip chứa:
      - document.tex        (LaTeX chuẩn, không dùng macro tùy chỉnh)
      - images/             (hình TikZ đã compile, SVG hoặc PNG)
      - reference.docx      (tùy chọn, template Word)
    
    Chạy pandoc để convert document.tex → output.docx
    Trả về file .docx binary.
    """
    import time
    t0 = time.time()

    # Kiểm tra pandoc
    if not shutil.which("pandoc"):
        raise HTTPException(
            status_code=503,
            detail="pandoc chưa được cài đặt trên VPS. Chạy: apt-get install -y pandoc"
        )

    # Tạo thư mục làm việc tạm thời
    workdir = tempfile.mkdtemp(prefix="docx_")
    try:
        # 1. Giải nén ZIP vào workdir
        zip_bytes = await file.read()
        zip_path = os.path.join(workdir, "input.zip")
        with open(zip_path, "wb") as f:
            f.write(zip_bytes)

        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(workdir)

        tex_path = os.path.join(workdir, "document.tex")
        if not os.path.exists(tex_path):
            raise HTTPException(status_code=400, detail="Không tìm thấy document.tex trong ZIP")

        output_path = os.path.join(workdir, "output.docx")
        reference_path = os.path.join(workdir, "reference.docx")

        # 2. Xây dựng lệnh pandoc
        cmd = [
            "pandoc",
            "document.tex",
            "--resource-path=.",          # tìm ảnh tương đối trong workdir
            "--from=latex",
            "--to=docx",
            "-o", "output.docx",
        ]
        # Dùng reference.docx nếu có (template định dạng)
        if os.path.exists(reference_path):
            cmd.insert(-2, "--reference-doc=reference.docx")

        print(f"[convert-to-docx] Running pandoc in {workdir}")
        print(f"[convert-to-docx] CMD: {' '.join(cmd)}")

        # 3. Chạy pandoc
        result = subprocess.run(
            cmd,
            cwd=workdir,
            capture_output=True,
            text=True,
            timeout=120,   # tối đa 2 phút
        )

        elapsed = int((time.time() - t0) * 1000)
        print(f"[convert-to-docx] pandoc exit={result.returncode}, time={elapsed}ms")
        if result.stderr:
            print(f"[convert-to-docx] pandoc stderr: {result.stderr[:500]}")

        if result.returncode != 0:
            raise HTTPException(
                status_code=500,
                detail=f"pandoc lỗi (exit={result.returncode}): {result.stderr[:400]}"
            )

        if not os.path.exists(output_path):
            raise HTTPException(status_code=500, detail="pandoc không tạo được output.docx")

        # 4. Đọc và trả về .docx
        with open(output_path, "rb") as f:
            docx_bytes = f.read()

        print(f"[convert-to-docx] OK — {len(docx_bytes)//1024}KB in {elapsed}ms")
        return Response(
            content=docx_bytes,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": "attachment; filename=output.docx"},
        )

    finally:
        # Dọn sạch thư mục tạm
        shutil.rmtree(workdir, ignore_errors=True)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
