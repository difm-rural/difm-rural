// The tool logic is shared with the Node test suite (tests/ai-connector*.mjs).
// Every relative import in its graph carries a file extension, which Deno
// (and the hosted Edge runtime) require.
export * from '../../../shared/aiConnector.ts'
