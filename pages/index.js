import { useState, useRef, useCallback, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import Login from './login';
import styles from '../styles/Home.module.css';

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [stage, setStage] = useState('upload');
  const [bookText, setBookText] = useState('');
  const [bookTitle, setBookTitle] = useState('');
  const [processingStatus, setProcessingStatus] = useState('');
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return unsubscribe;
  }, []);

  const handleSignOut = async () => {
    await signOut(auth);
    setUser(null);
    setStage('upload');
  };

  const extractPDF = useCallback(async (file) => {
    setError('');
    setStage('extracting');
    const fallbackTitle = file.name.replace(/\.pdf$/i, '').replace(/[_-]/g, ' ');
    setBookTitle(fallbackTitle);
    try {
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const totalPages = pdf.numPages;
      const maxPages = Math.min(totalPages, 100);
      let text = '';
      for (let i = 1; i <= maxPages; i++) {
        setProcessingStatus(`Reading page ${i} of ${maxPages}...`);
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map(s => s.str).join(' ') + '\n';
      }
      setBookText(text);
      setStage('intro');
    } catch (err) {
      console.error(err);
      setError('Could not read this PDF. Please try another file.');
      setStage('upload');
    }
  }, []);

  const handleFile = useCallback((file) => {
    if (!file) return;
    if (file.type !== 'application/pdf') {
      setError('Please upload a PDF file.');
      return;
    }
    extractPDF(file);
  }, [extractPDF]);

  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    handleFile(file);
  };

  const startAssessment = async () => {
    setStage('analyzing');
    setError('');
    try {
      const res = await fetch('/api/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate questions');

      const finalTitle = data.bookTitle || bookTitle;
      sessionStorage.setItem('bm_assessment', JSON.stringify({
        bookTitle: finalTitle,
        bookText,
        coreIdeas: data.coreIdeas,
        questions: data.questions,
      }));
      router.push('/assessment');
    } catch (err) {
      setError(err.message || 'Something went wrong analyzing your book.');
      setStage('intro');
    }
  };

  if (authLoading) {
    return (
      <div className={styles.bootScreen}>
        <div className={styles.bootInner}>
          <div className={styles.bootIcon}>📖</div>
          <div className={styles.bootName}>BookMentor</div>
        </div>
      </div>
    );
  }

  if (!user) return <Login />;

  return (
    <>
      <Head>
        <title>BookMentor — Your AI Reading Coach</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main className={styles.main}>
        <div className={styles.bgTexture} />

        <nav className={styles.nav}>
          <div className={styles.logo}>
            <span className={styles.logoIcon}>📖</span>
            <span className={styles.logoText}>BookMentor</span>
          </div>
          <div className={styles.navRight}>
            {user.photoURL && <img src={user.photoURL} alt={user.displayName} className={styles.userAvatar} />}
            <span className={styles.userName}>{user.displayName?.split(' ')[0]}</span>
            <button className={styles.signOutBtn} onClick={handleSignOut}>Sign out</button>
          </div>
        </nav>

        {stage === 'upload' && (
          <section className={styles.hero}>
            <div className={styles.heroContent}>
              <div className={styles.badge}>AI-Powered Diagnostic</div>
              <h1 className={styles.heroTitle}>
                Your book.<br /><em>Your blind spots.</em><br />A real assessment.
              </h1>
              <p className={styles.heroSub}>
                Upload any non-fiction book. We extract its core principles and put you through a short diagnostic to reveal where you actually stand.
              </p>

              <div
                className={`${styles.uploadZone} ${isDragging ? styles.dragging : ''}`}
                onClick={() => fileInputRef.current?.click()}
                onDrop={onDrop}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
              >
                <div className={styles.uploadIcon}>📄</div>
                <p className={styles.uploadTitle}>Drop your book here</p>
                <p className={styles.uploadSub}>PDF format · Any non-fiction book</p>
                <button className={styles.uploadBtn}>Browse files</button>
              </div>

              {error && <p className={styles.error}>{error}</p>}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                style={{ display: 'none' }}
                onChange={(e) => handleFile(e.target.files[0])}
              />
            </div>
          </section>
        )}

        {stage === 'extracting' && (
          <section className={styles.fullCenter}>
            <div className={styles.loadingCard}>
              <div className={styles.spinner} />
              <p className={styles.loadingText}>{processingStatus}</p>
              <p className={styles.loadingHint}>Reading every page so your coach knows the book inside out.</p>
            </div>
          </section>
        )}

        {stage === 'intro' && (
          <section className={styles.fullCenter}>
            <div className={styles.introCard}>
              <div className={styles.introBadge}>Your Book</div>
              <h2 className={styles.introTitle}>{bookTitle}</h2>

              <div className={styles.coachIntro}>
                <p>
                  Hey. I&apos;ve just read this one. <em>Cover to cover.</em>
                </p>
                <p>
                  Before I coach you on it, I need to see how you actually <em>think</em> about its ideas — not how well you can recite them. So I&apos;ve built you a short diagnostic. A few real-life scenarios. No right-sounding answers, just the one the book would actually endorse.
                </p>
                <p>
                  At the end, I&apos;ll tell you the truth about where you stand, where your blind spots are, and exactly what to work on next. Ready?
                </p>
              </div>

              <button className={styles.primaryCta} onClick={startAssessment}>
                Start Assessment →
              </button>
              {error && <p className={styles.error}>{error}</p>}
            </div>
          </section>
        )}

        {stage === 'analyzing' && (
          <section className={styles.fullCenter}>
            <div className={styles.loadingCard}>
              <div className={styles.spinner} />
              <p className={styles.loadingText}>Analyzing your book...</p>
              <p className={styles.loadingHint}>Identifying the core principles and crafting your diagnostic.</p>
            </div>
          </section>
        )}
      </main>
    </>
  );
}
