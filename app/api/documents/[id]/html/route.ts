import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { getDocumentMetadata, getDocumentPath } from '@/lib/storage'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id
    
    if (!id) {
      return NextResponse.json(
        { error: 'Document ID is required' },
        { status: 400 }
      )
    }

    const metadata = await getDocumentMetadata(id)
    
    if (!metadata) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      )
    }

    const fileExtension = '.' + metadata.name.split('.').pop()?.toLowerCase()
    
    if (fileExtension !== '.docx') {
      return NextResponse.json(
        { error: 'This endpoint only supports DOCX files' },
        { status: 400 }
      )
    }

    // Read the file
    const filePath = getDocumentPath(metadata.fileName)
    const buffer = await readFile(filePath)
    
    // Convert DOCX to HTML using mammoth
    const mammoth = await import('mammoth')
    const result = await mammoth.convertToHtml({ buffer })
    
    // Create a complete HTML document with basic styling
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${metadata.name}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      color: #333;
      background: #fff;
    }
    p {
      margin: 0.5em 0;
    }
    h1, h2, h3, h4, h5, h6 {
      margin-top: 1em;
      margin-bottom: 0.5em;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 1em 0;
    }
    table td, table th {
      border: 1px solid #ddd;
      padding: 8px;
    }
    table th {
      background-color: #f2f2f2;
      font-weight: bold;
    }
    ul, ol {
      margin: 0.5em 0;
      padding-left: 2em;
    }
    img {
      max-width: 100%;
      height: auto;
    }
  </style>
</head>
<body>
  ${result.value}
</body>
</html>
    `.trim()
    
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    })
  } catch (error) {
    console.error('Error converting DOCX to HTML:', error)
    return NextResponse.json(
      { error: 'Failed to convert document to HTML' },
      { status: 500 }
    )
  }
}

