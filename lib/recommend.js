// Maps the user's onboarding profile to the card types most relevant to them.
// Recommendation is derived client-side after onboarding (the learning map is
// generated before the profile exists).

const CONTEXT_TYPES = {
  'Student': ['Key Insight', 'Framework'],
  'Professional': ['Framework', 'Practical Tool'],
  'Parent': ['Mindset Shift', 'Common Mistake'],
  'Entrepreneur': ['Framework', 'Key Insight'],
  'Other': ['Framework', 'Key Insight', 'Mindset Shift', 'Practical Tool', 'Common Mistake'],
};

const CHALLENGE_TYPES = {
  'Communication & relationships': ['Mindset Shift', 'Practical Tool'],
  'Career & performance': ['Framework', 'Practical Tool'],
  'Focus & productivity': ['Practical Tool', 'Common Mistake'],
  'Confidence & mindset': ['Mindset Shift', 'Key Insight'],
  'Work-life balance': ['Mindset Shift', 'Common Mistake'],
};

export function getRecommendedTypes(profile) {
  if (!profile) return [];
  const set = new Set();
  (CONTEXT_TYPES[profile.lifeContext] || []).forEach(t => set.add(t));
  (CHALLENGE_TYPES[profile.challenge] || []).forEach(t => set.add(t));
  return Array.from(set);
}

// Returns an ordered list of card ids to highlight as "recommended" — only
// unexplored cards whose type matches the profile, capped so the map doesn't
// glow everywhere.
export function pickRecommendedCardIds(cards, statuses, profile, cap = 4) {
  const types = getRecommendedTypes(profile);
  if (types.length === 0) return [];
  const result = [];
  for (const card of cards || []) {
    const status = (statuses && statuses[card.id]) || 'unexplored';
    if (status !== 'unexplored') continue;
    if (types.includes(card.type)) result.push(card.id);
    if (result.length >= cap) break;
  }
  return result;
}
