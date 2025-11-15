import { NextRequest, NextResponse } from 'next/server'
import { searchSimilarChunks } from '@/lib/fileVectordb'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { query, limit = 5, documentIds } = body

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Query is required and must be a string' },
        { status: 400 }
      )
    }

    const chunks = await searchSimilarChunks(query, limit, documentIds)

    return NextResponse.json({
      success: true,
      chunks: chunks.map(chunk => ({
        id: chunk.id,
        documentId: chunk.documentId,
        documentName: chunk.documentName,
        text: chunk.text,
        chunkIndex: chunk.chunkIndex
      }))
    })
  } catch (error) {
    console.error('Search error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Search failed' },
      { status: 500 }
    )
  }
}

