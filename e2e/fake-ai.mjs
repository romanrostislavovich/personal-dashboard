// A stand-in for an OpenAI-compatible model, for the end-to-end tests: no key, no network, the
// same answer every time. It answers "pong" to the check of a new connection and repeats the
// user's last words in every other reply, so a test can tell its message reached the model.
import {createServer} from 'node:http';

const PORT = Number(process.env.FAKE_AI_PORT ?? 3397);

createServer((request, response) => {
  if (request.method === 'GET') {
    // Playwright's webServer waits for this to answer.
    response.writeHead(200).end('ok');
    return;
  }
  let body = '';
  request.on('data', chunk => (body += chunk));
  request.on('end', () => {
    const {messages = []} = JSON.parse(body || '{}');
    const last = [...messages]
      .reverse()
      .find(message => message.role === 'user');
    const said = typeof last?.content === 'string' ? last.content : '';
    const content = said === 'ping' ? 'pong' : `Fake model heard: ${said}`;
    response.writeHead(200, {'Content-Type': 'application/json'});
    response.end(
      JSON.stringify({choices: [{message: {role: 'assistant', content}}]}),
    );
  });
}).listen(PORT, () => console.log(`fake AI on ${PORT}`));
