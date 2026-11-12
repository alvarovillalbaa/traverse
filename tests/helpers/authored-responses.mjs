// Authored Responses wire data, not an OpenAI client or model-quality fixture.
export const terminal = status => ({ status, action: null });
export const step = action => ({ status: 'action', action });
export const wire = value => ({ status: 'completed', error: null, incomplete_details: null, output: [
  { type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify(value) }] },
] });
export const response = value => new Response(JSON.stringify(wire(value)), { headers: { 'Content-Type': 'application/json' } });
