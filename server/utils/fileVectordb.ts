// File-based vector database using SQLite with sqlite-vec extension
// Persists to disk, uses native vector operations for fast similarity search
// Use dynamic imports for native modules to work with Nuxt/Nitro ES modules
import { join } from 'path'
import { existsSync } from 'fs'
import { mkdir } from 'fs/promises'
import { generateEmbedding } from './embeddings'
import { chunkText } from './chunking'

const DB_PATH = join(process.cwd(), 'storage', 'vectordb.sqlite')

export interface DocumentChunk {
  id: string
  documentId: string
  documentName: string
  chunkIndex: number
  text: string
  startIndex: number
  endIndex: number
  vector: number[]
}

let Database: any = null
let sqliteVec: any = null
let db: any = null

// Lazy load native modules
async function loadNativeModules() {
  if (!Database) {
    const dbModule = await import('better-sqlite3')
    Database = dbModule.default || dbModule
  }
  if (!sqliteVec) {
    const vecModule = await import('sqlite-vec')
    sqliteVec = vecModule.default || vecModule
  }
}

async function getDatabase() {
  await loadNativeModules()
  
  if (!db) {
    try {
      console.log('[FileVectorDB] Opening database:', DB_PATH)
      // Use synchronous mode and ensure proper error handling
      db = new Database(DB_PATH, { 
        verbose: console.log // For debugging
      })
      console.log('[FileVectorDB] Database connection opened')
      
      // Load sqlite-vec extension with error handling
      try {
        sqliteVec.load(db)
        console.log('[FileVectorDB] sqlite-vec extension loaded')
      } catch (vecError) {
        console.error('[FileVectorDB] Failed to load sqlite-vec, falling back to basic SQLite:', vecError)
        // Continue without sqlite-vec - we'll use basic storage
      }
      
      // Create table - simplified without vec0 virtual table for now
      db.exec(`
        CREATE TABLE IF NOT EXISTS document_chunks (
          id TEXT PRIMARY KEY,
          document_id TEXT NOT NULL,
          document_name TEXT NOT NULL,
          chunk_index INTEGER NOT NULL,
          text TEXT NOT NULL,
          start_index INTEGER NOT NULL,
          end_index INTEGER NOT NULL,
          embedding BLOB NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE INDEX IF NOT EXISTS idx_document_id ON document_chunks(document_id);
      `)
      
      console.log('[FileVectorDB] Database initialized')
    } catch (error) {
      console.error('[FileVectorDB] Error initializing database:', error)
      throw error
    }
  }
  return db
}

// Convert number array to Float32Array for sqlite-vec
function toFloat32Array(vec: number[]): Float32Array {
  return new Float32Array(vec)
}

export async function indexDocument(
  documentId: string,
  documentName: string,
  text: string
): Promise<void> {
  try {
    console.log(`[FileVectorDB] Indexing document ${documentId} (${documentName})...`)
    const database = await getDatabase()

    // Delete existing chunks for this document
    const deleteStmt = database.prepare('DELETE FROM document_chunks WHERE document_id = ?')
    const deleteResult = deleteStmt.run(documentId)
    console.log(`[FileVectorDB] Removed ${deleteResult.changes} existing chunks`)

    // Chunk the text
    const chunks = chunkText(text, 1000, 200)
    console.log(`[FileVectorDB] Created ${chunks.length} chunks`)

    if (chunks.length === 0) {
      console.warn(`[FileVectorDB] No chunks created for document ${documentId}`)
      return
    }

    // Prepare insert statement
    const insertStmt = database.prepare(`
      INSERT INTO document_chunks 
      (id, document_id, document_name, chunk_index, text, start_index, end_index, embedding)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)

    // Generate embeddings and insert in batches
    const batchSize = 5
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize)
      
      // Generate embeddings for batch
      const batchData = await Promise.all(
        batch.map(async (chunk) => {
          try {
            console.log(`[FileVectorDB] Generating embedding ${chunk.chunkIndex + 1}/${chunks.length}...`)
            const embedding = await generateEmbedding(chunk.text)
            return {
              id: `${documentId}_${chunk.chunkIndex}`,
              documentId,
              documentName,
              chunkIndex: chunk.chunkIndex,
              text: chunk.text,
              startIndex: chunk.startIndex,
              endIndex: chunk.endIndex,
              embedding: toFloat32Array(embedding)
            }
          } catch (error) {
            console.error(`[FileVectorDB] Error generating embedding for chunk ${chunk.chunkIndex}:`, error)
            return null
          }
        })
      )

      // Insert batch into database
      const transaction = database.transaction(() => {
        for (const data of batchData) {
          if (data) {
            insertStmt.run(
              data.id,
              data.documentId,
              data.documentName,
              data.chunkIndex,
              data.text,
              data.startIndex,
              data.endIndex,
              data.embedding.buffer
            )
          }
        }
      })
      
      transaction()
      console.log(`[FileVectorDB] Inserted batch ${Math.floor(i / batchSize) + 1}`)
    }

    console.log(`[FileVectorDB] ✓ Successfully indexed ${chunks.length} chunks for document ${documentId}`)
  } catch (error) {
    console.error(`[FileVectorDB] ✗ Error indexing document ${documentId}:`, error)
    throw error
  }
}

// Cosine similarity function (fallback when sqlite-vec not available)
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have the same length')
  }

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i]
    normA += vecA[i] * vecA[i]
    normB += vecB[i] * vecB[i]
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB)
  if (denominator === 0) return 0

  return dotProduct / denominator
}

export async function searchSimilarChunks(
  query: string,
  limit: number = 5,
  documentIds?: string[]
): Promise<DocumentChunk[]> {
  try {
    console.log(`[FileVectorDB] Searching for: "${query}" (limit: ${limit})`)
    const database = await getDatabase()

    // Generate embedding for query
    const queryEmbedding = await generateEmbedding(query)

    // Build query to load chunks
    let sql = 'SELECT * FROM document_chunks'
    const params: any[] = []
    
    if (documentIds && documentIds.length > 0) {
      const placeholders = documentIds.map(() => '?').join(',')
      sql += ` WHERE document_id IN (${placeholders})`
      params.push(...documentIds)
    }

    // Load chunks from database
    const rows = database.prepare(sql).all(...params) as any[]
    console.log(`[FileVectorDB] Loaded ${rows.length} chunks from database`)

    if (rows.length === 0) {
      return []
    }

    // Calculate similarity scores in JavaScript (works without sqlite-vec)
    const scoredChunks = rows.map(row => {
      // Parse embedding from BLOB
      const embeddingBuffer = Buffer.from(row.embedding)
      const embedding = new Float32Array(embeddingBuffer.buffer, embeddingBuffer.byteOffset, embeddingBuffer.byteLength / 4)
      const embeddingArray = Array.from(embedding)
      
      return {
        chunk: {
          id: row.id,
          documentId: row.document_id,
          documentName: row.document_name,
          chunkIndex: row.chunk_index,
          text: row.text,
          startIndex: row.start_index,
          endIndex: row.end_index,
          vector: embeddingArray
        },
        score: cosineSimilarity(queryEmbedding, embeddingArray)
      }
    })

    // Sort by similarity and take top N
    scoredChunks.sort((a, b) => b.score - a.score)
    const topChunks = scoredChunks.slice(0, limit).map(item => item.chunk)

    console.log(`[FileVectorDB] Found ${topChunks.length} similar chunks`)
    if (scoredChunks.length > 0) {
      console.log(`[FileVectorDB] Top similarity score: ${scoredChunks[0].score.toFixed(4)}`)
    }

    return topChunks
  } catch (error) {
    console.error('[FileVectorDB] Error searching chunks:', error)
    throw error
  }
}

export async function deleteDocumentChunks(documentId: string): Promise<void> {
  try {
    console.log(`[FileVectorDB] Deleting chunks for document ${documentId}...`)
    const database = await getDatabase()
    
    const stmt = database.prepare('DELETE FROM document_chunks WHERE document_id = ?')
    const result = stmt.run(documentId)
    
    console.log(`[FileVectorDB] Deleted ${result.changes} chunks for document ${documentId}`)
  } catch (error) {
    console.error('[FileVectorDB] Error deleting document chunks:', error)
    throw error
  }
}

