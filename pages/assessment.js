import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../lib/firebase';
import styles from '../styles/Assessment.module.css';

const LETTERS = ['A', 'B', 'C', 'D'];

export default function Assessment() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [data, setData] = useState(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [selected, setSelected] = useState(null);
  const [direction, setDirection] = useState('in');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) {
        router.replace('/');
        return;
      }
      setUser(u);
      try {
        const raw = sessionStorage.getItem('bm_assessment');
        if (!raw) {
          router.replace('/');
          return;
        }
        const parsed = JSON.parse(raw);
        if (!parsed.questions || !parsed.questions.length) {
          router.replace('/');
          return;
        }
        setData(parsed);
        setReady(true);
      } catch {
        router.replace('/');
      }
    });
    return unsub;
  }, [router]);

  if (!ready || !data) {
    return (
      <div className={styles.boot}>
        <div className={styles.spinner} />
      </div>
    );
  }

  const total = data.questions.length;
  const current = data.questions[index];
  const progress = ((index + (selected ? 1 : 0)) / total) * 100;

  const onSelect = (letter) => {
    if (submitting) return;
    setSelected(letter);
  };

  const onNext = async () => {
    if (!selected) return;
    const updated = { ...answers, [current.id]: selected };
    setAnswers(updated);

    if (index < total - 1) {
      setDirection('out');
      setTimeout(() => {
        setIndex(i => i + 1);
        setSelected(null);
        setDirection('in');
      }, 260);
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/generate-assessment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookTitle: data.bookTitle,
          coreIdeas: data.coreIdeas,
          questions: data.questions,
          answers: updated,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to generate assessment');

      sessionStorage.setItem('bm_result', JSON.stringify({
        bookTitle: data.bookTitle,
        ...result,
        answers: updated,
        questions: data.questions,
        coreIdeas: data.coreIdeas,
      }));
      router.push('/result');
    } catch (err) {
      setError(err.message || 'Could not finalize your assessment.');
      setSubmitting(false);
    }
  };

  return (
    <>
      <Head><title>Assessment — {data.bookTitle}</title></Head>

      <main className={styles.main}>
        <header className={styles.topBar}>
          <button className={styles.exitBtn} onClick={() => router.push('/')}>✕</button>
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${progress}%` }} />
          </div>
          <div className={styles.count}>{index + 1}/{total}</div>
        </header>

        {submitting ? (
          <div className={styles.submittingWrap}>
            <div className={styles.spinner} />
            <p className={styles.submittingText}>Reading your answers...</p>
            <p className={styles.submittingHint}>Building your gap assessment.</p>
          </div>
        ) : (
          <section className={`${styles.questionWrap} ${direction === 'in' ? styles.slideIn : styles.slideOut}`} key={current.id}>
            <p className={styles.scenarioLabel}>Scenario</p>
            <h1 className={styles.questionText}>{current.question}</h1>

            <div className={styles.options}>
              {current.options.map((opt, i) => {
                const letter = LETTERS[i];
                const isSelected = selected === letter;
                const label = opt.replace(/^\s*[A-D]\)\s*/, '');
                return (
                  <button
                    key={letter}
                    className={`${styles.option} ${isSelected ? styles.optionSelected : ''}`}
                    onClick={() => onSelect(letter)}
                    type="button"
                  >
                    <span className={styles.optionLetter}>{letter}</span>
                    <span className={styles.optionText}>{label}</span>
                  </button>
                );
              })}
            </div>

            {error && <p className={styles.error}>{error}</p>}

            <div className={styles.footer}>
              <button
                className={`${styles.nextBtn} ${selected ? styles.nextBtnActive : ''}`}
                disabled={!selected}
                onClick={onNext}
              >
                {index === total - 1 ? 'Finish' : 'Next'}
              </button>
            </div>
          </section>
        )}
      </main>
    </>
  );
}
