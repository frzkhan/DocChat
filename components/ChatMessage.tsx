'use client'

import React, { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface ChatMessageProps {
  message: Message
}

export default function ChatMessage({ message }: ChatMessageProps) {
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
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {message.content}
                </ReactMarkdown>
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

