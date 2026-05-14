const PROMPT = `You are a master educator who has just deeply read the following book.

---BOOK CONTENT START---
{BOOK_TEXT}
---BOOK CONTENT END---

Build a complete LEARNING MAP of this book — every concept worth learning, organized as cards.

STEP 1 — Identify the book's intent:
- bookContext: "universal" if its principles apply across all of life (negotiation, habits, mindset, communication, productivity), or "domain-specific" if written for one domain.
- bookDomain: one of "negotiation", "parenting", "business", "fitness", "productivity", "mindset", or "other".

STEP 2 — Extract 12-20 concept cards across these FIVE types (use the exact strings):
- "Framework": models, systems, step-by-step processes
- "Key Insight": surprising findings, data points, counterintuitive ideas
- "Mindset Shift": how the book wants you to think differently
- "Practical Tool": specific techniques, scripts, methods to apply
- "Common Mistake": what the book warns against doing

Include cards from all five types where the book supports it. Do not invent content not in the book. Do not collapse distinct ideas to hit a number.

STEP 3 — For each card, judge its complexity and set questions_count accordingly:
- "low" complexity -> questions_count 3
- "medium" complexity -> questions_count 4
- "high" complexity -> questions_count 5

Return ONLY valid JSON — no markdown fences, no preamble, no commentary:
{
  "bookTitle": "the actual title of the book",
  "bookContext": "universal|domain-specific",
  "bookDomain": "negotiation|parenting|business|fitness|productivity|mindset|other",
  "cards": [
    {
      "id": "unique_slug",
      "type": "Framework|Key Insight|Mindset Shift|Practical Tool|Common Mistake",
      "title": "Short name (max 5 words)",
      "description": "One sentence explaining this concept",
      "complexity": "low|medium|high",
      "questions_count": 3
    }
  ]
}

Rules:
- id must be a unique lowercase slug using only a-z, 0-9 and underscores.
- type and complexity must use the exact allowed strings.
- questions_count MUST match complexity: low=3, medium=4, high=5.
- 12-20 cards total.
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

const VALID_TYPES = ['Framework', 'Key Insight', 'Mindset Shift', 'Practical Tool', 'Common Mistake'];
const VALID_COMPLEXITY = ['low', 'medium', 'high'];
const COUNT_BY_COMPLEXITY = { low: 3, medium: 4, high: 5 };

function slugify(s, fallback) {
  const out = String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);
  return out || fallback;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { bookText } = req.body;
  if (!bookText) {
    return res.status(400).json({ error: 'Missing bookText' });
  }

  const truncatedBook = bookText.slice(0, 45000);
  const prompt = PROMPT.replace('{BOOK_TEXT}', truncatedBook);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 8000,
            temperature: 0.8,
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
    if (!parsed || !Array.isArray(parsed.cards) || parsed.cards.length === 0) {
      console.error('Invalid learning-map response:', raw.slice(0, 500));
      throw new Error('Gemini returned an invalid learning map.');
    }

    const seenIds = new Set();
    const cards = parsed.cards.slice(0, 20).map((c, i) => {
      const type = VALID_TYPES.includes(c.type) ? c.type : 'Key Insight';
      const complexity = VALID_COMPLEXITY.includes(c.complexity) ? c.complexity : 'medium';
      let id = slugify(c.id || c.title, `card_${i + 1}`);
      while (seenIds.has(id)) id = `${id}_${i + 1}`;
      seenIds.add(id);
      return {
        id,
        type,
        title: String(c.title || 'Untitled concept').trim(),
        description: String(c.description || '').trim(),
        complexity,
        questions_count: COUNT_BY_COMPLEXITY[complexity],
      };
    });

    return res.status(200).json({
      bookTitle: parsed.bookTitle || '',
      bookContext: parsed.bookContext === 'domain-specific' ? 'domain-specific' : 'universal',
      bookDomain: parsed.bookDomain || 'other',
      cards,
    });
  } catch (error) {
    console.error('generate-learning-map error:', error);
    return res.status(500).json({ error: error.message || 'Failed to generate learning map' });
  }
}
