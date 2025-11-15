import * as cheerio from 'cheerio'

/**
 * Performs a web search using DuckDuckGo Lite HTML
 * @param query - The search query
 * @param maxResults - Maximum number of results to return (default: 5)
 * @returns Array of search results with title, snippet, and URL
 */
export async function searchWeb(query: string, maxResults: number = 5): Promise<Array<{
  title: string
  snippet: string
  url: string
}>> {
  try {
    console.log(`[WebSearch] Searching for: ${query}`)
    
    // Use DuckDuckGo Lite HTML (simpler, more reliable)
    const liteUrl = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`
    const liteResponse = await fetch(liteUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html',
      },
    })
    
    if (!liteResponse.ok) {
      throw new Error(`HTTP error! status: ${liteResponse.status}`)
    }

    const html = await liteResponse.text()
    console.log(`[WebSearch] HTML response length: ${html.length} characters`)
    
    // Parse HTML using cheerio
    const $ = cheerio.load(html)
    const results: Array<{ title: string; snippet: string; url: string }> = []

    // Extract URL from DuckDuckGo redirect link
    // Format: //duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.example.com...
    const extractUrl = (redirectUrl: string): string => {
      try {
        const match = redirectUrl.match(/uddg=([^&]+)/)
        if (match) {
          return decodeURIComponent(match[1])
        }
        // If no redirect, return as-is (fix protocol if needed)
        if (redirectUrl.startsWith('//')) {
          return `https:${redirectUrl}`
        }
        return redirectUrl
      } catch {
        return redirectUrl
      }
    }

    // Parse DuckDuckGo Lite HTML structure using cheerio
    // Results are in table rows with this structure:
    // <tr><td><a rel="nofollow" href="//duckduckgo.com/l/?uddg=..." class='result-link'>Title</a></td></tr>
    // <tr><td class='result-snippet'>Description</td></tr>
    // <tr><td><span class='link-text'>www.example.com</span></td></tr>
    
    const seenUrls = new Set<string>()
    
    // Find all result links
    $('a.result-link').each((index, element) => {
      if (results.length >= maxResults) return false // Stop iteration
      
      const $link = $(element)
      const redirectUrl = $link.attr('href') || ''
      const title = $link.text().trim()
      
      // Extract actual URL from DuckDuckGo redirect
      let url = extractUrl(redirectUrl)
      
      // Skip DuckDuckGo internal links and duplicates
      if (!url || url.includes('duckduckgo.com/l/') || seenUrls.has(url) || !title) {
        return true // Continue to next iteration
      }
      
      // Find snippet - look for result-snippet in the same table row or nearby
      // The snippet is typically in a <td class='result-snippet'> after the link
      let snippet = 'No description available'
      
      // Try to find the snippet in the same table row or next rows
      const $row = $link.closest('tr')
      const $nextRows = $row.nextAll('tr').slice(0, 3) // Check next 3 rows
      
      $nextRows.each((_, row) => {
        const $snippetCell = $(row).find('td.result-snippet')
        if ($snippetCell.length > 0) {
          snippet = $snippetCell.text().trim()
          return false // Stop searching
        }
      })
      
      // If no snippet found, try to get link-text as fallback
      if (!snippet || snippet === 'No description available') {
        $nextRows.each((_, row) => {
          const $linkText = $(row).find('span.link-text')
          if ($linkText.length > 0) {
            snippet = `Visit ${$linkText.text().trim()}`
            return false // Stop searching
          }
        })
      }
      
      seenUrls.add(url)
      results.push({
        title: title.substring(0, 200),
        snippet: snippet.substring(0, 500) || 'No description available',
        url: url
      })
      
      return true // Continue to next iteration
    })

    console.log(`[WebSearch] Found ${results.length} results`)
    
    return results.length > 0 ? results.slice(0, maxResults) : [{
      title: 'No results found',
      snippet: `Unable to find search results for "${query}". Please try rephrasing your query.`,
      url: ''
    }]
  } catch (error) {
    console.error('[WebSearch] Error:', error)
    return [{
      title: 'Search Error',
      snippet: `Unable to perform web search: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again later.`,
      url: ''
    }]
  }
}

