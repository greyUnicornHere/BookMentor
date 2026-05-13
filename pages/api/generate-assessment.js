const ASSESSMENT_PROMPT = `You are the coach from Good Will Hunting — warm, perceptive, honest. You designed the diagnostic the reader just took, and now you must tell them the truth about where they stand with this book's core ideas.

Book title: {BOOK_TITLE}

Core ideas of the book:
{CORE_IDEAS}

The reader answered the following questions:
{QA_BLOCK}

Their scorecard:
- Correct: {CORRECT_COUNT} of {TOTAL_COUNT}
- Missed principles: {MISSED_PRINCIPLES}

Your task:
1. Choose a level from exactly one of: "Beginner", "Developing", "Advanced".
   - Beginner: missed half or more — they are reading the words but not absorbing the framework.
   - Developing: getting some core ideas but with clear, specific blind spots.
   - Advanced: nearly all correct — they have internalized the book's logic.
2. Write a one-sentence level_summary that is honest and specific to what their answers revealed.
3. Write 2-3 sentences of blind_spots — name the specific principles they missed and what that pattern reveals about how they currently think. Reference the book's language. No generic platitudes.
4. Write a 3-4 step roadmap drawn directly from this book's tools, drills, or practices. Each step must be concrete enough to do this week. No fluff.

Return ONLY valid JSON in this exact shape, no markdown, no code fences:
{
  "level": "Beginner|Developing|Advanced",
  "level_summary": "one honest sentence",
  "blind_spots": "2-3 sentences on the specific principles missed and the pattern beneath them",
  "roadmap": ["concrete action 1", "concrete action 2", "concrete action 3", "concrete action 4"]
}

The roadmap array must have 3 or 4 items. Output must be valid JSON — no trailing commas, no comments.`;

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
  const qaLines = questions.map((q, i) => {
    const userAnswer = answers[q.id] || '';
    const correct = q.correctAnswer && userAnswer === q.correctAnswer;
    if (correct) correctCount++;
    else if (q.coreIdea) missedPrinciples.push(q.coreIdea);

    const userOption = q.options?.find(o => o.startsWith(`${userAnswer})`)) || `(no answer)`;
    const correctOption = q.options?.find(o => o.startsWith(`${q.correctAnswer})`)) || '';
    return `Q${i + 1} [tests: ${q.coreIdea}]
Scenario: ${q.question}
User chose: ${userOption}
Book's answer: ${correctOption}
Result: ${correct ? 'CORRECT' : 'MISSED'}`;
  }).join('\n\n');

  const prompt = ASSESSMENT_PROMPT
    .replace('{BOOK_TITLE}', bookTitle || 'this book')
    .replace('{CORE_IDEAS}', (coreIdeas || []).map((c, i) => `${i + 1}. ${c}`).join('\n'))
    .replace('{QA_BLOCK}', qaLines)
    .replace('{CORRECT_COUNT}', String(correctCount))
    .replace('{TOTAL_COUNT}', String(questions.length))
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
            maxOutputTokens: 4000,
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
    if (!parsed || !parsed.level) {
      console.error('Invalid assessment response:', raw.slice(0, 500));
      throw new Error('Gemini returned an invalid assessment.');
    }

    return res.status(200).json({
      level: parsed.level,
      level_summary: parsed.level_summary || '',
      blind_spots: parsed.blind_spots || '',
      roadmap: Array.isArray(parsed.roadmap) ? parsed.roadmap.slice(0, 4) : [],
      score: { correct: correctCount, total: questions.length },
    });
  } catch (error) {
    console.error('generate-assessment error:', error);
    return res.status(500).json({ error: error.message || 'Failed to generate assessment' });
  }
}
