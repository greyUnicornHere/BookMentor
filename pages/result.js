import { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import styles from '../styles/Result.module.css';

const RING_RADIUS = 88;
const RING_CIRC = 2 * Math.PI * RING_RADIUS;

export default function Result() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [data, setData] = useState(null);
  const [ready, setReady] = useState(false);
  const [animatedScore, setAnimatedScore] = useState(0);
  const savedRef = useRef(false);

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
    if (!user || !data || savedRef.current) return;
    savedRef.current = true;
    (async () => {
      try {
        await addDoc(collection(db, 'users', user.uid, 'assessments'), {
          bookTitle: data.bookTitle || '',
          score: typeof data.score === 'number' ? data.score : 0,
          correct: data.correct ?? null,
          total: data.total ?? null,
          how_you_think: data.how_you_think || '',
          blind_spots: data.blind_spots || [],
          book_map: data.book_map || [],
          coreIdeas: data.coreIdeas || [],
          questions: data.questions || [],
          answers: data.answers || {},
          createdAt: serverTimestamp(),
        });
      } catch (e) {
        console.error('Failed to save assessment:', e);
      }
    })();
  }, [user, data]);

  useEffect(() => {
    if (!ready || !data) return;
    const target = Math.max(0, Math.min(100, Math.round(data.score ?? 0)));
    const start = performance.now();
    const duration = 1400;
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setAnimatedScore(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready, data]);

  if (!ready || !data) {
    return (
      <div className={styles.boot}>
        <div className={styles.spinner} />
      </div>
    );
  }

  const score = Math.max(0, Math.min(100, Math.round(data.score ?? 0)));
  const dashOffset = RING_CIRC - (RING_CIRC * (animatedScore / 100));

  const blindSpots = Array.isArray(data.blind_spots) ? data.blind_spots : [];
  const bookMap = Array.isArray(data.book_map) ? data.book_map : [];

  return (
    <>
      <Head><title>Your Assessment — {data.bookTitle}</title></Head>

      <main className={styles.main}>
        <div className={styles.bgTexture} />

        <div className={styles.reveal}>
          <p className={styles.bookLine}>On <em>{data.bookTitle}</em></p>

          <div className={styles.ringCard}>
            <div className={styles.ringWrap}>
              <svg className={styles.ring} viewBox="0 0 200 200" width="200" height="200">
                <circle
                  cx="100"
                  cy="100"
                  r={RING_RADIUS}
                  stroke="#E8D5C8"
                  strokeWidth="16"
                  fill="none"
                />
                <circle
                  cx="100"
                  cy="100"
                  r={RING_RADIUS}
                  stroke="#C4622D"
                  strokeWidth="16"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={RING_CIRC}
                  strokeDashoffset={dashOffset}
                  transform="rotate(-90 100 100)"
                  style={{ transition: 'stroke-dashoffset 0.05s linear' }}
                />
              </svg>
              <div className={styles.ringCenter}>
                <span className={styles.percentNum}>{animatedScore}</span>
                <span className={styles.percentSign}>%</span>
              </div>
            </div>
            <p className={styles.masteryLabel}>Mastery Score</p>
            {typeof data.correct === 'number' && typeof data.total === 'number' && (
              <p className={styles.scoreSub}>{data.correct} of {data.total} principles correct</p>
            )}
          </div>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>How You Think</h2>
            <p className={styles.sectionBody}>{data.how_you_think}</p>
          </section>

          {blindSpots.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Your Blind Spots</h2>
              <div className={styles.blindSpotList}>
                {blindSpots.map((b, i) => (
                  <div key={i} className={styles.blindSpotCard}>
                    <span className={styles.redDot} />
                    <div className={styles.blindSpotBody}>
                      <p className={styles.blindSpotName}>{b.name}</p>
                      <p className={styles.blindSpotDesc}>{b.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {bookMap.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Your Book Map</h2>
              <p className={styles.sectionSubtitle}>
                Every core idea from this book — personalized to where you stand
              </p>
              <div className={styles.mapGrid}>
                {bookMap.map((item, i) => {
                  const isGap = item.status === 'gap';
                  return (
                    <div
                      key={i}
                      className={`${styles.mapCard} ${isGap ? styles.mapGap : styles.mapStrength}`}
                    >
                      <div className={styles.mapTag}>
                        {isGap ? 'Start here' : (
                          <>
                            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                              <path d="M3 8.5L6.5 12L13 4.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            You&apos;ve got this
                          </>
                        )}
                      </div>
                      <p className={styles.mapIdea}>{item.idea}</p>
                      {item.description && (
                        <p className={styles.mapDesc}>{item.description}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

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
