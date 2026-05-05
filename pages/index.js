import { useState, useRef, useCallback } from 'react';
import Head from 'next/head';
import CoachChat from '../components/CoachChat';
import styles from '../styles/Home.module.css';

export default function Home() {
  const [stage, setStage] = useState('landing'); // landing | processing | chat
  const [bookText, setBookText] = useState('');
  const [bookTitle, setBookTitle] = useState('');
  const [pageCount, setPageCount] = useState(0);
  const [processingStatus, setProcessingStatus] = useState('');
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const extractPDF = useCallback(async (file) => {
    setError('');
    setStage('processing');
    setBookTitle(file.name.replace(/\.pdf$/i, '').replace(/[_-]/g, ' '));

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
      setStage('chat');
    } catch (err) {
      console.error(err);
      setError('Could not read this PDF. Please try another file.');
      setStage('landing');
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

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  if (stage === 'chat') {
    return (
      <CoachChat
        bookText={bookText}
        bookTitle={bookTitle}
        pageCount={pageCount}
        onReset={() => setStage('landing')}
      />
    );
  }

  return (
    <>
      <Head>
        <title>BookMentor — Your AI Reading Coach</title>
        <meta name="description" content="Upload any non-fiction book and get a personalized AI coach that evaluates your gap and guides your growth." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className={styles.main}>
        {/* Background texture */}
        <div className={styles.bgTexture} />

        {/* Nav */}
        <nav className={styles.nav}>
          <div className={styles.logo}>
            <span className={styles.logoIcon}>📖</span>
            <span className={styles.logoText}>BookMentor</span>
          </div>
        </nav>

        {/* Hero */}
        <section className={styles.hero}>
          <div className={styles.heroContent}>
            <div className={styles.badge}>AI-Powered Personal Coaching</div>
            <h1 className={styles.heroTitle}>
              Your book.<br />
              <em>Your coach.</em><br />
              Your growth.
            </h1>
            <p className={styles.heroSub}>
              Upload any non-fiction book and your AI coach evaluates where you stand, identifies your blind spots, and guides you to close the gap — one conversation at a time.
            </p>

            {/* Upload Zone */}
            <div
              className={`${styles.uploadZone} ${isDragging ? styles.dragging : ''}`}
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              {stage === 'processing' ? (
                <div className={styles.processing}>
                  <div className={styles.spinner} />
                  <p className={styles.processingText}>{processingStatus}</p>
                  <div className={styles.progressBar}>
                    <div className={styles.progressFill} />
                  </div>
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

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              style={{ display: 'none' }}
              onChange={(e) => handleFile(e.target.files[0])}
            />
          </div>

          {/* Feature pills */}
          <div className={styles.features}>
            {[
              { icon: '🎯', text: 'Gap Assessment' },
              { icon: '🗺️', text: 'Personal Roadmap' },
              { icon: '💬', text: 'Ongoing Coaching' },
              { icon: '🧠', text: 'Blind Spot Detection' },
            ].map((f) => (
              <div key={f.text} className={styles.featurePill}>
                <span>{f.icon}</span>
                <span>{f.text}</span>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className={styles.howItWorks}>
          <h2 className={styles.sectionTitle}>How it works</h2>
          <div className={styles.steps}>
            {[
              { num: '01', title: 'Upload your book', desc: 'Drop any non-fiction PDF. Your coach reads it entirely.' },
              { num: '02', title: 'Have a conversation', desc: 'Your coach asks diagnostic questions to understand where you stand.' },
              { num: '03', title: 'Get your gap assessment', desc: 'Receive your level, blind spots, and a personalized action roadmap.' },
              { num: '04', title: 'Close the gap', desc: 'Continue coaching across sessions until you master the material.' },
            ].map((step) => (
              <div key={step.num} className={styles.step}>
                <div className={styles.stepNum}>{step.num}</div>
                <h3 className={styles.stepTitle}>{step.title}</h3>
                <p className={styles.stepDesc}>{step.desc}</p>
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
