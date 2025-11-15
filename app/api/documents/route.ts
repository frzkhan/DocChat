import { NextResponse } from 'next/server'
import { readMetadata } from '@/lib/storage'

export async function GET() {
  try {
    const metadata = await readMetadata()
    
    return NextResponse.json({
      success: true,
      documents: metadata.map(doc => ({
        id: doc.id,
        name: doc.name,
        size: doc.size,
        type: doc.type,
        processedAt: doc.uploadedAt,
        textLength: doc.textLength
      }))
    })
  } catch (error) {
    console.error('Error fetching documents:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch documents' },
      { status: 500 }
    )
  }
}

