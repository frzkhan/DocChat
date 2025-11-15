import { NextRequest } from 'next/server'
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

// Helper function to send SSE events
function sendSSE(controller: ReadableStreamDefaultController, event: string, data: any) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  controller.enqueue(new TextEncoder().encode(message))
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
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const body = await request.json()
        const { question, documentIds, limit = 5 } = body

        if (!question || typeof question !== 'string') {
          sendSSE(controller, 'error', { error: 'Question is required and must be a string' })
          controller.close()
          return
        }

        // Search for relevant document chunks
        let contextChunks: any[] = []
        let contextText = ''
        let isGeneral = false

        if (documentIds && documentIds.length > 0) {
          try {
            // Send event: searching documents
            sendSSE(controller, 'tool_start', {
              tool: 'document_search',
              message: `Searching documents for: ${question.substring(0, 100)}${question.length > 100 ? '...' : ''}`
            })

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

              // Send event: document search complete
              sendSSE(controller, 'tool_end', {
                tool: 'document_search',
                message: `Found ${contextChunks.length} relevant chunks from ${Object.keys(chunksByDoc).length} document(s)`
              })
            } else {
              sendSSE(controller, 'tool_end', {
                tool: 'document_search',
                message: 'No relevant chunks found'
              })
            }
          } catch (error) {
            console.error('Error searching chunks:', error)
            sendSSE(controller, 'tool_end', {
              tool: 'document_search',
              message: 'Error searching documents'
            })
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
            ? `You are a helpful assistant that answers questions based on the provided document context. The current year is 2025. When asked about what a document contains or to summarize it, synthesize information from all the provided chunks to give a comprehensive overview. Identify key topics, themes, and important details. Organize your response clearly and be thorough. 

You also have access to a web search tool. Use the web search tool when:
- The user asks about current events, recent news, or real-time information
- The question requires information not found in the documents
- The user asks about general knowledge that may not be in the documents
- The user explicitly asks you to search the web or look something up online

When using web search, first try to answer from the document context if available, then supplement with web search results if needed.

IMPORTANT - Visual Diagrams and Charts:
You can create visual diagrams and charts using Mermaid syntax. When appropriate, use Mermaid code blocks to visualize:
- Data comparisons: Use xychart for bar charts, line charts, or pie charts when comparing numerical data
- Processes and workflows: Use flowcharts (graph TD or graph LR) to show processes, decision trees, or workflows
- Relationships: Use diagrams to show relationships between concepts, entities, or data points
- Sequences: Use sequence diagrams to show interactions over time

When creating charts or diagrams:
- Use \`\`\`mermaid code blocks (not plain text)
- For flowcharts, use graph TD (top-down) or graph LR (left-right)
- Make diagrams clear, well-labeled, and easy to understand

CRITICAL - xychart Bar Chart Syntax (MUST FOLLOW EXACTLY):
For bar charts, you MUST use this exact format:
\`\`\`mermaid
xychart
    title "Chart Title"
    x-axis "X-Axis Label" ["Category 1", "Category 2", "Category 3"]
    y-axis "Y-Axis Label" 0 --> 100
    bar [value1, value2, value3]
\`\`\`

Key requirements:
- Title must be in quotes: title "Your Title"
- x-axis must have label in quotes AND an array of category names: x-axis "Label" ["Cat1", "Cat2"]
- y-axis must have label in quotes AND a range: y-axis "Label" 0 --> max_value
- bar must be an array matching the number of categories: bar [val1, val2, val3]
- All values in the bar array must be numbers, not strings
- The number of values in bar array MUST match the number of categories in x-axis array

Example of CORRECT bar chart:
\`\`\`mermaid
xychart
    title "Sales by Product"
    x-axis "Products" ["Product A", "Product B", "Product C"]
    y-axis "Sales ($)" 0 --> 100
    bar [30, 70, 50]
\`\`\`

Example of INCORRECT (DO NOT USE):
- x-axis Driver Type (missing quotes and array)
- y-axis Count (missing range)
- "Category" : value (invalid format - use bar array instead)`
            : `You are a helpful assistant that answers questions based on the provided document context. The current year is 2025. Use the information from the documents to answer the question accurately. Synthesize information from multiple chunks when needed to provide a complete answer. 

You also have access to a web search tool. Use the web search tool when:
- The answer cannot be found in the documents
- The user asks about current events, recent information, or general knowledge
- The question requires information that is not in the document context

If the answer cannot be found in the documents, use web search to find the information.

IMPORTANT - Visual Diagrams and Charts:
You can create visual diagrams and charts using Mermaid syntax. When appropriate, use Mermaid code blocks to visualize:
- Data comparisons: Use xychart for bar charts, line charts, or pie charts when comparing numerical data
- Processes and workflows: Use flowcharts (graph TD or graph LR) to show processes, decision trees, or workflows
- Relationships: Use diagrams to show relationships between concepts, entities, or data points
- Sequences: Use sequence diagrams to show interactions over time

When creating charts or diagrams:
- Use \`\`\`mermaid code blocks (not plain text)
- For flowcharts, use graph TD (top-down) or graph LR (left-right)
- Make diagrams clear, well-labeled, and easy to understand

CRITICAL - xychart Bar Chart Syntax (MUST FOLLOW EXACTLY):
For bar charts, you MUST use this exact format:
\`\`\`mermaid
xychart
    title "Chart Title"
    x-axis "X-Axis Label" ["Category 1", "Category 2", "Category 3"]
    y-axis "Y-Axis Label" 0 --> 100
    bar [value1, value2, value3]
\`\`\`

Key requirements:
- Title must be in quotes: title "Your Title"
- x-axis must have label in quotes AND an array of category names: x-axis "Label" ["Cat1", "Cat2"]
- y-axis must have label in quotes AND a range: y-axis "Label" 0 --> max_value
- bar must be an array matching the number of categories: bar [val1, val2, val3]
- All values in the bar array must be numbers, not strings
- The number of values in bar array MUST match the number of categories in x-axis array

Example of CORRECT bar chart:
\`\`\`mermaid
xychart
    title "Sales by Product"
    x-axis "Products" ["Product A", "Product B", "Product C"]
    y-axis "Sales ($)" 0 --> 100
    bar [30, 70, 50]
\`\`\`

Example of INCORRECT (DO NOT USE):
- x-axis Driver Type (missing quotes and array)
- y-axis Count (missing range)
- "Category" : value (invalid format - use bar array instead)`
          : `You are a helpful assistant. The current year is 2025. You have access to a web search tool that you can use to search the internet for information. 

Use the web search tool when:
- The user asks about current events, recent news, or real-time information
- The user asks general knowledge questions
- The user asks about topics that require up-to-date information
- The user explicitly asks you to search the web

Answer the user's question using web search when appropriate.

IMPORTANT - Visual Diagrams and Charts:
You can create visual diagrams and charts using Mermaid syntax. When appropriate, use Mermaid code blocks to visualize:
- Data comparisons: Use xychart for bar charts, line charts, or pie charts when comparing numerical data
- Processes and workflows: Use flowcharts (graph TD or graph LR) to show processes, decision trees, or workflows
- Relationships: Use diagrams to show relationships between concepts, entities, or data points
- Sequences: Use sequence diagrams to show interactions over time

When creating charts or diagrams:
- Use \`\`\`mermaid code blocks (not plain text)
- For flowcharts, use graph TD (top-down) or graph LR (left-right)
- Make diagrams clear, well-labeled, and easy to understand

CRITICAL - xychart Bar Chart Syntax (MUST FOLLOW EXACTLY):
For bar charts, you MUST use this exact format:
\`\`\`mermaid
xychart
    title "Chart Title"
    x-axis "X-Axis Label" ["Category 1", "Category 2", "Category 3"]
    y-axis "Y-Axis Label" 0 --> 100
    bar [value1, value2, value3]
\`\`\`

Key requirements:
- Title must be in quotes: title "Your Title"
- x-axis must have label in quotes AND an array of category names: x-axis "Label" ["Cat1", "Cat2"]
- y-axis must have label in quotes AND a range: y-axis "Label" 0 --> max_value
- bar must be an array matching the number of categories: bar [val1, val2, val3]
- All values in the bar array must be numbers, not strings
- The number of values in bar array MUST match the number of categories in x-axis array

Example of CORRECT bar chart:
\`\`\`mermaid
xychart
    title "Sales by Product"
    x-axis "Products" ["Product A", "Product B", "Product C"]
    y-axis "Sales ($)" 0 --> 100
    bar [30, 70, 50]
\`\`\`

Example of INCORRECT (DO NOT USE):
- x-axis Driver Type (missing quotes and array)
- y-axis Count (missing range)
- "Category" : value (invalid format - use bar array instead)`

        const userPrompt = contextText
          ? isGeneral
            ? `Context from documents:\n\n${contextText}\n\nQuestion: ${question}\n\nBased on the document context provided above, provide a comprehensive answer. For questions about document contents, summarize the key topics, themes, and important information found in the documents. Organize your response clearly. If you need additional information not in the documents, use the web search tool.`
            : `Context from documents:\n\n${contextText}\n\nQuestion: ${question}\n\nAnswer the question based on the context provided above. If you need to combine information from multiple chunks, do so to provide a complete answer. If the answer cannot be found in the context, use the web search tool to find the information.`
          : `Question: ${question}\n\nNote: No documents are available for context. Use web search if needed to answer the question.`

        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]

        let usedWebSearch = false
        let iterationCount = 0
        const maxIterations = 5 // Prevent infinite loops

        // Handle function calling with potential multiple rounds
        while (iterationCount < maxIterations) {
          iterationCount++
          
          // Send event: AI thinking/processing
          if (iterationCount === 1) {
            sendSSE(controller, 'thinking', { message: 'Processing your question...' })
          }

          const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages,
            tools,
            tool_choice: 'auto',
            temperature: 0.7,
            max_tokens: isGeneral ? 2000 : 1000,
            stream: true
          })

          let messageContent = ''
          let toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] = []

          // Stream the completion
          for await (const chunk of completion) {
            const delta = chunk.choices[0]?.delta
            if (!delta) continue

            if (delta.content) {
              messageContent += delta.content
              sendSSE(controller, 'content', { chunk: delta.content })
            }

            if (delta.tool_calls) {
              for (const toolCallDelta of delta.tool_calls) {
                const index = toolCallDelta.index || 0
                if (!toolCalls[index]) {
                  toolCalls[index] = {
                    id: toolCallDelta.id || '',
                    type: 'function',
                    function: {
                      name: '',
                      arguments: ''
                    }
                  }
                }
                if (toolCallDelta.id) {
                  toolCalls[index].id = toolCallDelta.id
                }
                if (toolCallDelta.function?.name) {
                  toolCalls[index].function.name += toolCallDelta.function.name
                }
                if (toolCallDelta.function?.arguments) {
                  toolCalls[index].function.arguments += toolCallDelta.function.arguments
                }
              }
            }
          }

          // Create message object
          const message: OpenAI.Chat.Completions.ChatCompletionMessageParam = {
            role: 'assistant',
            content: messageContent || null,
            ...(toolCalls.length > 0 && { tool_calls: toolCalls as any })
          }

          // Add the assistant's message to the conversation
          messages.push(message)

          // Check if the model wants to call a function
          if (toolCalls.length > 0) {
            // Handle function calls
            for (const toolCall of toolCalls) {
              if (toolCall.function.name === 'search_web') {
                try {
                  const { query } = JSON.parse(toolCall.function.arguments || '{}')
                  
                  // Send event: web search starting
                  sendSSE(controller, 'tool_start', {
                    tool: 'web_search',
                    message: `Searching web for: ${query}`
                  })
                  
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

                  // Send event: web search complete
                  sendSSE(controller, 'tool_end', {
                    tool: 'web_search',
                    message: `Found ${validResults.length} result(s)`
                  })

                  // Add function result to messages
                  messages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: `Web search performed for: "${query}"\n\n${searchResultsText}`
                  })
                } catch (error) {
                  console.error('Web search error:', error)
                  sendSSE(controller, 'tool_end', {
                    tool: 'web_search',
                    message: 'Web search error occurred'
                  })
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

          // No function calls, we have the final answer
          break
        }

        // Send completion event
        sendSSE(controller, 'done', {
          hasContext: contextText.length > 0,
          chunksUsed: contextChunks.length,
          usedWebSearch
        })
        controller.close()
      } catch (error) {
        console.error('Chat error:', error)
        sendSSE(controller, 'error', {
          error: error instanceof Error ? error.message : 'Failed to generate answer'
        })
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}

