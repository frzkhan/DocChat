import { NextRequest, NextResponse } from 'next/server'
import { searchSimilarChunks, getAllDocumentChunks } from '@/lib/fileVectordb'
import { searchWeb } from '@/lib/webSearch'
import OpenAI from 'openai'

let openaiClient: OpenAI | null = null

function getOpenAIClient() {
  if (!openaiClient) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is not set')
    }
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    })
  }
  return openaiClient
}

// Detect if a question is general (asking about document contents, summary, etc.)
function isGeneralQuestion(question: string): boolean {
  const lowerQuestion = question.toLowerCase().trim()
  const generalPatterns = [
    /what (does|is|are|do|did)/i,
    /what (does|is|are|do|did) (this|that|the) (document|file|text)/i,
    /what (does|is|are|do|did) (this|that|the) (document|file|text) (contain|say|include|discuss|cover|describe)/i,
    /(summarize|summary|summarise)/i,
    /what (is|are) (in|inside|the content of|the contents of)/i,
    /(tell me|describe|explain) (what|about) (this|that|the) (document|file)/i,
    /(overview|contents?|content) (of|about) (this|that|the) (document|file)/i,
    /what (is|are) (this|that|the) (document|file) (about|on)/i
  ]
  
  return generalPatterns.some(pattern => pattern.test(lowerQuestion))
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { question, documentIds, limit = 5 } = body

    if (!question || typeof question !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Question is required and must be a string' },
        { status: 400 }
      )
    }

    // Search for relevant document chunks
    let contextChunks: any[] = []
    let contextText = ''
    let isGeneral = false

    if (documentIds && documentIds.length > 0) {
      try {
        // Detect if this is a general question about document contents
        isGeneral = isGeneralQuestion(question)
        
        if (isGeneral) {
          // For general questions, retrieve more chunks or all chunks
          // Use a higher limit (25 chunks) to get comprehensive context
          const generalLimit = 25
          contextChunks = await searchSimilarChunks(question, generalLimit, documentIds)
          
          // If we still don't have enough chunks or similarity scores are low,
          // fall back to getting all chunks from the documents
          if (contextChunks.length < 10) {
            console.log('[Chat] General question detected, retrieving all chunks for comprehensive context')
            const allChunks = await getAllDocumentChunks(documentIds)
            // Limit to reasonable size (max 50 chunks to avoid token limits)
            contextChunks = allChunks.slice(0, 50)
          }
        } else {
          // For specific questions, use semantic search with the provided limit
          contextChunks = await searchSimilarChunks(question, limit, documentIds)
        }
        
        if (contextChunks.length > 0) {
          // Group chunks by document for better context
          const chunksByDoc = contextChunks.reduce((acc, chunk) => {
            const docName = chunk.documentName || 'Unknown'
            if (!acc[docName]) {
              acc[docName] = []
            }
            acc[docName].push(chunk.text)
            return acc
          }, {} as Record<string, string[]>)

          contextText = Object.entries(chunksByDoc)
            .map(([docName, chunks]) => `[Document: ${docName}]\n${chunks.join('\n\n')}`)
            .join('\n\n---\n\n')
        }
      } catch (error) {
        console.error('Error searching chunks:', error)
        // Continue without context if search fails
      }
    }

    // Generate answer using OpenAI with function calling support
    const openai = getOpenAIClient()
    
    // Define the web search tool for function calling
    const tools = [
      {
        type: 'function' as const,
        function: {
          name: 'search_web',
          description: 'Search the internet for current information, facts, news, or any information that may not be in the provided documents. Use this when the user asks about current events, recent information, general knowledge questions, or when the answer cannot be found in the document context.',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'The search query to look up on the internet'
              }
            },
            required: ['query']
          }
        }
      }
    ]
    
    const systemPrompt = contextText
      ? isGeneral
        ? `You are a helpful assistant that answers questions based on the provided document context. When asked about what a document contains or to summarize it, synthesize information from all the provided chunks to give a comprehensive overview. Identify key topics, themes, and important details. Organize your response clearly and be thorough. 

You also have access to a web search tool. Use the web search tool when:
- The user asks about current events, recent news, or real-time information
- The question requires information not found in the documents
- The user asks about general knowledge that may not be in the documents
- The user explicitly asks you to search the web or look something up online

When using web search, first try to answer from the document context if available, then supplement with web search results if needed.`
        : `You are a helpful assistant that answers questions based on the provided document context. Use the information from the documents to answer the question accurately. Synthesize information from multiple chunks when needed to provide a complete answer. 

You also have access to a web search tool. Use the web search tool when:
- The answer cannot be found in the documents
- The user asks about current events, recent information, or general knowledge
- The question requires information that is not in the document context

If the answer cannot be found in the documents, use web search to find the information.`
      : `You are a helpful assistant. You have access to a web search tool that you can use to search the internet for information. 

Use the web search tool when:
- The user asks about current events, recent news, or real-time information
- The user asks general knowledge questions
- The user asks about topics that require up-to-date information
- The user explicitly asks you to search the web

Answer the user's question using web search when appropriate.`

    const userPrompt = contextText
      ? isGeneral
        ? `Context from documents:\n\n${contextText}\n\nQuestion: ${question}\n\nBased on the document context provided above, provide a comprehensive answer. For questions about document contents, summarize the key topics, themes, and important information found in the documents. Organize your response clearly. If you need additional information not in the documents, use the web search tool.`
        : `Context from documents:\n\n${contextText}\n\nQuestion: ${question}\n\nAnswer the question based on the context provided above. If you need to combine information from multiple chunks, do so to provide a complete answer. If the answer cannot be found in the context, use the web search tool to find the information.`
      : `Question: ${question}\n\nNote: No documents are available for context. Use web search if needed to answer the question.`

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]

    let answer = ''
    let usedWebSearch = false
    let iterationCount = 0
    const maxIterations = 5 // Prevent infinite loops

    // Handle function calling with potential multiple rounds
    while (iterationCount < maxIterations) {
      iterationCount++
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        tools,
        tool_choice: 'auto',
        temperature: 0.7,
        max_tokens: isGeneral ? 2000 : 1000
      })

      const message = completion.choices[0]?.message
      if (!message) {
        answer = 'I apologize, but I could not generate an answer.'
        break
      }

      // Add the assistant's message to the conversation
      messages.push(message)

      // Check if the model wants to call a function
      if (message.tool_calls && message.tool_calls.length > 0) {
        // Handle function calls
        for (const toolCall of message.tool_calls) {
          if (toolCall.function.name === 'search_web') {
            try {
              const { query } = JSON.parse(toolCall.function.arguments || '{}')
              console.log(`[Chat] Performing web search: ${query}`)
              
              const searchResults = await searchWeb(query, 5)
              usedWebSearch = true
              
              // Filter out error messages and check if we have valid results
              const validResults = searchResults.filter(r => 
                r.title && 
                r.title !== 'No results found' && 
                r.title !== 'Search Error' &&
                r.snippet &&
                !r.snippet.toLowerCase().includes('unable to') &&
                !r.snippet.toLowerCase().includes('error')
              )
              
              // Format search results for the model
              let searchResultsText = ''
              if (validResults.length > 0) {
                searchResultsText = validResults.map((result, idx) => 
                  `[${idx + 1}] Title: ${result.title}\nDescription: ${result.snippet}${result.url ? `\nURL: ${result.url}` : ''}`
                ).join('\n\n')
              } else {
                // If no valid results, inform the model that search was attempted but yielded no results
                searchResultsText = `The web search for "${query}" did not return any useful results. The search may have been blocked, the query may need to be rephrased, or there may be no relevant information available online for this query.`
              }

              // Add function result to messages
              messages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: `Web search performed for: "${query}"\n\n${searchResultsText}`
              })
            } catch (error) {
              console.error('Web search error:', error)
              messages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: `Error performing web search: ${error instanceof Error ? error.message : 'Unknown error'}`
              })
            }
          }
        }
        // Continue the loop to get the model's response with the function results
        continue
      }

      // No function calls, get the final answer
      answer = message.content || 'I apologize, but I could not generate an answer.'
      break
    }

    // Fallback if we hit max iterations
    if (iterationCount >= maxIterations && !answer) {
      answer = 'I apologize, but I encountered an issue while processing your request. Please try again.'
    }

    return NextResponse.json({
      success: true,
      answer,
      hasContext: contextText.length > 0,
      chunksUsed: contextChunks.length,
      usedWebSearch
    })
  } catch (error) {
    console.error('Chat error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to generate answer' 
      },
      { status: 500 }
    )
  }
}

