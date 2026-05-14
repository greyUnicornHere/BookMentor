import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import styles from '../styles/Onboarding.module.css';

const AGE_OPTIONS = ['Under 20', '20-30', '31-40', '41-50', '50+'];

const CONTEXT_OPTIONS = [
  { value: 'Student', icon: '🎓' },
  { value: 'Professional', icon: '💼' },
  { value: 'Parent', icon: '👨‍👩‍👧' },
  { value: 'Entrepreneur', icon: '🚀' },
  { value: 'Other', icon: '🌍' },
];

const REASON_OPTIONS = [
  'Personal growth',
  'Professional development',
  'Solving a specific problem',
  'Recommended by someone',
  'Other',
];

const CHALLENGE_OPTIONS = [
  'Communication & relationships',
  'Career & performance',
  'Focus & productivity',
  'Confidence & mindset',
  'Work-life balance',
  'Other',
];

const TOTAL_STEPS = 5;

export default function Onboarding() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState('in');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [name, setName] = useState('');
  const [ageRange, setAgeRange] = useState('');
  const [lifeContext, setLifeContext] = useState('');
  const [reason, setReason] = useState('');
  const [reasonCustom, setReasonCustom] = useState('');
  const [challenge, setChallenge] = useState('');
  const [challengeCustom, setChallengeCustom] = useState('');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) {
        router.replace('/');
        return;
      }
      if (!sessionStorage.getItem('bm_book')) {
        router.replace('/');
        return;
      }
      setUser(u);
      setReady(true);
    });
    return unsub;
  }, [router]);

  if (!ready) {
    return (
      <div className={styles.boot}>
        <div className={styles.spinner} />
      </div>
    );
  }

  const canContinue = () => {
    if (step === 0) return name.trim().length > 0;
    if (step === 1) return !!ageRange;
    if (step === 2) return !!lifeContext;
    if (step === 3) return reason && (reason !== 'Other' || reasonCustom.trim().length > 0);
    if (step === 4) return challenge && (challenge !== 'Other' || challengeCustom.trim().length > 0);
    return false;
  };

  const goNext = async () => {
    if (!canContinue() || saving) return;
    if (step < TOTAL_STEPS - 1) {
      setDirection('out');
      setTimeout(() => {
        setStep(s => s + 1);
        setDirection('in');
      }, 220);
      return;
    }
    await finish();
  };

  const goBack = () => {
    if (step === 0 || saving) return;
    setDirection('out');
    setTimeout(() => {
      setStep(s => s - 1);
      setDirection('in');
    }, 220);
  };

  const finish = async () => {
    setSaving(true);
    setError('');
    const profile = {
      name: name.trim(),
      ageRange,
      lifeContext,
      reason: reason === 'Other' ? reasonCustom.trim() : reason,
      reasonCustom: reason === 'Other',
      challenge: challenge === 'Other' ? challengeCustom.trim() : challenge,
      challengeCustom: challenge === 'Other',
    };
    try {
      await setDoc(doc(db, 'users', user.uid, 'profile', 'main'), {
        ...profile,
        updatedAt: serverTimestamp(),
      });
      sessionStorage.setItem('bm_profile', JSON.stringify(profile));
      router.push('/map');
    } catch (e) {
      console.error('Failed to save profile:', e);
      setError('Could not save your profile. Please try again.');
      setSaving(false);
    }
  };

  const progress = ((step + 1) / TOTAL_STEPS) * 100;

  return (
    <>
      <Head><title>Welcome — BookMentor</title></Head>

      <main className={styles.main}>
        <header className={styles.topBar}>
          <button
            className={styles.backBtn}
            onClick={goBack}
            disabled={step === 0}
            aria-label="Back"
          >
            ←
          </button>
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${progress}%` }} />
          </div>
          <div className={styles.count}>{step + 1}/{TOTAL_STEPS}</div>
        </header>

        <section
          key={step}
          className={`${styles.screen} ${direction === 'in' ? styles.slideIn : styles.slideOut}`}
        >
          {step === 0 && (
            <>
              <h1 className={styles.question}>What should we call you?</h1>
              <p className={styles.hint}>We&apos;ll use this to make your coaching feel personal.</p>
              <input
                className={styles.textInput}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                maxLength={40}
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') goNext(); }}
              />
            </>
          )}

          {step === 1 && (
            <>
              <h1 className={styles.question}>How old are you?</h1>
              <p className={styles.hint}>This helps us tailor scenarios to your life.</p>
              <div className={styles.options}>
                {AGE_OPTIONS.map(opt => (
                  <button
                    key={opt}
                    type="button"
                    className={`${styles.option} ${ageRange === opt ? styles.optionSelected : ''}`}
                    onClick={() => setAgeRange(opt)}
                  >
                    <span className={styles.optionText}>{opt}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h1 className={styles.question}>What best describes you right now?</h1>
              <p className={styles.hint}>Pick the one that fits most.</p>
              <div className={styles.options}>
                {CONTEXT_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`${styles.option} ${lifeContext === opt.value ? styles.optionSelected : ''}`}
                    onClick={() => setLifeContext(opt.value)}
                  >
                    <span className={styles.optionIcon}>{opt.icon}</span>
                    <span className={styles.optionText}>{opt.value}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h1 className={styles.question}>Why did you pick this book?</h1>
              <p className={styles.hint}>Your reason shapes how we coach you.</p>
              <div className={styles.options}>
                {REASON_OPTIONS.map(opt => (
                  <button
                    key={opt}
                    type="button"
                    className={`${styles.option} ${reason === opt ? styles.optionSelected : ''}`}
                    onClick={() => setReason(opt)}
                  >
                    <span className={styles.optionText}>{opt}</span>
                  </button>
                ))}
              </div>
              {reason === 'Other' && (
                <input
                  className={styles.textInput}
                  type="text"
                  value={reasonCustom}
                  onChange={(e) => setReasonCustom(e.target.value)}
                  placeholder="Tell us your reason"
                  maxLength={120}
                  autoFocus
                />
              )}
            </>
          )}

          {step === 4 && (
            <>
              <h1 className={styles.question}>What&apos;s your biggest challenge right now?</h1>
              <p className={styles.hint}>We&apos;ll prioritize the concepts that help most.</p>
              <div className={styles.options}>
                {CHALLENGE_OPTIONS.map(opt => (
                  <button
                    key={opt}
                    type="button"
                    className={`${styles.option} ${challenge === opt ? styles.optionSelected : ''}`}
                    onClick={() => setChallenge(opt)}
                  >
                    <span className={styles.optionText}>{opt}</span>
                  </button>
                ))}
              </div>
              {challenge === 'Other' && (
                <input
                  className={styles.textInput}
                  type="text"
                  value={challengeCustom}
                  onChange={(e) => setChallengeCustom(e.target.value)}
                  placeholder="Tell us your challenge"
                  maxLength={120}
                  autoFocus
                />
              )}
            </>
          )}

          {error && <p className={styles.error}>{error}</p>}
        </section>

        <footer className={styles.footer}>
          <button
            className={`${styles.continueBtn} ${canContinue() ? styles.continueActive : ''}`}
            onClick={goNext}
            disabled={!canContinue() || saving}
          >
            {saving ? 'Saving...' : step === TOTAL_STEPS - 1 ? 'Finish' : 'Continue'}
          </button>
        </footer>
      </main>
    </>
  );
}
