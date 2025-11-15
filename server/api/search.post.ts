import { searchSimilarChunks } from '../utils/fileVectordb'

export default defineEventHandler(async (event) => {
  try {
    setHeader(event, 'Content-Type', 'application/json')
    
    const body = await readBody(event)
    const { query, limit = 5, documentIds } = body

    if (!query || typeof query !== 'string') {
      setResponseStatus(event, 400)
      return {
        success: false,
        error: 'Query is required and must be a string'
      }
    }

    const chunks = await searchSimilarChunks(query, limit, documentIds)

    return {
      success: true,
      chunks: chunks.map(chunk => ({
        id: chunk.id,
        documentId: chunk.documentId,
        documentName: chunk.documentName,
        text: chunk.text,
        chunkIndex: chunk.chunkIndex
      }))
    }
  } catch (error) {
    console.error('Search error:', error)
    setResponseStatus(event, 500)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Search failed'
    }
  }
})
