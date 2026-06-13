// src/lib/omr/opencv-loader.ts
// Lazy-load OpenCV.js từ CDN (WebAssembly, ~9MB, cached bởi browser)

declare global {
  interface Window {
    cv: any
    Module: any
  }
}

let cvInstance: any = null
let loadPromise: Promise<any> | null = null

export function loadOpenCV(onProgress?: (percent: number) => void): Promise<any> {
  if (cvInstance) return Promise.resolve(cvInstance)
  if (loadPromise) return loadPromise

  loadPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('OpenCV.js chỉ chạy trên trình duyệt'))
      return
    }

    // Đã có sẵn
    if (window.cv?.Mat) {
      cvInstance = window.cv
      onProgress?.(100)
      resolve(cvInstance)
      return
    }

    onProgress?.(5)

    const script = document.createElement('script')
    // Dùng version 4.8.0 stable
    script.src = 'https://docs.opencv.org/4.8.0/opencv.js'
    script.async = true

    const timeout = setTimeout(() => {
      loadPromise = null
      reject(new Error('OpenCV.js timeout. Kiểm tra kết nối mạng.'))
    }, 90_000)

    // OpenCV 4.x dùng Module.onRuntimeInitialized
    ;(window as any).Module = {
      onRuntimeInitialized: () => {
        clearTimeout(timeout)
        cvInstance = window.cv
        onProgress?.(100)
        resolve(cvInstance)
      },
    }

    script.onload = () => {
      onProgress?.(50)
      // Nếu đã init ngay (không async WASM)
      if (window.cv?.Mat) {
        clearTimeout(timeout)
        cvInstance = window.cv
        onProgress?.(100)
        resolve(cvInstance)
      }
    }

    script.onerror = () => {
      clearTimeout(timeout)
      loadPromise = null
      reject(new Error('Không tải được OpenCV.js. Kiểm tra mạng.'))
    }

    document.head.appendChild(script)
  })

  return loadPromise
}

export function isOpenCVLoaded(): boolean {
  return cvInstance !== null
}

export function getCV(): any {
  return cvInstance
}
