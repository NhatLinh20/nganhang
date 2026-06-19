'use client'
import { useState, useRef, useCallback, useEffect } from 'react'
import Header from '@/components/layout/Header'
import styles from './ai-chat.module.css'
import { CHAPTER_NAMES, LESSON_NAMES, VARIANT_NAMES } from '@/lib/curriculum-labels'
import { normalizeQuestion, formatLatexIndentation } from '@/lib/latex-parser/normalizer'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { SYSTEM_INSTRUCTION } from '@/lib/ai-system-instruction'

interface ChatMessage {
  role: 'user' | 'model'
  content: string
  attachments?: { dataUrl: string; name: string; type: string }[]
  timestamp: number
}

// Simple markdown renderer for AI responses
function renderMarkdown(text: string): string {
  let html = text
    // Escape HTML
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Code blocks (``` ... ```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang, code) => {
    return `<pre><code class="${lang}">${code.trim()}</code></pre>`
  })

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')

  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')

  // Italic
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')

  // Unordered lists
  html = html.replace(/^[\s]*[-*]\s+(.+)$/gm, '<li>$1</li>')
  html = html.replace(/(<li>[\s\S]*?<\/li>)/g, (match) => {
    if (!match.startsWith('<ul>')) return `<ul>${match}</ul>`
    return match
  })
  // Clean up consecutive </ul><ul>
  html = html.replace(/<\/ul>\s*<ul>/g, '')

  // Ordered lists
  html = html.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>')

  // Paragraphs (double newlines)
  html = html.replace(/\n\n/g, '</p><p>')

  // Single newlines to <br>
  html = html.replace(/\n/g, '<br>')

  // Wrap in paragraphs
  if (!html.startsWith('<')) {
    html = `<p>${html}</p>`
  }

  return html
}



const generateExamCode = (): string => {
  return String(Math.floor(1000 + Math.random() * 9000))
}

export default function AiChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')

  // Image
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Settings
  const [aiModel, setAiModel] = useState('gemini-3.5-flash')
  const [customApiKey, setCustomApiKey] = useState('')
  const [showSettings, setShowSettings] = useState(false)

  // Refs
  const chatEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const editorTextareaRef = useRef<HTMLTextAreaElement>(null)

  // Editor State
  const [editorContent, setEditorContent] = useState('')
  const [isCopied, setIsCopied] = useState(false)
  const [isIdModalOpen, setIsIdModalOpen] = useState(false)
  const [isAutoAssigning, setIsAutoAssigning] = useState(false)
  const [showQuickPromptsMenu, setShowQuickPromptsMenu] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  // Export Modal States
  const [showExportModal, setShowExportModal] = useState(false)
  const [headerLabels, setHeaderLabels] = useState<string[]>([
    'SỞ GDĐT ...',
    'TRƯỜNG THPT ...',
    'Đề chính thức',
    '(Đề thi gồm có 0\\zpageref{\\made-lastpage} trang)',
    'ĐỀ KIỂM TRA',
    'Môn: TOÁN',
    'Thời gian làm bài: 90 phút',
    '(Không kể thời gian phát đề)'
  ])
  const [headerStyles, setHeaderStyles] = useState<{ bold: boolean; italic: boolean; underline: boolean; color: string }[]>(
    Array.from({ length: 8 }, () => ({ bold: false, italic: false, underline: false, color: '' }))
  )
  const LATEX_COLORS = ['', 'red', 'blue', 'green', 'purple', 'orange', 'brown', 'cyan', 'magenta']
  const [selectedLine, setSelectedLine] = useState<number | null>(null)
  const [examCodes, setExamCodes] = useState<string[]>([''])
  const [includeAnswerTable, setIncludeAnswerTable] = useState<boolean>(true)

  const DEFAULT_QUICK_PROMPTS = [
    'Gõ lại câu hỏi từ ảnh/PDF thành LaTeX chuẩn.',
    'Tạo bài toán tương tự, đổi số.',
    'Thêm lời giải cho các câu hỏi sau, và gõ theo chuẩn latex.',
  ]
  const [quickPrompts, setQuickPrompts] = useState<string[]>(DEFAULT_QUICK_PROMPTS)
  
  // ID Modal State
  const [selectedGrade, setSelectedGrade] = useState<number>(12)
  const [selectedSubject, setSelectedSubject] = useState<string>('D')
  const [selectedChapter, setSelectedChapter] = useState<number>(1)
  const [selectedDiff, setSelectedDiff] = useState<string>('N')
  const [selectedLesson, setSelectedLesson] = useState<number>(1)
  const [selectedVariant, setSelectedVariant] = useState<number>(1)

  // Load from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('ai-chat-state')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.messages) setMessages(parsed.messages)
        if (parsed.aiModel) setAiModel(parsed.aiModel)
        if (parsed.editorContent) setEditorContent(parsed.editorContent)
        if (parsed.quickPrompts) setQuickPrompts(parsed.quickPrompts)
        if (parsed.customApiKey) setCustomApiKey(parsed.customApiKey)
        if (parsed.headerLabels) setHeaderLabels(parsed.headerLabels)
        if (parsed.examCodes) setExamCodes(parsed.examCodes)
        if (parsed.includeAnswerTable !== undefined) setIncludeAnswerTable(parsed.includeAnswerTable)
      }
    } catch (e) {
      console.error('Failed to load chat state', e)
    }
  }, [])

  // Save to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('ai-chat-state', JSON.stringify({ messages, aiModel, editorContent, quickPrompts, customApiKey, headerLabels, examCodes, includeAnswerTable }))
    } catch (e) {
      console.error('Failed to save chat state', e)
    }
  }, [messages, aiModel, editorContent, quickPrompts, customApiKey, headerLabels, examCodes, includeAnswerTable])

  // Editor Actions
  const handleCopy = (text: string) => {
    setEditorContent(prev => prev ? prev + '\n\n' + text : text)
  }

  const handleNormalize = () => {
    setEditorContent(prev => normalizeQuestion(prev))
  }

  // ═══ Gán ID tự động bằng Vector RAG ═══
  const handleAutoAssignId = async () => {
    if (!editorContent.trim() || isAutoAssigning) return

    // Tách từng block \begin{ex}...\end{ex}
    const blocks = editorContent.match(/\\begin\{ex\}[\s\S]*?\\end\{ex\}/g)
    if (!blocks || blocks.length === 0) {
      alert('Không tìm thấy câu hỏi nào trong Editor (cần có \\begin{ex}...\\end{ex})')
      return
    }

    setIsAutoAssigning(true)
    let updatedContent = editorContent
    let assignedCount = 0

    try {
      for (const block of blocks) {
        try {
          const res = await fetch('/api/ai/suggest-id', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              latex_content: block,
              custom_api_key: customApiKey 
            }),
          })
          
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}))
            console.error('Suggest ID failed for a block:', errData)
            alert(`Lỗi API suggest-id: ${errData.error || res.statusText}`)
            continue
          }

          const data = await res.json()
          if (!data.best_id) {
            console.warn('No best_id returned:', data)
            alert('Không tìm thấy ID nào tương tự trong ngân hàng.')
            continue
          }
          if (data.similarity < 0.6) {
            console.warn('Similarity too low:', data.similarity)
            alert(`Tìm thấy ID ${data.best_id} nhưng độ chính xác quá thấp (${Math.round(data.similarity * 100)}%). Bỏ qua để tránh gán sai.`)
            continue
          }

          const newId = `%[${data.best_id}]`

          if (block.includes('%[')) {
            // Câu đã có ID → thay thế
            const newBlock = block.replace(/%\[[^\]]+\]/, newId)
            updatedContent = updatedContent.replace(block, newBlock)
          } else {
            // Câu chưa có ID → chèn sau \begin{ex}
            const newBlock = block.replace('\\begin{ex}', `\\begin{ex}${newId}`)
            updatedContent = updatedContent.replace(block, newBlock)
          }
          assignedCount++
        } catch {
          // Bỏ qua lỗi từng câu, tiếp tục xử lý câu khác
          continue
        }
      }

      setEditorContent(updatedContent)
      alert(`✅ Đã gán ID cho ${assignedCount}/${blocks.length} câu hỏi`)
    } catch (err) {
      console.error('Auto assign ID error:', err)
      alert('❌ Lỗi khi gán ID tự động')
    } finally {
      setIsAutoAssigning(false)
    }
  }

  const handleCopyToClipboard = async () => {
    if (!editorContent) return
    try {
      await navigator.clipboard.writeText(editorContent)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2000)
    } catch (e) {
      console.error(e)
    }
  }

  const getGeneratedId = () => {
    let chCode = selectedChapter.toString()
    if (selectedGrade === 10 && selectedChapter === 10) chCode = '0'
    return `${selectedGrade % 10}${selectedSubject}${chCode}${selectedDiff}${selectedLesson}-${selectedVariant}`
  }

  const handleAssignId = () => {
    const generatedId = getGeneratedId()
    const idString = `%[${generatedId}]`
    
    if (editorTextareaRef.current) {
      const start = editorTextareaRef.current.selectionStart
      const end = editorTextareaRef.current.selectionEnd
      
      const before = editorContent.substring(0, start)
      const after = editorContent.substring(end)
      
      setEditorContent(before + idString + after)
      
      // Update cursor position
      setTimeout(() => {
        if (editorTextareaRef.current) {
          editorTextareaRef.current.selectionStart = editorTextareaRef.current.selectionEnd = start + idString.length
          editorTextareaRef.current.focus()
        }
      }, 0)
    } else {
      setEditorContent(prev => prev + idString)
    }
    
    setIsIdModalOpen(false)
  }

  // ═══ Xuất file LaTeX ═══
  const handleExportLatex = async () => {
    if (!editorContent.trim() || isExporting) return
    setIsExporting(true)
    try {
      const res = await fetch('/api/ai/export-latex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          editorContent,
          headerLabels,
          headerStyles,
          examCode: examCodes[0],
          includeAnswerTable 
        })
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || res.statusText)
      }

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'ai_latex_export.zip'
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export error:', err)
      alert(`❌ Lỗi xuất file: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setIsExporting(false)
    }
  }

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  // Auto-resize textarea
  const autoResize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 150) + 'px'
  }, [])

  useEffect(() => {
    autoResize()
  }, [input, autoResize])

  // Handle files
  const [selectedFiles, setSelectedFiles] = useState<{ file: File, preview: string }[]>([])

  const handleFilesSelect = useCallback(async (files: File[]) => {
    const validFiles = files.filter(f => f.type.startsWith('image/') || f.type === 'application/pdf')
    if (validFiles.length === 0) return

    const newSelections = await Promise.all(validFiles.map(file => {
      return new Promise<{file: File, preview: string}>((resolve) => {
        const reader = new FileReader()
        reader.onload = (e) => resolve({ file, preview: e.target?.result as string })
        reader.readAsDataURL(file)
      })
    }))

    setSelectedFiles(prev => [...prev, ...newSelections])
  }, [])

  // Drag and drop handlers
  const [isDragging, setIsDragging] = useState(false)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    handleFilesSelect(files)
  }

  // Paste image from clipboard
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items)
    const files = items.map(item => item.getAsFile()).filter(Boolean) as File[]
    handleFilesSelect(files)
  }, [handleFilesSelect])

  // Send message
  const handleSend = async () => {
    const trimmedInput = input.trim()
    if (!trimmedInput && selectedFiles.length === 0) return
    if (isStreaming) return

    // Add user message
    const userMessage: ChatMessage = {
      role: 'user',
      content: trimmedInput,
      attachments: selectedFiles.map(sf => ({ dataUrl: sf.preview, name: sf.file.name, type: sf.file.type })),
      timestamp: Date.now(),
    }

    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    setInput('')
    setSelectedFiles([])
    setIsStreaming(true)
    setStreamingText('')

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    try {
      let fullText = ''

      if (customApiKey.trim()) {
        // ═══ CLIENT-SIDE: Gọi thẳng Google API từ Trình duyệt ═══
        // Không đi qua Server Vercel → KHÔNG bị giới hạn 60 giây
        const genAI = new GoogleGenerativeAI(customApiKey.trim())
        const genModel = genAI.getGenerativeModel({
          model: aiModel,
          systemInstruction: SYSTEM_INSTRUCTION,
        })

        // Build history (tất cả tin nhắn trừ tin cuối)
        const history = updatedMessages.slice(0, -1).map((msg) => ({
          role: msg.role as 'user' | 'model',
          parts: [{ text: msg.content || '(ảnh đính kèm)' }],
        }))

        // Build parts cho tin nhắn cuối (có thể kèm ảnh/PDF)
        const lastParts: any[] = []
        if (userMessage.attachments && userMessage.attachments.length > 0) {
          for (const att of userMessage.attachments) {
            const arr = att.dataUrl.split(',')
            const mime = arr[0].match(/:(.*?);/)?.[1] || att.type || 'image/png'
            lastParts.push({
              inlineData: { data: arr[1], mimeType: mime },
            })
          }
        }
        lastParts.push({ text: userMessage.content || '(ảnh đính kèm)' })

        const chat = genModel.startChat({ history })
        const result = await chat.sendMessageStream(lastParts)

        for await (const chunk of result.stream) {
          const text = chunk.text()
          if (text) {
            fullText += text
            setStreamingText(fullText)
          }
        }
      } else {
        // ═══ SERVER-SIDE: Gọi qua Vercel API route (giới hạn 60s) ═══
        const apiMessages = updatedMessages.map((msg) => ({
          role: msg.role,
          parts: [{ text: msg.content || '(ảnh đính kèm)' }],
        }))

        const formData = new FormData()
        formData.append('messages', JSON.stringify(apiMessages))
        formData.append('model', aiModel)
        if (userMessage.attachments && userMessage.attachments.length > 0) {
          userMessage.attachments.forEach((att, i) => {
            const arr = att.dataUrl.split(',')
            const mime = arr[0].match(/:(.*?);/)?.[1] || att.type || 'image/png'
            const bstr = atob(arr[1])
            let n = bstr.length
            const u8arr = new Uint8Array(n)
            while (n--) u8arr[n] = bstr.charCodeAt(n)
            const imgFile = new File([u8arr], att.name || `file_${i}`, { type: mime })
            formData.append('files', imgFile)
          })
        }

        const res = await fetch('/api/ai/chat', {
          method: 'POST',
          body: formData,
        })

        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: 'Lỗi không xác định' }))
          throw new Error(errData.error || `HTTP ${res.status}`)
        }

        const reader = res.body?.getReader()
        const decoder = new TextDecoder()

        if (reader) {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            const chunk = decoder.decode(value, { stream: true })
            fullText += chunk
            setStreamingText(fullText)
          }
        }
      }

      // Add AI message
      const aiMessage: ChatMessage = {
        role: 'model',
        content: fullText,
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, aiMessage])
    } catch (err) {
      const rawError = err instanceof Error ? err.message : 'Lỗi không xác định'
      const lowerErr = rawError.toLowerCase()
      let translatedError = rawError

      if (lowerErr.includes('401') || lowerErr.includes('unauthorized') || lowerErr.includes('invalid authentication')) {
        translatedError = 'API Key cá nhân của bạn không hợp lệ hoặc copy bị thiếu ký tự. Vui lòng kiểm tra lại hoặc xoá trắng ô API Key để dùng máy chủ mặc định.'
      } else if (lowerErr.includes('503') || lowerErr.includes('service unavailable') || lowerErr.includes('high demand') || lowerErr.includes('overloaded')) {
        translatedError = 'Google Gemini đang bị quá tải do có quá nhiều người sử dụng. Vui lòng thử lại sau ít phút hoặc đổi sang mô hình khác.'
      } else if (lowerErr.includes('429') || lowerErr.includes('rate limit') || lowerErr.includes('quota')) {
        translatedError = 'Hệ thống đang quá tải do vượt quá hạn mức. Bạn có thể tự nhập API Key cá nhân của mình để ưu tiên xử lý hoặc đợi vài phút rồi thử lại.'
      } else if (lowerErr.includes('400') || lowerErr.includes('invalid format')) {
        translatedError = 'Yêu cầu gửi đi không hợp lệ. Vui lòng kiểm tra lại nội dung chat.'
      } else if (lowerErr.includes('timeout') || lowerErr.includes('timed out') || lowerErr.includes('deadline')) {
        translatedError = 'Yêu cầu mất quá lâu để xử lý. Vui lòng thử lại.'
      } else if (lowerErr.includes('network') || lowerErr.includes('fetch') || lowerErr.includes('econnrefused')) {
        translatedError = 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối Internet và thử lại.'
      } else if (lowerErr.includes('404') || lowerErr.includes('not found')) {
        translatedError = 'Không tìm thấy mô hình AI. Vui lòng chọn mô hình dự phòng khác trong danh sách (Ví dụ: Gemini 3 Flash).'
      }

      const aiError: ChatMessage = {
        role: 'model',
        content: `⚠️ **Lỗi:** ${translatedError}`,
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, aiError])
    } finally {
      setIsStreaming(false)
      setStreamingText('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleClear = () => {
    if (messages.length === 0) return
    if (window.confirm('Xóa toàn bộ hội thoại?')) {
      setMessages([])
      setStreamingText('')
    }
  }

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
  }



  return (
    <div className={styles.page}>
      <Header
        title="Trợ Lý AI"
        subtitle="Chat trực tiếp với Gemini — Hỗ trợ soạn câu hỏi, gõ LaTeX, gán ID"
        actions={
          <button 
            className="btn btn-primary" 
            onClick={() => {
              if (!examCodes[0]) setExamCodes([generateExamCode()])
              setShowExportModal(true)
            }} 
            disabled={isExporting || !editorContent.trim()}
          >
            {isExporting ? '⏳ Đang xử lý...' : '📥 Xuất file LaTeX'}
          </button>
        }
      />

      <div className={styles.layout}>
        {/* ═══ LEFT PANE (CHAT) ═══ */}
        <div 
          className={`${styles.leftPane} ${isDragging ? styles.isDragging : ''}`}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {isDragging && (
            <div className={styles.dragOverlay}>
              <div className={styles.dragOverlayIcon}>📥</div>
              <div className={styles.dragOverlayText}>Thả file ảnh hoặc PDF vào đây</div>
            </div>
          )}
          
          <div className={styles.chatWindow}>
          {messages.length === 0 && !isStreaming ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>💬</div>
              <div className={styles.emptyTitle}>Trợ lý AI Ngân Hàng Toán</div>
              <ul className={styles.emptySubtitleList}>
                <li>Gõ toàn bộ đề thi từ file ảnh/PDF.</li>
                <li>Vẽ ảnh, bảng biến thiên từ file ảnh/PDF.</li>
                <li>Bổ sung lời giải cho toàn bộ câu hỏi.</li>
                <li>Tự động gán ID.</li>
              </ul>
            </div>
          ) : (
            <div className={styles.chatWindowInner}>
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`${styles.messageRow} ${
                    msg.role === 'user' ? styles.messageRowUser : ''
                  }`}
                >
                  <div
                    className={`${styles.messageAvatar} ${
                      msg.role === 'user'
                        ? styles.messageAvatarUser
                        : styles.messageAvatarAI
                    }`}
                  >
                    {msg.role === 'user' ? '👤' : '🤖'}
                  </div>
                  <div
                    className={`${styles.messageBubble} ${
                      msg.role === 'user'
                        ? styles.messageBubbleUser
                        : styles.messageBubbleAI
                    }`}
                  >
                    {msg.role === 'model' && (
                      <button className={styles.copyBtn} onClick={() => handleCopy(msg.content)} title="Copy sang Editor">
                        📋 Copy
                      </button>
                    )}
                    {msg.role === 'user' && msg.attachments && msg.attachments.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '8px' }}>
                        {msg.attachments.map((att, idx) => (
                          att.type === 'application/pdf' ? (
                            <div key={idx} className={styles.filePreviewChip} style={{ maxWidth: '300px' }}>
                              <div className={styles.filePreviewIcon}>📄</div>
                              <div className={styles.filePreviewInfo}>
                                <span className={styles.filePreviewName}>{att.name}</span>
                                <span className={styles.filePreviewType}>PDF Document</span>
                              </div>
                            </div>
                          ) : (
                            <img
                              key={idx}
                              src={att.dataUrl}
                              alt="Ảnh đính kèm"
                              className={styles.messageImage}
                            />
                          )
                        ))}
                      </div>
                    )}
                    {msg.role === 'user' ? (
                      <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                    ) : (
                      <div
                        dangerouslySetInnerHTML={{
                          __html: renderMarkdown(msg.content),
                        }}
                      />
                    )}
                    <span
                      className={`${styles.messageTime} ${
                        msg.role === 'user' ? styles.messageTimeUser : ''
                      }`}
                    >
                      {formatTime(msg.timestamp)}
                    </span>
                  </div>
                </div>
              ))}

              {/* Streaming message */}
              {isStreaming && (
                <div className={styles.messageRow}>
                  <div
                    className={`${styles.messageAvatar} ${styles.messageAvatarAI}`}
                  >
                    🤖
                  </div>
                  <div
                    className={`${styles.messageBubble} ${styles.messageBubbleAI}`}
                  >
                    {streamingText ? (
                      <div
                        dangerouslySetInnerHTML={{
                          __html: renderMarkdown(streamingText),
                        }}
                      />
                    ) : (
                      <div className={styles.typingIndicator}>
                        <div className={styles.typingDot} />
                        <div className={styles.typingDot} />
                        <div className={styles.typingDot} />
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>
          )}
        </div>

        {/* ═══ INPUT AREA ═══ */}
        <div className={styles.inputArea}>
          <div className={styles.inputAreaInner}>
            {/* File preview */}
            {selectedFiles.length > 0 && (
              <div className={styles.filePreviewRow}>
                {selectedFiles.map((sf, idx) => (
                  <div key={idx} className={styles.filePreviewChip}>
                    <div className={styles.filePreviewIcon}>
                      {sf.file.type === 'application/pdf' ? '📄' : (
                        <img src={sf.preview} alt="Preview" />
                      )}
                    </div>
                    <div className={styles.filePreviewInfo}>
                      <span className={styles.filePreviewName}>{sf.file.name}</span>
                      <span className={styles.filePreviewType}>
                        {sf.file.type === 'application/pdf' ? 'PDF Document' : 'Image File'}
                      </span>
                    </div>
                    <button className={styles.filePreviewRemove} onClick={() => setSelectedFiles(prev => prev.filter((_, i) => i !== idx))}>✕</button>
                  </div>
                ))}
              </div>
            )}

            {/* Input box */}
            <div className={styles.inputWrapper}>
              <textarea
                ref={textareaRef}
                className={styles.inputTextarea}
                placeholder="Nhập câu hỏi hoặc dán ảnh (Ctrl+V)..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                rows={1}
                disabled={isStreaming}
              />

              <div className={styles.inputActions}>
                {/* Attach image */}
                <button
                  className={styles.inputActionBtn}
                  title="Đính kèm ảnh"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect
                      x="3"
                      y="3"
                      width="18"
                      height="18"
                      rx="2"
                      ry="2"
                    />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    if (e.target.files) {
                      handleFilesSelect(Array.from(e.target.files))
                    }
                    e.target.value = ''
                  }}
                  multiple
                />

                {/* Send */}
                <button
                  className={styles.sendBtn}
                  onClick={handleSend}
                  disabled={isStreaming || (!input.trim() && selectedFiles.length === 0)}
                  title="Gửi (Enter)"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Bottom bar */}
            <div className={styles.bottomBar}>
              <div className={styles.bottomBarLeft}>
                <button 
                  className={styles.quickPromptToggle}
                  onClick={() => setShowQuickPromptsMenu(!showQuickPromptsMenu)}
                  title="Gợi ý nhanh"
                >
                  ⚡ Gợi ý nhanh {showQuickPromptsMenu ? '▲' : '▼'}
                </button>
                {showQuickPromptsMenu && (
                  <div className={styles.quickPromptMenu}>
                    {quickPrompts.map((prompt, i) => (
                      <div key={i} className={styles.quickPromptItemWrapper}>
                        <button 
                          className={styles.quickPromptMenuItem}
                          onClick={() => {
                            setInput(prompt);
                            setShowQuickPromptsMenu(false);
                            textareaRef.current?.focus();
                          }}
                        >
                          {prompt}
                        </button>
                        <div className={styles.quickPromptActions}>
                          <button 
                            title="Sửa" 
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              const newText = window.prompt('Sửa gợi ý:', prompt); 
                              if (newText !== null && newText.trim()) {
                                const newArr = [...quickPrompts];
                                newArr[i] = newText.trim();
                                setQuickPrompts(newArr);
                              }
                            }}
                          >
                            ✏️
                          </button>
                          <button 
                            title="Xóa" 
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              if (window.confirm('Bạn có chắc muốn xóa gợi ý này?')) {
                                setQuickPrompts(prev => prev.filter((_, idx) => idx !== i));
                              }
                            }}
                          >
                            ❌
                          </button>
                        </div>
                      </div>
                    ))}
                    <button 
                      className={styles.addQuickPromptBtn}
                      onClick={() => {
                        const text = window.prompt('Nhập gợi ý mới:', '');
                        if (text && text.trim()) {
                          setQuickPrompts(prev => [...prev, text.trim()]);
                        }
                      }}
                    >
                      + Thêm gợi ý mới
                    </button>
                  </div>
                )}
              </div>
              <div className={styles.bottomBarRight}>
                <select
                  className={styles.modelSelect}
                  value={aiModel}
                  onChange={(e) => setAiModel(e.target.value)}
                >
                  <option value="gemini-3.5-flash">Gemini 3.5 Flash (Thông minh, giải bài khó)</option>
                  <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite (Nhanh nhất, 15 req/phút)</option>
                  <option value="gemini-3-flash">Gemini 3 Flash (Dự phòng)</option>
                </select>
                <button
                  className={styles.settingsToggle}
                  onClick={() => setShowSettings(!showSettings)}
                  title="Cài đặt API Key"
                >
                  ⚙️ {showSettings ? 'Ẩn' : 'API Key'}
                </button>
                <button
                  className={styles.clearBtn}
                  onClick={handleClear}
                  disabled={messages.length === 0}
                >
                  🗑️ Xóa hội thoại
                </button>
              </div>
            </div>

            {/* Settings panel */}
            {showSettings && (
              <div className={styles.settingsPanel}>
                <div className={styles.settingsRow}>
                  <label className={styles.settingsLabel}>API Key:</label>
                  <input
                    type="password"
                    className={styles.settingsInput}
                    placeholder="Nhập API Key cá nhân (không bắt buộc)..."
                    value={customApiKey}
                    onChange={(e) => setCustomApiKey(e.target.value)}
                  />
                </div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', lineHeight: '1.4' }}>
                  Không bắt buộc. Hệ thống có sẵn API key. Bạn có thể tự nhập API key cá nhân khi server quá tải.
                </div>
              </div>
            )}
          </div>
        </div>
        </div> {/* END LEFT PANE */}

        {/* ═══ RIGHT PANE (EDITOR) ═══ */}
        <div className={styles.rightPane}>
          <div className={styles.editorToolbar}>
            <button className={styles.btnToolbar} onClick={handleNormalize}>✨ Chuẩn hóa</button>
            <button className={styles.btnToolbar} onClick={() => setIsIdModalOpen(true)}>🏷 Gán ID</button>
            <button className={styles.btnToolbar} onClick={handleAutoAssignId} disabled={isAutoAssigning || !editorContent.trim()}>
              {isAutoAssigning ? '⏳ Đang gán...' : '🤖 Gán ID tự động'}
            </button>
            <button className={styles.btnToolbar} onClick={handleCopyToClipboard}>
              {isCopied ? '✅ Đã copy' : '📋 Copy'}
            </button>
          </div>
          <textarea
            ref={editorTextareaRef}
            className={styles.editorTextarea}
            value={editorContent}
            onChange={e => setEditorContent(e.target.value)}
            placeholder="Paste code LaTeX vào đây hoặc bấm Copy từ tin nhắn của AI..."
            spellCheck={false}
          />
        </div>
      </div>

      {/* Export LaTeX Modal – 8 header fields */}
      {showExportModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.65)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 1120, padding: 24, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0f172a' }}>📝 Xuất file LaTeX</h3>
              </div>
              <button onClick={() => setShowExportModal(false)} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>✕</button>
            </div>

            <div style={{ display: 'flex', gap: 24 }}>
              {/* ── LEFT COLUMN (Main Content) ── */}
              <div style={{ flex: '1 1 65%', display: 'flex', flexDirection: 'column' }}>
                {/* ── Shared Formatting Toolbar ── */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12, padding: '8px 12px', background: '#f1f5f9', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginRight: 4 }}>Định dạng:</span>
                  {(['bold', 'italic', 'underline'] as const).map(prop => (
                    <button key={prop} type="button" disabled={selectedLine === null || selectedLine === 3} onClick={() => {
                      if (selectedLine === null || selectedLine === 3) return
                      const ns = [...headerStyles]; ns[selectedLine] = { ...ns[selectedLine], [prop]: !ns[selectedLine][prop] }; setHeaderStyles(ns)
                    }} style={{
                      width: 30, height: 30, borderRadius: 6, border: `1.5px solid ${selectedLine !== null && selectedLine !== 3 && headerStyles[selectedLine]?.[prop] ? '#3b82f6' : '#cbd5e1'}`,
                      background: selectedLine !== null && selectedLine !== 3 && headerStyles[selectedLine]?.[prop] ? '#dbeafe' : 'white',
                      cursor: selectedLine === null || selectedLine === 3 ? 'not-allowed' : 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: prop === 'bold' ? 700 : 400, fontStyle: prop === 'italic' ? 'italic' : 'normal',
                      textDecoration: prop === 'underline' ? 'underline' : 'none',
                      color: selectedLine !== null && selectedLine !== 3 && headerStyles[selectedLine]?.[prop] ? '#1d4ed8' : '#94a3b8',
                      opacity: selectedLine === null || selectedLine === 3 ? 0.5 : 1, transition: 'all 0.15s',
                    }}>
                      {prop === 'bold' ? 'B' : prop === 'italic' ? 'I' : 'U'}
                    </button>
                  ))}
                  <select value={selectedLine !== null && selectedLine !== 3 ? headerStyles[selectedLine]?.color || '' : ''}
                    disabled={selectedLine === null || selectedLine === 3}
                    onChange={e => {
                      if (selectedLine === null || selectedLine === 3) return
                      const ns = [...headerStyles]; ns[selectedLine] = { ...ns[selectedLine], color: e.target.value }; setHeaderStyles(ns)
                    }} style={{
                      height: 30, padding: '0 8px', borderRadius: 6, border: '1.5px solid #cbd5e1', fontSize: 12,
                      cursor: selectedLine === null || selectedLine === 3 ? 'not-allowed' : 'pointer',
                      background: selectedLine !== null && selectedLine !== 3 && headerStyles[selectedLine]?.color ? headerStyles[selectedLine].color : 'white',
                      color: selectedLine !== null && selectedLine !== 3 && headerStyles[selectedLine]?.color ? 'white' : '#64748b',
                      opacity: selectedLine === null || selectedLine === 3 ? 0.5 : 1, transition: 'all 0.15s',
                    }}>
                    <option value="">🎨 Màu</option>
                    {LATEX_COLORS.filter(c => c).map(c => <option key={c} value={c} style={{ background: c, color: 'white' }}>{c}</option>)}
                  </select>
                  {selectedLine !== null && selectedLine !== 3 && (
                    <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 'auto', fontStyle: 'italic' }}>Đang sửa dòng {selectedLine + 1}</span>
                  )}
                </div>

                {/* ── WYSIWYG Editable Preview ── */}
                <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px', marginBottom: 16 }} onClick={e => { if (e.target === e.currentTarget) setSelectedLine(null) }}>
                  <div style={{ display: 'flex', gap: 0 }}>
                    <div style={{ flex: '0 0 45%', textAlign: 'center', padding: '4px 8px' }}>
                      {[0, 1, 2, 3].map(i => {
                        const s = headerStyles[i]; const isSelected = selectedLine === i; const isLocked = i === 3
                        return (
                          <div key={i} onClick={e => { e.stopPropagation(); if (!isLocked) setSelectedLine(i) }}
                            style={{ padding: '3px 6px', borderRadius: 4, marginBottom: 2, cursor: isLocked ? 'default' : 'text',
                              outline: isSelected ? '2px solid #3b82f6' : 'none', outlineOffset: 1,
                              background: isSelected ? '#eff6ff' : 'transparent', transition: 'all 0.15s',
                              fontSize: i === 0 ? '14px' : i === 1 ? '13px' : '12px',
                              fontWeight: s.bold ? 700 : 400, fontStyle: isLocked ? 'italic' : (s.italic ? 'italic' : 'normal'),
                              textDecoration: s.underline ? 'underline' : 'none', color: isLocked ? '#9ca3af' : (s.color || 'inherit'),
                            }}
                            onMouseEnter={e => { if (!isLocked && !isSelected) (e.currentTarget as HTMLElement).style.background = '#f8fafc' }}
                            onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                          >
                            {isLocked ? '(Đề thi gồm có X trang) 🔒' : (
                              isSelected ? (
                                <input type="text" value={headerLabels[i]} autoFocus
                                  onChange={e => { const n = [...headerLabels]; n[i] = e.target.value; setHeaderLabels(n) }}
                                  onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setSelectedLine(null) }}
                                  style={{ width: '100%', textAlign: 'center', border: 'none', outline: 'none', background: 'transparent', fontSize: 'inherit', fontWeight: 'inherit', fontStyle: 'inherit', textDecoration: 'inherit', color: 'inherit', padding: 0 }} />
                              ) : (headerLabels[i] || '...')
                            )}
                          </div>
                        )
                      })}
                    </div>
                    <div style={{ flex: '0 0 55%', textAlign: 'center', padding: '4px 8px' }}>
                      {[4, 5, 6, 7].map(i => {
                        const s = headerStyles[i]; const isSelected = selectedLine === i
                        return (
                          <div key={i} onClick={e => { e.stopPropagation(); setSelectedLine(i) }}
                            style={{ padding: '3px 6px', borderRadius: 4, marginBottom: 2, cursor: 'text',
                              outline: isSelected ? '2px solid #3b82f6' : 'none', outlineOffset: 1,
                              background: isSelected ? '#eff6ff' : 'transparent', transition: 'all 0.15s',
                              fontSize: i === 4 ? '14px' : i === 5 ? '13px' : '12px',
                              fontWeight: s.bold ? 700 : 400, fontStyle: s.italic ? 'italic' : 'normal',
                              textDecoration: s.underline ? 'underline' : 'none', color: s.color || 'inherit',
                            }}
                            onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = '#f8fafc' }}
                            onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                          >
                            {isSelected ? (
                              <input type="text" value={headerLabels[i]} autoFocus
                                onChange={e => { const n = [...headerLabels]; n[i] = e.target.value; setHeaderLabels(n) }}
                                onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setSelectedLine(null) }}
                                style={{ width: '100%', textAlign: 'center', border: 'none', outline: 'none', background: 'transparent', fontSize: 'inherit', fontWeight: 'inherit', fontStyle: 'inherit', textDecoration: 'inherit', color: 'inherit', padding: 0 }} />
                            ) : (headerLabels[i] || '...')}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  <div style={{ borderTop: '2px double #94a3b8', marginTop: '8px', paddingTop: '6px', display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748b' }}>
                    <span style={{ fontStyle: 'italic' }}>Họ và tên thí sinh: .........................</span>
                    <span style={{ fontStyle: 'italic' }}>Số báo danh: ....................</span>
                    <span style={{ fontWeight: 700, border: '1px solid #333', padding: '2px 8px', fontSize: '13px', color: '#2563eb' }}>{examCodes[0] || '1234'}</span>
                  </div>
                  <div style={{ textAlign: 'center', fontSize: 10, color: '#94a3b8', marginTop: 6 }}>💡 Click vào dòng để chỉnh sửa • Dùng toolbar phía trên để định dạng</div>
                </div>

                {/* Exam Codes */}
                <div style={{
                  background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px',
                  padding: '16px', marginBottom: '16px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.03em' }}>🔢 Mã đề thi</div>
                    <button
                      type="button"
                      onClick={() => {
                        const val = generateExamCode()
                        setExamCodes([val])
                      }}
                      style={{
                        padding: '4px 12px', borderRadius: '6px', border: '1px solid #86efac',
                        background: 'white', color: '#166534', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                        transition: 'all 0.2s',
                      }}
                      onMouseOver={e => { e.currentTarget.style.background = '#166534'; e.currentTarget.style.color = 'white' }}
                      onMouseOut={e => { e.currentTarget.style.background = 'white'; e.currentTarget.style.color = '#166534' }}
                    >
                      🎲 Tạo mã ngẫu nhiên
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <input
                        type="text"
                        value={examCodes[0]}
                        onChange={e => {
                          const val = e.target.value.replace(/\D/g, '').slice(0, 4)
                          setExamCodes([val])
                        }}
                        maxLength={4}
                        style={{
                          width: '72px', padding: '8px 10px', borderRadius: '8px',
                          border: '2px solid #86efac', fontSize: '16px', fontWeight: 700,
                          textAlign: 'center', background: 'white', color: '#166534',
                          fontFamily: 'monospace', letterSpacing: '2px',
                        }}
                        placeholder="1234"
                      />
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: 'auto', paddingTop: '16px' }}>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      onClick={() => setShowExportModal(false)}
                      style={{
                        padding: '10px 20px', borderRadius: '8px', border: '1px solid #cbd5e1',
                        background: '#f8fafc', color: '#475569', cursor: 'pointer', fontSize: '14px', fontWeight: 500
                      }}
                    >
                      Hủy bỏ
                    </button>
                    <button
                      onClick={() => { setShowExportModal(false); handleExportLatex(); }}
                      style={{
                        padding: '10px 24px', borderRadius: '8px', border: 'none',
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: 'white',
                        cursor: 'pointer', fontSize: '14px', fontWeight: 700,
                        boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.3)',
                        transition: 'all 0.2s',
                      }}
                    >
                      📥 Xuất file .tex
                    </button>
                  </div>
                </div>
              </div>

              {/* ── RIGHT COLUMN (Options) ── */}
              <div style={{ flex: '0 0 280px', background: '#f8fafc', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tùy chọn xuất</h4>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#334155', background: 'white', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                    <input type="checkbox" checked={includeAnswerTable} onChange={e => setIncludeAnswerTable(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#10b981', cursor: 'pointer' }} />
                    <span style={{ flex: 1 }}>Thêm Bảng đáp án cuối đề <i>(indapan)</i></span>
                  </label>
                </div>

                <div style={{ flex: 1, border: '2px dashed #cbd5e1', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5, minHeight: '100px' }}>
                  <span style={{ fontSize: '12px', color: '#64748b', fontStyle: 'italic' }}>Không gian chờ cập nhật...</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ GÁN ID MODAL ═══ */}
      {isIdModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsIdModalOpen(false)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>🏷 Chọn ID Câu Hỏi</div>
              <button className={styles.modalClose} onClick={() => setIsIdModalOpen(false)}>✕</button>
            </div>
            
            <div className={styles.modalBody}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className={styles.formGroup}>
                  <label>Lớp</label>
                  <select className={styles.formSelect} value={selectedGrade} onChange={e => setSelectedGrade(Number(e.target.value))}>
                    <option value={10}>Lớp 10</option>
                    <option value={11}>Lớp 11</option>
                    <option value={12}>Lớp 12</option>
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label>Nhóm môn</label>
                  <select className={styles.formSelect} value={selectedSubject} onChange={e => {
                    setSelectedSubject(e.target.value)
                    setSelectedChapter(Number(Object.keys(CHAPTER_NAMES[selectedGrade][e.target.value] || {})[0] || 1))
                  }}>
                    {Object.keys(CHAPTER_NAMES[selectedGrade] || {}).map(sub => (
                      <option key={sub} value={sub}>{sub === 'D' ? 'Đại số/Giải tích' : sub === 'H' ? 'Hình học' : 'Chuyên đề'}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label>Chương</label>
                <select className={styles.formSelect} value={selectedChapter} onChange={e => {
                  setSelectedChapter(Number(e.target.value))
                  setSelectedLesson(1)
                }}>
                  {Object.entries(CHAPTER_NAMES[selectedGrade]?.[selectedSubject] || {}).map(([cId, name]) => (
                    <option key={cId} value={Number(cId)}>{name}</option>
                  ))}
                </select>
              </div>

              <div className={styles.formGroup}>
                <label>Bài học</label>
                <select className={styles.formSelect} value={selectedLesson} onChange={e => {
                  setSelectedLesson(Number(e.target.value))
                  setSelectedVariant(1)
                }}>
                  {Object.entries(LESSON_NAMES[selectedGrade]?.[selectedSubject]?.[selectedChapter] || {}).map(([lId, name]) => (
                    <option key={lId} value={Number(lId)}>{name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className={styles.formGroup}>
                  <label>Dạng bài (Variant)</label>
                  <select className={styles.formSelect} value={selectedVariant} onChange={e => setSelectedVariant(Number(e.target.value))}>
                    {Object.entries(VARIANT_NAMES[selectedGrade]?.[selectedSubject]?.[selectedChapter]?.[selectedLesson] || {}).map(([vId, name]) => (
                      <option key={vId} value={Number(vId)}>Dạng {vId}: {name}</option>
                    ))}
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label>Mức độ</label>
                  <select className={styles.formSelect} value={selectedDiff} onChange={e => setSelectedDiff(e.target.value)}>
                    <option value="N">Nhận biết (N)</option>
                    <option value="H">Thông hiểu (H)</option>
                    <option value="V">Vận dụng (V)</option>
                    <option value="C">Vận dụng cao (C)</option>
                  </select>
                </div>
              </div>

              <div className={styles.idPreviewBox}>
                ID Sẽ Gán: {getGeneratedId()}
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button className="btn btn-secondary" onClick={() => setIsIdModalOpen(false)}>Hủy</button>
              <button className="btn btn-primary" onClick={handleAssignId}>Chèn ID</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
