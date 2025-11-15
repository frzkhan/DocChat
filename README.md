# Document Chat Assistant

A Next.js application that allows you to upload documents and chat with AI to get answers using RAG (Retrieval Augmented Generation).

## Features

- 📄 Upload documents (PDF, TXT, MD, DOC, DOCX)
- 🔍 Semantic search using vector embeddings
- 💬 Chat interface similar to ChatGPT
- 🧠 AI-powered answers from your documents
- 💾 Persistent storage with SQLite + sqlite-vec

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env.local` file:
```bash
OPENAI_API_KEY=your_openai_api_key_here
```

3. Get your OpenAI API key from: https://platform.openai.com/api-keys

## Development

Start the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Production

Build the application:
```bash
npm run build
```

Start the production server:
```bash
npm start
```

## How It Works

1. **Document Upload**: Documents are uploaded to the server and text is extracted
2. **Chunking**: Text is split into smaller chunks (1000 chars with 200 overlap)
3. **Embeddings**: Each chunk is converted to a vector embedding using OpenAI
4. **Storage**: Embeddings are stored in SQLite with sqlite-vec for fast similarity search
5. **Search**: When you ask a question, relevant chunks are found using cosine similarity
6. **Context**: Relevant chunks are used as context for AI responses

## Tech Stack

- **Next.js 14** - React framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **SQLite + sqlite-vec** - Vector database
- **OpenAI** - Embeddings generation
- **pdf-parse** - PDF text extraction

## Project Structure

```
├── app/
│   ├── api/              # Next.js API routes
│   ├── page.tsx          # Main page
│   └── layout.tsx        # Root layout
├── components/           # React components
├── lib/                  # Utilities (storage, embeddings, vectordb)
└── storage/             # Document and database storage
```
