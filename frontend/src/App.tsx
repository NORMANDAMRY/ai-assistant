import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from './lib/supabase';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { 
  MessageCircle, Plus, LogOut, Send, Bot, User, ChevronDown, Trash2,
  Copy, CheckCheck, Menu, X, RefreshCw
} from 'lucide-react';
import './App.css';

interface Message {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

interface Chat {
  id: string;
  title: string;
  model: string;
  created_at: string;
  updated_at: string;
}

const MODELS = [
  { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B' },
  { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout 17B' },
  { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B' },
];

function App() {
  const [user, setUser] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChat, setCurrentChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [selectedModel, setSelectedModel] = useState(MODELS[0].id);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user);
        loadChats(session.access_token);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setUser(session.user);
        loadChats(session.access_token);
      } else {
        setUser(null);
        setChats([]);
        setMessages([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadChats = async (token: string) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL || 'https://ubnpsaanghtgriluemqg.supabase.co'}/functions/v1/history?action=list`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      const data = await response.json();
      if (data.chats) {
        setChats(data.chats);
      }
    } catch (err) {
      console.error('Failed to load chats:', err);
    }
  };

  const loadMessages = async (chatId: string, token: string) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL || 'https://ubnpsaanghtgriluemqg.supabase.co'}/functions/v1/history?action=messages&chat_id=${chatId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      const data = await response.json();
      if (data.messages) {
        setMessages(data.messages.map((m: Message) => ({
          ...m,
          timestamp: m.id ? new Date().toISOString() : undefined
        })));
      }
    } catch (err) {
      console.error('Failed to load messages:', err);
    }
  };

  const handleScroll = useCallback(() => {
    if (messagesContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      setAutoScroll(isNearBottom);
    }
  }, []);

  useEffect(() => {
    if (autoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, autoScroll]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setError('Check your email for confirmation!');
        setIsSignUp(false);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setChats([]);
    setMessages([]);
    setCurrentChat(null);
  };

  const createNewChat = async () => {
    if (!user) return;
    
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) return;

    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL || 'https://ubnpsaanghtgriluemqg.supabase.co'}/functions/v1/history`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          title: 'New Chat',
          model: selectedModel 
        }),
      });
      
      const data = await response.json();
      if (data.chat) {
        setChats([data.chat, ...chats]);
        setCurrentChat(data.chat);
        setMessages([]);
        inputRef.current?.focus();
      }
    } catch (err) {
      console.error('Failed to create chat:', err);
    }
  };

  const selectChat = async (chat: Chat) => {
    setCurrentChat(chat);
    setSelectedModel(chat.model);
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (token) {
      await loadMessages(chat.id, token);
    }
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  };

  const deleteChat = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) return;

    try {
      await fetch(`${import.meta.env.VITE_SUPABASE_URL || 'https://ubnpsaanghtgriluemqg.supabase.co'}/functions/v1/history?chat_id=${chatId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      setChats(chats.filter(c => c.id !== chatId));
      if (currentChat?.id === chatId) {
        setCurrentChat(null);
        setMessages([]);
      }
    } catch (err) {
      console.error('Failed to delete chat:', err);
    }
  };

  const copyMessage = async (content: string, id: string) => {
    await navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const regenerateResponse = async () => {
    if (messages.length < 2 || isTyping) return;
    
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUserMessage) return;

    const lastIndex = messages.lastIndexOf(lastUserMessage);
    const messagesToKeep = messages.slice(0, lastIndex);
    
    setMessages(messagesToKeep);
    await handleSubmitInternal(messagesToKeep, lastUserMessage.content);
  };

  const handleSubmitInternal = async (existingMessages: Message[], userMessage: string) => {
    setIsTyping(true);

    const userMsg: Message = { role: 'user', content: userMessage, timestamp: new Date().toISOString() };
    const updatedMessages = [...existingMessages, userMsg];
    setMessages([...updatedMessages, { role: 'assistant', content: '', timestamp: new Date().toISOString() }]);

    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) return;

      const currentMessages = updatedMessages.map(m => ({
        role: m.role,
        content: m.content,
      }));

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL || 'https://ubnpsaanghtgriluemqg.supabase.co'}/functions/v1/chat`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: currentMessages,
          chat_id: currentChat?.id,
          model: selectedModel,
        }),
      });

      const data = await response.json();
      
      if (data.message) {
        setMessages(prev => {
          const newMsgs = prev.slice(0, -1);
          return [...newMsgs, { role: 'assistant', content: data.message, timestamp: new Date().toISOString() }];
        });

        if (!currentChat && data.chat_id) {
          const title = userMessage.slice(0, 40) + (userMessage.length > 40 ? '...' : '');
          const newChat: Chat = {
            id: data.chat_id,
            title,
            model: selectedModel,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          setCurrentChat(newChat);
          setChats([newChat, ...chats]);
        }
      }
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: 'Error: Failed to get response', timestamp: new Date().toISOString() }]);
    }

    setIsTyping(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isTyping || !user) return;

    const userMessage = input.trim();
    setInput('');
    await handleSubmitInternal(messages, userMessage);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  if (!user) {
    return (
      <div className="auth-container">
        <div className="auth-background">
          <div className="bg-gradient"></div>
          <div className="bg-grid"></div>
        </div>
        <div className="auth-box">
          <div className="auth-logo">
            <div className="logo-icon">
              <Bot size={32} />
            </div>
            <h1>KrakenAi</h1>
          </div>
          <p className="auth-subtitle">Your AI coding assistant</p>
          {error && <div className="auth-error">{error}</div>}
          <form onSubmit={handleAuth}>
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button type="submit" disabled={loading}>
              {loading ? (
                <span className="btn-loading">
                  <span className="spinner"></span>
                  Please wait...
                </span>
              ) : isSignUp ? 'Create Account' : 'Sign In'}
            </button>
          </form>
          <p className="auth-toggle">
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <span onClick={() => { setIsSignUp(!isSignUp); setError(''); }}>
              {isSignUp ? 'Sign In' : 'Sign Up'}
            </span>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-header">
          <button className="new-chat-btn" onClick={createNewChat}>
            <Plus size={18} />
            <span>New Chat</span>
          </button>
          <button className="sidebar-close" onClick={() => setSidebarOpen(false)}>
            <X size={20} />
          </button>
        </div>
        <div className="chat-list">
          {chats.length === 0 ? (
            <div className="empty-chats">
              <MessageCircle size={24} />
              <p>No conversations yet</p>
            </div>
          ) : (
            chats.map(chat => (
              <div
                key={chat.id}
                className={`chat-item ${currentChat?.id === chat.id ? 'active' : ''}`}
                onClick={() => selectChat(chat)}
              >
                <MessageCircle size={16} />
                <span className="chat-title">{chat.title}</span>
                <button 
                  className="delete-btn"
                  onClick={(e) => deleteChat(chat.id, e)}
                  title="Delete chat"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">
              <User size={16} />
            </div>
            <span className="user-email">{user.email}</span>
          </div>
          <button onClick={handleSignOut} className="signout-btn" title="Sign out">
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      <main className="main-content">
        <header className="chat-header">
          <button 
            className="menu-toggle"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={20} />
          </button>
          
          <div className="header-title">
            <h2>{currentChat?.title || 'New Chat'}</h2>
            {currentChat && (
              <span className="model-badge">
                {MODELS.find(m => m.id === currentChat.model)?.name || currentChat.model}
              </span>
            )}
          </div>

          <div className="header-actions">
            <div className="model-selector">
              <button 
                className="model-btn"
                onClick={() => setShowModelDropdown(!showModelDropdown)}
              >
                {MODELS.find(m => m.id === selectedModel)?.name || 'Select Model'}
                <ChevronDown size={14} />
              </button>
              {showModelDropdown && (
                <>
                  <div className="dropdown-overlay" onClick={() => setShowModelDropdown(false)} />
                  <div className="model-dropdown">
                    {MODELS.map(model => (
                      <div
                        key={model.id}
                        className={`model-option ${selectedModel === model.id ? 'selected' : ''}`}
                        onClick={() => {
                          setSelectedModel(model.id);
                          setShowModelDropdown(false);
                        }}
                      >
                        <span className="model-name">{model.name}</span>
                        {selectedModel === model.id && <CheckCheck size={14} />}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <div 
          className="messages-container"
          ref={messagesContainerRef}
          onScroll={handleScroll}
        >
          {messages.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <Bot size={48} />
              </div>
              <h3>How can I help you today?</h3>
              <p>Ask me anything about coding, debugging, or documentation</p>
              <div className="suggestion-chips">
                <button onClick={() => setInput('Help me write a React component')}>
                  Help me write a React component
                </button>
                <button onClick={() => setInput('Explain this code for me')}>
                  Explain this code
                </button>
                <button onClick={() => setInput('Debug this error')}>
                  Debug an error
                </button>
                <button onClick={() => setInput('Write documentation')}>
                  Write documentation
                </button>
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, i) => (
                <div key={i} className={`message ${msg.role}`}>
                  <div className="message-avatar">
                    {msg.role === 'user' ? <User size={18} /> : <Bot size={18} />}
                  </div>
                  <div className="message-wrapper">
                    <div className="message-content">
                      {msg.role === 'assistant' ? (
                        <Markdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            code({ className, children, ...props }) {
                              const match = /language-(\w+)/.exec(className || '');
                              const isInline = !match && !className;
                              return isInline ? (
                                <code className="inline-code" {...props}>{children}</code>
                              ) : (
                                <div className="code-block">
                                  <div className="code-header">
                                    <span className="code-language">{match ? match[1] : 'code'}</span>
                                    <button 
                                      className="copy-btn"
                                      onClick={() => copyMessage(String(children), `code-${i}`)}
                                    >
                                      {copiedId === `code-${i}` ? <CheckCheck size={14} /> : <Copy size={14} />}
                                    </button>
                                  </div>
                                  <SyntaxHighlighter
                                    style={oneDark}
                                    language={match ? match[1] : 'text'}
                                    PreTag="div"
                                    customStyle={{
                                      margin: 0,
                                      borderRadius: 0,
                                      fontSize: '0.875rem',
                                    }}
                                  >
                                    {String(children).replace(/\n$/, '')}
                                  </SyntaxHighlighter>
                                </div>
                              );
                            },
                            p({ children }) {
                              return <p className="markdown-p">{children}</p>;
                            },
                            h1({ children }) {
                              return <h1 className="markdown-h1">{children}</h1>;
                            },
                            h2({ children }) {
                              return <h2 className="markdown-h2">{children}</h2>;
                            },
                            h3({ children }) {
                              return <h3 className="markdown-h3">{children}</h3>;
                            },
                            ul({ children }) {
                              return <ul className="markdown-ul">{children}</ul>;
                            },
                            ol({ children }) {
                              return <ol className="markdown-ol">{children}</ol>;
                            },
                            li({ children }) {
                              return <li className="markdown-li">{children}</li>;
                            },
                            blockquote({ children }) {
                              return <blockquote className="markdown-blockquote">{children}</blockquote>;
                            },
                            a({ href, children }) {
                              return <a href={href} target="_blank" rel="noopener noreferrer" className="markdown-link">{children}</a>;
                            },
                          }}
                        >
                          {msg.content}
                        </Markdown>
                      ) : (
                        <p>{msg.content}</p>
                      )}
                    </div>
                    {msg.role === 'assistant' && msg.content && (
                      <div className="message-actions">
                        <button 
                          className="action-btn"
                          onClick={() => copyMessage(msg.content, `msg-${i}`)}
                          title="Copy response"
                        >
                          {copiedId === `msg-${i}` ? <CheckCheck size={14} /> : <Copy size={14} />}
                        </button>
                      </div>
                    )}
                    {msg.timestamp && (
                      <span className="message-time">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="message assistant">
                  <div className="message-avatar">
                    <Bot size={18} />
                  </div>
                  <div className="message-wrapper">
                    <div className="message-content typing">
                      <span className="typing-dot"></span>
                      <span className="typing-dot"></span>
                      <span className="typing-dot"></span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {messages.length > 0 && (
          <div className="scroll-to-bottom">
            <button onClick={scrollToBottom} title="Scroll to bottom">
              <span>↓</span>
            </button>
          </div>
        )}

        <form className="input-form" onSubmit={handleSubmit}>
          <div className="input-wrapper">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Send a message..."
              disabled={isTyping}
            />
            {messages.length > 0 && !isTyping && (
              <button 
                type="button" 
                className="regenerate-btn"
                onClick={regenerateResponse}
                title="Regenerate response"
              >
                <RefreshCw size={16} />
              </button>
            )}
            <button 
              type="submit" 
              className="send-btn"
              disabled={isTyping || !input.trim()}
            >
              <Send size={18} />
            </button>
          </div>
          <p className="input-footer">
            KrakenAi can make mistakes. Consider checking important information.
          </p>
        </form>
      </main>
    </div>
  );
}

export default App;