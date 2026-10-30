// Этот модуль загружается через --import раньше CLI. Любой fetch заменён
// ответом в памяти, включая ошибки: тест никогда не вызывает платный API.
import { appendFileSync } from 'node:fs';

globalThis.fetch = (input, init) => {
  const body = JSON.parse(init.body);
  const judge = body.messages[0].content.startsWith('Ты — судья');
  appendFileSync(
    'requests.jsonl',
    JSON.stringify({
      model: body.model,
      judge,
      url: String(input),
      stream: body.stream,
      reasoning: body.reasoning,
      thinking: body.thinking,
      maxCompletionTokens: body.max_completion_tokens,
    }) + '\n',
  );
  if (body.model === process.env.HARNESS_MOCK_FAIL_MODEL) {
    return Promise.resolve(
      Response.json({ error: { message: 'Mock rate limit' } }, { status: 429 }),
    );
  }
  const content = judge ? JSON.stringify({ verdict: 'pass', explanation: 'done' }) : 'done';
  const usage = {
    prompt_tokens: 10,
    completion_tokens: 3,
    prompt_tokens_details: { cached_tokens: 4 },
    cost: 0.004,
  };
  const response = {
    id: 'reply',
    model: 'actual-' + body.model,
    choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }],
    usage,
  };
  return Promise.resolve(body.stream ? streamReply(response) : Response.json(response));
};

function streamReply(response) {
  const events = [
    {
      id: response.id,
      model: response.model,
      choices: [{ delta: { content: response.choices[0].message.content }, finish_reason: 'stop' }],
    },
    { choices: [], usage: response.usage },
  ];
  if (process.env.HARNESS_MOCK_STREAM_ERROR === 'true') {
    events.push({ error: { message: 'Mock upstream stream failure' } });
  }
  const bytes = new TextEncoder().encode(
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n',
  );
  return new Response(
    new ReadableStream({
      start(controller) {
        for (let offset = 0; offset < bytes.length; offset += 5) {
          controller.enqueue(bytes.slice(offset, offset + 5));
        }
        controller.close();
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  );
}
