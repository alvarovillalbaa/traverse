import { openSession, type Executor, type SessionOptions } from '@alvarovillalbaa/traverse';
import { createOpenAIExecutor, type OpenAIExecutorOptions } from '@alvarovillalbaa/traverse/openai';

const options: OpenAIExecutorOptions = { apiKey: 'AUTHORED_ONLY', model: 'authored-model', maxRequests: 2,
  maxOutputTokens: 512, endpoint: 'http://127.0.0.1:1/v1/responses', allowLocalHTTP: true, fetch: globalThis.fetch };
const executor: Executor = createOpenAIExecutor(options);
const attach = (createDriver: SessionOptions['createDriver']) => openSession({ createDriver, executor });
void attach;
// @ts-expect-error explicit model is required
createOpenAIExecutor({ apiKey: 'AUTHORED_ONLY' });
// @ts-expect-error explicit credential is required
createOpenAIExecutor({ model: 'authored-model' });
// @ts-expect-error transport options are strict
createOpenAIExecutor({ apiKey: 'AUTHORED_ONLY', model: 'authored-model', discoverCredentials: true });
