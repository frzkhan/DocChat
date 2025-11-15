import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { getDocumentMetadata, getDocumentPath } from '@/lib/storage'

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id
    
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Document ID is required' },
        { status: 400 }
      )
    }

    const metadata = await getDocumentMetadata(id)
    
    if (!metadata) {
      return NextResponse.json(
        { success: false, error: 'Document not found' },
        { status: 404 }
      )
    }

    // Read the file
    const filePath = getDocumentPath(metadata.fileName)
    const buffer = await readFile(filePath)
    
    // Determine content type based on file extension
    const fileExtension = '.' + metadata.name.split('.').pop()?.toLowerCase()
    const contentTypeMap: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.csv': 'text/csv',
    }
    
    const contentType = contentTypeMap[fileExtension] || 'application/octet-stream'
    
    // Return the file with appropriate headers
    // Add CORS headers to allow iframe viewers (Microsoft Office Online, Google Docs Viewer) to access the file
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${metadata.name}"`,
        'Content-Length': buffer.length.toString(),
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  } catch (error) {
    console.error('Error serving file:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to serve file' },
      { status: 500 }
    )
  }
}

