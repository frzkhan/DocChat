'use client'

import { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'

interface MermaidDiagramProps {
  chart: string
}

export default function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isInitialized, setIsInitialized] = useState(false)
  const renderTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (!chart) return

    // Clear any pending render timeout
    if (renderTimeoutRef.current) {
      clearTimeout(renderTimeoutRef.current)
      renderTimeoutRef.current = null
    }

    // Initialize Mermaid only once
    if (!isInitialized) {
      mermaid.initialize({ 
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'loose',
        fontFamily: 'inherit',
      })
      setIsInitialized(true)
    }

    setIsLoading(true)
    setError(null)

    // Wait for content to stabilize (SSE streaming delay)
    // Use a debounce delay to ensure content is complete before rendering
    // This prevents rendering while content is still being streamed
    renderTimeoutRef.current = setTimeout(() => {
      if (!ref.current) {
        setIsLoading(false)
        return
      }

      const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`
      
      // Clear previous content and set the chart
      ref.current.id = id
      ref.current.className = 'mermaid'
      ref.current.textContent = chart.trim()

      // Additional small delay to ensure DOM is ready
      setTimeout(() => {
        if (!ref.current) {
          setIsLoading(false)
          return
        }

        // Render the diagram
        mermaid.run({
          nodes: [ref.current!],
        }).then(() => {
          setIsLoading(false)
        }).catch((err) => {
          console.error('Mermaid rendering error:', err)
          const errorMessage = err instanceof Error ? err.message : 'Unknown error'
          // Extract more helpful error information
          let displayError = 'Failed to render diagram'
          if (errorMessage.includes('syntax') || errorMessage.includes('parse')) {
            displayError = 'Syntax error in diagram. Check that xychart syntax is correct: x-axis "Label" ["Cat1", "Cat2"], y-axis "Label" 0 --> max, bar [val1, val2]'
          } else if (errorMessage) {
            displayError = `Error: ${errorMessage.substring(0, 100)}`
          }
          setError(displayError)
          setIsLoading(false)
        })
      }, 50)
    }, 500) // 500ms delay to wait for SSE to finish

    // Cleanup function
    return () => {
      if (renderTimeoutRef.current) {
        clearTimeout(renderTimeoutRef.current)
      }
    }
  }, [chart, isInitialized])

  if (error) {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm my-4">
        <p className="font-medium mb-1">Diagram Error</p>
        <p className="text-xs">{error}</p>
        <details className="mt-2">
          <summary className="cursor-pointer text-xs hover:text-red-300">Show code</summary>
          <pre className="mt-2 text-xs overflow-auto bg-chat-surface p-2 rounded border border-red-500/20">
            {chart}
          </pre>
        </details>
      </div>
    )
  }

  return (
    <div className="my-4 relative">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-chat-card/50 rounded-lg z-10">
          <div className="text-chat-text-muted text-sm flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Rendering diagram...
          </div>
        </div>
      )}
      <div 
        ref={ref} 
        className="mermaid flex justify-center overflow-x-auto"
        style={{ minHeight: isLoading ? '200px' : 'auto' }}
      />
    </div>
  )
}

