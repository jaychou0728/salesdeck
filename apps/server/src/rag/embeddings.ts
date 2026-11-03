function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function hashEmbedding(text: string, dims = 1024): number[] {
  const vector = new Array<number>(dims).fill(0);
  const normalized = text.toLowerCase().replace(/\s+/g, "");
  const grams: string[] = [];
  for (let i = 0; i < normalized.length; i += 1) {
    grams.push(normalized[i]);
    if (i < normalized.length - 1) grams.push(normalized.slice(i, i + 2));
    if (i < normalized.length - 2) grams.push(normalized.slice(i, i + 3));
  }
  for (const gram of grams) vector[fnv1a(gram) % dims] += 1;
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}

export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) dot += a[i] * b[i];
  return dot;
}
