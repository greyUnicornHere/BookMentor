import { useState, useRef, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import Login from './login';
import styles from '../styles/Home.module.css';

function slugify(s) {
  return (
    String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'book'
  );
}

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [stage, setStage] = useState('upload'); // upload | extracting | analyzing
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

  const analyzeBook = async (text, fallbackTitle) => {
    setStage('analyzing');
    try {
      const res = await fetch('/api/generate-learning-map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookText: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to analyze book');

      const bookTitle = data.bookTitle || fallbackTitle;
      const bookId = slugify(bookTitle);

      sessionStorage.setItem('bm_book', JSON.stringify({
        bookId,
        bookTitle,
        bookContext: data.bookContext || 'universal',
        bookDomain: data.bookDomain || 'other',
        bookText: text.slice(0, 50000),
      }));
      sessionStorage.setItem('bm_learning_map', JSON.stringify(data.cards || []));
      sessionStorage.removeItem('bm_selected_card');
      sessionStorage.removeItem('bm_completed');

      let hasProfile = false;
      try {
        const snap = await getDoc(doc(db, 'users', user.uid, 'profile', 'main'));
        if (snap.exists()) {
          hasProfile = true;
          sessionStorage.setItem('bm_profile', JSON.stringify(snap.data()));
        }
      } catch (e) {
        console.error('Profile check failed:', e);
      }

      router.push(hasProfile ? '/map' : '/onboarding');
    } catch (err) {
      console.error(err);
      setError(err.message || 'Something went wrong analyzing your book.');
      setStage('upload');
    }
  };

  const extractPDF = async (file) => {
    setError('');
    setStage('extracting');
    const fallbackTitle = file.name.replace(/\.pdf$/i, '').replace(/[_-]/g, ' ');
    try {
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
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
      await analyzeBook(text, fallbackTitle);
    } catch (err) {
      console.error(err);
      setError('Could not read this PDF. Please try another file.');
      setStage('upload');
    }
  };

  const handleFile = (file) => {
    if (!file) return;
    if (file.type !== 'application/pdf') {
      setError('Please upload a PDF file.');
      return;
    }
    extractPDF(file);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    handleFile(e.dataTransfer.files?.[0]);
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
            {user.photoURL && (
              <img src={user.photoURL} alt={user.displayName} className={styles.userAvatar} />
            )}
            <span className={styles.userName}>{user.displayName?.split(' ')[0]}</span>
            <button className={styles.signOutBtn} onClick={handleSignOut}>Sign out</button>
          </div>
        </nav>

        {stage === 'upload' && (
          <section className={styles.hero}>
            <div className={styles.heroContent}>
              <div className={styles.badge}>AI-Powered Learning Map</div>
              <h1 className={styles.heroTitle}>
                Your book.<br /><em>Mapped.</em><br />Made yours.
              </h1>
              <p className={styles.heroSub}>
                Upload any non-fiction book. We turn it into a personalized learning map —
                every concept as a card you can explore and test yourself on, at your own pace.
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
              <p className={styles.loadingText}>{processingStatus || 'Reading your book...'}</p>
              <p className={styles.loadingHint}>Reading every page so we can map it properly.</p>
            </div>
          </section>
        )}

        {stage === 'analyzing' && (
          <section className={styles.fullCenter}>
            <div className={styles.loadingCard}>
              <div className={styles.spinner} />
              <p className={styles.loadingText}>Building your learning map...</p>
              <p className={styles.loadingHint}>
                Extracting every concept worth learning and organizing it into cards.
              </p>
            </div>
          </section>
        )}
      </main>
    </>
  );
}
