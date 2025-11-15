import { writeFile } from 'fs/promises'
import { join } from 'path'
import { PDFParse } from 'pdf-parse'
import { ensureStorageExists, getDocumentPath, addDocumentMetadata, getDocumentsDir } from '../utils/storage'
import type { DocumentMetadata } from '../utils/storage'
import { indexDocument } from '../utils/fileVectordb'

interface UploadResponse {
  success: boolean
  document?: {
    id: string
    name: string
    text: string
    size: number
    type: string
    uploadedAt: string
  }
  error?: string
}

export default defineEventHandler(async (event): Promise<UploadResponse> => {
  try {
    // Set content type to JSON
    setHeader(event, 'Content-Type', 'application/json')
    
    // Ensure storage exists
    await ensureStorageExists()
    
    const formData = await readFormData(event)
    const file = formData.get('file') as File

    if (!file) {
      setResponseStatus(event, 400)
      return {
        success: false,
        error: 'No file provided'
      }
    }

    // Validate file size (50MB limit)
    const MAX_FILE_SIZE = 50 * 1024 * 1024
    if (file.size > MAX_FILE_SIZE) {
      setResponseStatus(event, 400)
      return {
        success: false,
        error: `File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`
      }
    }

    // Validate file type
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase()
    const SUPPORTED_TYPES = ['.pdf', '.txt', '.doc', '.docx', '.md']
    if (!SUPPORTED_TYPES.includes(fileExtension)) {
      setResponseStatus(event, 400)
      return {
        success: false,
        error: `File type ${fileExtension} is not supported. Supported types: ${SUPPORTED_TYPES.join(', ')}`
      }
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

      // Index document in LanceDB for semantic search (non-blocking)
      // Don't await - let it run in background so upload response returns immediately
      indexDocument(documentId, file.name, extractedText).catch((error) => {
        console.error('[UPLOAD] Error indexing document in LanceDB:', error)
        // Don't fail the upload if indexing fails, but log the error
      })

      return response
    } catch (processingError) {
      throw processingError
    }
  } catch (error) {
    console.error('Upload error:', error)
    setResponseStatus(event, 500)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process file'
    }
  }
})

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    const parser = new PDFParse({ data: buffer })
    const data = await parser.getText()
    return data.text.trim()
  } catch (error) {
    console.error('PDF extraction error:', error)
    throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

async function extractTextFromDOCX(buffer: Buffer): Promise<string> {
  try {
    // Dynamic import to avoid webpack bundling issues
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ buffer })
    const text = result.value.trim()
    
    if (!text || text.length === 0) {
      throw new Error('No text content found in DOCX file')
    }
    
    return text
  } catch (error) {
    console.error('DOCX extraction error:', error)
    throw new Error(`Failed to extract text from DOCX: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}