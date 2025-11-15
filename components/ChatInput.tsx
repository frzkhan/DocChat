'use client'

import React, { useState, useRef, useEffect } from 'react'
import { MdDescription } from 'react-icons/md'
import DocumentSelector from './DocumentSelector'
import Tooltip from './Tooltip'
import type { ProcessedDocument } from '@/lib/documentApi'

interface ChatInputProps {
  disabled?: boolean
  documents: ProcessedDocument[]
  selectedDocumentIds: string[]
  onSelectionChange: (documentIds: string[]) => void
  onSendMessage: (content: string) => void
}

export default function ChatInput({ 
  disabled, 
  documents,
  selectedDocumentIds,
  onSelectionChange,
  onSendMessage 
}: ChatInputProps) {
  const [inputText, setInputText] = useState('')
  const [isSelectorOpen, setIsSelectorOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const atButtonRef = useRef<HTMLButtonElement>(null)
  const [selectorPosition, setSelectorPosition] = useState({ top: 0, left: 0 })

  useEffect(() => {
    if (textareaRef.current && !disabled) {
      textareaRef.current.focus()
    }
  }, [disabled])

  const adjustHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      const scrollHeight = textareaRef.current.scrollHeight
      const maxHeight = 200
      textareaRef.current.style.height = `${Math.min(scrollHeight, maxHeight)}px`
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSend()
    }
  }

  const handleSend = () => {
    if (disabled || !inputText.trim()) return
    
    const content = inputText.trim()
    setInputText('')
    setIsSelectorOpen(false)
    onSendMessage(content)
    
    // Reset textarea height
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    }, 0)
  }

  const handleAtClick = () => {
    if (atButtonRef.current) {
      const rect = atButtonRef.current.getBoundingClientRect()
      const viewportHeight = window.innerHeight
      const viewportWidth = window.innerWidth
      const dropdownHeight = 400 // Approximate height of dropdown
      const dropdownWidth = 320 // Width of dropdown (w-80 = 20rem = 320px)
      const spaceBelow = viewportHeight - rect.bottom
      const spaceAbove = rect.top
      
      // Position above if not enough space below, otherwise below
      const shouldPositionAbove = spaceBelow < dropdownHeight && spaceAbove > spaceBelow
      
      // Calculate top position
      let top = shouldPositionAbove 
        ? rect.top - dropdownHeight - 8 // Position above the button
        : rect.bottom + 8 // Position below the button
      
      // Ensure it doesn't go above viewport
      top = Math.max(8, top)
      
      // Calculate left position - ensure it doesn't go off right edge
      let left = rect.left
      if (left + dropdownWidth > viewportWidth) {
        left = viewportWidth - dropdownWidth - 8
      }
      // Ensure it doesn't go off left edge
      left = Math.max(8, left)
      
      setSelectorPosition({
        top,
        left
      })
    }
    setIsSelectorOpen(!isSelectorOpen)
  }

  return (
    <>
      <div className="py-4 bg-chat-bg border-t border-chat-border">
        <div className="max-w-4xl mx-auto px-6">
          {/* Toolbar */}
          <div className="flex items-center bg-chat-surface border border-chat-border rounded-t-xl px-2 py-1 mb-0">
            <Tooltip 
              content="Select documents to search" 
              disabled={disabled || documents.length === 0}
            >
              <button
                ref={atButtonRef}
                onClick={handleAtClick}
                disabled={disabled || documents.length === 0}
                className={`h-7 px-2 rounded flex items-center gap-1.5 transition-colors ${
                  disabled || documents.length === 0
                    ? 'opacity-50 cursor-not-allowed text-chat-text-muted'
                    : isSelectorOpen
                      ? 'bg-chat-primary text-white'
                      : 'text-chat-text-muted hover:bg-chat-card hover:text-chat-text'
                }`}
                aria-label="Select documents"
              >
                <MdDescription className="w-4 h-4" />
                {selectedDocumentIds.length > 0 && (
                  <span className="text-xs font-medium">
                    {selectedDocumentIds.length}
                  </span>
                )}
              </button>
            </Tooltip>
          </div>
          
          {/* Input area */}
          <div className="flex items-end gap-3 bg-chat-surface border border-chat-border border-t-0 rounded-b-2xl shadow-lg p-3 transition-all focus-within:border-chat-primary focus-within:shadow-chat-primary/20">
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value)
                adjustHeight()
              }}
              onKeyDown={handleKeyDown}
              disabled={disabled}
              placeholder="Ask a question about your documents..."
              rows={1}
              className="flex-1 bg-transparent border-0 outline-none text-chat-text text-base leading-6 py-2 px-3 resize-none max-h-[200px] overflow-y-auto font-inherit placeholder:text-chat-text-muted disabled:opacity-50 disabled:cursor-not-allowed [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-chat-input-border [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-chat-primary"
            />
            <button
              onClick={handleSend}
              disabled={disabled || !inputText.trim()}
              aria-label="Send message"
              title="Send message"
              className={`flex-shrink-0 w-10 h-10 rounded-xl border-0 text-white cursor-pointer flex items-center justify-center transition-all shadow-lg ${
                disabled || !inputText.trim()
                  ? 'bg-chat-input-border cursor-not-allowed opacity-50'
                  : 'bg-gradient-to-br from-chat-primary to-chat-secondary hover:from-chat-primary-hover hover:to-chat-secondary hover:scale-105 active:scale-95'
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                <path d="M.5 1.163A1 1 0 0 1 1.97.28l12.868 6.837a1 1 0 0 1 0 1.766L1.969 15.72A1 1 0 0 1 .5 14.836V10.33a1 1 0 0 1 .816-.983L8.5 8 1.316 6.653A1 1 0 0 1 .5 5.67V1.163Z" fill="currentColor"/>
              </svg>
            </button>
          </div>
          
          {/* Status text */}
          <div className="mt-3 flex items-center justify-center">
            {selectedDocumentIds.length > 0 ? (
              <span className="text-xs text-chat-primary font-medium">
                {selectedDocumentIds.length} document{selectedDocumentIds.length !== 1 ? 's' : ''} selected
              </span>
            ) : (
              <span className="text-xs text-chat-text-muted">All documents will be used</span>
            )}
          </div>
        </div>
      </div>
      <DocumentSelector
        documents={documents}
        selectedDocumentIds={selectedDocumentIds}
        onSelectionChange={onSelectionChange}
        isOpen={isSelectorOpen}
        onClose={() => setIsSelectorOpen(false)}
        position={selectorPosition}
      />
    </>
  )
}

