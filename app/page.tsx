'use client'

import React, { useState, useEffect, useRef } from 'react'
import ChatMessage from '@/components/ChatMessage'
import ChatInput from '@/components/ChatInput'
import DocumentUpload from '@/components/DocumentUpload'
import DocumentPreview from '@/components/DocumentPreview'
import { 
  formatFileSize, 
  fetchDocuments, 
  deleteDocument, 
  askQuestion,
  type ProcessedDocument 
} from '@/lib/documentApi'

interface ToolIndicator {
  id: string
  tool: string
  message: string
  timestamp: Date
  active: boolean
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  toolIndicators?: ToolIndicator[]
}

interface Document extends ProcessedDocument {
  processing?: boolean
  textLoaded?: boolean
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([])
  const [uploadedDocuments, setUploadedDocuments] = useState<Document[]>([])
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [previewDocument, setPreviewDocument] = useState<Document | null>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadDocuments()
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
    }
  }

  const loadDocuments = async () => {
    try {
      setIsLoadingDocuments(true)
      const docs = await fetchDocuments()
      setUploadedDocuments(docs.map(doc => ({
        ...doc,
        text: '',
        processing: false,
        textLoaded: false
      })))
    } catch (error) {
      console.error('Failed to load documents:', error)
      addSystemMessage(`Failed to load documents: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsLoadingDocuments(false)
    }
  }

  const handleDocumentProcessed = (processedDocument: ProcessedDocument) => {
    const doc: Document = {
      ...processedDocument,
      processing: false,
      textLoaded: true
    }
    setUploadedDocuments(prev => [...prev, doc])
    addSystemMessage(`Document "${processedDocument.name}" uploaded and processed successfully.`)
  }

  const handleUploadError = (error: string, fileName: string) => {
    addSystemMessage(`Upload error for "${fileName}": ${error}`)
  }

  const removeDocument = async (id: string) => {
    try {
      await deleteDocument(id)
      setUploadedDocuments(prev => prev.filter(doc => doc.id !== id))
      addSystemMessage('Document removed.')
    } catch (error) {
      addSystemMessage(`Failed to remove document: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const addSystemMessage = (content: string) => {
    const systemMessage: Message = {
      id: Date.now().toString(),
      role: 'assistant',
      content: `[System] ${content}`,
      timestamp: new Date()
    }
    setMessages(prev => [...prev, systemMessage])
  }

  const startNewChat = () => {
    setMessages([])
  }

  const handleSendMessage = async (content: string) => {
    if (!content.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date()
    }
    setMessages(prev => [...prev, userMessage])

    setIsLoading(true)
    setIsStreaming(false)
    
    // Create assistant message for streaming
    const assistantMessageId = (Date.now() + 1).toString()
    let assistantContent = ''
    const toolIndicators: ToolIndicator[] = []
    
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      toolIndicators: []
    }
    setMessages(prev => [...prev, assistantMessage])
    
    try {
      // Use selected documents if any, otherwise use all available documents
      let documentIds: string[] | undefined
      
      if (selectedDocumentIds.length > 0) {
        // Use only selected documents
        documentIds = selectedDocumentIds.filter(id => {
          const doc = uploadedDocuments.find(d => d.id === id)
          return doc && !doc.processing && !doc.error
        })
      } else {
        // Use all available documents
        documentIds = uploadedDocuments
          .filter(doc => !doc.processing && !doc.error)
          .map(doc => doc.id)
      }

      // Get answer from OpenAI using SSE streaming
      await askQuestion(
        content.trim(), 
        documentIds.length > 0 ? documentIds : undefined, 
        5,
        {
          onContent: (chunk: string) => {
            setIsStreaming(true)
            assistantContent += chunk
            setMessages(prev => prev.map(msg => 
              msg.id === assistantMessageId 
                ? { ...msg, content: assistantContent }
                : msg
            ))
          },
          onToolStart: (tool: string, message: string) => {
            const indicator: ToolIndicator = {
              id: `${Date.now()}-${tool}`,
              tool,
              message,
              timestamp: new Date(),
              active: true
            }
            setMessages(prev => prev.map(msg => 
              msg.id === assistantMessageId 
                ? { ...msg, toolIndicators: [...(msg.toolIndicators || []), indicator] }
                : msg
            ))
          },
          onToolEnd: (tool: string, message: string) => {
            setMessages(prev => prev.map(msg => {
              if (msg.id !== assistantMessageId) return msg
              const updatedIndicators = (msg.toolIndicators || []).map(ind => 
                ind.tool === tool && ind.active
                  ? { ...ind, active: false, message }
                  : ind
              )
              return { ...msg, toolIndicators: updatedIndicators }
            }))
          },
          onThinking: (message: string) => {
            // Could show a thinking indicator if needed
          },
          onDone: (data) => {
            setIsLoading(false)
            setIsStreaming(false)
          },
          onError: (error: string) => {
            setIsLoading(false)
            setIsStreaming(false)
            setMessages(prev => prev.map(msg => 
              msg.id === assistantMessageId 
                ? { 
                    ...msg, 
                    content: `I apologize, but I encountered an error while trying to answer your question: ${error}. Please make sure your OpenAI API key is configured correctly.`
                  }
                : msg
            ))
          }
        }
      )
    } catch (error) {
      console.error('Error in handleSendMessage:', error)
      setIsLoading(false)
      setMessages(prev => prev.map(msg => 
        msg.id === assistantMessageId 
          ? { 
              ...msg, 
              content: `I apologize, but I encountered an error while trying to answer your question: ${error instanceof Error ? error.message : 'Unknown error'}. Please make sure your OpenAI API key is configured correctly.`
            }
          : msg
      ))
    }
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-chat-bg">
      {/* Top Header Bar */}
      <header className="bg-chat-surface border-b border-chat-border px-6 py-4 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-white">
                <path d="M10 2L3 7v11h4v-6h6v6h4V7l-7-5z" fill="currentColor"/>
              </svg>
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-chat-primary to-chat-secondary bg-clip-text text-transparent">
              DocChat
            </h1>
          </div>
          <button 
            onClick={startNewChat}
            className="px-4 py-2 bg-chat-surface-elevated border border-chat-border rounded-lg text-chat-text text-sm font-medium hover:bg-chat-card-hover transition-colors flex items-center gap-2"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            New Chat
          </button>
        </div>
        
        <div className="flex items-center gap-3">
          <DocumentUpload 
            onDocumentProcessed={handleDocumentProcessed} 
            onUploadError={handleUploadError}
            compact={true}
          />
          {uploadedDocuments.length > 0 && (
            <div className="px-3 py-1.5 bg-chat-surface-elevated rounded-lg border border-chat-border">
              <span className="text-chat-text text-sm font-medium">
                {uploadedDocuments.filter(d => !d.processing && !d.error).length} document{uploadedDocuments.filter(d => !d.processing && !d.error).length !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>
      </header>

      <div className="flex h-[calc(100vh-73px)]">
        {/* Collapsible Sidebar */}
        <aside className="w-80 bg-chat-surface border-r border-chat-border flex flex-col overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-chat-input-border [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb:hover]:bg-chat-primary">
          {isLoadingDocuments ? (
            <div className="p-4 flex-1">
              <p className="text-chat-text-muted text-sm text-center">Loading documents...</p>
            </div>
          ) : uploadedDocuments.length > 0 ? (
            <div className="px-4 py-4 flex-1">
              <h3 className="text-chat-text-muted text-xs font-semibold uppercase mb-3 tracking-wide px-2">Your Documents</h3>
              <div className="space-y-2">
                {uploadedDocuments.map((doc) => (
                  <div 
                    key={doc.id} 
                    onClick={() => {
                      if (!doc.processing && !doc.error) {
                        setPreviewDocument(doc)
                      }
                    }}
                    className="bg-chat-card border border-chat-border rounded-xl p-3 hover:bg-chat-card-hover hover:border-chat-primary/50 transition-all group cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-chat-primary flex-shrink-0">
                            <path d="M14 2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z" fill="currentColor"/>
                            <path d="M4 6a2 2 0 0 1 2-2h8v8a2 2 0 0 1-2 2H4V6z" fill="currentColor" opacity="0.5"/>
                          </svg>
                          <span className="text-chat-text text-sm font-medium truncate" title={doc.name}>
                            {doc.name}
                          </span>
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-chat-text-muted text-xs">{formatFileSize(doc.size)}</span>
                          {doc.processing ? (
                            <span className="text-chat-text-muted text-xs">Processing...</span>
                          ) : doc.error ? (
                            <span className="text-red-400 text-xs" title={doc.error}>Error</span>
                          ) : doc.textLoaded && doc.text ? (
                            <span className="text-chat-primary text-xs font-medium">{doc.text.length.toLocaleString()} chars</span>
                          ) : (
                            <span className="text-green-400 text-xs font-medium">Ready</span>
                          )}
                        </div>
                      </div>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation()
                          removeDocument(doc.id)
                        }}
                        className="bg-transparent border-0 text-chat-text-muted text-lg cursor-pointer px-1 leading-none transition-colors hover:text-red-400 opacity-0 group-hover:opacity-100 flex-shrink-0"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-4 flex-1 flex items-center justify-center">
              <p className="text-chat-text-muted text-sm text-center">No documents yet. Upload one to get started!</p>
            </div>
          )}
        </aside>

        {/* Main chat area */}
        <main className="flex-1 flex flex-col bg-chat-bg relative">
          <div 
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto py-8 px-6 scroll-smooth [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-chat-input-border [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-chat-primary"
          >
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-10 text-chat-text max-w-2xl mx-auto">
                <div className="w-20 h-20 rounded-2xl bg-gradient-primary flex items-center justify-center mb-6 shadow-lg shadow-chat-primary/20">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" className="text-white">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <polyline points="17 8 12 3 7 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <h1 className="text-4xl font-bold mb-3 bg-gradient-to-r from-chat-primary to-chat-secondary bg-clip-text text-transparent">
                  Document Chat Assistant
                </h1>
                <p className="text-lg text-chat-text-muted my-4">Upload documents and ask questions to get AI-powered answers.</p>
                {uploadedDocuments.length === 0 ? (
                  <p className="mt-6 px-6 py-3 bg-chat-surface rounded-xl text-chat-text border border-chat-border">
                    Start by uploading a document using the upload button in the top bar.
                  </p>
                ) : uploadedDocuments.some(d => d.processing) ? (
                  <p className="mt-6 px-6 py-3 bg-chat-surface rounded-xl text-chat-text border border-chat-border">
                    Processing documents... Please wait.
                  </p>
                ) : null}
              </div>
            ) : null}
            
            <div className="max-w-4xl mx-auto space-y-4">
              {messages.map((message, index) => {
                const lastMessage = messages[messages.length - 1]
                const isLastMessage = message.id === lastMessage?.id
                const shouldShowStreaming = isStreaming && message.role === 'assistant' && isLastMessage
                return (
                  <ChatMessage 
                    key={message.id} 
                    message={message} 
                    isStreaming={shouldShowStreaming} 
                  />
                )
              })}
            </div>
          </div>

          <ChatInput
            disabled={isLoading || uploadedDocuments.length === 0 || uploadedDocuments.some(d => d.processing)}
            documents={uploadedDocuments}
            selectedDocumentIds={selectedDocumentIds}
            onSelectionChange={setSelectedDocumentIds}
            onSendMessage={handleSendMessage}
          />
        </main>
      </div>

      {/* Document Preview Modal */}
      <DocumentPreview
        document={previewDocument}
        isOpen={previewDocument !== null}
        onClose={() => setPreviewDocument(null)}
      />
    </div>
  )
}

