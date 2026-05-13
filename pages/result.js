import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import styles from '../styles/Result.module.css';

const LEVEL_COPY = {
  Beginner: 'You\'re at the start of the path.',
  Developing: 'You\'re moving — with specific gaps.',
  Advanced: 'You\'ve internalized the book.',
};

export default function Result() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [data, setData] = useState(null);
  const [ready, setReady] = useState(false);
  const savedRef = useState({ saved: false })[0];

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) {
        router.replace('/');
        return;
      }
      setUser(u);
      try {
        const raw = sessionStorage.getItem('bm_result');
        if (!raw) {
          router.replace('/');
          return;
        }
        setData(JSON.parse(raw));
        setReady(true);
      } catch {
        router.replace('/');
      }
    });
    return unsub;
  }, [router]);

  useEffect(() => {
    if (!user || !data || savedRef.saved) return;
    savedRef.saved = true;
    (async () => {
      try {
        await addDoc(collection(db, 'users', user.uid, 'assessments'), {
          bookTitle: data.bookTitle || '',
          level: data.level || '',
          level_summary: data.level_summary || '',
          blind_spots: data.blind_spots || '',
          roadmap: data.roadmap || [],
          score: data.score || null,
          coreIdeas: data.coreIdeas || [],
          questions: data.questions || [],
          answers: data.answers || {},
          createdAt: serverTimestamp(),
        });
      } catch (e) {
        console.error('Failed to save assessment:', e);
      }
    })();
  }, [user, data, savedRef]);

  if (!ready || !data) {
    return (
      <div className={styles.boot}>
        <div className={styles.spinner} />
      </div>
    );
  }

  const level = data.level || 'Developing';
  const levelKey = LEVEL_COPY[level] ? level : 'Developing';

  return (
    <>
      <Head><title>Your Assessment — {data.bookTitle}</title></Head>

      <main className={styles.main}>
        <div className={styles.bgTexture} />

        <div className={styles.reveal}>
          <p className={styles.bookLine}>On <em>{data.bookTitle}</em></p>

          <div className={styles.levelCard}>
            <p className={styles.levelEyebrow}>Your level</p>
            <h1 className={styles.levelName}>{level}</h1>
            <p className={styles.levelTag}>{LEVEL_COPY[levelKey]}</p>
            {data.score && (
              <p className={styles.score}>{data.score.correct} of {data.score.total} principles correct</p>
            )}
          </div>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>The honest read</h2>
            <p className={styles.sectionBody}>{data.level_summary}</p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Your blind spots</h2>
            <p className={styles.sectionBody}>{data.blind_spots}</p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Your roadmap</h2>
            <ol className={styles.roadmap}>
              {(data.roadmap || []).map((step, i) => (
                <li key={i} className={styles.roadmapItem}>
                  <span className={styles.stepNum}>{i + 1}</span>
                  <span className={styles.stepText}>{step}</span>
                </li>
              ))}
            </ol>
          </section>

          <div className={styles.actions}>
            <button className={styles.primaryBtn} onClick={() => {
              sessionStorage.removeItem('bm_assessment');
              sessionStorage.removeItem('bm_result');
              router.push('/');
            }}>
              Assess another book
            </button>
          </div>
        </div>
      </main>
    </>
  );
}
