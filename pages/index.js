import { useState, useRef, useCallback, useEffect } from 'react';
import Head from 'next/head';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, getDocs, query, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import CoachChat from '../components/CoachChat';
import Login from './login';
import styles from '../styles/Home.module.css';

export default function Home() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [stage, setStage] = useState('landing');
  const [bookText, setBookText] = useState('');
  const [bookTitle, setBookTitle] = useState('');
  const [pageCount, setPageCount] = useState(0);
  const [processingStatus, setProcessingStatus] = useState('');
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
      if (u) loadSessions(u.uid);
    });
    return unsubscribe;
  }, []);

  const loadSessions = async (uid) => {
    try {
      const q = query(collection(db, 'users', uid, 'sessions'), orderBy('updatedAt', 'desc'));
      const snap = await getDocs(q);
      const loaded = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setSessions(loaded);
    } catch (e) {
      console.error('Failed to load sessions:', e);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setUser(null);
    setSessions([]);
    setActiveSession(null);
    setStage('landing');
  };

  const extractPDF = useCallback(async (file) => {
    setError('');
    setStage('processing');
    const title = file.name.replace(/\.pdf$/i, '').replace(/[_-]/g, ' ');
    setBookTitle(title);
    try {
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const totalPages = pdf.numPages;
      setPageCount(totalPages);
      const maxPages = Math.min(totalPages, 100);
      let text = '';
      for (let i = 1; i <= maxPages; i++) {
        setProcessingStatus(`Reading page ${i} of ${maxPages}...`);
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map(s => s.str).join(' ') + '\n';
      }
      setBookText(text);
      setActiveSession(null);
      setStage('chat');
    } catch (err) {
      setError('Could not read this PDF. Please try another file.');
      setStage('landing');
    }
  }, []);

  const MAX_FILE_SIZE_MB = 50;

  const handleFile = useCallback((file) => {
    if (!file) return;
    if (file.type !== 'application/pdf') { setError('Please upload a PDF file.'); return; }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setError(`File is too large. Please upload a PDF under ${MAX_FILE_SIZE_MB} MB.`);
      return;
    }
    extractPDF(file);
  }, [extractPDF]);

  const openSession = (session) => {
    setBookTitle(session.bookTitle);
    setBookText(session.bookText);
    setPageCount(session.pageCount || 0);
    setActiveSession(session);
    setStage('chat');
  };

  const deleteSession = async (e, sessionId) => {
    e.stopPropagation();
    if (!user) return;
    await deleteDoc(doc(db, 'users', user.uid, 'sessions', sessionId));
    setSessions(prev => prev.filter(s => s.id !== sessionId));
    if (activeSession?.id === sessionId) {
      setActiveSession(null);
      setStage('landing');
    }
  };

  if (authLoading) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'var(--cream)' }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:'32px', marginBottom:'12px' }}>📖</div>
          <div style={{ fontFamily:'Playfair Display,serif', fontSize:'18px' }}>BookMentor</div>
        </div>
      </div>
    );
  }

  if (!user) return <Login />;

  if (stage === 'chat') {
    return (
      <CoachChat
        bookText={bookText}
        bookTitle={bookTitle}
        pageCount={pageCount}
        user={user}
        existingSession={activeSession}
        onSessionSaved={(session) => {
          setActiveSession(session);
          setSessions(prev => {
            const exists = prev.find(s => s.id === session.id);
            if (exists) return prev.map(s => s.id === session.id ? session : s);
            return [session, ...prev];
          });
        }}
        onReset={() => { setStage('landing'); setActiveSession(null); }}
        sessions={sessions}
        onOpenSession={openSession}
        onDeleteSession={deleteSession}
        onSignOut={handleSignOut}
      />
    );
  }

  return (
    <>
      <Head>
        <title>BookMentor — Your AI Reading Coach</title>
        <meta name="description" content="Upload any non-fiction book and get a personalized AI coach." />
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

        <section className={styles.hero}>
          <div className={styles.heroContent}>
            <div className={styles.badge}>AI-Powered Personal Coaching</div>
            <h1 className={styles.heroTitle}>
              Your book.<br /><em>Your coach.</em><br />Your growth.
            </h1>
            <p className={styles.heroSub}>
              Upload any non-fiction book and your AI coach evaluates where you stand, identifies your blind spots, and guides you to close the gap — one conversation at a time.
            </p>

            <div
              className={`${styles.uploadZone} ${isDragging ? styles.dragging : ''}`}
              onClick={() => fileInputRef.current?.click()}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFile(e.dataTransfer.files[0]); }}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
            >
              {stage === 'processing' ? (
                <div className={styles.processing}>
                  <div className={styles.spinner} />
                  <p className={styles.processingText}>{processingStatus}</p>
                  <div className={styles.progressBar}><div className={styles.progressFill} /></div>
                </div>
              ) : (
                <>
                  <div className={styles.uploadIcon}>📄</div>
                  <p className={styles.uploadTitle}>Drop your book here</p>
                  <p className={styles.uploadSub}>PDF format · Any non-fiction book</p>
                  <button className={styles.uploadBtn}>Browse files</button>
                </>
              )}
            </div>

            {error && <p className={styles.error}>{error}</p>}
            <input ref={fileInputRef} type="file" accept=".pdf" style={{ display:'none' }}
              onChange={(e) => handleFile(e.target.files[0])} />
          </div>

          {sessions.length > 0 && (
            <div className={styles.sessionsSection}>
              <h2 className={styles.sessionsTitle}>Continue a session</h2>
              <div className={styles.sessionsList}>
                {sessions.map(session => (
                  <div key={session.id} className={styles.sessionCard} onClick={() => openSession(session)}>
                    <div className={styles.sessionIcon}>📗</div>
                    <div className={styles.sessionInfo}>
                      <div className={styles.sessionBookTitle}>{session.bookTitle}</div>
                      <div className={styles.sessionMeta}>
                        {session.messageCount || 0} messages · {new Date(session.updatedAt).toLocaleDateString()}
                      </div>
                    </div>
                    <button className={styles.deleteBtn} onClick={(e) => deleteSession(e, session.id)}>×</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={styles.features}>
            {[
              { icon: '🎯', text: 'Gap Assessment' },
              { icon: '🗺️', text: 'Personal Roadmap' },
              { icon: '💬', text: 'Ongoing Coaching' },
              { icon: '💾', text: 'Saved Sessions' },
            ].map((f) => (
              <div key={f.text} className={styles.featurePill}>
                <span>{f.icon}</span><span>{f.text}</span>
              </div>
            ))}
          </div>
        </section>

        <footer className={styles.footer}>
          <p>BookMentor · Powered by Gemini AI</p>
        </footer>
      </main>
    </>
  );
}
