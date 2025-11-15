'use client'

import React, { useEffect } from 'react'
import { formatFileSize, type ProcessedDocument } from '@/lib/documentApi'

interface DocumentPreviewProps {
  document: ProcessedDocument | null
  isOpen: boolean
  onClose: () => void
}

export default function DocumentPreview({ document, isOpen, onClose }: DocumentPreviewProps) {
  const getFileExtension = (fileName: string): string => {
    return '.' + fileName.split('.').pop()?.toLowerCase()
  }

  const getFileUrl = (): string | null => {
    if (!document) return null
    return `/api/documents/${document.id}/file`
  }

  const canEmbedInIframe = (): boolean => {
    if (!document) return false
    const ext = getFileExtension(document.name)
    // PDFs and images can be embedded
    return ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.txt', '.md', '.csv'].includes(ext)
  }

  const isDocx = (): boolean => {
    if (!document) return false
    return getFileExtension(document.name) === '.docx'
  }

  const getDocxViewerUrl = (): string | null => {
    if (!document) return null
    // Use server-side HTML conversion endpoint
    return `/api/documents/${document.id}/html`
  }

  const handleOpenInNewTab = () => {
    const url = getFileUrl()
    if (url) {
      window.open(url, '_blank')
    }
  }

  const handleDownload = () => {
    const url = getFileUrl()
    if (url && document && typeof window !== 'undefined') {
      const link = window.document.createElement('a')
      link.href = url
      link.download = document.name
      window.document.body.appendChild(link)
      link.click()
      window.document.body.removeChild(link)
    }
  }

  useEffect(() => {
    // Check if we're in the browser
    if (typeof window === 'undefined' || !window.document?.body) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }

    if (isOpen) {
      window.document.addEventListener('keydown', handleEscape)
      // Prevent body scroll when modal is open
      if (window.document.body) {
        window.document.body.style.overflow = 'hidden'
      }
    } else {
      if (window.document.body) {
        window.document.body.style.overflow = ''
      }
    }

    return () => {
      if (typeof window !== 'undefined' && window.document) {
        window.document.removeEventListener('keydown', handleEscape)
        if (window.document.body) {
          window.document.body.style.overflow = ''
        }
      }
    }
  }, [isOpen, onClose])

  if (!isOpen || !document) return null

  return (
    <div 
      className="fixed inset-0 z-50 flex bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div 
        className="bg-chat-surface border-0 w-full h-full flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-chat-border bg-chat-surface-elevated flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-chat-text truncate">{document.name}</h2>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs text-chat-text-muted">{formatFileSize(document.size)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 ml-4">
            <button
              onClick={handleOpenInNewTab}
              className="px-3 py-1.5 text-sm bg-chat-card hover:bg-chat-card-hover rounded-lg text-chat-text transition-colors flex items-center gap-2"
              title="Open in new tab"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 3v2M3 8h2M13 8h-2M8 13v-2M5.636 5.636l1.414 1.414M10.95 10.95l-1.414-1.414M5.636 10.364l1.414-1.414M10.95 5.05l-1.414 1.414" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
              Open
            </button>
            <button
              onClick={handleDownload}
              className="px-3 py-1.5 text-sm bg-chat-card hover:bg-chat-card-hover rounded-lg text-chat-text transition-colors flex items-center gap-2"
              title="Download"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 11V3M8 11L5 8M8 11l3-3M3 13h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Download
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-chat-card transition-colors text-chat-text-muted hover:text-chat-text flex-shrink-0"
              aria-label="Close"
              title="Close"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M15 5L5 15M5 5l10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {canEmbedInIframe() ? (
            <iframe
              src={getFileUrl() || ''}
              className="w-full h-full border-0"
              title={document.name}
            />
          ) : isDocx() ? (
            <iframe
              src={getDocxViewerUrl() || ''}
              className="w-full h-full border-0"
              title={document.name}
              allow="fullscreen"
            />
          ) : (
            <div className="flex-1 flex items-center justify-center p-12">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-chat-card flex items-center justify-center">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-chat-primary">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <polyline points="14 2 14 8 20 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-chat-text mb-2">{document.name}</h3>
                <p className="text-chat-text-muted text-sm mb-4">
                  This file type cannot be previewed in the browser.
                </p>
                <div className="flex gap-2 justify-center">
                  <button
                    onClick={handleOpenInNewTab}
                    className="px-4 py-2 bg-chat-primary hover:bg-chat-primary/90 rounded-lg text-white text-sm font-medium transition-colors"
                  >
                    Open in New Tab
                  </button>
                  <button
                    onClick={handleDownload}
                    className="px-4 py-2 bg-chat-card hover:bg-chat-card-hover rounded-lg text-chat-text text-sm font-medium transition-colors"
                  >
                    Download
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

