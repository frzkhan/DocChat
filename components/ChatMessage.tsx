'use client'

import React, { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import MermaidDiagram from './MermaidDiagram'

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

interface ChatMessageProps {
  message: Message
  isStreaming?: boolean
}

export default function ChatMessage({ message, isStreaming = false }: ChatMessageProps) {
  const [copied, setCopied] = useState(false)

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    })
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  return (
    <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} group`}>
      <div className={`flex gap-4 max-w-[85%] ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
        <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center shadow-lg ${
          message.role === 'user' 
            ? 'bg-gradient-to-br from-chat-primary to-chat-secondary' 
            : 'bg-gradient-to-br from-chat-secondary to-chat-accent'
        }`}>
          {message.role === 'user' ? (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-white">
              <path d="M10 10C12.7614 10 15 7.76142 15 5C15 2.23858 12.7614 0 10 0C7.23858 0 5 2.23858 5 5C5 7.76142 7.23858 10 10 10Z" fill="currentColor"/>
              <path d="M10 12C5.58172 12 2 14.6863 2 18V20H18V18C18 14.6863 14.4183 12 10 12Z" fill="currentColor"/>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-white">
              <path d="M10 2L3 7v11h4v-6h6v6h4V7l-7-5z" fill="currentColor"/>
            </svg>
          )}
        </div>
        <div className={`flex-1 min-w-0 flex gap-2 ${message.role === 'user' ? 'flex-row-reverse items-start' : 'flex-row items-start'}`}>
          <div className={`flex-1 min-w-0 ${message.role === 'user' ? 'flex items-end flex-col' : ''}`}>
            {/* Tool Indicators */}
            {message.role === 'assistant' && message.toolIndicators && message.toolIndicators.length > 0 && (
              <div className="mb-2 space-y-1.5">
                {message.toolIndicators.map((indicator) => (
                  <div
                    key={indicator.id}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-all ${
                      indicator.active
                        ? 'bg-chat-primary/10 border-chat-primary/30 text-chat-primary'
                        : 'bg-chat-surface border-chat-border text-chat-text-muted'
                    }`}
                  >
                    {indicator.tool === 'web_search' ? (
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={indicator.active ? 'animate-spin' : ''}>
                        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" fill="none" strokeDasharray="4 4" opacity="0.3"/>
                        <path d="M8 2L8 6M8 10L8 14M2 8L6 8M10 8L14 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    ) : indicator.tool === 'document_search' ? (
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={indicator.active ? 'animate-pulse' : ''}>
                        <path d="M14 2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z" fill="currentColor" opacity="0.2"/>
                        <path d="M4 6a2 2 0 0 1 2-2h8v8a2 2 0 0 1-2 2H4V6z" fill="currentColor"/>
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                        <path d="M8 4V8L10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    )}
                    <span className="flex-1">{indicator.message}</span>
                    {indicator.active && (
                      <div className="w-2 h-2 rounded-full bg-chat-primary animate-pulse"></div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className={`rounded-2xl px-4 py-3 shadow-lg ${
              message.role === 'user'
                ? 'bg-gradient-to-br from-chat-primary to-chat-secondary text-white'
                : 'bg-chat-card border border-chat-border text-chat-text'
            }`}>
              <div 
                className={`text-base leading-[1.7] break-words markdown-content ${
                  message.role === 'user' ? 'text-white' : 'text-chat-text'
                }`}
              >
                {message.content ? (
                  <>
                    <ReactMarkdown 
                      remarkPlugins={[remarkGfm]}
                      components={{
                        code({ node, inline, className, children, ...props }) {
                          const match = /language-(\w+)/.exec(className || '')
                          const language = match && match[1]
                          
                          if (!inline && language === 'mermaid') {
                            return (
                              <MermaidDiagram chart={String(children).replace(/\n$/, '')} />
                            )
                          }
                          
                          // Default code block rendering
                          return (
                            <code className={className} {...props}>
                              {children}
                            </code>
                          )
                        }
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                    {isStreaming && message.role === 'assistant' && (
                      <span className="inline-block w-0.5 h-4 ml-1 bg-chat-primary align-middle" style={{ animation: 'blink 1s ease-in-out infinite' }}></span>
                    )}
                  </>
                ) : (
                  <span className="text-chat-text-muted italic flex items-center gap-1.5">
                    <span>Thinking</span>
                    <span className="flex gap-0.5">
                      <span className="w-1 h-1 rounded-full bg-chat-text-muted" style={{ animation: 'pulse 1.4s ease-in-out infinite', animationDelay: '0s' }}></span>
                      <span className="w-1 h-1 rounded-full bg-chat-text-muted" style={{ animation: 'pulse 1.4s ease-in-out infinite', animationDelay: '0.2s' }}></span>
                      <span className="w-1 h-1 rounded-full bg-chat-text-muted" style={{ animation: 'pulse 1.4s ease-in-out infinite', animationDelay: '0.4s' }}></span>
                    </span>
                  </span>
                )}
              </div>
            </div>
            <div className={`mt-1.5 text-xs text-chat-text-muted ${message.role === 'user' ? 'text-right' : 'text-left'}`}>
              {formatTime(message.timestamp)}
            </div>
          </div>
          <button
            onClick={handleCopy}
            className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 hover:scale-110 active:scale-95 self-start ${
              'bg-chat-surface hover:bg-chat-surface-elevated text-chat-text-muted hover:text-chat-text border border-chat-border'
            }`}
            aria-label="Copy message"
            title={copied ? 'Copied!' : 'Copy message'}
          >
            {copied ? (
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" className="text-green-400">
                <path d="M13.5 4L6 11.5L2.5 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                <path d="M5.5 3.5H11.5C12.0523 3.5 12.5 3.94772 12.5 4.5V11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M3.5 5.5H9.5C10.0523 5.5 10.5 5.94772 10.5 6.5V13.5C10.5 14.0523 10.0523 14.5 9.5 14.5H3.5C2.94772 14.5 2.5 14.0523 2.5 13.5V6.5C2.5 5.94772 2.94772 5.5 3.5 5.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

