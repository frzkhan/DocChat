import { NextRequest, NextResponse } from 'next/server'
import { readFile, unlink } from 'fs/promises'
import { getDocumentMetadata, removeDocumentMetadata, getDocumentPath } from '@/lib/storage'
import { deleteDocumentChunks } from '@/lib/fileVectordb'

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

    // Read the file and extract text
    const filePath = getDocumentPath(metadata.fileName)
    const buffer = await readFile(filePath)
    
    // Extract text based on file type
    let text = ''
    const fileExtension = '.' + metadata.name.split('.').pop()?.toLowerCase()
    
    if (fileExtension === '.pdf') {
      // Dynamic import to avoid webpack bundling issues
      let parser: any = null
      try {
        const pdfParseModule = await import('pdf-parse')
        const PDFParse = pdfParseModule.PDFParse || (pdfParseModule as any).default?.PDFParse || (pdfParseModule as any).default
        parser = new PDFParse({ data: buffer })
        const result = await parser.getText()
        await parser.destroy()
        text = result.text.trim()
      } catch (error) {
        // Clean up parser if it was created
        if (parser) {
          try {
            await parser.destroy()
          } catch (destroyError) {
            // Ignore destroy errors
          }
        }
        throw error
      }
    } else if (fileExtension === '.txt' || fileExtension === '.md') {
      text = buffer.toString('utf-8')
    } else {
      text = '[Text extraction not available for this file type]'
    }

    return NextResponse.json({
      success: true,
      document: {
        id: metadata.id,
        name: metadata.name,
        text: text,
        size: metadata.size,
        type: metadata.type,
        processedAt: new Date(metadata.uploadedAt)
      }
    })
  } catch (error) {
    console.error('Error fetching document:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch document' },
      { status: 500 }
    )
  }
}

export async function DELETE(
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

    // Delete the file
    const filePath = getDocumentPath(metadata.fileName)
    await unlink(filePath).catch((error) => {
      console.warn('File not found during delete:', filePath, error)
    })

    // Delete document chunks from vector database
    try {
      await deleteDocumentChunks(id)
    } catch (error) {
      console.error('Error deleting document chunks:', error)
    }

    // Remove metadata
    await removeDocumentMetadata(id)

    return NextResponse.json({
      success: true,
      message: 'Document deleted successfully'
    })
  } catch (error) {
    console.error('Error deleting document:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to delete document' },
      { status: 500 }
    )
  }
}

