'use client'
import { useState, useRef, useCallback, useEffect } from 'react'
import Header from '@/components/layout/Header'
import styles from './ai-chat.module.css'
import { CHAPTER_NAMES, LESSON_NAMES, VARIANT_NAMES } from '@/lib/curriculum-labels'
import { normalizeQuestion, formatLatexIndentation } from '@/lib/latex-parser/normalizer'

interface ChatMessage {
  role: 'user' | 'model'
  content: string
  imageDataUrl?: string
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

const QUICK_PROMPTS = [
  'Hướng dẫn cách import file .tex vào ngân hàng câu hỏi',
  'Giải thích cấu trúc ID 6 tham số (ví dụ: 2D1N3-1)',
  'Cách tạo đề thi bằng AI từ ma trận',
  'Gõ lại câu hỏi từ ảnh thành LaTeX chuẩn',
  'Gán ID cho câu hỏi Toán',
]

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

  // Editor State
  const [editorContent, setEditorContent] = useState('')
  const [isCopied, setIsCopied] = useState(false)
  const [isIdModalOpen, setIsIdModalOpen] = useState(false)
  
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
      }
    } catch (e) {
      console.error('Failed to load chat state', e)
    }
  }, [])

  // Save to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('ai-chat-state', JSON.stringify({ messages, aiModel, editorContent }))
    } catch (e) {
      console.error('Failed to save chat state', e)
    }
  }, [messages, aiModel, editorContent])

  // Editor Actions
  const handleCopy = (text: string) => {
    setEditorContent(prev => prev ? prev + '\n\n' + text : text)
  }

  const handleNormalize = () => {
    setEditorContent(prev => normalizeQuestion(prev))
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
    if (editorContent.includes('\\begin{ex}')) {
      const replaced = editorContent.replace(/\\begin\{ex\}(%\[[^\]]*\])?/, `\\begin{ex}%[${generatedId}]`)
      setEditorContent(replaced)
    } else {
      setEditorContent(prev => prev + `\n\\begin{ex}%[${generatedId}]\n\n\\end{ex}`)
    }
    setIsIdModalOpen(false)
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

  // Handle image
  const handleImageSelect = useCallback((file: File) => {
    setImageFile(file)
    const reader = new FileReader()
    reader.onload = (e) => setImagePreview(e.target?.result as string)
    reader.readAsDataURL(file)
  }, [])

  const removeImage = () => {
    setImageFile(null)
    setImagePreview(null)
  }

  // Paste image from clipboard
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile()
        if (file) handleImageSelect(file)
        break
      }
    }
  }, [handleImageSelect])

  // Send message
  const handleSend = async () => {
    const trimmedInput = input.trim()
    if (!trimmedInput && !imageFile) return
    if (isStreaming) return

    // Add user message
    const userMessage: ChatMessage = {
      role: 'user',
      content: trimmedInput,
      imageDataUrl: imagePreview || undefined,
      timestamp: Date.now(),
    }

    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    setInput('')
    setImageFile(null)
    setImagePreview(null)
    setIsStreaming(true)
    setStreamingText('')

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    try {
      // Build messages for API (Gemini format)
      const apiMessages = updatedMessages.map((msg) => ({
        role: msg.role,
        parts: [{ text: msg.content || '(ảnh đính kèm)' }],
      }))

      // Build FormData
      const formData = new FormData()
      formData.append('messages', JSON.stringify(apiMessages))
      formData.append('model', aiModel)
      if (customApiKey.trim()) {
        formData.append('custom_api_key', customApiKey.trim())
      }
      if (userMessage.imageDataUrl) {
        // Convert dataURL to File
        const arr = userMessage.imageDataUrl.split(',')
        const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png'
        const bstr = atob(arr[1])
        let n = bstr.length
        const u8arr = new Uint8Array(n)
        while (n--) u8arr[n] = bstr.charCodeAt(n)
        const imgFile = new File([u8arr], 'image.png', { type: mime })
        formData.append('image', imgFile)
      }

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Lỗi không xác định' }))
        throw new Error(errData.error || `HTTP ${res.status}`)
      }

      // Read streaming response
      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let fullText = ''

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          fullText += chunk
          setStreamingText(fullText)
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
      const errorMsg = err instanceof Error ? err.message : 'Lỗi không xác định'
      const aiError: ChatMessage = {
        role: 'model',
        content: `⚠️ **Lỗi:** ${errorMsg}`,
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
      />

      <div className={styles.layout}>
        {/* ═══ LEFT PANE (CHAT) ═══ */}
        <div className={styles.leftPane}>
          <div className={styles.chatWindow}>
          {messages.length === 0 && !isStreaming ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>💬</div>
              <div className={styles.emptyTitle}>Trợ lý AI Ngân Hàng Toán</div>
              <div className={styles.emptySubtitle}>
                Hỏi bất cứ điều gì về phần mềm, gửi ảnh câu hỏi để gõ lại LaTeX, hoặc nhờ gán ID cho câu hỏi.
              </div>
              <div className={styles.quickActions}>
                {QUICK_PROMPTS.map((qp, i) => (
                  <button
                    key={i}
                    className={styles.quickAction}
                    onClick={() => {
                      setInput(qp)
                      textareaRef.current?.focus()
                    }}
                  >
                    {qp}
                  </button>
                ))}
              </div>
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
                    {msg.role === 'user' && msg.imageDataUrl && (
                      <img
                        src={msg.imageDataUrl}
                        alt="Ảnh đính kèm"
                        className={styles.messageImage}
                      />
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
            {/* Image preview */}
            {imagePreview && (
              <div className={styles.imagePreviewRow}>
                <div className={styles.imagePreviewThumb}>
                  <img src={imagePreview} alt="Preview" />
                  <button
                    className={styles.imagePreviewRemove}
                    onClick={removeImage}
                  >
                    ✕
                  </button>
                </div>
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
                    const file = e.target.files?.[0]
                    if (file) handleImageSelect(file)
                    e.target.value = ''
                  }}
                />

                {/* Send */}
                <button
                  className={styles.sendBtn}
                  onClick={handleSend}
                  disabled={isStreaming || (!input.trim() && !imageFile)}
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
                <span>Nhấn Enter để gửi, Shift+Enter để xuống dòng</span>
              </div>
              <div className={styles.bottomBarRight}>
                <select
                  className={styles.modelSelect}
                  value={aiModel}
                  onChange={(e) => setAiModel(e.target.value)}
                >
                  <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
                  <option value="gemini-flash-latest">Gemini Flash Latest</option>
                  <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
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
            <div className={styles.editorTitle}>📝 Raw LaTeX Editor</div>
            <button className={styles.btnToolbar} onClick={handleNormalize} title="Chuẩn hóa ký tự ẩn, tự động canh tab, xóa comment rác">✨ Chuẩn hóa</button>
            <button className={styles.btnToolbar} onClick={() => setIsIdModalOpen(true)} title="Gán ID cho câu hỏi đầu tiên">🏷 Gán ID</button>
            <button className={styles.btnToolbar} onClick={handleCopyToClipboard} title="Copy nội dung">
              {isCopied ? '✅ Đã copy' : '📋 Copy'}
            </button>
          </div>
          <textarea
            className={styles.editorTextarea}
            value={editorContent}
            onChange={e => setEditorContent(e.target.value)}
            placeholder="Paste code LaTeX vào đây hoặc bấm Copy từ tin nhắn của AI..."
            spellCheck={false}
          />
        </div>
      </div>

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
