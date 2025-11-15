export interface ProcessedDocument {
  id: string
  name: string
  text: string
  size: number
  type: string
  processedAt: Date
  error?: string
}

export interface UploadProgress {
  loaded: number
  total: number
  percentage: number
}

export async function uploadDocument(
  file: File,
  onProgress?: (progress: UploadProgress) => void
): Promise<ProcessedDocument> {
  const formData = new FormData()
  formData.append('file', file)

  // Create XMLHttpRequest for progress tracking
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    // Track upload progress
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress({
          loaded: e.loaded,
          total: e.total,
          percentage: Math.round((e.loaded / e.total) * 100)
        })
      }
    })

    xhr.addEventListener('load', () => {
      if (xhr.status === 200) {
        try {
          const responseText = xhr.responseText
          if (!responseText) {
            reject(new Error('Empty server response'))
            return
          }
          
          const response = JSON.parse(responseText)
          if (response.success && response.document) {
            resolve({
              id: response.document.id,
              name: response.document.name,
              text: response.document.text,
              size: response.document.size,
              type: response.document.type,
              processedAt: new Date()
            })
          } else {
            reject(new Error(response.error || 'Upload failed'))
          }
        } catch (error) {
          console.error('Failed to parse server response:', xhr.responseText)
          reject(new Error(`Failed to parse server response: ${error instanceof Error ? error.message : 'Unknown error'}. Response: ${xhr.responseText.substring(0, 200)}`))
        }
      } else {
        try {
          const responseText = xhr.responseText
          if (responseText) {
            const error = JSON.parse(responseText)
            reject(new Error(error.error || `Upload failed with status ${xhr.status}`))
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`))
          }
        } catch {
          reject(new Error(`Upload failed with status ${xhr.status}. Response: ${xhr.responseText.substring(0, 200)}`))
        }
      }
    })

    xhr.addEventListener('error', () => {
      reject(new Error('Network error during upload'))
    })

    xhr.addEventListener('abort', () => {
      reject(new Error('Upload aborted'))
    })

    xhr.open('POST', '/api/upload')
    xhr.send(formData)
  })
}

export async function fetchDocuments(): Promise<ProcessedDocument[]> {
  try {
    const response = await fetch('/api/documents')
    const data = await response.json()
    
    if (data.success && data.documents) {
      return data.documents.map((doc: any) => ({
        id: doc.id,
        name: doc.name,
        text: '', // Text is loaded separately when needed
        size: doc.size,
        type: doc.type,
        processedAt: new Date(doc.processedAt)
      }))
    }
    
    throw new Error(data.error || 'Failed to fetch documents')
  } catch (error) {
    console.error('Error fetching documents:', error)
    throw error
  }
}

export async function fetchDocumentText(id: string): Promise<string> {
  try {
    const response = await fetch(`/api/documents/${id}`)
    const data = await response.json()
    
    if (data.success && data.document) {
      return data.document.text
    }
    
    throw new Error(data.error || 'Failed to fetch document text')
  } catch (error) {
    console.error('Error fetching document text:', error)
    throw error
  }
}

export async function deleteDocument(id: string): Promise<void> {
  try {
    const response = await fetch(`/api/documents/${id}`, {
      method: 'DELETE'
    })
    const data = await response.json()
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to delete document')
    }
  } catch (error) {
    console.error('Error deleting document:', error)
    throw error
  }
}

export async function searchDocuments(
  query: string,
  limit: number = 5,
  documentIds?: string[]
): Promise<Array<{ documentId: string; documentName: string; text: string; chunkIndex: number }>> {
  try {
    const response = await fetch('/api/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        limit,
        documentIds: documentIds && documentIds.length > 0 ? documentIds : undefined
      })
    })
    const data = await response.json()
    
    if (data.success && data.chunks) {
      return data.chunks
    }
    
    throw new Error(data.error || 'Search failed')
  } catch (error) {
    console.error('Error searching documents:', error)
    throw error
  }
}

export async function askQuestion(
  question: string,
  documentIds?: string[],
  limit: number = 5
): Promise<{ answer: string; hasContext: boolean; chunksUsed: number }> {
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        question,
        documentIds: documentIds && documentIds.length > 0 ? documentIds : undefined,
        limit
      })
    })
    const data = await response.json()
    
    if (data.success) {
      return {
        answer: data.answer,
        hasContext: data.hasContext || false,
        chunksUsed: data.chunksUsed || 0
      }
    }
    
    throw new Error(data.error || 'Failed to get answer')
  } catch (error) {
    console.error('Error asking question:', error)
    throw error
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
}

