const ASSESSMENT_PROMPT = `You are the coach from Good Will Hunting — warm, perceptive, honest. You designed the diagnostic the reader just took, and now you must tell them the truth about how they think about this book's core ideas, AND give them a complete map of what this book contains.

Book title: {BOOK_TITLE}

Core ideas of the book (each tested by one question):
{CORE_IDEAS}

The reader answered the following questions:
{QA_BLOCK}

Scorecard:
- Correct: {CORRECT_COUNT} of {TOTAL_COUNT}
- Principles they got: {STRENGTH_PRINCIPLES}
- Principles they missed: {MISSED_PRINCIPLES}

Your task has THREE parts.

PART 1 — "how_you_think"
One short paragraph (3-5 sentences) that names the pattern beneath their answers. What does their selection across these scenarios reveal about how they reason, what they reach for, what they overlook? Be specific to what they actually picked. No platitudes. No generic coach-speak.

PART 2 — "blind_spots" (2 or 3 items)
Each one is a sharp, named observation:
  - name: a bold, vivid phrase that crystallizes the pattern (e.g., "You reason when you should empathize", "You optimize before you understand")
  - description: one honest sentence anchored in the book's logic — what they default to vs. what the book says
Each blind spot must trace back to specific principles they missed. No vague "you sometimes struggle with X" — be sharp.

PART 3 — "learning_map" (the full curriculum from this book)
Extract and categorize the book's actual content into FIVE TYPES. For each, use the exact type string shown:
  - "Framework": models, systems, step-by-step processes the book teaches (e.g., a 4-step method, a 2x2 matrix)
  - "Key Insight": surprising findings, data points, counterintuitive ideas the book is built on
  - "Mindset Shift": how the book wants you to think differently about something
  - "Practical Tool": specific techniques, scripts, drills, or methods you can apply
  - "Common Mistake": what the book warns against — the failure mode it tries to fix

For each item, return:
  - type: one of the five strings above, exactly
  - title: short name (2-6 words)
  - description: ONE sentence explaining what it means in plain language a stranger could understand
  - status: "recommended" | "strength" | "neutral"

How to set status:
  - "recommended": the user demonstrated they need this — it maps closely to a principle they MISSED, or it is a tool/framework that directly addresses their blind spots. These should glow yellow for the reader.
  - "strength": the user demonstrated mastery of this — it maps to a principle they got CORRECT.
  - "neutral": this is core book content but not directly tested by their answers — they neither demonstrated it nor failed it.

Aim for roughly 12-20 total items across the five types, with at least 1 item per type when the book supports it. Do not invent content not in the book. Do not collapse distinct ideas into one to fit a quota.

Return ONLY valid JSON in this exact shape, no markdown, no code fences:
{
  "how_you_think": "3-5 sentence narrative on their pattern of thought",
  "blind_spots": [
    {"name": "Bold vivid name", "description": "One sharp honest sentence."},
    {"name": "Bold vivid name", "description": "One sharp honest sentence."}
  ],
  "learning_map": [
    {"type": "Framework", "title": "Short name", "description": "One sentence.", "status": "recommended"}
  ]
}

Rules:
- type must be one of: "Framework", "Key Insight", "Mindset Shift", "Practical Tool", "Common Mistake".
- status must be one of: "recommended", "strength", "neutral".
- Output must be valid JSON parseable by JSON.parse — no trailing commas, no comments.`;

const VALID_TYPES = new Set(['Framework', 'Key Insight', 'Mindset Shift', 'Practical Tool', 'Common Mistake']);
const VALID_STATUSES = new Set(['recommended', 'strength', 'neutral']);

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

  const { bookTitle, coreIdeas, questions, answers } = req.body;
  if (!questions || !answers) {
    return res.status(400).json({ error: 'Missing questions or answers' });
  }

  let correctCount = 0;
  const missedPrinciples = [];
  const strengthPrinciples = [];

  const qaLines = questions.map((q, i) => {
    const userAnswer = answers[q.id] || '';
    const correct = q.correctAnswer && userAnswer === q.correctAnswer;
    if (correct) {
      correctCount++;
      if (q.coreIdea) strengthPrinciples.push(q.coreIdea);
    } else if (q.coreIdea) {
      missedPrinciples.push(q.coreIdea);
    }

    const userOption = q.options?.find(o => o.startsWith(`${userAnswer})`)) || '(no answer)';
    const correctOption = q.options?.find(o => o.startsWith(`${q.correctAnswer})`)) || '';
    return `Q${i + 1} [tests: ${q.coreIdea}]
Scenario: ${q.question}
User chose: ${userOption}
Book's answer: ${correctOption}
Result: ${correct ? 'CORRECT' : 'MISSED'}`;
  }).join('\n\n');

  const total = questions.length;
  const score = total > 0 ? Math.round((correctCount / total) * 100) : 0;

  const prompt = ASSESSMENT_PROMPT
    .replace('{BOOK_TITLE}', bookTitle || 'this book')
    .replace('{CORE_IDEAS}', (coreIdeas || []).map((c, i) => `${i + 1}. ${c}`).join('\n'))
    .replace('{QA_BLOCK}', qaLines)
    .replace('{CORRECT_COUNT}', String(correctCount))
    .replace('{TOTAL_COUNT}', String(total))
    .replace('{STRENGTH_PRINCIPLES}', strengthPrinciples.length ? strengthPrinciples.join('; ') : 'none')
    .replace('{MISSED_PRINCIPLES}', missedPrinciples.length ? missedPrinciples.join('; ') : 'none');

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
            temperature: 0.7,
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
    if (!parsed || !parsed.how_you_think) {
      console.error('Invalid assessment response:', raw.slice(0, 500));
      throw new Error('Gemini returned an invalid assessment.');
    }

    const learningMap = Array.isArray(parsed.learning_map)
      ? parsed.learning_map
          .filter(item => item && item.title)
          .map(item => ({
            type: VALID_TYPES.has(item.type) ? item.type : 'Key Insight',
            title: String(item.title).trim(),
            description: String(item.description || '').trim(),
            status: VALID_STATUSES.has(item.status) ? item.status : 'neutral',
          }))
      : [];

    const blindSpots = Array.isArray(parsed.blind_spots)
      ? parsed.blind_spots
          .filter(b => b && (b.name || b.description))
          .slice(0, 3)
          .map(b => ({ name: b.name || '', description: b.description || '' }))
      : [];

    return res.status(200).json({
      score,
      how_you_think: parsed.how_you_think || '',
      blind_spots: blindSpots,
      learning_map: learningMap,
      correct: correctCount,
      total,
    });
  } catch (error) {
    console.error('generate-assessment error:', error);
    return res.status(500).json({ error: error.message || 'Failed to generate assessment' });
  }
}
