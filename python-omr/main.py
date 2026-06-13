from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from omr_engine import process_omr_image
import numpy as np
import cv2

app = FastAPI(title="Ngân Hàng Toán OMR Service")

# Allow CORS for Next.js
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/scan")
async def scan_omr(
    file: UploadFile = File(...),
    mcCount: int = Form(12),
    tfCount: int = Form(4),
    saCount: int = Form(6)
):
    try:
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            return {"error": "Invalid image file"}

        # Process the image with the OpenCV engine
        result = process_omr_image(img, mcCount, tfCount, saCount)
        return result

    except Exception as e:
        return {"error": f"OMR processing failed: {str(e)}"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
