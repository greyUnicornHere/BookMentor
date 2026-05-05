import { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';
import styles from '../styles/CoachChat.module.css';

const SESSION_KEY = 'bookmentor_session_v1';

function GapCard({ data }) {
  return (
    <div className={styles.gapCard}>
      <div className={styles.gapHeader}>
        <span className={styles.gapIcon}>📊</span>
        <span className={styles.gapTitle}>Gap Assessment</span>
      </div>
      <div className={styles.levelRow}>
        <span className={`${styles.levelBadge} ${styles[`level${data.level}`]}`}>
          {data.level}
        </span>
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
      const json = msg.content.replace('GAP_ASSESSMENT:', '').trim();
      const data = JSON.parse(json);
      return (
        <div className={`${styles.msgRow} ${styles.coach}`}>
          <div className={styles.avatar}>🎓</div>
          <GapCard data={data} />
        </div>
      );
    } catch (e) {
      // fall through to normal render
    }
  }

  return (
    <div className={`${styles.msgRow} ${isUser ? styles.user : styles.coach}`}>
      {!isUser && <div className={styles.avatar}>🎓</div>}
      <div className={`${styles.bubble} ${isUser ? styles.userBubble : styles.coachBubble}`}>
        {msg.content.split('\n').map((line, i) => (
          <span key={i}>{line}{i < msg.content.split('\n').length - 1 && <br />}</span>
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

export default function CoachChat({ bookText, bookTitle, pageCount, onReset }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const isInitialized = useRef(false);

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Save session
  useEffect(() => {
    if (messages.length > 0) {
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify({
          bookTitle,
          bookText,
          messages,
          savedAt: new Date().toISOString(),
        }));
      } catch (e) {}
    }
  }, [messages, bookTitle, bookText]);

  // Initialize — start coaching session
  const sendMessage = useCallback(async (userContent, history) => {
    const newMessages = userContent
      ? [...history, { role: 'user', content: userContent }]
      : history;

    if (userContent) {
      setMessages(newMessages);
    }

    setIsLoading(true);

    try {
      // Filter out GAP_ASSESSMENT messages for API (they confuse the model)
      const apiMessages = newMessages
        .filter(m => !m.content.startsWith('GAP_ASSESSMENT:'))
        .map(m => ({ role: m.role, content: m.content }));

      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          bookText,
          bookTitle,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const reply = { role: 'assistant', content: data.content };
      setMessages(prev => [...prev, reply]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `I encountered an error: ${err.message}. Please try again.`
      }]);
    }

    setIsLoading(false);
  }, [bookText, bookTitle]);

  useEffect(() => {
    if (isInitialized.current) return;
    isInitialized.current = true;

    // Check for saved session
    try {
      const saved = localStorage.getItem(SESSION_KEY);
      if (saved) {
        const session = JSON.parse(saved);
        if (session.bookTitle === bookTitle && session.messages?.length > 0) {
          setMessages(session.messages);
          setSessionLoaded(true);
          return;
        }
      }
    } catch (e) {}

    // Start fresh session
    const opener = `I just uploaded "${bookTitle}". Please introduce yourself as my coach for this book and ask your first diagnostic question.`;
    sendMessage(null, [{ role: 'user', content: opener }]);
  }, [bookTitle, sendMessage]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    sendMessage(text, messages);
  }, [input, isLoading, messages, sendMessage]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleNewSession = useCallback(() => {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
    onReset();
  }, [onReset]);

  const wordCount = Math.round(bookText.split(' ').length / 100) * 100;

  return (
    <>
      <Head>
        <title>{bookTitle} · BookMentor</title>
      </Head>

      <div className={styles.layout}>
        {/* Sidebar */}
        <aside className={styles.sidebar}>
          <div className={styles.sidebarLogo}>
            <span>📖</span>
            <span className={styles.sidebarLogoText}>BookMentor</span>
          </div>

          <div className={styles.bookCard}>
            <div className={styles.bookCardIcon}>📗</div>
            <div className={styles.bookCardTitle}>{bookTitle}</div>
            <div className={styles.bookCardMeta}>
              {pageCount} pages · ~{wordCount.toLocaleString()} words
            </div>
          </div>

          {sessionLoaded && (
            <div className={styles.sessionBadge}>
              ✓ Session resumed
            </div>
          )}

          <div className={styles.sidebarFooter}>
            <button className={styles.newSessionBtn} onClick={handleNewSession}>
              ↩ Upload new book
            </button>
          </div>
        </aside>

        {/* Chat */}
        <main className={styles.chatMain}>
          <div className={styles.chatHeader}>
            <div className={styles.chatHeaderLeft}>
              <div className={styles.coachAvatar}>🎓</div>
              <div>
                <div className={styles.coachName}>BookMentor</div>
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
                <div key={i} className={styles.msgWrapper} style={{ animationDelay: `${i * 0.05}s` }}>
                  <Message msg={msg} />
                </div>
              ))}
            {isLoading && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>

          <div className={styles.inputArea}>
            <textarea
              ref={inputRef}
              className={styles.input}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px';
              }}
              onKeyDown={handleKeyDown}
              placeholder="Reply to your coach..."
              rows={1}
              disabled={isLoading}
            />
            <button
              className={styles.sendBtn}
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
            >
              ↑
            </button>
          </div>
        </main>
      </div>
    </>
  );
}
