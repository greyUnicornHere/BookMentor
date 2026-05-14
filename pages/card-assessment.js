import { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { getRecommendedTypes } from '../lib/recommend';
import styles from '../styles/CardAssessment.module.css';

const LETTERS = ['A', 'B', 'C', 'D'];

function computeStatus(correct, total) {
  if (total > 0 && correct === total) return 'strength';
  if (total > 0 && correct / total >= 0.5) return 'partial';
  return 'gap';
}

const RESULT_COPY = {
  strength: { emoji: '✅', label: "You've got this" },
  partial: { emoji: '🟡', label: 'Good progress' },
  gap: { emoji: '🔴', label: 'Room to grow' },
};

export default function CardAssessment() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const userRef = useRef(null);
  const bookRef = useRef(null);
  const profileRef = useRef(null);
  const mapRef = useRef([]);

  const [card, setCard] = useState(null);
  const [phase, setPhase] = useState('loading'); // loading | question | result | error
  const [error, setError] = useState('');

  const [questions, setQuestions] = useState([]);
  const [coachingInsight, setCoachingInsight] = useState('');
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [selectedLetter, setSelectedLetter] = useState(null);
  const [locked, setLocked] = useState(false);
  const [direction, setDirection] = useState('in');

  const [result, setResult] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadCard = async (targetCard) => {
    setPhase('loading');
    setError('');
    setQuestions([]);
    setCoachingInsight('');
    setQIndex(0);
    setAnswers({});
    setSelectedLetter(null);
    setLocked(false);
    setResult(null);
    setDirection('in');
    setCard(targetCard);
    try {
      const res = await fetch('/api/generate-card-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          card: targetCard,
          userProfile: profileRef.current,
          bookContext: bookRef.current?.bookContext,
          bookTitle: bookRef.current?.bookTitle,
          bookText: bookRef.current?.bookText,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate questions');
      if (!Array.isArray(data.questions) || data.questions.length === 0) {
        throw new Error('No questions returned.');
      }
      setQuestions(data.questions);
      setCoachingInsight(data.coachingInsight || '');
      setPhase('question');
    } catch (err) {
      console.error(err);
      setError(err.message || 'Could not build this assessment.');
      setPhase('error');
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) {
        router.replace('/');
        return;
      }
      let bookData, profileData, mapData, selectedCard;
      try {
        bookData = JSON.parse(sessionStorage.getItem('bm_book') || 'null');
        profileData = JSON.parse(sessionStorage.getItem('bm_profile') || 'null');
        mapData = JSON.parse(sessionStorage.getItem('bm_learning_map') || 'null');
        selectedCard = JSON.parse(sessionStorage.getItem('bm_selected_card') || 'null');
      } catch {
        router.replace('/map');
        return;
      }
      if (!bookData || !selectedCard) {
        router.replace('/map');
        return;
      }
      userRef.current = u;
      bookRef.current = bookData;
      profileRef.current = profileData;
      mapRef.current = Array.isArray(mapData) ? mapData : [];
      setReady(true);
      loadCard(selectedCard);
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const total = questions.length;
  const currentQ = questions[qIndex];

  const onSelect = (letter) => {
    if (locked || !currentQ) return;
    setSelectedLetter(letter);
    setLocked(true);
    setAnswers(prev => ({ ...prev, [currentQ.id]: letter }));
  };

  const finishAssessment = async (finalAnswers) => {
    let correct = 0;
    questions.forEach(q => {
      if (finalAnswers[q.id] && finalAnswers[q.id] === q.correctAnswer) correct++;
    });
    const status = computeStatus(correct, total);
    setResult({ correct, total, status });
    setPhase('result');

    const u = userRef.current;
    const book = bookRef.current;
    if (u && book && card) {
      setSaving(true);
      try {
        await setDoc(
          doc(db, 'users', u.uid, 'books', book.bookId, 'cards', card.id),
          {
            status,
            score: correct,
            total,
            title: card.title,
            type: card.type,
            updatedAt: serverTimestamp(),
          }
        );
      } catch (e) {
        console.error('Failed to save card status:', e);
      } finally {
        setSaving(false);
      }
    }

    try {
      const completed = JSON.parse(sessionStorage.getItem('bm_completed') || '[]');
      if (card && !completed.includes(card.id)) {
        completed.push(card.id);
        sessionStorage.setItem('bm_completed', JSON.stringify(completed));
      }
    } catch {
      // ignore
    }
  };

  const onNext = () => {
    if (!locked) return;
    if (qIndex < total - 1) {
      setDirection('out');
      setTimeout(() => {
        setQIndex(i => i + 1);
        setSelectedLetter(null);
        setLocked(false);
        setDirection('in');
      }, 260);
      return;
    }
    finishAssessment(answers);
  };

  const findNextRecommended = () => {
    let completed = [];
    try {
      completed = JSON.parse(sessionStorage.getItem('bm_completed') || '[]');
    } catch {
      completed = [];
    }
    const list = mapRef.current || [];
    const types = getRecommendedTypes(profileRef.current);
    const matched = list.find(
      c => c.id !== card?.id && !completed.includes(c.id) && types.includes(c.type)
    );
    if (matched) return matched;
    return list.find(c => c.id !== card?.id && !completed.includes(c.id)) || null;
  };

  const onNextRecommended = () => {
    const next = findNextRecommended();
    if (!next) {
      router.push('/map');
      return;
    }
    sessionStorage.setItem('bm_selected_card', JSON.stringify(next));
    loadCard(next);
  };

  if (!ready) {
    return (
      <div className={styles.boot}>
        <div className={styles.spinner} />
      </div>
    );
  }

  return (
    <>
      <Head><title>{card ? card.title : 'Assessment'} — BookMentor</title></Head>

      <main className={styles.main}>
        <header className={styles.topBar}>
          <button className={styles.exitBtn} onClick={() => router.push('/map')} aria-label="Back to map">
            ✕
          </button>
          <div className={styles.progressTrack}>
            <div
              className={styles.progressFill}
              style={{
                width:
                  phase === 'question' && total > 0
                    ? `${((qIndex + (locked ? 1 : 0)) / total) * 100}%`
                    : phase === 'result'
                    ? '100%'
                    : '0%',
              }}
            />
          </div>
          <div className={styles.count}>
            {phase === 'question' && total > 0 ? `${qIndex + 1}/${total}` : ''}
          </div>
        </header>

        {card && (
          <div className={styles.conceptBar}>
            <span className={styles.conceptType}>{card.type}</span>
            <span className={styles.conceptTitle}>{card.title}</span>
          </div>
        )}

        {phase === 'loading' && (
          <div className={styles.centerWrap}>
            <div className={styles.spinner} />
            <p className={styles.centerText}>Building your assessment...</p>
            <p className={styles.centerHint}>Writing scenarios tailored to you.</p>
          </div>
        )}

        {phase === 'error' && (
          <div className={styles.centerWrap}>
            <p className={styles.centerText}>Something went wrong</p>
            <p className={styles.centerHint}>{error}</p>
            <div className={styles.resultActions}>
              <button className={styles.secondaryBtn} onClick={() => router.push('/map')}>
                Back to map
              </button>
              {card && (
                <button className={styles.primaryBtn} onClick={() => loadCard(card)}>
                  Try again
                </button>
              )}
            </div>
          </div>
        )}

        {phase === 'question' && currentQ && (
          <section
            key={qIndex}
            className={`${styles.questionWrap} ${direction === 'in' ? styles.slideIn : styles.slideOut}`}
          >
            <p className={styles.scenarioLabel}>Scenario</p>
            <h1 className={styles.questionText}>{currentQ.question}</h1>

            <div className={styles.options}>
              {currentQ.options.map((opt, i) => {
                const letter = LETTERS[i];
                const label = opt.replace(/^\s*[A-D]\)\s*/, '');
                const isSelected = selectedLetter === letter;
                const isCorrect = letter === currentQ.correctAnswer;
                let stateClass = '';
                if (locked) {
                  if (isCorrect) stateClass = styles.optionCorrect;
                  else if (isSelected) stateClass = styles.optionWrong;
                  else stateClass = styles.optionDimmed;
                }
                return (
                  <button
                    key={letter}
                    type="button"
                    className={`${styles.option} ${stateClass}`}
                    onClick={() => onSelect(letter)}
                    disabled={locked}
                  >
                    <span className={styles.optionLetter}>{letter}</span>
                    <span className={styles.optionText}>{label}</span>
                  </button>
                );
              })}
            </div>

            {locked && (
              <div
                className={`${styles.feedback} ${
                  selectedLetter === currentQ.correctAnswer ? styles.feedbackOk : styles.feedbackBad
                }`}
              >
                <p className={styles.feedbackHead}>
                  {selectedLetter === currentQ.correctAnswer ? '✅ Correct' : '❌ Not quite'}
                </p>
                <p className={styles.feedbackBody}>{currentQ.explanation}</p>
              </div>
            )}

            <div className={styles.footer}>
              <button
                className={`${styles.nextBtn} ${locked ? styles.nextBtnActive : ''}`}
                onClick={onNext}
                disabled={!locked}
              >
                {qIndex === total - 1 ? 'See result' : 'Next'}
              </button>
            </div>
          </section>
        )}

        {phase === 'result' && result && (
          <section className={styles.resultWrap}>
            <div className={styles.resultEmoji}>{RESULT_COPY[result.status].emoji}</div>
            <p className={styles.resultScore}>
              {result.correct}/{result.total} correct
            </p>
            <h1 className={styles.resultStatus}>{RESULT_COPY[result.status].label}</h1>

            {coachingInsight && (
              <div className={styles.insightCard}>
                <p className={styles.insightLabel}>Coaching insight</p>
                <p className={styles.insightBody}>{coachingInsight}</p>
              </div>
            )}

            {saving && <p className={styles.savingNote}>Saving your progress...</p>}

            <div className={styles.resultActions}>
              <button className={styles.secondaryBtn} onClick={() => router.push('/map')}>
                Back to map
              </button>
              <button className={styles.primaryBtn} onClick={onNextRecommended}>
                Next recommended card
              </button>
            </div>
          </section>
        )}
      </main>
    </>
  );
}
