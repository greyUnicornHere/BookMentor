import { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';
import { doc, setDoc, collection, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import styles from '../styles/CoachChat.module.css';

// Chars saved to Firestore — matches what the API sends to Gemini so resumed
// sessions see the same book context as the original session.
const BOOK_TEXT_STORAGE_LIMIT = 45_000;

function GapCard({ data }) {
  return (
    <div className={styles.gapCard}>
      <div className={styles.gapHeader}>
        <span className={styles.gapIcon}>📊</span>
        <span className={styles.gapTitle}>Gap Assessment</span>
      </div>
      <div className={styles.levelRow}>
        <span className={`${styles.levelBadge} ${styles[`level${data.level}`]}`}>{data.level}</span>
        <span className={styles.levelSummary}>{data.level_summary}</span>
      </div>
      <div className={styles.gapSection}>
        <div className={styles.gapSectionLabel}>🔍 Blind Spots</div>
        <p className={styles.gapSectionContent}>{data.blind_spots}</p>
      </div>
      <div className={styles.gapSection}>
        <div className={styles.gapSectionLabel}>🗺️ Your Roadmap</div>
        <div className={styles.roadmap}>
          {(data.roadmap || []).map((item, i) => (
            <div key={i} className={styles.roadmapItem}>
              <div className={styles.roadmapNum}>{i + 1}</div>
              <div className={styles.roadmapText}>{item}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Message({ msg }) {
  const isUser = msg.role === 'user';
  if (!isUser && msg.content.startsWith('GAP_ASSESSMENT:')) {
    try {
      const data = JSON.parse(msg.content.replace('GAP_ASSESSMENT:', '').trim());
      return (
        <div className={`${styles.msgRow} ${styles.coach}`}>
          <div className={styles.avatar}>🎓</div>
          <div style={{ flex: 1 }}><GapCard data={data} /></div>
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
  const [sendError, setSendError] = useState('');
  const [pendingRetry, setPendingRetry] = useState(null); // { userContent, history, sid }
  const messagesEndRef = useRef(null);
  const isInitialized = useRef(false);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const saveSession = useCallback(async (msgs, sid) => {
    if (!user) return sid;
    const sessionData = {
      bookTitle,
      bookText: bookText.slice(0, BOOK_TEXT_STORAGE_LIMIT),
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

  const sendMessage = useCallback(async (userContent, history, currentSessionId) => {
    const newMessages = userContent
      ? [...history, { role: 'user', content: userContent }]
      : history;
    if (userContent) setMessages(newMessages);
    setIsLoading(true);
    setSendError('');
    setPendingRetry(null);

    try {
      const idToken = await user.getIdToken();
      const apiMessages = newMessages
        .filter(m => !m.content.startsWith('GAP_ASSESSMENT:'))
        .map(m => ({ role: m.role, content: m.content }));

      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ messages: apiMessages, bookText, bookTitle }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong');

      const reply = { role: 'assistant', content: data.content };
      const updatedMessages = [...newMessages, reply];
      setMessages(updatedMessages);
      const newSid = await saveSession(updatedMessages, currentSessionId);
      if (!currentSessionId) setSessionId(newSid);
    } catch (err) {
      setSendError(err.message || 'Failed to reach the coach. Please try again.');
      // Store context so the user can retry without losing their message
      setPendingRetry({ userContent, history, sid: currentSessionId });
      // If we added the user message optimistically, keep it visible but remove
      // it from the stored list so retry doesn't double-send
      if (userContent) {
        setMessages(newMessages);
      }
    }
    setIsLoading(false);
  }, [user, bookText, bookTitle, saveSession]);

  const handleRetry = useCallback(() => {
    if (!pendingRetry) return;
    const { userContent, history, sid } = pendingRetry;
    // Remove the optimistically-added user message from display before re-sending
    setMessages(history);
    sendMessage(userContent, history, sid);
  }, [pendingRetry, sendMessage]);

  useEffect(() => {
    if (isInitialized.current) return;
    isInitialized.current = true;
    if (existingSession?.messages?.length > 0) {
      setMessages(existingSession.messages);
      setSessionId(existingSession.id);
      return;
    }
    const opener = `I just uploaded "${bookTitle}". Please introduce yourself as my coach for this book and ask your first diagnostic question.`;
    sendMessage(null, [{ role: 'user', content: opener }], null);
  }, [bookTitle, existingSession, sendMessage]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    sendMessage(text, messages, sessionId);
  }, [input, isLoading, messages, sessionId, sendMessage]);

  const wordCount = Math.round(bookText.split(' ').length / 100) * 100;

  return (
    <>
      <Head><title>{bookTitle} · BookMentor</title></Head>
      <div className={styles.layout}>

        {/* Sidebar */}
        <aside className={styles.sidebar}>
          <div className={styles.sidebarLogo}>
            <span>📖</span>
            <span className={styles.sidebarLogoText}>BookMentor</span>
          </div>

          {/* Active book */}
          <div className={styles.bookCard}>
            <div className={styles.bookCardIcon}>📗</div>
            <div className={styles.bookCardTitle}>{bookTitle}</div>
            <div className={styles.bookCardMeta}>{pageCount} pages · ~{wordCount.toLocaleString()} words</div>
            <div className={styles.activeTag}>Active session</div>
          </div>

          {/* Other sessions tabs */}
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

        {/* Chat */}
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

          <div className={styles.messages}>
            {messages
              .filter(m => !m.content.startsWith('I just uploaded'))
              .map((msg, i) => (
                <div key={i} className={styles.msgWrapper}>
                  <Message msg={msg} />
                </div>
              ))}
            {isLoading && <TypingIndicator />}
            {sendError && (
              <div className={styles.errorBanner}>
                <span className={styles.errorBannerText}>{sendError}</span>
                {pendingRetry && (
                  <button className={styles.retryBtn} onClick={handleRetry}>
                    Try again
                  </button>
                )}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

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
        </main>
      </div>
    </>
  );
}
