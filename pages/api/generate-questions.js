const QUESTIONS_PROMPT = `You are a master educator and assessment designer who has just deeply read the following book.

---BOOK CONTENT START---
{BOOK_TEXT}
---BOOK CONTENT END---

Your task: design a Duolingo-style diagnostic assessment that reveals where a reader truly stands with this book's core ideas.

STEP 0 — IDENTIFY THE BOOK'S INTENT AND CONTEXT (do this silently before writing anything).
Before generating questions, identify the book's primary intent and audience. If the book's principles apply universally across life contexts (negotiation, habits, mindset, communication, productivity, decision-making, persuasion), generate questions from varied settings — workplace, home, romantic and friend relationships, family, and broader social life. If the book is written for a specific domain (parenting, fitness, business strategy, finance, cooking, sales, leadership of a specific kind), generate questions WITHIN that domain but vary the specific situations and stakeholders inside it (e.g., a parenting book: toddler bedtime, teen with phone, sibling fight, in-law conflict — not all toddler bedtime).
Never generate all questions from the same narrow context. No assessment should be all office meetings or all toddler tantrums. Variety inside the right domain is the rule.

Step 1 — Extract the distinct CORE ACTIONABLE IDEAS from this book.
- Find the principles that actually change behavior, not surface concepts.
- A core idea is something the author would say is non-negotiable to "getting" the book.
- Decide the number purely by the book's substance: minimum 5, maximum 10. Do not pad. Do not collapse.

Step 2 — For each core idea, write ONE scenario-based question (Type B).
- Present a real-life situation a reader might actually face.
- Ask "What would you do?" — the answer must reveal whether they have internalized the principle.
- Four multiple choice options labeled A) B) C) D).
- Exactly one option is the answer the book's principle would endorse.
- Distractors must be tempting and plausible — common-sense traps people fall into when they have not absorbed this principle.
- Keep each question to 2-4 sentences. Keep each option to one short sentence.
- Do not name the principle in the question. The user should not be able to game it.

CRITICAL — APPLY YOUR STEP 0 DECISION:
- If you decided the book is UNIVERSAL: spread scenarios deliberately across workplace, personal relationships (romantic, friendships), family (parents, siblings, kids), and social life (strangers, community, public). Each question, where possible, from a different context. No corporate-only language. A good test: would someone who has never worked in an office still recognize this scenario?
- If you decided the book is DOMAIN-SPECIFIC: stay inside the domain, but vary the specific situations and people inside it. Different stakeholders, settings, ages, stakes. Same domain, different angles. Never repeat the same micro-situation.
- Either way: NEVER generate all questions from the same narrow context.

Step 3 — Return ONLY valid JSON in this exact shape, with no markdown, no commentary, no code fences:
{
  "bookTitle": "the actual title of the book",
  "coreIdeas": ["principle 1 in plain language", "principle 2 in plain language"],
  "questions": [
    {
      "id": 1,
      "coreIdea": "the principle being tested",
      "question": "scenario question text",
      "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
      "correctAnswer": "A"
    }
  ]
}

Rules:
- correctAnswer must be exactly one of "A", "B", "C", "D".
- The options array must contain 4 strings, each starting with its letter and a closing parenthesis.
- coreIdeas.length must equal questions.length.
- Output must be valid JSON parseable by JSON.parse. No trailing commas. No comments.`;

function extractJSON(text) {
  if (!text) return null;
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  const candidate = cleaned.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
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
  const prompt = QUESTIONS_PROMPT.replace('{BOOK_TEXT}', truncatedBook);

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
    if (!parsed || !Array.isArray(parsed.questions) || parsed.questions.length < 5) {
      console.error('Invalid Gemini response:', raw.slice(0, 500));
      throw new Error('Gemini returned an invalid question set.');
    }

    const questions = parsed.questions.slice(0, 10).map((q, i) => ({
      id: i + 1,
      coreIdea: q.coreIdea || '',
      question: q.question || '',
      options: Array.isArray(q.options) ? q.options.slice(0, 4) : [],
      correctAnswer: typeof q.correctAnswer === 'string' ? q.correctAnswer.trim().charAt(0).toUpperCase() : '',
    }));

    return res.status(200).json({
      bookTitle: parsed.bookTitle || '',
      coreIdeas: Array.isArray(parsed.coreIdeas) ? parsed.coreIdeas : [],
      questions,
    });
  } catch (error) {
    console.error('generate-questions error:', error);
    return res.status(500).json({ error: error.message || 'Failed to generate questions' });
  }
}
