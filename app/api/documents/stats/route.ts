import { NextResponse } from 'next/server'
import { getDocumentStats } from '@/lib/fileVectordb'

export async function GET() {
  try {
    const stats = await getDocumentStats()
    
    return NextResponse.json({
      success: true,
      stats
    })
  } catch (error) {
    console.error('Error fetching document stats:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to fetch document stats' 
      },
      { status: 500 }
    )
  }
}

