export interface RawChunk {
  heading: string;
  content: string;
}

export function chunkMarkdown(markdown: string, maxChars = 700): RawChunk[] {
  const lines = markdown.split(/\r?\n/);
  const chunks: RawChunk[] = [];
  let heading = "正文";
  let buffer: string[] = [];

  const flush = () => {
    const content = buffer.join("\n").trim();
    if (content) chunks.push({ heading, content });
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
    if (buffer.join("\n").length >= maxChars) flush();
  }
  flush();
  return chunks;
}
