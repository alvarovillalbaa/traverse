// Exact temporary control retirement; requires only the job's ephemeral token.
const repo = 'alvarovillalbaa/traverse';
const branch = 'qa/traverse-openai-20261112-1';
const path = '.github/workflows/traverse-openai-20261112.yml';
const token = process.env.GITHUB_TOKEN;
async function api(route, method = 'GET', payload) {
  const response = await fetch(`https://api.github.com/repos/${repo}/${route}`, { method, redirect: 'error',
    signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28', ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) });
  if (!response.ok) throw new Error(`retirement_http_${response.status}`);
  return response.status === 204 ? null : response.json();
}
if (!token || process.env.GITHUB_REPOSITORY !== repo || process.env.GITHUB_REF !== `refs/heads/${branch}`
  || !/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA ?? '') || !/^\d+$/.test(process.env.GITHUB_RUN_ID ?? '')) throw new Error('retirement_scope');
const run = await api(`actions/runs/${process.env.GITHUB_RUN_ID}`);
const workflow = await api(`actions/workflows/${run.workflow_id}`);
if (run.head_sha !== process.env.GITHUB_SHA || run.head_branch !== branch || workflow.path !== path || workflow.state !== 'active') throw new Error('retirement_identity');
await api(`actions/workflows/${workflow.id}/disable`, 'PUT');
const disabled = await api(`actions/workflows/${workflow.id}`);
if (disabled.state !== 'disabled_manually') throw new Error('retirement_disable_failed');
const ref = await api(`git/ref/heads/${branch}`);
if (ref.object.sha !== process.env.GITHUB_SHA) throw new Error('retirement_moved_ref');
await api(`git/refs/heads/${branch}`, 'DELETE');
const refs = await api(`git/matching-refs/heads/${branch}`);
if (refs.some(ref => ref.ref === `refs/heads/${branch}`)) throw new Error('retirement_ref_retained');
console.log(JSON.stringify({ kind: 'control-retirement', run: run.id, workflow: workflow.id, path,
  state: disabled.state, branch, deletedHead: process.env.GITHUB_SHA, exactRefAbsent: true }));
