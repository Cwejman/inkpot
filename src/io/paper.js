// Paper MCP client — the only place the MCP SDK is imported.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { FIELD_NAME_RE } from '../core/fields.js';
import { normalizeLogicalCss } from '../core/jsx.js';

export const DEFAULT_MCP_URL = 'http://127.0.0.1:29979/mcp';

export async function connect(url = DEFAULT_MCP_URL) {
  try {
    const transport = new StreamableHTTPClientTransport(new URL(url));
    const client = new Client({ name: 'inkpot', version: '0.4.0' });
    await client.connect(transport);
    return client;
  } catch (err) {
    throw new Error(`Paper MCP not reachable at ${url}. Is Paper running?\n${err.message}`);
  }
}

export async function close(client) {
  try { await client.close(); } catch {}
}

async function call(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) {
    const text = result.content?.map(c => c.text).join('\n') || 'Unknown error';
    throw new Error(`MCP tool ${name} failed: ${text}`);
  }
  const text = result.content?.find(c => c.type === 'text')?.text;
  return text ? JSON.parse(text) : result.content;
}

export async function getArtboards(client) {
  const info = await call(client, 'get_basic_info');
  if (info.truncated) {
    throw new Error(
      `Paper MCP truncated the artboard list (showing ${info.artboards.length} of ${info.artboardCount ?? '?'}).\n` +
      `inkpot cannot see all artboards when the canvas exceeds MCP's per-response limit.\n` +
      `Remove some artboards, or work in a smaller Paper file, then retry.`
    );
  }
  return info.artboards;
}

export async function getJsxBodies(client, frames) {
  const bodies = [];
  for (const frame of frames) {
    process.stdout.write(`  fetching ${frame.name}...`);
    const raw = await client.callTool({
      name: 'get_jsx',
      arguments: { nodeId: frame.id, format: 'inline-styles' },
    });
    const text = raw.content?.find(c => c.type === 'text')?.text;
    if (!text) {
      console.log(' failed');
      throw new Error(`get_jsx returned no text for ${frame.name}`);
    }
    let jsx;
    try { jsx = JSON.parse(text); } catch { jsx = text; }
    bodies.push(jsx);
    console.log(' ok');
  }
  return bodies;
}

// Walk each frame's descendants and collect text nodes whose layer name
// matches {field:<key>}. Also fetches computed styles for fonts/colors.
export async function collectFields(client, frames) {
  const fields = [];

  async function walk(nodeId, frameIdx) {
    const info = await call(client, 'get_node_info', { nodeId });
    const m = info.name && info.name.match(FIELD_NAME_RE);
    if (m && info.component === 'Text') {
      fields.push({
        frameIdx,
        key: m[1],
        textContent: info.textContent ?? '',
        nodeId,
        width: info.width,
        height: info.height,
      });
      return;
    }
    for (const cid of info.childIds || []) await walk(cid, frameIdx);
  }

  for (let i = 0; i < frames.length; i++) await walk(frames[i].id, i);

  if (fields.length === 0) return fields;

  const styles = await call(client, 'get_computed_styles', { nodeIds: fields.map(f => f.nodeId) });
  for (const f of fields) {
    const s = styles[f.nodeId] || {};
    f.fontSize = parseFloat(s.fontSize) || 14;
    f.lineHeight = parseFloat(s.lineHeight) || f.fontSize * 1.4;
    f.color = s.color || '#000000';
    f.fontWeight = Number(s.fontWeight) || 400;
  }
  return fields;
}

// Create an artboard and write its HTML children. Paper auto-places the
// artboard on the canvas — position it afterwards with setPositions().
// Returns the new artboard's node ID.
export async function createArtboard(client, { name, width, height, html }) {
  const created = await call(client, 'create_artboard', {
    name,
    styles: { width: `${width}px`, height: `${height}px` },
  });
  const nodeId = created?.id ?? created?.nodeId ?? created?.node?.id;
  if (!nodeId) throw new Error(`create_artboard did not return a node ID (got ${JSON.stringify(created)})`);
  await call(client, 'write_html', {
    html: normalizeLogicalCss(html),
    targetNodeId: nodeId,
    mode: 'insert-children',
  });
  return nodeId;
}

// Batch-set left/top on one or more nodes. `updates` is [{ nodeId, left, top }].
export async function setPositions(client, updates) {
  if (updates.length === 0) return;
  await call(client, 'update_styles', {
    updates: updates.map(u => ({
      nodeIds: [u.nodeId],
      styles: { left: `${u.left}px`, top: `${u.top}px` },
    })),
  });
}
