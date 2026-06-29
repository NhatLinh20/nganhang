'use client'

import React, { useState, useEffect } from 'react'
import { compileTikz } from '@/lib/tikz-api'

interface TikZImageProps {
  tikzCode: string
  className?: string
  placeholderClassName?: string
  onUploadClick?: () => void
}

export default function TikZImage({
  tikzCode,
  className,
  placeholderClassName,
  onUploadClick
}: TikZImageProps) {
  const [svgContent, setSvgContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)

  // Intersection Observer for lazy loading
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsVisible(true)
          observer.disconnect() // Stop observing once visible
        }
      },
      { threshold: 0.1 }
    )

    if (containerRef.current) {
      observer.observe(containerRef.current)
    }

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!isVisible) return

    let isMounted = true
    
    async function fetchSvg() {
      try {
        setLoading(true)
        setError(false)
        const svg = await compileTikz(tikzCode)
        if (isMounted) {
          setSvgContent(svg)
          setLoading(false)
        }
      } catch (err) {
        console.error('TikZ compilation failed:', err)
        if (isMounted) {
          setError(true)
          setLoading(false)
        }
      }
    }

    fetchSvg()

    return () => {
      isMounted = false
    }
  }, [tikzCode, isVisible])

  // Not visible yet, render placeholder structure so observer can track it
  if (!isVisible) {
    return (
      <div ref={containerRef} className={placeholderClassName} style={{ minHeight: '100px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          ⏳ Đang chờ cuộn tới...
        </div>
      </div>
    )
  }

  // Fallback to manual upload if API fails
  if (error) {
    return (
      <div 
        ref={containerRef}
        className={placeholderClassName}
        onClick={onUploadClick}
        style={{ cursor: onUploadClick ? 'pointer' : 'default', border: '1px dashed red', color: 'red' }}>
        🖼️ {onUploadClick ? 'Biên dịch lỗi. Bấm để upload hình thủ công' : 'Hình ảnh TikZ (Lỗi biên dịch)'}
      </div>
    )
  }

  if (loading) {
    return (
      <div ref={containerRef} className={placeholderClassName} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '20px', height: '20px', border: '2px solid #ccc', borderTopColor: '#007bff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <span style={{ marginLeft: '10px' }}>Đang biên dịch...</span>
      </div>
    )
  }

  if (svgContent) {
    return (
      <div 
        ref={containerRef}
        className={className} 
        style={{ cursor: onUploadClick ? 'pointer' : 'default', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
        onClick={onUploadClick}
        dangerouslySetInnerHTML={{ __html: svgContent }}
      />
    )
  }

  return null
}
