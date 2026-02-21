const cliBaseUrl = process.argv.slice(2).find((arg) => arg !== '--')
const baseUrl = cliBaseUrl ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:4000'
const namespace = process.env.SMOKE_NAMESPACE ?? 'default'
const userId = process.env.SMOKE_USER_ID ?? 'smoke-user'

const key = `smoke-${Date.now()}`

const headers = {
  'content-type': 'application/json',
  'x-namespace': namespace,
  'x-user-id': userId,
}

const putResponse = await fetch(`${baseUrl}/v1/items/${encodeURIComponent(key)}`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({ ok: true, at: new Date().toISOString() }),
})
if (!putResponse.ok) {
  throw new Error(`PUT failed: ${putResponse.status} ${await putResponse.text()}`)
}

const getResponse = await fetch(`${baseUrl}/v1/items/${encodeURIComponent(key)}`, {
  method: 'GET',
  headers,
})
if (!getResponse.ok) {
  throw new Error(`GET failed: ${getResponse.status} ${await getResponse.text()}`)
}

const value = await getResponse.json()
if (!value || value.ok !== true) {
  throw new Error(`Unexpected GET payload: ${JSON.stringify(value)}`)
}

const batchResponse = await fetch(`${baseUrl}/v1/items:batchGet`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ keys: [key] }),
})
if (!batchResponse.ok) {
  throw new Error(`batchGet failed: ${batchResponse.status} ${await batchResponse.text()}`)
}

const batchPayload = await batchResponse.json()
if (!batchPayload.items?.[key]) {
  throw new Error('batchGet did not include stored key')
}

const listResponse = await fetch(
  `${baseUrl}/v1/items?prefix=${encodeURIComponent('smoke-')}&limit=10`,
  {
    method: 'GET',
    headers,
  }
)
if (!listResponse.ok) {
  throw new Error(`list failed: ${listResponse.status} ${await listResponse.text()}`)
}

const listPayload = await listResponse.json()
if (!Array.isArray(listPayload.items)) {
  throw new Error('list payload missing items array')
}

const deleteResponse = await fetch(`${baseUrl}/v1/items/${encodeURIComponent(key)}`, {
  method: 'DELETE',
  headers,
})
if (deleteResponse.status !== 204) {
  throw new Error(`DELETE failed: ${deleteResponse.status} ${await deleteResponse.text()}`)
}

console.log('Smoke test passed')
