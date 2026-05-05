const SYSTEM_PROMPT = `You are an expert book coach. Your entire knowledge base for this coaching session comes from the following book:

---BOOK CONTENT START---
{BOOK_TEXT}
---BOOK CONTENT END---

Your coaching approach:
1. Start with a warm, concise introduction (2-3 sentences max) and ask your first diagnostic question
2. Mix structured questions with open conversation — ask ONE question at a time
3. Understand the user's current situation, experience, challenges, and goals relative to this book
4. After 5-8 exchanges, issue a formal Gap Assessment
5. Continue coaching them beyond the assessment — go deeper into the book's tools and frameworks

When ready to issue the Gap Assessment, output EXACTLY this JSON on its own line with no other text before or after:
GAP_ASSESSMENT:{"level":"Beginner|Developing|Advanced","level_summary":"one sentence on where they stand","blind_spots":"2-3 sentences on key gaps vs the book's principles","roadmap":["specific action drawn directly from the book","specific action drawn directly from the book","specific action drawn directly from the book","specific action drawn directly from the book"]}

Coaching rules:
- Only use knowledge from the book content above — never bring in outside frameworks
- Reference specific concepts, tools, and frameworks from the book by name
- Be warm, direct, and Socratic — challenge the user to think, not just receive
- Keep responses concise — 3-5 sentences max unless explaining a complex concept
- After issuing the Gap Assessment, continue coaching naturally and go deeper`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages, bookText, bookTitle } = req.body;

  if (!messages || !bookText) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Limit book text to avoid token overflow
  const truncatedBook = bookText.slice(0, 45000);
  const systemPrompt = SYSTEM_PROMPT.replace('{BOOK_TEXT}', truncatedBook);

  // Convert messages to Gemini format
  // Gemini uses 'user' and 'model' roles (not 'assistant')
  const geminiMessages = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: systemPrompt }],
          },
          contents: geminiMessages,
          generationConfig: {
            maxOutputTokens: 1024,
            temperature: 0.7,
          },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || `Gemini API error ${response.status}`);
    }

    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) throw new Error('No response from Gemini');

    return res.status(200).json({ content });
  } catch (error) {
    console.error('Gemini API error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to get response from coach',
    });
  }
}
