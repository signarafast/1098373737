// Node 18+ -- define FAL_KEY on the server; never expose it in index.html.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const port = Number(process.env.PORT || 3000);
const falKey = process.env.FAL_KEY;
const indexPath = path.join(__dirname, 'index.html');

function sendJson(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

http.createServer(async (request, response) => {
  if (request.method === 'GET' && (request.url === '/' || request.url === '/index.html')) {
    fs.createReadStream(indexPath)
      .on('error', () => sendJson(response, 500, { error: 'Unable to load index.html.' }))
      .pipe(response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }));
    return;
  }

  if (request.method !== 'POST' || request.url !== '/api/fal') {
    sendJson(response, 404, { error: 'Route not found.' });
    return;
  }
  if (!falKey) {
    sendJson(response, 500, { error: 'The server FAL_KEY variable is missing.' });
    return;
  }

  let raw = '';
  request.setEncoding('utf8');
  request.on('data', chunk => {
    raw += chunk;
    if (raw.length > 100_000) request.destroy();
  });
  request.on('end', async () => {
    try {
      const input = JSON.parse(raw);
      if (!input || typeof input.prompt !== 'string' || !input.prompt.trim()) {
        sendJson(response, 400, { error: 'A prompt is required.' });
        return;
      }
      const upstream = await fetch('https://fal.run/fal-ai/any-llm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Key ${falKey}`
        },
        body: JSON.stringify({
          model: String(input.model || 'anthropic/claude-sonnet-4.5'),
          prompt: input.prompt.slice(0, 20_000),
          max_tokens: Math.min(Math.max(Number(input.max_tokens) || 400, 1), 2_000),
          temperature: Math.min(Math.max(Number(input.temperature) || 0, 0), 1)
        })
      });
      const body = await upstream.text();
      response.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8' });
      response.end(body);
    } catch (error) {
      sendJson(response, 502, { error: `fal.ai connection error: ${error.message}` });
    }
  });
}).listen(port, () => console.log(`Server started on http://localhost:${port}`));
