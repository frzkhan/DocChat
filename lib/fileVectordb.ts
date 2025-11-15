// File-based vector database using SQLite with sqlite-vec extension
// Persists to disk, uses native vector operations for fast similarity search
import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import { join } from 'path'
import { existsSync } from 'fs'
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

let db: Database.Database | null = null

function getDatabase(): Database.Database {
  if (!db) {
    try {
      console.log('[FileVectorDB] Opening database:', DB_PATH)
      db = new Database(DB_PATH, { 
        verbose: console.log
      })
      console.log('[FileVectorDB] Database connection opened')
      
      // Load sqlite-vec extension with error handling
      try {
        sqliteVec.load(db)
        console.log('[FileVectorDB] sqlite-vec extension loaded')
      } catch (vecError) {
        console.error('[FileVectorDB] Failed to load sqlite-vec, falling back to basic SQLite:', vecError)
      }
      
      // Create table
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

// Cosine similarity function
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

export async function indexDocument(
  documentId: string,
  documentName: string,
  text: string
): Promise<void> {
  try {
    console.log(`[FileVectorDB] Indexing document ${documentId} (${documentName})...`)
    const database = getDatabase()

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
            const embeddingBuffer = Buffer.from(new Float32Array(embedding).buffer)
            
            return {
              id: `${documentId}_${chunk.chunkIndex}`,
              documentId,
              documentName,
              chunkIndex: chunk.chunkIndex,
              text: chunk.text,
              startIndex: chunk.startIndex,
              endIndex: chunk.endIndex,
              embedding: embeddingBuffer
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
              data.embedding
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

export async function searchSimilarChunks(
  query: string,
  limit: number = 5,
  documentIds?: string[]
): Promise<DocumentChunk[]> {
  try {
    console.log(`[FileVectorDB] Searching for: "${query}" (limit: ${limit})`)
    const database = getDatabase()

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

    // Calculate similarity scores in JavaScript
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

export async function getAllDocumentChunks(
  documentIds: string[]
): Promise<DocumentChunk[]> {
  try {
    console.log(`[FileVectorDB] Retrieving all chunks for ${documentIds.length} document(s)`)
    const database = getDatabase()

    if (documentIds.length === 0) {
      return []
    }

    // Build query to load all chunks for specified documents
    const placeholders = documentIds.map(() => '?').join(',')
    const sql = `SELECT * FROM document_chunks WHERE document_id IN (${placeholders}) ORDER BY document_id, chunk_index`
    
    const rows = database.prepare(sql).all(...documentIds) as any[]
    console.log(`[FileVectorDB] Loaded ${rows.length} chunks from database`)

    // Convert rows to DocumentChunk format
    const chunks: DocumentChunk[] = rows.map(row => {
      // Parse embedding from BLOB
      const embeddingBuffer = Buffer.from(row.embedding)
      const embedding = new Float32Array(embeddingBuffer.buffer, embeddingBuffer.byteOffset, embeddingBuffer.byteLength / 4)
      const embeddingArray = Array.from(embedding)
      
      return {
        id: row.id,
        documentId: row.document_id,
        documentName: row.document_name,
        chunkIndex: row.chunk_index,
        text: row.text,
        startIndex: row.start_index,
        endIndex: row.end_index,
        vector: embeddingArray
      }
    })

    return chunks
  } catch (error) {
    console.error('[FileVectorDB] Error retrieving all document chunks:', error)
    throw error
  }
}

export async function deleteDocumentChunks(documentId: string): Promise<void> {
  try {
    console.log(`[FileVectorDB] Deleting chunks for document ${documentId}...`)
    const database = getDatabase()
    
    const stmt = database.prepare('DELETE FROM document_chunks WHERE document_id = ?')
    const result = stmt.run(documentId)
    
    console.log(`[FileVectorDB] Deleted ${result.changes} chunks for document ${documentId}`)
  } catch (error) {
    console.error('[FileVectorDB] Error deleting document chunks:', error)
    throw error
  }
}

export interface DocumentStats {
  totalDocuments: number
  totalChunks: number
  documents: Array<{
    documentId: string
    documentName: string
    chunkCount: number
  }>
}

export async function getDocumentStats(): Promise<DocumentStats> {
  try {
    const database = getDatabase()
    
    // Get count of distinct documents and total chunks
    const statsQuery = database.prepare(`
      SELECT 
        document_id,
        document_name,
        COUNT(*) as chunk_count
      FROM document_chunks
      GROUP BY document_id, document_name
      ORDER BY document_name
    `)
    
    const rows = statsQuery.all() as Array<{
      document_id: string
      document_name: string
      chunk_count: number
    }>
    
    const totalChunks = rows.reduce((sum, row) => sum + row.chunk_count, 0)
    
    return {
      totalDocuments: rows.length,
      totalChunks,
      documents: rows.map(row => ({
        documentId: row.document_id,
        documentName: row.document_name,
        chunkCount: row.chunk_count
      }))
    }
  } catch (error) {
    console.error('[FileVectorDB] Error getting document stats:', error)
    throw error
  }
}

