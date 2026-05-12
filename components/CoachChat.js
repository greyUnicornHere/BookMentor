import { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';
import { doc, setDoc, collection, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import styles from '../styles/CoachChat.module.css';

const ASSESSMENT_PHASES = [
  { min: 0, max: 1, label: 'Getting to know you...' },
  { min: 2, max: 3, label: 'Understanding your situation...' },
  { min: 4, max: 5, label: 'Identifying your patterns...' },
  { min: 6, max: 7, label: 'Almost ready to assess...' },
  { min: 8, max: 99, label: 'Finalizing your assessment...' },
];

function AssessmentBar({ exchangeCount, assessmentDone }) {
  if (assessmentDone) return null;
  const progress = Math.min((exchangeCount / 8) * 100, 95);
  const phase = ASSESSMENT_PHASES.find(p => exchangeCount >= p.min && exchangeCount <= p.max);

  return (
    <div className={styles.assessmentBar}>
      <div className={styles.assessmentBarTop}>
        <div className={styles.assessmentBarLabel}>
          <span className={styles.assessmentPulse} />
          {phase?.label || 'Analyzing...'}
        </div>
        <span className={styles.assessmentBarPercent}>Gap Assessment in progress</span>
      </div>
      <div className={styles.assessmentBarTrack}>
        <div className={styles.assessmentBarFill} style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

function GapCard({ data, onContinue }) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setRevealed(true), 300);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className={`${styles.gapCardFull} ${revealed ? styles.gapCardRevealed : ''}`}>
      {/* Header */}
      <div className={styles.gapCardFullHeader}>
        <div className={styles.gapCardFullBadge}>Assessment Complete</div>
        <h2 className={styles.gapCardFullTitle}>Your Gap Assessment Report</h2>
        <p className={styles.gapCardFullSub}>Based on our conversation and the book's principles</p>
      </div>

      {/* Level */}
      <div className={styles.gapLevelSection}>
        <div className={styles.gapLevelLabel}>Current Level</div>
        <div className={styles.gapLevelRow}>
          <span className={`${styles.levelBadgeLg} ${styles[`level${data.level}`]}`}>{data.level}</span>
          <span className={styles.levelSummaryLg}>{data.level_summary}</span>
        </div>
        <div className={styles.levelBar}>
          <div className={`${styles.levelBarFill} ${styles[`levelFill${data.level}`]}`} />
          <div className={styles.levelBarLabels}>
            <span>Beginner</span><span>Developing</span><span>Advanced</span>
          </div>
        </div>
      </div>

      {/* Blind Spots */}
      <div className={styles.gapReportSection}>
        <div className={styles.gapReportSectionHeader}>
          <span className={styles.gapReportIcon}>🔍</span>
          <span className={styles.gapReportSectionTitle}>Your Blind Spots</span>
        </div>
        <p className={styles.gapReportContent}>{data.blind_spots}</p>
      </div>

      {/* Roadmap */}
      <div className={styles.gapReportSection}>
        <div className={styles.gapReportSectionHeader}>
          <span className={styles.gapReportIcon}>🗺️</span>
          <span className={styles.gapReportSectionTitle}>Your Action Roadmap</span>
        </div>
        <div className={styles.roadmapFull}>
          {(data.roadmap || []).map((item, i) => (
            <div key={i} className={styles.roadmapItemFull}>
              <div className={styles.roadmapNumFull}>{i + 1}</div>
              <div className={styles.roadmapTextFull}>{item}</div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className={styles.gapCardCTA}>
        <p className={styles.gapCardCTAText}>
          Now that we know where you stand — let's start closing that gap. I'll guide you through each step.
        </p>
        <button className={styles.gapCardCTABtn} onClick={onContinue}>
          Let's bridge the gap →
        </button>
      </div>
    </div>
  );
}

function Message({ msg, onGapContinue }) {
  const isUser = msg.role === 'user';
  if (!isUser && msg.content.startsWith('GAP_ASSESSMENT:')) {
    try {
      const data = JSON.parse(msg.content.replace('GAP_ASSESSMENT:', '').trim());
      return (
        <div className={styles.gapCardWrapper}>
          <GapCard data={data} onContinue={onGapContinue} />
        </div>
      );
    } catch (e) {}
  }
  return (
    <div className={`${styles.msgRow} ${isUser ? styles.user : styles.coach}`}>
      {!isUser && <div className={styles.avatar}>🎓</div>}
      <div className={`${styles.bubble} ${isUser ? styles.userBubble : styles.coachBubble}`}>
        {msg.content.split('\n').map((line, i, arr) => (
          <span key={i}>{line}{i < arr.length - 1 && <br />}</span>
        ))}
      </div>
      {isUser && <div className={styles.avatar}>👤</div>}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className={`${styles.msgRow} ${styles.coach}`}>
      <div className={styles.avatar}>🎓</div>
      <div className={`${styles.bubble} ${styles.coachBubble} ${styles.typing}`}>
        <span /><span /><span />
      </div>
    </div>
  );
}

export default function CoachChat({
  bookText, bookTitle, pageCount, user,
  existingSession, onSessionSaved, onReset,
  sessions, onOpenSession, onDeleteSession, onSignOut
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [exchangeCount, setExchangeCount] = useState(0);
  const [assessmentDone, setAssessmentDone] = useState(false);
  const [showInput, setShowInput] = useState(true);
  const messagesEndRef = useRef(null);
  const isInitialized = useRef(false);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Check if assessment already done in existing session
  useEffect(() => {
    if (existingSession?.messages) {
      const hasAssessment = existingSession.messages.some(m => m.content.startsWith('GAP_ASSESSMENT:'));
      if (hasAssessment) setAssessmentDone(true);
      const userMsgs = existingSession.messages.filter(m => m.role === 'user' && !m.content.startsWith('I just uploaded'));
      setExchangeCount(userMsgs.length);
    }
  }, [existingSession]);

  const saveSession = useCallback(async (msgs, sid) => {
    if (!user) return sid;
    const sessionData = {
      bookTitle,
      bookText: bookText.slice(0, 10000),
      pageCount,
      messages: msgs,
      messageCount: msgs.filter(m => !m.content.startsWith('I just uploaded')).length,
      updatedAt: new Date().toISOString(),
      userId: user.uid,
    };
    try {
      if (sid) {
        await setDoc(doc(db, 'users', user.uid, 'sessions', sid), sessionData);
        onSessionSaved({ id: sid, ...sessionData });
        return sid;
      } else {
        const ref = await addDoc(collection(db, 'users', user.uid, 'sessions'), sessionData);
        onSessionSaved({ id: ref.id, ...sessionData });
        return ref.id;
      }
    } catch (e) {
      console.error('Save error:', e);
      return sid;
    }
  }, [user, bookTitle, bookText, pageCount, onSessionSaved]);

  const sendMessage = useCallback(async (userContent, history, currentSessionId, currentExchangeCount) => {
    const newMessages = userContent
      ? [...history, { role: 'user', content: userContent }]
      : history;
    if (userContent) {
      setMessages(newMessages);
      setExchangeCount(prev => prev + 1);
    }
    setIsLoading(true);
    try {
      const apiMessages = newMessages
        .filter(m => !m.content.startsWith('GAP_ASSESSMENT:'))
        .map(m => ({ role: m.role, content: m.content }));
      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, bookText, bookTitle }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const reply = { role: 'assistant', content: data.content };
      const updatedMessages = [...newMessages, reply];
      setMessages(updatedMessages);

      // Check if assessment was issued
      if (data.content.startsWith('GAP_ASSESSMENT:')) {
        setAssessmentDone(true);
        setShowInput(false); // Hide input until user clicks CTA
      }

      const newSid = await saveSession(updatedMessages, currentSessionId);
      if (!currentSessionId) setSessionId(newSid);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }]);
    }
    setIsLoading(false);
  }, [bookText, bookTitle, saveSession]);

  useEffect(() => {
    if (isInitialized.current) return;
    isInitialized.current = true;
    if (existingSession?.messages?.length > 0) {
      setMessages(existingSession.messages);
      setSessionId(existingSession.id);
      setShowInput(true);
      return;
    }
    const opener = `I just uploaded "${bookTitle}". Please introduce yourself as my coach for this book and ask your first diagnostic question.`;
    sendMessage(null, [{ role: 'user', content: opener }], null, 0);
  }, [bookTitle, existingSession, sendMessage]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    sendMessage(text, messages, sessionId, exchangeCount);
  }, [input, isLoading, messages, sessionId, exchangeCount, sendMessage]);

  const handleGapContinue = useCallback(() => {
    setShowInput(true);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, []);

  const wordCount = Math.round(bookText.split(' ').length / 100) * 100;

  return (
    <>
      <Head><title>{bookTitle} · BookMentor</title></Head>
      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarLogo}>
            <span>📖</span>
            <span className={styles.sidebarLogoText}>BookMentor</span>
          </div>
          <div className={styles.bookCard}>
            <div className={styles.bookCardIcon}>📗</div>
            <div className={styles.bookCardTitle}>{bookTitle}</div>
            <div className={styles.bookCardMeta}>{pageCount} pages · ~{wordCount.toLocaleString()} words</div>
            <div className={styles.activeTag}>Active session</div>
          </div>
          {sessions.filter(s => s.id !== sessionId).length > 0 && (
            <div className={styles.otherSessions}>
              <div className={styles.otherSessionsLabel}>Other sessions</div>
              {sessions.filter(s => s.id !== sessionId).map(session => (
                <div key={session.id} className={styles.sessionTab} onClick={() => onOpenSession(session)}>
                  <span className={styles.sessionTabIcon}>📘</span>
                  <div className={styles.sessionTabInfo}>
                    <div className={styles.sessionTabTitle}>{session.bookTitle}</div>
                    <div className={styles.sessionTabMeta}>{session.messageCount || 0} messages</div>
                  </div>
                  <button className={styles.sessionTabDelete} onClick={(e) => onDeleteSession(e, session.id)}>×</button>
                </div>
              ))}
            </div>
          )}
          <div className={styles.sidebarFooter}>
            <button className={styles.newSessionBtn} onClick={onReset}>↩ Upload new book</button>
            {user && (
              <div className={styles.userRow}>
                {user.photoURL && <img src={user.photoURL} className={styles.sidebarAvatar} alt="" />}
                <span className={styles.sidebarUserName}>{user.displayName?.split(' ')[0]}</span>
                <button className={styles.signOutSmall} onClick={onSignOut}>Sign out</button>
              </div>
            )}
          </div>
        </aside>

        <main className={styles.chatMain}>
          <div className={styles.chatHeader}>
            <div className={styles.chatHeaderLeft}>
              <div className={styles.coachAvatar}>🎓</div>
              <div>
                <div className={styles.coachName}>Book Coach</div>
                <div className={styles.coachStatus}>
                  <span className={styles.statusDot} />
                  Coaching on: {bookTitle}
                </div>
              </div>
            </div>
          </div>

          {/* Assessment progress bar */}
          <AssessmentBar exchangeCount={exchangeCount} assessmentDone={assessmentDone} />

          <div className={styles.messages}>
            {messages
              .filter(m => !m.content.startsWith('I just uploaded'))
              .map((msg, i) => (
                <div key={i} className={styles.msgWrapper}>
                  <Message msg={msg} onGapContinue={handleGapContinue} />
                </div>
              ))}
            {isLoading && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>

          {showInput && (
            <div className={styles.inputArea}>
              <textarea
                className={styles.input}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px';
                }}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="Reply to your coach..."
                rows={1}
                disabled={isLoading}
              />
              <button className={styles.sendBtn} onClick={handleSend} disabled={isLoading || !input.trim()}>↑</button>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
