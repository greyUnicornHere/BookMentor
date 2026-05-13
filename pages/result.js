import { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import styles from '../styles/Result.module.css';

const RING_RADIUS = 88;
const RING_CIRC = 2 * Math.PI * RING_RADIUS;

const TYPE_ORDER = ['Framework', 'Key Insight', 'Mindset Shift', 'Practical Tool', 'Common Mistake'];
const TYPE_PLURAL = {
  'Framework': 'Frameworks',
  'Key Insight': 'Key Insights',
  'Mindset Shift': 'Mindset Shifts',
  'Practical Tool': 'Practical Tools',
  'Common Mistake': 'Common Mistakes',
};

export default function Result() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [data, setData] = useState(null);
  const [ready, setReady] = useState(false);
  const [animatedScore, setAnimatedScore] = useState(0);
  const [ringOffset, setRingOffset] = useState(RING_CIRC);
  const [selected, setSelected] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  const [assessmentDocId, setAssessmentDocId] = useState(null);
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
        const ref = await addDoc(collection(db, 'users', user.uid, 'assessments'), {
          bookTitle: data.bookTitle || '',
          score: typeof data.score === 'number' ? data.score : 0,
          correct: data.correct ?? null,
          total: data.total ?? null,
          how_you_think: data.how_you_think || '',
          blind_spots: data.blind_spots || [],
          learning_map: data.learning_map || [],
          coreIdeas: data.coreIdeas || [],
          questions: data.questions || [],
          answers: data.answers || {},
          selectedTitles: [],
          createdAt: serverTimestamp(),
        });
        setAssessmentDocId(ref.id);
      } catch (e) {
        console.error('Failed to save assessment:', e);
      }
    })();
  }, [user, data]);

  useEffect(() => {
    if (!ready || !data) return;
    const target = Math.max(0, Math.min(100, Math.round(data.score ?? 0)));
    const finalOffset = RING_CIRC * (1 - target / 100);
    const id = requestAnimationFrame(() => setRingOffset(finalOffset));

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
    return () => {
      cancelAnimationFrame(id);
      cancelAnimationFrame(raf);
    };
  }, [ready, data]);

  const toggleSelect = (title) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  };

  const saveSelections = async () => {
    if (!user || !assessmentDocId) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', user.uid, 'assessments', assessmentDocId), {
        selectedTitles: Array.from(selected),
        selectionsSavedAt: serverTimestamp(),
      });
      setSavedAt(Date.now());
    } catch (e) {
      console.error('Failed to save selections:', e);
    } finally {
      setSaving(false);
    }
  };

  if (!ready || !data) {
    return (
      <div className={styles.boot}>
        <div className={styles.spinner} />
      </div>
    );
  }

  const blindSpots = Array.isArray(data.blind_spots) ? data.blind_spots : [];
  const learningMap = Array.isArray(data.learning_map) ? data.learning_map : [];

  const grouped = TYPE_ORDER
    .map(type => ({ type, items: learningMap.filter(m => m.type === type) }))
    .filter(g => g.items.length > 0);

  return (
    <>
      <Head><title>Your Assessment — {data.bookTitle}</title></Head>

      <main className={styles.main}>
        <div className={styles.bgTexture} />

        <div className={styles.reveal}>
          <p className={styles.bookLine}>On <em>{data.bookTitle}</em></p>

          <div className={styles.ringCard}>
            <svg
              className={styles.ring}
              viewBox="0 0 200 200"
              width="200"
              height="200"
              role="img"
              aria-label={`Mastery score ${animatedScore} out of 100`}
            >
              <circle
                cx="100"
                cy="100"
                r={RING_RADIUS}
                stroke="#E8D5C8"
                strokeWidth="16"
                fill="none"
              />
              <circle
                className={styles.ringFill}
                cx="100"
                cy="100"
                r={RING_RADIUS}
                stroke="#C4622D"
                strokeWidth="16"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={RING_CIRC}
                strokeDashoffset={ringOffset}
                transform="rotate(-90 100 100)"
              />
              <text
                className={styles.ringNumber}
                x="92"
                y="100"
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="64"
              >
                {animatedScore}
              </text>
              <text
                className={styles.ringPercent}
                x="138"
                y="80"
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="22"
              >
                %
              </text>
            </svg>
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

          {grouped.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Your Learning Map</h2>
              <p className={styles.sectionSubtitle}>
                Everything this book has to offer — curated for where you stand
              </p>

              {grouped.map(group => (
                <div key={group.type} className={styles.mapGroup}>
                  <h3 className={styles.mapGroupTitle}>{TYPE_PLURAL[group.type]}</h3>
                  <div className={styles.mapGrid}>
                    {group.items.map((item, idx) => {
                      const key = `${group.type}-${idx}-${item.title}`;
                      const isSelected = selected.has(item.title);
                      const statusClass =
                        item.status === 'recommended' ? styles.mapRecommended :
                        item.status === 'strength' ? styles.mapStrength :
                        styles.mapNeutral;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => toggleSelect(item.title)}
                          className={`${styles.mapCard} ${statusClass} ${isSelected ? styles.mapSelected : ''}`}
                          aria-pressed={isSelected}
                        >
                          {isSelected && (
                            <span className={styles.checkMark} aria-hidden="true">
                              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                                <path d="M3 8.5L6.5 12L13 4.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </span>
                          )}
                          <span className={styles.mapTypeLabel}>{item.type}</span>
                          <span className={styles.mapTitle}>{item.title}</span>
                          {item.description && (
                            <span className={styles.mapDesc}>{item.description}</span>
                          )}
                          {item.status === 'recommended' && (
                            <span className={styles.mapBadge}>★ Recommended for you</span>
                          )}
                          {item.status === 'strength' && (
                            <span className={styles.mapBadge}>
                              <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                                <path d="M3 8.5L6.5 12L13 4.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                              You&apos;ve got this
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div className={styles.saveBar}>
                <span className={styles.saveCount}>
                  {selected.size} selected
                </span>
                <button
                  className={styles.saveBtn}
                  onClick={saveSelections}
                  disabled={saving || !assessmentDocId || selected.size === 0}
                >
                  {saving ? 'Saving...' : 'Save my selections'}
                </button>
              </div>
              {savedAt > 0 && (
                <p className={styles.savedToast}>Saved to your assessment ✓</p>
              )}
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
