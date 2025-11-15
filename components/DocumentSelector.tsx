'use client'

import React, { useRef, useEffect } from 'react'
import { formatFileSize, type ProcessedDocument } from '@/lib/documentApi'

interface DocumentSelectorProps {
  documents: ProcessedDocument[]
  selectedDocumentIds: string[]
  onSelectionChange: (documentIds: string[]) => void
  isOpen: boolean
  onClose: () => void
  position: { top: number; left: number }
}

export default function DocumentSelector({
  documents,
  selectedDocumentIds,
  onSelectionChange,
  isOpen,
  onClose,
  position
}: DocumentSelectorProps) {
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, onClose])

  const toggleDocument = (documentId: string) => {
    if (selectedDocumentIds.includes(documentId)) {
      onSelectionChange(selectedDocumentIds.filter(id => id !== documentId))
    } else {
      onSelectionChange([...selectedDocumentIds, documentId])
    }
  }

  const selectAll = () => {
    const allIds = documents
      .filter(doc => !doc.error && !doc.processing)
      .map(doc => doc.id)
    onSelectionChange(allIds)
  }

  const clearSelection = () => {
    onSelectionChange([])
  }

  const availableDocuments = documents.filter(doc => !doc.error && !doc.processing)

  if (!isOpen) return null

  return (
    <div
      ref={dropdownRef}
      className="fixed z-50 bg-chat-surface border border-chat-border rounded-xl shadow-2xl max-h-96 w-80 overflow-hidden"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
    >
      <div className="p-3 border-b border-chat-border bg-chat-surface-elevated">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-chat-text">Select Documents</h3>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-chat-card transition-colors text-chat-text-muted hover:text-chat-text"
            aria-label="Close"
            title="Close"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={selectAll}
            className="px-2 py-1 text-xs bg-chat-card hover:bg-chat-card-hover rounded-lg text-chat-text transition-colors"
          >
            Select All
          </button>
          <button
            onClick={clearSelection}
            className="px-2 py-1 text-xs bg-chat-card hover:bg-chat-card-hover rounded-lg text-chat-text transition-colors"
          >
            Clear
          </button>
        </div>
        {selectedDocumentIds.length === 0 && (
          <p className="text-xs text-chat-text-muted mt-2">
            No documents selected. All documents will be used.
          </p>
        )}
        {selectedDocumentIds.length > 0 && (
          <p className="text-xs text-chat-primary mt-2 font-medium">
            {selectedDocumentIds.length} document{selectedDocumentIds.length !== 1 ? 's' : ''} selected
          </p>
        )}
      </div>
      <div className="overflow-y-auto max-h-64 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-chat-input-border [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-chat-primary">
        {availableDocuments.length === 0 ? (
          <div className="p-4 text-center text-chat-text-muted text-sm">
            No documents available
          </div>
        ) : (
          <div className="p-2">
            {availableDocuments.map((doc) => {
              const isSelected = selectedDocumentIds.includes(doc.id)
              return (
                <button
                  key={doc.id}
                  onClick={() => toggleDocument(doc.id)}
                  className={`w-full text-left p-2 rounded-lg mb-1 transition-all ${
                    isSelected
                      ? 'bg-chat-primary/20 border border-chat-primary text-chat-text'
                      : 'bg-transparent hover:bg-chat-card text-chat-text-muted hover:text-chat-text'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                      isSelected
                        ? 'bg-chat-primary border-chat-primary'
                        : 'border-chat-border'
                    }`}>
                      {isSelected && (
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-white">
                          <path d="M10 3L4.5 8.5L2 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{doc.name}</div>
                      <div className="text-xs text-chat-text-muted">{formatFileSize(doc.size)}</div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

