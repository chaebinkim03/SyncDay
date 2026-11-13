// JS/ui.js — 모든 화면 공통: 상단 날짜·인사말, 홈 환영 배너
(function () {
    const WEEK = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
    const now = new Date();
    const dateText = `${now.getMonth() + 1}월 ${now.getDate()}일 ${WEEK[now.getDay()]}`;
    const hour = now.getHours();
    const hello = hour < 12 ? '좋은 아침이에요' : hour < 18 ? '좋은 오후예요' : '오늘도 수고 많으셨어요';

    // 상단 헤더: 오늘 날짜 + 인사말
    const header = document.getElementById('header');
    if (header && !header.querySelector('.header-info')) {
        const info = document.createElement('div');
        info.className = 'header-info';
        info.innerHTML = `<span class="header-date">📅 ${dateText}</span><span class="header-hello" id="header-hello">${hello}</span>`;
        header.querySelector('.header-logo').after(info);
    }

    // 닉네임이 표시되면(왼쪽 아래) 인사말에도 넣기
    const nameEl = document.getElementById('user-email-display');
    const helloEl = document.getElementById('header-hello');
    const bannerName = document.getElementById('welcome-name');
    function syncName() {
        const name = (nameEl && nameEl.innerText || '').trim();
        if (!name || name.includes('로딩') || name.includes('불러오는')) return;
        if (helloEl) helloEl.textContent = `${name}님, ${hello}`;
        if (bannerName) bannerName.textContent = `${name}님, ${hello}!`;
    }
    if (nameEl) { new MutationObserver(syncName).observe(nameEl, { childList: true, characterData: true, subtree: true }); syncName(); }

    // 홈 환영 배너: 날짜 + 바로가기
    const bannerDate = document.getElementById('welcome-date');
    if (bannerDate) bannerDate.textContent = dateText;
    if (bannerName && !bannerName.textContent) bannerName.textContent = `${hello}!`;
})();

// 배너의 'AI로 계획 만들기' 버튼: 챗봇 창 열기
function openChatFromBanner() {
    const win = document.getElementById('chat-window');
    const icon = document.getElementById('chat-icon');
    if (win && getComputedStyle(win).display !== 'none' && !win.hidden) {
        const input = document.getElementById('chat-input');
        if (input) input.focus();
        return;
    }
    if (icon) icon.click();
    setTimeout(() => { const input = document.getElementById('chat-input'); if (input) input.focus(); }, 150);
}
