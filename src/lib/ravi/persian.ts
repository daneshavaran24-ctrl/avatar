/** Persian text normalization shared by ingestion, retrieval and TTS. */
const ARABIC_TO_PERSIAN: Record<string, string> = {
  "ي": "ی",
  "ك": "ک",
  "ۀ": "ه",
  "ة": "ه",
  "٠": "0",
  "١": "1",
  "٢": "2",
  "٣": "3",
  "٤": "4",
  "٥": "5",
  "٦": "6",
  "٧": "7",
  "٨": "8",
  "٩": "9",
  "۰": "0",
  "۱": "1",
  "۲": "2",
  "۳": "3",
  "۴": "4",
  "۵": "5",
  "۶": "6",
  "۷": "7",
  "۸": "8",
  "۹": "9",
};

export function normalizePersian(input: string): string {
  let out = "";
  for (const char of input.normalize("NFC")) {
    out += ARABIC_TO_PERSIAN[char] ?? char;
  }
  return out
    // remove tashkeel / diacritics
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    // zero-width non joiner kept, other invisible chars dropped
    .replace(/[\u200B\u200E\u200F\uFEFF]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Semantic-ish chunking: paragraph aware with a character budget and overlap. */
export function chunkPersianText(
  text: string,
  { maxChars = 1100, overlap = 150 }: { maxChars?: number; overlap?: number } = {},
): string[] {
  const clean = normalizePersian(text);
  if (!clean) return [];

  const paragraphs = clean.split(/\n{2,}/).flatMap((paragraph) => {
    if (paragraph.length <= maxChars) return [paragraph];
    return paragraph.split(/(?<=[.!?؟。])\s+/);
  });

  const chunks: string[] = [];
  let current = "";

  for (const piece of paragraphs) {
    const candidate = current ? `${current}\n${piece}` : piece;
    if (candidate.length > maxChars && current) {
      chunks.push(current.trim());
      const tail = current.slice(-overlap);
      current = `${tail}\n${piece}`;
    } else {
      current = candidate;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  return chunks.filter((chunk) => chunk.replace(/\s/g, "").length > 30);
}