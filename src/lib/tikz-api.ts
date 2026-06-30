/**
 * Calls the external VPS API to compile TikZ code into an SVG string.
 */
export async function compileTikz(tikzCode: string): Promise<string> {
  const apiUrl = process.env.NEXT_PUBLIC_TIKZ_API_URL || '/api/tikz'
  
  try {
    const response = await fetch(`${apiUrl}/compile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ tikzCode })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.details || errorData.error || 'Failed to compile TikZ')
    }

    return await response.text()
  } catch (error) {
    console.error('Error compiling TikZ:', error)
    throw error
  }
}

/**
 * Calls the external VPS API to compile a ZIP containing LaTeX files into a PDF Blob.
 */
export async function compilePdfZip(zipBlob: Blob): Promise<Blob> {
  const apiUrl = process.env.NEXT_PUBLIC_TIKZ_API_URL || '/api/tikz'
  
  const formData = new FormData()
  formData.append('file', zipBlob, 'exam.zip')

  try {
    const response = await fetch(`${apiUrl}/compile-zip`, {
      method: 'POST',
      body: formData
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.details || errorData.error || 'Failed to compile PDF')
    }

    return await response.blob()
  } catch (error) {
    console.error('Error compiling PDF:', error)
    throw error
  }
}
