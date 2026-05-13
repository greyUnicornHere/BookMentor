const ASSESSMENT_PROMPT = `You are the coach from Good Will Hunting — warm, perceptive, honest. You designed the diagnostic the reader just took, and now you must tell them the truth about how they think about this book's core ideas.

Book title: {BOOK_TITLE}

Core ideas of the book:
{CORE_IDEAS}

The reader answered the following questions:
{QA_BLOCK}

Scorecard:
- Correct: {CORRECT_COUNT} of {TOTAL_COUNT}
- Principles they got: {STRENGTH_PRINCIPLES}
- Principles they missed: {MISSED_PRINCIPLES}

Your task:
1. Write a "how_you_think" narrative — one short paragraph (3-5 sentences) that names the pattern beneath their answers. What does their selection across these scenarios reveal about how they reason, what they reach for, what they overlook? Be specific to what they actually picked. No platitudes. No generic coach-speak.
2. Identify 2-3 blind_spots. Each one is a sharp, named observation in the form:
   - name: a bold, vivid phrase that crystallizes the pattern (e.g., "You reason when you should empathize", "You optimize before you understand")
   - description: one honest sentence anchored in the book's logic — what they default to vs. what the book says
   Each blind spot must trace back to specific principles they missed. No vague "you sometimes struggle with X" — be sharp.
3. For each core idea in the list, classify it as "gap" (they missed the question testing it) or "strength" (they got it). For each, write a one-sentence description in plain language of what that principle means. The description must be useful even to someone who never read the book.

Return ONLY valid JSON in this exact shape, no markdown, no code fences:
{
  "how_you_think": "3-5 sentence narrative on their pattern of thought",
  "blind_spots": [
    {"name": "Bold vivid name", "description": "One sharp honest sentence."},
    {"name": "Bold vivid name", "description": "One sharp honest sentence."}
  ],
  "book_map": [
    {"idea": "Plain-language name of the principle", "description": "One sentence on what this principle means.", "status": "gap"}
  ]
}

Rules:
- blind_spots array must have 2 or 3 items.
- book_map must include EVERY core idea from the list above, in the same order, with the correct status from the scorecard.
- status must be exactly "gap" or "strength".
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

  const { bookTitle, coreIdeas, questions, answers } = req.body;
  if (!questions || !answers) {
    return res.status(400).json({ error: 'Missing questions or answers' });
  }

  let correctCount = 0;
  const missedPrinciples = [];
  const strengthPrinciples = [];
  const ideaStatusMap = {};

  const qaLines = questions.map((q, i) => {
    const userAnswer = answers[q.id] || '';
    const correct = q.correctAnswer && userAnswer === q.correctAnswer;
    if (correct) {
      correctCount++;
      if (q.coreIdea) {
        strengthPrinciples.push(q.coreIdea);
        ideaStatusMap[q.coreIdea] = 'strength';
      }
    } else if (q.coreIdea) {
      missedPrinciples.push(q.coreIdea);
      ideaStatusMap[q.coreIdea] = 'gap';
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
            maxOutputTokens: 5000,
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

    const bookMap = Array.isArray(parsed.book_map) && parsed.book_map.length
      ? parsed.book_map.map(item => ({
          idea: item.idea || '',
          description: item.description || '',
          status: item.status === 'strength' ? 'strength' : 'gap',
        }))
      : (coreIdeas || []).map(idea => ({
          idea,
          description: '',
          status: ideaStatusMap[idea] === 'strength' ? 'strength' : 'gap',
        }));

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
      book_map: bookMap,
      correct: correctCount,
      total,
    });
  } catch (error) {
    console.error('generate-assessment error:', error);
    return res.status(500).json({ error: error.message || 'Failed to generate assessment' });
  }
}
