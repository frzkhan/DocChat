import { unlink } from 'fs/promises'
import { getDocumentMetadata, removeDocumentMetadata, getDocumentPath } from '../../utils/storage'
import { deleteDocumentChunks } from '../../utils/fileVectordb'

export default defineEventHandler(async (event) => {
  try {
    const id = getRouterParam(event, 'id')
    
    if (!id) {
      setResponseStatus(event, 400)
      return {
        success: false,
        error: 'Document ID is required'
      }
    }

    const metadata = await getDocumentMetadata(id)
    
    if (!metadata) {
      setResponseStatus(event, 404)
      return {
        success: false,
        error: 'Document not found'
      }
    }

    // Delete the file
    const filePath = getDocumentPath(metadata.fileName)
    await unlink(filePath).catch((error) => {
      // Log but don't fail if file doesn't exist
      console.warn('File not found during delete:', filePath, error)
    })

    // Delete document chunks from LanceDB
    try {
      await deleteDocumentChunks(id)
    } catch (error) {
      console.error('Error deleting document chunks:', error)
      // Don't fail the delete if chunk removal fails
    }

    // Remove metadata
    await removeDocumentMetadata(id)

    return {
      success: true,
      message: 'Document deleted successfully'
    }
  } catch (error) {
    console.error('Error deleting document:', error)
    setResponseStatus(event, 500)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete document'
    }
  }
})
