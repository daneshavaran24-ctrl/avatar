/**
 * Turns a written Persian answer into text that *sounds* right when spoken.
 *
 * Voice models read raw answers literally: digits become English numerals,
 * markdown symbols are pronounced, Latin brand names get a foreign accent and
 * missing punctuation flattens the prosody. This module rewrites the answer
 * into fully spelled-out, well punctuated Persian before it reaches the
 * synthesizer, which is where most of the perceived fluency comes from.
 */

const ONES = [
  "",
  "یک",
  "دو",
  "سه",
  "چهار",
  "پنج",
  "شش",
  "هفت",
  "هشت",
  "نه",
];
const TEENS = [
  "ده",
  "یازده",
  "دوازده",
  "سیزده",
  "چهارده",
  "پانزده",
  "شانزده",
  "هفده",
  "هجده",
  "نوزده",
];
const TENS = ["", "", "بیست", "سی", "چهل", "پنجاه", "شصت", "هفتاد", "هشتاد", "نود"];
const HUNDREDS = [
  "",
  "صد",
  "دویست",
  "سیصد",
  "چهارصد",
  "پانصد",
  "ششصد",
  "هفتصد",
  "هشتصد",
  "نهصد",
];
const SCALES: { value: number; name: string }[] = [
  { value: 1_000_000_000, name: "میلیارد" },
  { value: 1_000_000, name: "میلیون" },
  { value: 1_000, name: "هزار" },
];

function belowThousand(value: number): string {
  const parts: string[] = [];
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  if (hundreds) parts.push(HUNDREDS[hundreds]!);
  if (rest >= 10 && rest < 20) parts.push(TEENS[rest - 10]!);
  else {
    const tens = Math.floor(rest / 10);
    const ones = rest % 10;
    if (tens) parts.push(TENS[tens]!);
    if (ones) parts.push(ONES[ones]!);
  }
  return parts.join(" و ");
}

/** 1۴۵۰ → «هزار و چهارصد و پنجاه». */
export function persianNumberToWords(input: number): string {
  if (!Number.isFinite(input)) return "";
  if (input === 0) return "صفر";
  const negative = input < 0;
  let value = Math.abs(Math.trunc(input));
  const decimals = Math.abs(input) - value;

  const parts: string[] = [];
  for (const scale of SCALES) {
    if (value >= scale.value) {
      const count = Math.floor(value / scale.value);
      value %= scale.value;
      parts.push(count === 1 ? scale.name : `${belowThousand(count)} ${scale.name}`);
    }
  }
  if (value) parts.push(belowThousand(value));

  let words = parts.filter(Boolean).join(" و ");
  if (decimals > 0) {
    const fraction = String(Math.round(decimals * 100)).padStart(2, "0");
    words += ` ممیز ${belowThousand(Number(fraction))}`;
  }
  return negative ? `منفی ${words}` : words;
}

/** Latin words a Persian narrator otherwise pronounces with a foreign accent. */
const LATIN_TERMS: [RegExp, string][] = [
  [/\bPDF\b/gi, "پی‌دی‌اف"],
  [/\bAPI\b/gi, "ای‌پی‌آی"],
  [/\bID\b/g, "شناسه"],
  [/\bOK\b/gi, "اوکی"],
  [/\bSMS\b/gi, "پیامک"],
  [/\bEmail\b/gi, "ایمیل"],
  [/\bURL\b/gi, "نشانی اینترنتی"],
  [/\bAI\b/g, "هوش مصنوعی"],
];

const ABBREVIATIONS: [RegExp, string][] = [
  [/(^|\s)ص\.(?=\s|$)/g, "$1صفحهٔ "],
  [/(^|\s)ره(?=\s|$)/g, "$1رحمة‌الله‌علیه"],
  [/(^|\s)و غیره(?=\s|$)/g, "$1و موارد دیگر"],
  [/\bو\/یا\b/g, "و یا"],
];

/** Converts written Persian into fluent, speakable Persian. */
export function toSpeechText(input: string): string {
  let text = input.normalize("NFC");

  // Markdown and bullet symbols are read aloud otherwise.
  text = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/(\*\*|__|\*|_)/g, "")
    .replace(/^\s*[-–—•]\s+/gm, "")
    .replace(/^\s*(\d+)[.)]\s+/gm, "$1. ")
    .replace(/\|/g, " ")
    .replace(/[<>#^~]/g, " ");

  // Arabic digits/letters → Persian equivalents handled by the shared normalizer's map.
  text = text
    .replace(/[٠۰]/g, "0")
    .replace(/[١۱]/g, "1")
    .replace(/[٢۲]/g, "2")
    .replace(/[٣۳]/g, "3")
    .replace(/[٤۴]/g, "4")
    .replace(/[٥۵]/g, "5")
    .replace(/[٦۶]/g, "6")
    .replace(/[٧۷]/g, "7")
    .replace(/[٨۸]/g, "8")
    .replace(/[٩۹]/g, "9")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک");

  for (const [pattern, replacement] of LATIN_TERMS) text = text.replace(pattern, replacement);
  for (const [pattern, replacement] of ABBREVIATIONS) text = text.replace(pattern, replacement);

  // Units and symbols before numbers, so the numeral pass sees plain digits.
  text = text
    .replace(/(\d)\s*%/g, "$1 درصد")
    .replace(/٪/g, " درصد")
    .replace(/(\d)\s*(ریال|تومان)/g, "$1 $2")
    .replace(/&/g, " و ");

  // Dates: 1403/05/12 → «۱۴۰۳ ماه ۵ روز ۱۲» reads badly; say it as a date.
  text = text.replace(/\b(\d{4})[/-](\d{1,2})[/-](\d{1,2})\b/g, (_m, y, mo, d) =>
    `${persianNumberToWords(Number(d))} ماه ${persianNumberToWords(Number(mo))} سال ${persianNumberToWords(Number(y))}`,
  );

  // Times: 14:30 → «ساعت چهارده و سی دقیقه».
  text = text.replace(/\b(\d{1,2}):(\d{2})\b/g, (_m, h, mi) =>
    `ساعت ${persianNumberToWords(Number(h))} و ${persianNumberToWords(Number(mi))} دقیقه`,
  );

  // Remaining numerals (thousand separators included) become words.
  text = text.replace(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g, (match) =>
    persianNumberToWords(Number(match.replace(/,/g, ""))),
  );

  // Prosody: normalize punctuation and give the model clear pause points.
  text = text
    .replace(/\s*\.\s*/g, "، ")
    .replace(/\s*[;؛]\s*/g, "، ")
    .replace(/\s*:\s*/g, "، ")
    .replace(/\s*،\s*/g, "، ")
    .replace(/\s*\?\s*/g, "؟ ")
    .replace(/\s*!\s*/g, "! ")
    .replace(/(؟|!)\s*/g, "$1 ")
    .replace(/\n{2,}/g, "... ")
    .replace(/\n/g, "، ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/(،\s*){2,}/g, "، ")
    .trim();

  // A trailing separator sounds like an unfinished sentence.
  text = text.replace(/[،\s]+$/g, "");
  return text.endsWith("؟") || text.endsWith("!") ? text : `${text}.`;
}

/**
 * Splits speech text into sentence groups. Groups end on real sentence
 * boundaries so each synthesized clip has a natural falling intonation.
 */
export function splitSpeechChunks(text: string, maxChars = 340): string[] {
  const sentences = text.match(/[^؟!.]+[؟!.]+\s*|[^؟!.]+$/g) ?? [text];
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current && current.length + sentence.length > maxChars) {
      chunks.push(current.trim());
      current = "";
    }
    current += sentence;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}
