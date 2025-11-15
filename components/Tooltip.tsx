'use client'

import React from 'react'

interface TooltipProps {
  content: string
  children: React.ReactNode
  position?: 'top' | 'bottom' | 'left' | 'right'
  disabled?: boolean
}

export default function Tooltip({ 
  content, 
  children, 
  position = 'top',
  disabled = false 
}: TooltipProps) {
  if (disabled) {
    return <>{children}</>
  }

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2'
  }

  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 -mt-px',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 -mb-px',
    left: 'left-full top-1/2 -translate-y-1/2 -ml-px',
    right: 'right-full top-1/2 -translate-y-1/2 -mr-px'
  }

  const arrowDirection = {
    top: {
      border: 'border-4 border-transparent border-t-chat-border',
      inner: 'border-4 border-transparent border-t-chat-surface-elevated -mt-1'
    },
    bottom: {
      border: 'border-4 border-transparent border-b-chat-border',
      inner: 'border-4 border-transparent border-b-chat-surface-elevated -mb-1'
    },
    left: {
      border: 'border-4 border-transparent border-l-chat-border',
      inner: 'border-4 border-transparent border-l-chat-surface-elevated -ml-1'
    },
    right: {
      border: 'border-4 border-transparent border-r-chat-border',
      inner: 'border-4 border-transparent border-r-chat-surface-elevated -mr-1'
    }
  }

  return (
    <div className="relative group">
      {children}
      <div className={`absolute ${positionClasses[position]} px-2 py-1 bg-chat-surface-elevated border border-chat-border rounded-lg text-xs text-chat-text whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg`}>
        {content}
        <div className={`absolute ${arrowClasses[position]}`}>
          <div className={arrowDirection[position].border}></div>
          <div className={arrowDirection[position].inner}></div>
        </div>
      </div>
    </div>
  )
}

