export interface RawChunk {
  heading: string;
  content: string;
}

function splitLongSection(heading: string, content: string, maxChars: number, overlap: number): RawChunk[] {
  if (content.length <= maxChars) return [{ heading, content }];
  const chunks: RawChunk[] = [];
  let start = 0;
  while (start < content.length) {
    const end = Math.min(content.length, start + maxChars);
    chunks.push({ heading, content: content.slice(start, end) });
    if (end === content.length) break;
    start = end - overlap;
  }
  return chunks;
}

export function chunkMarkdown(markdown: string, maxChars = 700, overlap = 80): RawChunk[] {
  const lines = markdown.split(/\r?\n/);
  const chunks: RawChunk[] = [];
  let heading = "正文";
  let buffer: string[] = [];

  const flush = () => {
    const content = buffer.join("\n").trim();
    if (content) chunks.push(...splitLongSection(heading, content, maxChars, overlap));
    buffer = [];
  };

  for (const line of lines) {
    const match = line.match(/^#{1,3}\s+(.+)$/);
    if (match) {
      flush();
      heading = match[1].trim();
      continue;
    }
    buffer.push(line);
  }
  flush();
  return chunks;
}
