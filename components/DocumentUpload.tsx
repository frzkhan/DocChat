'use client'

import React, { useState, useRef } from 'react'
import { uploadDocument, formatFileSize, type ProcessedDocument } from '@/lib/documentApi'

interface UploadingFile {
  id: string
  name: string
  progress: number
  status: 'uploading' | 'processing' | 'completed' | 'error'
  error?: string
}

interface DocumentUploadProps {
  onDocumentProcessed: (document: ProcessedDocument) => void
  onUploadError: (error: string, fileName: string) => void
  compact?: boolean
}

export default function DocumentUpload({ onDocumentProcessed, onUploadError, compact = false }: DocumentUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([])

  const validateFile = (file: File): { valid: boolean; error?: string } => {
    const MAX_FILE_SIZE = 50 * 1024 * 1024
    if (file.size > MAX_FILE_SIZE) {
      return {
        valid: false,
        error: `File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`
      }
    }

    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase()
    const SUPPORTED_TYPES = ['.pdf', '.txt', '.doc', '.docx', '.md', '.xlsx', '.xls', '.csv']
    if (!SUPPORTED_TYPES.includes(fileExtension)) {
      return {
        valid: false,
        error: `File type ${fileExtension} is not supported. Supported types: ${SUPPORTED_TYPES.join(', ')}`
      }
    }

    return { valid: true }
  }

  const triggerFileInput = () => {
    fileInputRef.current?.click()
  }

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      await processFiles(Array.from(event.target.files))
      event.target.value = ''
    }
  }

  const handleDrop = async (event: React.DragEvent) => {
    setIsDragOver(false)
    event.preventDefault()
    
    if (event.dataTransfer?.files) {
      await processFiles(Array.from(event.dataTransfer.files))
    }
  }

  const processFiles = async (files: File[]) => {
    for (const file of files) {
      const validation = validateFile(file)
      if (!validation.valid) {
        onUploadError(validation.error || 'Invalid file', file.name)
        continue
      }

      const uploadId = Date.now().toString() + Math.random().toString(36).substr(2, 9)
      const uploadingFile: UploadingFile = {
        id: uploadId,
        name: file.name,
        progress: 0,
        status: 'uploading'
      }
      setUploadingFiles(prev => [...prev, uploadingFile])

      try {
        const processedDocument = await uploadDocument(file, (progress) => {
          setUploadingFiles(prev => prev.map(f => 
            f.id === uploadId 
              ? { 
                  ...f, 
                  progress: progress.percentage,
                  status: progress.percentage >= 100 ? 'processing' : f.status
                }
              : f
          ))
        })

        setUploadingFiles(prev => prev.map(f => 
          f.id === uploadId 
            ? { ...f, progress: 100, status: 'completed' }
            : f
        ))

        onDocumentProcessed(processedDocument)

        setTimeout(() => {
          setUploadingFiles(prev => prev.filter(f => f.id !== uploadId))
        }, 1000)
      } catch (error) {
        setUploadingFiles(prev => prev.map(f => 
          f.id === uploadId 
            ? { 
                ...f, 
                error: error instanceof Error ? error.message : 'Upload failed',
                status: 'error',
                progress: 0
              }
            : f
        ))
        onUploadError(error instanceof Error ? error.message : 'Upload failed', file.name)
      }
    }
  }

  if (compact) {
    return (
      <div className="relative">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.txt,.doc,.docx,.md,.xlsx,.xls,.csv"
          onChange={handleFileSelect}
          className="hidden"
          aria-label="Upload document"
          title="Upload document"
        />
        <button
          onClick={triggerFileInput}
          className="px-4 py-2 bg-chat-primary hover:bg-chat-primary/90 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          title="Upload document"
          aria-label="Upload document"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          Upload
        </button>
        {uploadingFiles.length > 0 && (
          <div className="absolute top-full right-0 mt-2 w-80 bg-chat-surface border border-chat-border rounded-xl shadow-2xl z-50 p-3">
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {uploadingFiles.map((file) => (
                <div key={file.id} className="bg-chat-card border border-chat-border rounded-lg p-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-chat-text text-xs font-medium truncate flex-1 mr-2">{file.name}</span>
                    <span className="text-chat-primary text-xs font-semibold whitespace-nowrap">{file.progress}%</span>
                  </div>
                  <div className="w-full bg-chat-surface rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-chat-primary to-chat-secondary h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${file.progress}%` }}
                    />
                  </div>
                  {file.error && (
                    <p className="text-red-400 text-xs mt-1 font-medium">{file.error}</p>
                  )}
                  {file.status === 'processing' && (
                    <p className="text-chat-text-muted text-xs mt-1 flex items-center gap-1">
                      <span className="w-1 h-1 rounded-full bg-chat-primary animate-pulse"></span>
                      Processing...
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-4 border-b border-chat-border">
      <div
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
          isDragOver 
            ? 'border-chat-primary bg-chat-surface-elevated shadow-lg shadow-chat-primary/20' 
            : 'border-chat-border bg-chat-card hover:border-chat-primary hover:bg-chat-card-hover hover:shadow-md'
        }`}
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragOver(true)
        }}
        onDragLeave={() => setIsDragOver(false)}
        onClick={triggerFileInput}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.txt,.doc,.docx,.md"
          onChange={handleFileSelect}
          className="hidden"
          aria-label="Upload document"
          title="Upload document"
        />
        <div className="flex flex-col items-center gap-2">
          <div className="w-16 h-16 rounded-xl bg-gradient-primary flex items-center justify-center mb-2 shadow-lg">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" className="text-white">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </div>
          <p className="text-chat-text text-sm font-semibold m-0">Click to upload or drag and drop</p>
          <p className="text-chat-text-muted text-xs m-0">PDF, DOC, DOCX, TXT, MD (Max 50MB)</p>
        </div>
      </div>

      {uploadingFiles.length > 0 && (
        <div className="mt-4 space-y-2">
          {uploadingFiles.map((file) => (
            <div key={file.id} className="bg-chat-card border border-chat-border rounded-xl p-3 shadow-md">
              <div className="flex items-center justify-between mb-2">
                <span className="text-chat-text text-sm font-medium truncate flex-1 mr-2">{file.name}</span>
                <span className="text-chat-primary text-xs font-semibold whitespace-nowrap">{file.progress}%</span>
              </div>
              <div className="w-full bg-chat-surface rounded-full h-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-chat-primary to-chat-secondary h-2 rounded-full transition-all duration-300 shadow-sm"
                  style={{ width: `${file.progress}%` }}
                />
              </div>
              {file.error && (
                <p className="text-red-400 text-xs mt-2 font-medium">{file.error}</p>
              )}
              {file.status === 'processing' && (
                <p className="text-chat-text-muted text-xs mt-2 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-chat-primary animate-pulse"></span>
                  Processing...
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

