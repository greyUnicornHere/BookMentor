import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, getDocs } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { pickRecommendedCardIds } from '../lib/recommend';
import styles from '../styles/Map.module.css';

const TYPE_ORDER = ['Framework', 'Key Insight', 'Mindset Shift', 'Practical Tool', 'Common Mistake'];
const TYPE_PLURAL = {
  'Framework': 'Frameworks',
  'Key Insight': 'Key Insights',
  'Mindset Shift': 'Mindset Shifts',
  'Practical Tool': 'Practical Tools',
  'Common Mistake': 'Common Mistakes',
};

const EXPLORED = ['strength', 'gap', 'partial'];

const STATUS_BADGE = {
  recommended: { label: 'Start here', cls: 'badgeRecommended' },
  strength: { label: "You've got this", cls: 'badgeStrength' },
  gap: { label: 'Needs work', cls: 'badgeGap' },
  partial: { label: 'Keep going', cls: 'badgePartial' },
};

function estimateMinutes(count) {
  return Math.max(1, Math.round((Number(count) || 3) * 0.8));
}

export default function LearningMap() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [book, setBook] = useState(null);
  const [cards, setCards] = useState([]);
  const [profile, setProfile] = useState(null);
  const [statuses, setStatuses] = useState({});
  const [recommendedIds, setRecommendedIds] = useState([]);
  const [flippedId, setFlippedId] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.replace('/');
        return;
      }
      let bookData, mapData, profileData;
      try {
        bookData = JSON.parse(sessionStorage.getItem('bm_book') || 'null');
        mapData = JSON.parse(sessionStorage.getItem('bm_learning_map') || 'null');
        profileData = JSON.parse(sessionStorage.getItem('bm_profile') || 'null');
      } catch {
        router.replace('/');
        return;
      }
      if (!bookData || !Array.isArray(mapData) || mapData.length === 0) {
        router.replace('/');
        return;
      }

      let loadedStatuses = {};
      try {
        const snap = await getDocs(
          collection(db, 'users', u.uid, 'books', bookData.bookId, 'cards')
        );
        snap.forEach(d => {
          const data = d.data();
          if (data?.status) loadedStatuses[d.id] = data.status;
        });
      } catch (e) {
        console.error('Failed to load card statuses:', e);
      }

      setBook(bookData);
      setCards(mapData);
      setProfile(profileData);
      setStatuses(loadedStatuses);
      setRecommendedIds(pickRecommendedCardIds(mapData, loadedStatuses, profileData));
      setReady(true);
    });
    return unsub;
  }, [router]);

  if (!ready || !book) {
    return (
      <div className={styles.boot}>
        <div className={styles.spinner} />
      </div>
    );
  }

  const displayStatus = (card) => {
    const s = statuses[card.id];
    if (s && EXPLORED.includes(s)) return s;
    if (recommendedIds.includes(card.id)) return 'recommended';
    return 'unexplored';
  };

  const exploredCount = cards.filter(c => EXPLORED.includes(statuses[c.id])).length;

  const startAssessment = (card) => {
    sessionStorage.setItem('bm_selected_card', JSON.stringify(card));
    router.push('/card-assessment');
  };

  const grouped = TYPE_ORDER
    .map(type => ({ type, items: cards.filter(c => c.type === type) }))
    .filter(g => g.items.length > 0);

  return (
    <>
      <Head><title>Learning Map — {book.bookTitle}</title></Head>

      <main className={styles.main}>
        <div className={styles.bgTexture} />

        <div className={styles.inner}>
          <header className={styles.header}>
            <button className={styles.homeBtn} onClick={() => router.push('/')}>
              ← New book
            </button>
            <h1 className={styles.bookTitle}>{book.bookTitle}</h1>
            <p className={styles.subtitle}>
              Your personalized learning map — tap any card to start
            </p>
            <div className={styles.progressSummary}>
              <div className={styles.progressBar}>
                <div
                  className={styles.progressBarFill}
                  style={{ width: `${cards.length ? (exploredCount / cards.length) * 100 : 0}%` }}
                />
              </div>
              <span className={styles.progressText}>
                {exploredCount} of {cards.length} concepts explored
              </span>
            </div>
          </header>

          {grouped.map(group => (
            <section key={group.type} className={styles.group}>
              <h2 className={styles.groupTitle}>{TYPE_PLURAL[group.type]}</h2>
              <div className={styles.grid}>
                {group.items.map(card => {
                  const status = displayStatus(card);
                  const badge = STATUS_BADGE[status];
                  const isFlipped = flippedId === card.id;
                  const minutes = estimateMinutes(card.questions_count);
                  return (
                    <div key={card.id} className={styles.cardOuter}>
                      <div className={`${styles.cardInner} ${isFlipped ? styles.flipped : ''}`}>
                        {/* FRONT */}
                        <button
                          type="button"
                          className={`${styles.cardFace} ${styles.cardFront} ${styles[`status_${status}`]}`}
                          onClick={() => setFlippedId(isFlipped ? null : card.id)}
                          aria-label={`${card.title} — tap to open`}
                        >
                          <span className={styles.typeLabel}>{card.type}</span>
                          <span className={styles.cardTitle}>{card.title}</span>
                          <span className={styles.cardDesc}>{card.description}</span>
                          {badge && (
                            <span className={`${styles.badge} ${styles[badge.cls]}`}>
                              {badge.label}
                            </span>
                          )}
                        </button>

                        {/* BACK */}
                        <div className={`${styles.cardFace} ${styles.cardBack}`}>
                          <span className={styles.typeLabel}>{card.type}</span>
                          <span className={styles.backTitle}>{card.title}</span>
                          <span className={styles.backDesc}>{card.description}</span>
                          <div className={styles.backActions}>
                            <button
                              type="button"
                              className={styles.startBtn}
                              onClick={() => startAssessment(card)}
                            >
                              Start Assessment
                            </button>
                            <span className={styles.estimate}>
                              {card.questions_count} questions · ~{minutes} min
                            </span>
                            <button
                              type="button"
                              className={styles.notNowBtn}
                              onClick={() => setFlippedId(null)}
                            >
                              Not now
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </main>
    </>
  );
}
