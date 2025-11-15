export interface TextChunk {
  text: string
  startIndex: number
  endIndex: number
  chunkIndex: number
}

export function chunkText(
  text: string,
  chunkSize: number = 1000,
  overlap: number = 200
): TextChunk[] {
  // Validate inputs
  if (!text || text.length === 0) {
    return []
  }
  
  if (chunkSize <= 0) {
    throw new Error('chunkSize must be greater than 0')
  }
  
  if (overlap < 0) {
    throw new Error('overlap must be non-negative')
  }
  
  if (overlap >= chunkSize) {
    throw new Error('overlap must be less than chunkSize to prevent infinite loops')
  }

  const chunks: TextChunk[] = []
  let startIndex = 0
  let chunkIndex = 0
  const maxChunks = Math.ceil(text.length / (chunkSize - overlap)) + 100 // Safety limit
  let iterations = 0

  while (startIndex < text.length && iterations < maxChunks) {
    const endIndex = Math.min(startIndex + chunkSize, text.length)
    const chunkText = text.slice(startIndex, endIndex)
    
    // Only add non-empty chunks
    if (chunkText.length > 0) {
      chunks.push({
        text: chunkText,
        startIndex,
        endIndex,
        chunkIndex
      })
    }
    
    // Calculate next start index, ensuring we always advance
    const nextStartIndex = endIndex - overlap
    if (nextStartIndex <= startIndex) {
      // Safety check: ensure we always advance
      startIndex = endIndex
    } else {
      startIndex = nextStartIndex
    }
    
    chunkIndex++
    iterations++
  }

  if (iterations >= maxChunks) {
    console.warn(`[chunkText] Hit safety limit of ${maxChunks} iterations. Text length: ${text.length}`)
  }

  return chunks
}

