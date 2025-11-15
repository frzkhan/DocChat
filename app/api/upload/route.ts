import { NextRequest, NextResponse } from 'next/server'
import { writeFile } from 'fs/promises'
import { ensureStorageExists, getDocumentPath, addDocumentMetadata } from '@/lib/storage'
import type { DocumentMetadata } from '@/lib/storage'
import { indexDocument } from '@/lib/fileVectordb'

export async function POST(request: NextRequest) {
  try {
    // Ensure storage exists
    await ensureStorageExists()
    
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      )
    }

    // Validate file size (50MB limit)
    const MAX_FILE_SIZE = 50 * 1024 * 1024
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: `File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit` },
        { status: 400 }
      )
    }

    // Validate file type
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase()
    const SUPPORTED_TYPES = ['.pdf', '.txt', '.doc', '.docx', '.md', '.xlsx', '.xls', '.csv']
    if (!SUPPORTED_TYPES.includes(fileExtension)) {
      return NextResponse.json(
        { success: false, error: `File type ${fileExtension} is not supported. Supported types: ${SUPPORTED_TYPES.join(', ')}` },
        { status: 400 }
      )
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Extract text based on file type
    let extractedText = ''
    
    try {
      switch (fileExtension) {
        case '.txt':
        case '.md':
          extractedText = buffer.toString('utf-8')
          break

        case '.pdf':
          extractedText = await extractTextFromPDF(buffer)
          break

        case '.doc':
        case '.docx':
          extractedText = await extractTextFromDOCX(buffer)
          break

        case '.xlsx':
        case '.xls':
          extractedText = await extractTextFromExcel(buffer)
          break

        case '.csv':
          extractedText = buffer.toString('utf-8')
          break

        default:
          throw new Error(`Unsupported file type: ${fileExtension}`)
      }

      // Generate unique file name and document ID
      const documentId = Date.now().toString() + Math.random().toString(36).substr(2, 9)
      const fileName = `${documentId}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
      const filePath = getDocumentPath(fileName)

      // Save file to storage
      await writeFile(filePath, buffer)

      // Save metadata
      const metadata: DocumentMetadata = {
        id: documentId,
        name: file.name,
        fileName: fileName,
        size: file.size,
        type: file.type || fileExtension,
        uploadedAt: new Date().toISOString(),
        textLength: extractedText.length
      }
      await addDocumentMetadata(metadata)

      // Return response immediately, then index in background
      const response = {
        success: true,
        document: {
          id: documentId,
          name: file.name,
          text: extractedText,
          size: file.size,
          type: file.type || fileExtension,
          uploadedAt: metadata.uploadedAt
        }
      }

      // Index document in background (non-blocking)
      indexDocument(documentId, file.name, extractedText).catch((error) => {
        console.error('[UPLOAD] Error indexing document:', error)
      })

      return NextResponse.json(response)
    } catch (processingError) {
      throw processingError
    }
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to process file' },
      { status: 500 }
    )
  }
}

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  let parser: any = null
  try {
    // Dynamic import to avoid webpack bundling issues
    const pdfParseModule = await import('pdf-parse')
    const PDFParse = pdfParseModule.PDFParse || (pdfParseModule as any).default?.PDFParse || (pdfParseModule as any).default
    parser = new PDFParse({ data: buffer })
    const result = await parser.getText()
    await parser.destroy()
    return result.text.trim()
  } catch (error) {
    // Clean up parser if it was created
    if (parser) {
      try {
        await parser.destroy()
      } catch (destroyError) {
        // Ignore destroy errors
      }
    }
    console.error('PDF extraction error:', error)
    throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

async function extractTextFromDOCX(buffer: Buffer): Promise<string> {
  try {
    // Dynamic import to avoid webpack bundling issues
    const mammoth = await import('mammoth')
    
    // Try extractRawText first (faster, but less formatting)
    let result
    try {
      result = await mammoth.extractRawText({ buffer })
    } catch (rawTextError) {
      // If extractRawText fails, try convertToHtml and extract text from HTML
      console.warn('extractRawText failed, trying convertToHtml:', rawTextError)
      const htmlResult = await mammoth.convertToHtml({ buffer })
      // Extract text from HTML by removing tags
      const textFromHtml = htmlResult.value
        .replace(/<[^>]*>/g, ' ') // Remove HTML tags
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim()
      
      if (!textFromHtml || textFromHtml.length === 0) {
        throw new Error('No text content found in DOCX file after HTML conversion')
      }
      
      return textFromHtml
    }
    
    const text = result.value.trim()
    
    if (!text || text.length === 0) {
      // Fallback: try HTML conversion
      console.warn('extractRawText returned empty, trying convertToHtml')
      const htmlResult = await mammoth.convertToHtml({ buffer })
      const textFromHtml = htmlResult.value
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim()
      
      if (!textFromHtml || textFromHtml.length === 0) {
        throw new Error('No text content found in DOCX file')
      }
      
      return textFromHtml
    }
    
    return text
  } catch (error) {
    console.error('DOCX extraction error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    
    // Provide more helpful error message
    if (errorMessage.includes('mammoth') || errorMessage.includes('parse')) {
      throw new Error(`Failed to parse DOCX file. The file may be corrupted or in an unsupported format. Original error: ${errorMessage}`)
    }
    
    throw new Error(`Failed to extract text from DOCX: ${errorMessage}`)
  }
}

async function extractTextFromExcel(buffer: Buffer): Promise<string> {
  try {
    // Dynamic import to avoid webpack bundling issues
    const XLSX = await import('xlsx')
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    
    const textParts: string[] = []
    
    // Extract text from all sheets
    workbook.SheetNames.forEach((sheetName) => {
      const worksheet = workbook.Sheets[sheetName]
      const sheetData = XLSX.utils.sheet_to_csv(worksheet)
      if (sheetData && sheetData.trim().length > 0) {
        textParts.push(`Sheet: ${sheetName}\n${sheetData}`)
      }
    })
    
    const text = textParts.join('\n\n').trim()
    
    if (!text || text.length === 0) {
      throw new Error('No text content found in Excel file')
    }
    
    return text
  } catch (error) {
    console.error('Excel extraction error:', error)
    throw new Error(`Failed to extract text from Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

