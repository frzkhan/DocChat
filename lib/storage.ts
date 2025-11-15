import { mkdir, readdir, stat, unlink } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

const DOCUMENTS_DIR = join(process.cwd(), 'storage', 'documents')
const METADATA_FILE = join(process.cwd(), 'storage', 'metadata.json')

export interface DocumentMetadata {
  id: string
  name: string
  fileName: string
  size: number
  type: string
  uploadedAt: string
  textLength: number
}

// Ensure storage directories exist
export async function ensureStorageExists() {
  if (!existsSync(DOCUMENTS_DIR)) {
    await mkdir(DOCUMENTS_DIR, { recursive: true })
  }
  const storageDir = join(process.cwd(), 'storage')
  if (!existsSync(storageDir)) {
    await mkdir(storageDir, { recursive: true })
  }
}

// Get metadata file path
export function getMetadataPath() {
  return METADATA_FILE
}

// Get documents directory
export function getDocumentsDir() {
  return DOCUMENTS_DIR
}

// Get document file path
export function getDocumentPath(fileName: string) {
  return join(DOCUMENTS_DIR, fileName)
}

// Read metadata
export async function readMetadata(): Promise<DocumentMetadata[]> {
  try {
    if (!existsSync(METADATA_FILE)) {
      return []
    }
    const { readFile } = await import('fs/promises')
    const content = await readFile(METADATA_FILE, 'utf-8')
    return JSON.parse(content)
  } catch (error) {
    console.error('Error reading metadata:', error)
    return []
  }
}

// Write metadata
export async function writeMetadata(metadata: DocumentMetadata[]) {
  try {
    const { writeFile } = await import('fs/promises')
    await writeFile(METADATA_FILE, JSON.stringify(metadata, null, 2), 'utf-8')
  } catch (error) {
    console.error('Error writing metadata:', error)
    throw error
  }
}

// Add document metadata
export async function addDocumentMetadata(metadata: DocumentMetadata) {
  const allMetadata = await readMetadata()
  allMetadata.push(metadata)
  await writeMetadata(allMetadata)
}

// Remove document metadata
export async function removeDocumentMetadata(id: string) {
  const allMetadata = await readMetadata()
  const filtered = allMetadata.filter(doc => doc.id !== id)
  await writeMetadata(filtered)
}

// Get document metadata by ID
export async function getDocumentMetadata(id: string): Promise<DocumentMetadata | null> {
  const allMetadata = await readMetadata()
  return allMetadata.find(doc => doc.id === id) || null
}

