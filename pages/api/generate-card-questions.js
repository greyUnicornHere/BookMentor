const PROMPT = `You are a master coach who has deeply read the book "{BOOK_TITLE}".

You are creating a focused mini-assessment for ONE concept from the book — not the whole book.

THE CONCEPT BEING TESTED:
- Type: {CARD_TYPE}
- Title: {CARD_TITLE}
- Description: {CARD_DESCRIPTION}

THE READER (personalize every scenario to this person):
- Name: {NAME}
- Age range: {AGE}
- Life context: {LIFE_CONTEXT}
- Why they picked this book: {REASON}
- Their biggest challenge right now: {CHALLENGE}

BOOK CONTEXT: {BOOK_CONTEXT}

RELEVANT BOOK CONTENT:
---
{BOOK_TEXT}
---

Write exactly {COUNT} multiple-choice scenario questions that reveal whether the reader has truly internalized THIS specific concept.

Rules for the questions:
- Each is a real-life scenario — "what would you do?" — that tests understanding of this one concept.
- Personalize the scenarios to the reader: their life context, age range, and challenge should shape who is in the scene and what is at stake. A parent gets family scenarios; a student gets study and social scenarios; a professional gets work scenarios. If the book is domain-specific, stay inside that domain but still tailor the situation to the reader.
- Four options labeled "A) ", "B) ", "C) ", "D) ". Exactly one is the answer this concept would endorse.
- Distractors must be plausible traps — the common-sense mistakes people make when they have not absorbed this concept.
- explanation: one sentence on why the correct answer is right, grounded in the book.

Also write ONE coachingInsight: a single warm, concrete sentence on how to actually apply this concept in daily life, in the spirit of the book.

Return ONLY valid JSON — no markdown fences, no preamble:
{
  "coachingInsight": "one sentence on applying this concept in real life",
  "questions": [
    {
      "question": "scenario text",
      "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
      "correctAnswer": "A",
      "explanation": "why this answer is correct according to the book"
    }
  ]
}

Rules:
- Exactly {COUNT} questions.
- correctAnswer must be exactly one of "A", "B", "C", "D".
- Each options array has 4 strings, each starting with its letter and a parenthesis.
- Output must be valid JSON parseable by JSON.parse — no trailing commas, no comments.`;

function extractJSON(text) {
  if (!text) return null;
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { card, userProfile, bookContext, bookText, bookTitle } = req.body;
  if (!card || !bookText) {
    return res.status(400).json({ error: 'Missing card or bookText' });
  }

  const profile = userProfile || {};
  const count = Math.max(3, Math.min(5, Number(card.questions_count) || 3));
  const excerpt = String(bookText).slice(0, 30000);

  const prompt = PROMPT
    .replace('{BOOK_TITLE}', bookTitle || 'this book')
    .replace('{CARD_TYPE}', card.type || '')
    .replace('{CARD_TITLE}', card.title || '')
    .replace('{CARD_DESCRIPTION}', card.description || '')
    .replace('{NAME}', profile.name || 'the reader')
    .replace('{AGE}', profile.ageRange || 'unknown')
    .replace('{LIFE_CONTEXT}', profile.lifeContext || 'unknown')
    .replace('{REASON}', profile.reason || 'unknown')
    .replace('{CHALLENGE}', profile.challenge || 'unknown')
    .replace('{BOOK_CONTEXT}', bookContext || 'universal')
    .replace('{BOOK_TEXT}', excerpt)
    .replace(/\{COUNT\}/g, String(count));

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 6000,
            temperature: 0.85,
            responseMimeType: 'application/json',
          },
        }),
      }
    );

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || `Gemini API error ${response.status}`);
    }

    const parts = data.candidates?.[0]?.content?.parts || [];
    const nonThoughtParts = parts.filter(p => p.text && !p.thought);
    const fallbackParts = parts.filter(p => p.text);
    const raw = (nonThoughtParts.length ? nonThoughtParts : fallbackParts).map(p => p.text).join('');

    if (!raw) throw new Error('No response from Gemini');

    const parsed = extractJSON(raw);
    if (!parsed || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
      console.error('Invalid card-questions response:', raw.slice(0, 500));
      throw new Error('Gemini returned invalid questions.');
    }

    const questions = parsed.questions.slice(0, count).map((q, i) => ({
      id: i + 1,
      question: String(q.question || '').trim(),
      options: Array.isArray(q.options) ? q.options.slice(0, 4).map(o => String(o)) : [],
      correctAnswer: typeof q.correctAnswer === 'string'
        ? q.correctAnswer.trim().charAt(0).toUpperCase()
        : '',
      explanation: String(q.explanation || '').trim(),
    }));

    return res.status(200).json({
      coachingInsight: String(parsed.coachingInsight || '').trim(),
      questions,
    });
  } catch (error) {
    console.error('generate-card-questions error:', error);
    return res.status(500).json({ error: error.message || 'Failed to generate questions' });
  }
}
