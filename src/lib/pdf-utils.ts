import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

// Initialize worker
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/legacy/build/pdf.worker.min.mjs`;
}

export async function extractPdfPagesAsBlobs(file: File): Promise<Blob[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const numPages = pdf.numPages;
  const blobs: Blob[] = [];

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    // Render at 2x scale for better quality (roughly 150-200 DPI depending on the PDF)
    const viewport = page.getViewport({ scale: 2.0 });
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    const renderContext: any = {
      canvasContext: ctx,
      viewport: viewport,
    };
    
    await page.render(renderContext).promise;
    
    const blob = await new Promise<Blob | null>(resolve => {
      // JPEG with 0.8 quality to save size, since OMR doesn't need perfect colors
      canvas.toBlob(resolve, 'image/jpeg', 0.8);
    });

    if (blob) {
      blobs.push(blob);
    }
  }

  return blobs;
}
