// gguf-parse-test.mjs — parse a synthetic GGUF v3 file with the real parser.
//
//   node docs/tests/gguf-parse-test.mjs            run the checks
//   node docs/tests/gguf-parse-test.mjs out.gguf   also write the file, for
//                                                  dropping into html/omni-gguf.html
//
// The file is built byte by byte from the GGUF v3 layout: magic, version,
// tensor count, metadata count, key/value pairs, then tensor descriptors.
// No tensor data follows; the parser never reads it.

import { writeFileSync } from 'node:fs';
import {
  GGUFValueType as T, DynamicFileReader, GGUFParser, ModelData,
  ggufReport, groupTensorsByBlock,
} from '../../website/js/parsers/gguf-parser.js';

const BLOCKS = 4;

function buildGguf() {
  const parts = [];
  const u32 = v => { const b = Buffer.alloc(4); b.writeUInt32LE(v); parts.push(b); };
  const u64 = v => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(v)); parts.push(b); };
  const str = s => { const b = Buffer.from(s, 'utf8'); u64(b.length); parts.push(b); };

  const kv = [
    ['general.architecture', T.STRING, 'llama'],
    ['general.name', T.STRING, 'tiny-test'],
    ['llama.block_count', T.UINT32, BLOCKS],
    ['llama.context_length', T.UINT32, 2048],
    ['llama.embedding_length', T.UINT32, 256],
    ['llama.attention.head_count', T.UINT32, 8],
    ['llama.attention.head_count_kv', T.UINT32, 2],
    ['tokenizer.ggml.tokens', T.ARRAY, ['<s>', '</s>', 'hello', 'world', '!', '?']],
  ];
  const tensors = [['token_embd.weight', [256, 1000]]];
  for (let i = 0; i < BLOCKS; i++) {
    for (const t of ['attn_norm', 'attn_q', 'attn_k', 'attn_v', 'attn_output', 'ffn_up', 'ffn_down']) {
      tensors.push([`blk.${i}.${t}.weight`, t.endsWith('norm') ? [256] : [256, 256]]);
    }
  }
  tensors.push(['output_norm.weight', [256]], ['output.weight', [256, 1000]]);

  parts.push(Buffer.from('GGUF'));
  u32(3);
  u64(tensors.length);
  u64(kv.length);
  for (const [key, type, value] of kv) {
    str(key);
    u32(type);
    if (type === T.STRING) str(value);
    else if (type === T.UINT32) u32(value);
    else if (type === T.ARRAY) { u32(T.STRING); u64(value.length); value.forEach(str); }
  }
  let offset = 0;
  for (const [name, dims] of tensors) {
    str(name);
    u32(dims.length);
    dims.forEach(u64);
    u32(0);                          // F32
    u64(offset);
    offset += dims.reduce((a, b) => a * b, 1) * 4;
  }
  return { bytes: Buffer.concat(parts), tensors };
}

// A File-like object: what DynamicFileReader needs (size, slice → arrayBuffer).
function fakeFile(bytes, name) {
  return {
    name, size: bytes.length,
    slice: (a, b) => ({ arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset + a, bytes.byteOffset + b) }),
  };
}

const { bytes, tensors } = buildGguf();
if (process.argv[2]) writeFileSync(process.argv[2], bytes);

const file = fakeFile(bytes, 'tiny-test.gguf');
const parsed = await GGUFParser.parseGGUF(new DynamicFileReader(file), 500);
const model = new ModelData(file, parsed);
const groups = groupTensorsByBlock(model.tensors);

const checks = [
  ['version', parsed.version, 3],
  ['tensorCount', parsed.tensorCount, tensors.length],
  ['metadataCount', parsed.metadataCount, 8],
  ['tensors read', parsed.tensors.length, tensors.length],
  ['architecture', model.getStats().arch, 'llama'],
  ['layers', model.getStats().layers, BLOCKS],
  ['heads (not kv)', model.getInfoText().heads, 8],
  ['token array', model.metadata.find(m => m.key === 'tokenizer.ggml.tokens').value.join(' '), '<s> </s> hello world ! ?'],
  ['embedding group', groups.embedding.map(t => t.name).join(), 'token_embd.weight'],
  ['layer groups', groups.layers.length, BLOCKS],
  ['output group', groups.output.length, 2],
  ['report mentions file', ggufReport(model).includes('GGUF MODEL: tiny-test.gguf'), true],
];
let failed = 0;
for (const [name, got, want] of checks) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${JSON.stringify(got)}${ok ? '' : ` (want ${JSON.stringify(want)})`}`);
}
process.exit(failed ? 1 : 0);
