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
  const chunks: TextChunk[] = []
  let startIndex = 0
  let chunkIndex = 0

  while (startIndex < text.length) {
    const endIndex = Math.min(startIndex + chunkSize, text.length)
    const chunkText = text.slice(startIndex, endIndex)
    
    chunks.push({
      text: chunkText,
      startIndex,
      endIndex,
      chunkIndex
    })

    startIndex = endIndex - overlap
    chunkIndex++
  }

  return chunks
}
