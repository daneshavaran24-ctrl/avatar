import { chatComplete, CLASSIFIER_MODEL } from "./providers.server";

const POLITICAL_HINTS = [
  "سیاس",
  "انتخابات",
  "دولت",
  "مجلس",
  "رئیس‌جمهور",
  "رییس جمهور",
  "حزب",
  "تحریم",
  "براندازی",
  "اپوزیسیون",
  "جنگ",
  "رهبر",
];

const RELIGIOUS_HINTS = [
  "مذهب",
  "دین",
  "اسلام",
  "مسیح",
  "یهود",
  "نماز",
  "روزه",
  "قرآن",
  "فتوا",
  "حلال",
  "حرام",
  "امام",
  "خدا",
  "پیامبر",
];

export type PolicyTopic = "POLITICAL" | "RELIGIOUS" | "NONE";

function keywordTopic(question: string): PolicyTopic {
  const text = question.toLowerCase();
  if (POLITICAL_HINTS.some((hint) => text.includes(hint))) return "POLITICAL";
  if (RELIGIOUS_HINTS.some((hint) => text.includes(hint))) return "RELIGIOUS";
  return "NONE";
}

/**
 * Two-stage gate: a cheap keyword prefilter, then a model confirmation so
 * ordinary questions that merely contain a hint word are not blocked.
 */
export async function classifyPolicyTopic(
  question: string,
  blockPolitical: boolean,
  blockReligious: boolean,
): Promise<PolicyTopic> {
  if (!blockPolitical && !blockReligious) return "NONE";

  const prefilter = keywordTopic(question);
  if (prefilter === "NONE") return "NONE";
  if (prefilter === "POLITICAL" && !blockPolitical) return "NONE";
  if (prefilter === "RELIGIOUS" && !blockReligious) return "NONE";

  try {
    const result = await chatComplete(
      [
        {
          role: "system",
          content:
            "پرسش کاربر را دسته‌بندی کن. فقط یکی از این سه کلمه را بدون توضیح بازگردان: POLITICAL اگر پرسش دربارهٔ سیاست، حکومت، احزاب یا مناقشات سیاسی است؛ RELIGIOUS اگر دربارهٔ باورها، احکام یا مناقشات دینی است؛ NONE در سایر موارد.",
        },
        { role: "user", content: question },
      ],
      { model: CLASSIFIER_MODEL, maxTokens: 8 },
    );

    const label = result.text.toUpperCase();
    if (label.includes("POLITICAL")) return blockPolitical ? "POLITICAL" : "NONE";
    if (label.includes("RELIGIOUS")) return blockReligious ? "RELIGIOUS" : "NONE";
    return "NONE";
  } catch {
    // Fail closed on the prefiltered topic: the admin explicitly asked to block it.
    return prefilter;
  }
}