(function () {
  if (document.getElementById('eco-chatbot-root')) return;

  /* ── Styles ── */
  const style = document.createElement('style');
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap');

    #eco-chatbot-root * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Cairo', sans-serif; }

    /* Toggle button */
    #eco-toggle {
      position: fixed;
      bottom: 28px;
      right: 28px;
      width: 58px;
      height: 58px;
      border-radius: 50%;
      background: linear-gradient(135deg, #4ade80, #16a34a);
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 20px rgba(22,163,74,0.45);
      z-index: 99999;
      transition: transform 0.25s cubic-bezier(.34,1.56,.64,1), box-shadow 0.2s;
    }
    #eco-toggle:hover { transform: scale(1.1); box-shadow: 0 6px 28px rgba(22,163,74,0.6); }
    #eco-toggle svg { transition: transform 0.3s, opacity 0.3s; position: absolute; }
    #eco-toggle .ico-chat { opacity: 1; transform: scale(1) rotate(0deg); }
    #eco-toggle .ico-close { opacity: 0; transform: scale(0.5) rotate(90deg); }
    #eco-toggle.open .ico-chat { opacity: 0; transform: scale(0.5) rotate(-90deg); }
    #eco-toggle.open .ico-close { opacity: 1; transform: scale(1) rotate(0deg); }

    /* Chat window */
    #eco-window {
      position: fixed;
      bottom: 100px;
      right: 28px;
      width: 360px;
      max-width: calc(100vw - 40px);
      height: 500px;
      max-height: calc(100vh - 120px);
      background: #0f172a;
      border: 1px solid rgba(74,222,128,0.18);
      border-radius: 20px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      z-index: 99998;
      box-shadow: 0 16px 48px rgba(0,0,0,0.55), 0 0 0 1px rgba(74,222,128,0.08);
      opacity: 0;
      pointer-events: none;
      transform: scale(0.88) translateY(16px);
      transform-origin: bottom right;
      transition: opacity 0.28s cubic-bezier(.4,0,.2,1), transform 0.28s cubic-bezier(.34,1.4,.64,1);
    }
    #eco-window.open {
      opacity: 1;
      pointer-events: auto;
      transform: scale(1) translateY(0);
    }

    /* Header */
    #eco-header {
      padding: 14px 18px;
      background: linear-gradient(135deg, rgba(74,222,128,0.1), rgba(22,163,74,0.05));
      border-bottom: 1px solid rgba(255,255,255,0.06);
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
    }
    #eco-av {
      width: 38px; height: 38px; border-radius: 50%;
      background: linear-gradient(135deg, #4ade80, #16a34a);
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    #eco-av svg { width: 20px; height: 20px; fill: #fff; }
    #eco-hinfo p { font-size: 14px; font-weight: 700; color: #f8fafc; }
    #eco-hinfo span { font-size: 11px; color: #86efac; }
    #eco-hdot {
      width: 8px; height: 8px; border-radius: 50%;
      background: #4ade80; margin-left: auto;
      box-shadow: 0 0 6px #4ade80;
    }

    /* Messages */
    #eco-msgs {
      flex: 1; overflow-y: auto; padding: 16px;
      display: flex; flex-direction: column; gap: 10px;
      scroll-behavior: smooth;
    }
    #eco-msgs::-webkit-scrollbar { width: 3px; }
    #eco-msgs::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }

    .eco-msg { display: flex; gap: 8px; align-items: flex-end; max-width: 88%; }
    .eco-msg.out { align-self: flex-end; flex-direction: row-reverse; }

    .eco-bub {
      padding: 9px 13px; border-radius: 16px;
      font-size: 13.5px; line-height: 1.6; color: #f1f5f9;
      background: rgba(255,255,255,0.07);
      border: 1px solid rgba(255,255,255,0.07);
    }
    .eco-msg.out .eco-bub {
      background: linear-gradient(135deg, #16a34a, #15803d);
      color: #fff; border-color: transparent;
    }

    .eco-bot-av {
      width: 26px; height: 26px; border-radius: 50%;
      background: linear-gradient(135deg, #4ade80, #16a34a);
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .eco-bot-av svg { width: 13px; height: 13px; fill: #fff; }

    /* Typing */
    .eco-typing-dot {
      display: inline-block; width: 6px; height: 6px; border-radius: 50%;
      background: rgba(255,255,255,0.4); margin: 0 2px;
      animation: eco-blink 1.2s infinite;
    }
    .eco-typing-dot:nth-child(2) { animation-delay: 0.2s; }
    .eco-typing-dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes eco-blink { 0%,80%,100%{opacity:0.2} 40%{opacity:1} }

    /* Quick chips */
    #eco-chips {
      padding: 8px 14px; display: flex; gap: 6px; flex-wrap: wrap;
      border-top: 1px solid rgba(255,255,255,0.05); flex-shrink: 0;
    }
    .eco-chip {
      font-size: 11.5px; padding: 5px 10px; border-radius: 20px;
      border: 1px solid rgba(74,222,128,0.25);
      background: rgba(74,222,128,0.07);
      color: #86efac; cursor: pointer;
      transition: background 0.15s, transform 0.1s;
    }
    .eco-chip:hover { background: rgba(74,222,128,0.15); transform: translateY(-1px); }

    /* Input */
    #eco-inputrow {
      display: flex; gap: 8px; padding: 10px 14px;
      border-top: 1px solid rgba(255,255,255,0.05);
      align-items: center; flex-shrink: 0;
      background: rgba(255,255,255,0.02);
    }
    #eco-inp {
      flex: 1; border: none; outline: none;
      background: transparent; font-size: 13.5px;
      color: #f1f5f9; font-family: 'Cairo', sans-serif;
      direction: rtl;
    }
    #eco-inp::placeholder { color: rgba(255,255,255,0.25); }
    #eco-sendbtn {
      width: 34px; height: 34px; border-radius: 50%;
      border: none; background: linear-gradient(135deg, #4ade80, #16a34a);
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; transition: transform 0.15s, opacity 0.15s;
      box-shadow: 0 2px 10px rgba(22,163,74,0.4);
    }
    #eco-sendbtn:hover { transform: scale(1.1); }
    #eco-sendbtn svg { width: 15px; height: 15px; fill: #fff; }

    /* Unread badge */
    #eco-badge {
      position: absolute; top: -3px; right: -3px;
      width: 18px; height: 18px; border-radius: 50%;
      background: #ef4444; color: #fff;
      font-size: 11px; font-weight: 700; font-family: 'Cairo', sans-serif;
      display: none; align-items: center; justify-content: center;
      border: 2px solid #fff;
    }
    #eco-toggle-wrap { position: fixed; bottom: 28px; right: 28px; z-index: 99999; }
  `;
  document.head.appendChild(style);

  /* ── HTML ── */
  const root = document.createElement('div');
  root.id = 'eco-chatbot-root';
  root.innerHTML = `
    <div id="eco-toggle-wrap">
      <button id="eco-toggle" aria-label="Open chat">
        <svg class="ico-chat" width="24" height="24" viewBox="0 0 24 24" fill="white">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
        </svg>
        <svg class="ico-close" width="22" height="22" viewBox="0 0 24 24" fill="white">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
      </button>
      <div id="eco-badge">1</div>
    </div>

    <div id="eco-window" role="dialog" aria-label="Eco Support Chat">
      <div id="eco-header">
        <div id="eco-av">
          <svg viewBox="0 0 24 24"><path d="M17 8C8 10 5.9 16.17 3.82 21c3.95-2.85 7.93-3.77 11.18-3.77V21l7-7-5-6z"/></svg>
        </div>
        <div id="eco-hinfo">
          <p>Eco Support</p>
          <span>Smart Waste AI Assistant</span>
        </div>
        <div id="eco-hdot"></div>
      </div>

      <div id="eco-msgs"></div>

      <div id="eco-chips">
        <button class="eco-chip" onclick="ecoChatQuick('ما هو هذا الموقع؟')">ما هو الموقع؟</button>
        <button class="eco-chip" onclick="ecoChatQuick('كيف أبلغ عن نفايات؟')">إبلاغ نفايات</button>
        <button class="eco-chip" onclick="ecoChatQuick('نقاط البيئة؟')">نقاط البيئة</button>
        <button class="eco-chip" onclick="ecoChatQuick('تتبع التقرير')">تتبع التقرير</button>
        <button class="eco-chip" onclick="ecoChatQuick('من يمكنه الاستخدام؟')">المستخدمون</button>
      </div>

      <div id="eco-inputrow">
        <button id="eco-sendbtn" onclick="ecoChatSend()">
          <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
        <input id="eco-inp" placeholder="اكتب سؤالك هنا..." maxlength="500" autocomplete="off" dir="rtl"/>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  /* ── Logic ── */
  const toggle = document.getElementById('eco-toggle');
  const win = document.getElementById('eco-window');
  const msgs = document.getElementById('eco-msgs');
  const inp = document.getElementById('eco-inp');
  const badge = document.getElementById('eco-badge');
  let isOpen = false;
  let unread = 0;

  function botAv() {
    return `<div class="eco-bot-av"><svg viewBox="0 0 24 24" fill="white"><path d="M17 8C8 10 5.9 16.17 3.82 21c3.95-2.85 7.93-3.77 11.18-3.77V21l7-7-5-6z"/></svg></div>`;
  }

  function addMsg(text, who, isHtml = false) {
    const div = document.createElement('div');
    div.className = 'eco-msg ' + (who === 'out' ? 'out' : 'in');
    const bub = document.createElement('div');
    bub.className = 'eco-bub';
    if (isHtml) bub.innerHTML = text; else bub.textContent = text;
    if (who === 'in') div.innerHTML = botAv();
    div.appendChild(bub);
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
    if (who === 'in' && !isOpen) {
      unread++;
      badge.style.display = 'flex';
      badge.textContent = unread;
    }
  }

  function showTyping() {
    const div = document.createElement('div');
    div.className = 'eco-msg in'; div.id = 'eco-typing';
    div.innerHTML = botAv() + `<div class="eco-bub"><span class="eco-typing-dot"></span><span class="eco-typing-dot"></span><span class="eco-typing-dot"></span></div>`;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function removeTyping() {
    const t = document.getElementById('eco-typing');
    if (t) t.remove();
  }

  function getReply(msg) {
    const m = msg.toLowerCase().trim();
    if (m.includes('مرحبا') || m.includes('اهلا') || m.includes('hello') || m.includes('hi'))
      return 'اهلاً وسهلاً! 👋 عندك أي سؤال عن منصة النفايات الذكية؟';
    if (m.includes('شكرا') || m.includes('شكراً') || m.includes('thank'))
      return 'العفو! 🌱 إذا عندك أسئلة تانية، أنا هنا.';
    if (m.includes('كيف أبلغ') || m.includes('كيف ابلغ') || m.includes('ابلغ') || m.includes('نفايات') || m.includes('نفاية') || m.includes('قمامة') || m.includes('بلغ') || m.includes('waste') || m.includes('report'))
      return `<strong>خطوات الإبلاغ:</strong><br>1️⃣ اضغط "Report" من القائمة<br>2️⃣ صوّر النفايات بوضوح 📸<br>3️⃣ حدد موقعك (GPS تلقائي) 📍<br>4️⃣ أرسل التقرير ✅<br><br><small>🎁 ستحصل على <strong>10 نقاط بيئية</strong> فوراً!</small>`;
    if (m.includes('نقاط') || m.includes('eco points') || m.includes('points'))
      return `<strong>نقاط البيئة (Eco Points):</strong><br>تكسب نقاط عند كل تقرير صحيح.<br>يمكن استبدالها بمكافآت وخصومات. 🏆`;
    if (m.includes('تتبع') || m.includes('حالة') || m.includes('track'))
      return `<strong>تتبع تقاريرك:</strong><br>من لوحة التحكم تشوف حالة كل تقرير:<br>⏳ معلق &nbsp;|&nbsp; 🚛 مُرسَل &nbsp;|&nbsp; ✅ تم الجمع`;
    if (m.includes('من يستخدم') || m.includes('مين') || m.includes('who') || m.includes('يمكنه'))
      return `<strong>من يستخدم المنصة؟</strong><br>👥 المواطن — الإبلاغ عن النفايات<br>🚛 السائق — استلام المهام<br>👨‍💼 الإدارة — الإشراف والتحليلات`;
    if (m.includes('ما هو') || m.includes('موقع') || m.includes('منصة') || m.includes('ايه ده') || m.includes('what is') || m.includes('website'))
      return `<strong>🌍 نظام إدارة النفايات الذكي</strong><br>منصة تتيح للمواطنين الإبلاغ عن النفايات وتساعد الجهات الرسمية على تنظيم عمليات الجمع بكفاءة.<br><br>💡 ابدأ بالضغط على <strong>Report</strong> وصوّر أول نفاية!`;
    return 'عذراً، لم أفهم سؤالك تماماً. 🤔<br>جرّب أحد الأزرار السريعة أو اسأل بطريقة مختلفة.';
  }

  window.ecoChatSend = function (text) {
    const val = (text || inp.value).trim();
    if (!val) return;
    inp.value = '';
    addMsg(val, 'out');
    showTyping();
    setTimeout(() => {
      removeTyping();
      addMsg(getReply(val), 'in', true);
    }, 700 + Math.random() * 500);
  };

  window.ecoChatQuick = function (text) { ecoChatSend(text); };

  toggle.addEventListener('click', () => {
    isOpen = !isOpen;
    toggle.classList.toggle('open', isOpen);
    win.classList.toggle('open', isOpen);
    if (isOpen) {
      unread = 0;
      badge.style.display = 'none';
      setTimeout(() => inp.focus(), 300);
    }
  });

  document.addEventListener('click', (e) => {
    if (isOpen && !win.contains(e.target) && !toggle.contains(e.target)) {
      isOpen = false;
      toggle.classList.remove('open');
      win.classList.remove('open');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) {
      isOpen = false;
      toggle.classList.remove('open');
      win.classList.remove('open');
    }
  });

  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); ecoChatSend(); }
  });

  // Welcome message after short delay
  setTimeout(() => {
    addMsg('مرحباً! كيف يمكنني مساعدتك اليوم؟ 😊<br><small style="opacity:0.6">اضغط على الأزرار السريعة أو اكتب سؤالك</small>', 'in', true);
  }, 600);

})();