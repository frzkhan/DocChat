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

export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is not set. Please add it to your .env.local file.')
    }

    const openai = getOpenAIClient()
    
    // Truncate text if too long (OpenAI has limits)
    const maxLength = 8000 // Safe limit for text-embedding-3-small
    const truncatedText = text.length > maxLength ? text.substring(0, maxLength) : text
    
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: truncatedText
    })
    
    if (!response.data || !response.data[0] || !response.data[0].embedding) {
      throw new Error('Invalid embedding response from OpenAI')
    }
    
    return response.data[0].embedding
  } catch (error) {
    console.error('Error generating embedding:', error)
    if (error instanceof Error) {
      console.error('Error details:', error.message)
      if (error.message.includes('API key')) {
        console.error('Please check your OPENAI_API_KEY in .env.local file')
      }
    }
    throw error
  }
}

