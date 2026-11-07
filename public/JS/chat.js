// JS/chat.js

// 💡 챗봇 안에 넣을 이미지 URL
const chatbotImageUrl = 'https://cdn-icons-png.flaticon.com/512/2040/2040946.png';

// 1. 챗봇 전용 디자인(CSS)과 화면(HTML)
const chatWidgetCode = `
<style>
    #chat-widget-container {
        position: fixed; z-index: 9999;
        right: 25px; bottom: 25px;
        font-family: 'Pretendard', sans-serif;
        touch-action: none;
    }
    #chat-icon {
        width: 65px; height: 65px; 
        background-color: #4361ee;
        border-radius: 50%; box-shadow: 0 4px 15px rgba(67, 97, 238, 0.3);
        cursor: pointer; display: flex; align-items: center; justify-content: center;
        transition: transform 0.2s; user-select: none;
        border: 2px solid white;
    }
    #chat-icon:active { transform: scale(0.95); }
    #chat-icon img {
        width: 35px; height: 35px;
        object-fit: contain; 
        pointer-events: none; 
    }
    #chat-window {
        display: none; width: 340px; height: 520px; 
        background: white; border: 2px solid #4361ee; 
        border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.1);
        overflow: hidden; flex-direction: column; position: absolute;
        z-index: 10000;
        animation: chatFadeIn 0.2s ease-out;
    }
    #chat-window.dir-up-left { bottom: 85px; right: 0; top: auto; left: auto; }
    #chat-window.dir-up-left::after { content: ''; position: absolute; bottom: -15px; right: 20px; border-left: 12px solid transparent; border-right: 12px solid transparent; border-top: 15px solid #4361ee; }
    #chat-window.dir-up-left::before { content: ''; position: absolute; bottom: -12px; right: 21px; border-left: 11px solid transparent; border-right: 11px solid transparent; border-top: 14px solid white; z-index: 1; }

    #chat-window.dir-down-left { top: 85px; right: 0; bottom: auto; left: auto; }
    #chat-window.dir-down-left::after { content: ''; position: absolute; top: -15px; right: 20px; border-left: 12px solid transparent; border-right: 12px solid transparent; border-bottom: 15px solid #4361ee; }
    #chat-window.dir-down-left::before { content: ''; position: absolute; top: -12px; right: 21px; border-left: 11px solid transparent; border-right: 11px solid transparent; border-bottom: 14px solid white; z-index: 1; }

    #chat-window.dir-up-right { bottom: 85px; left: 0; top: auto; right: auto; }
    #chat-window.dir-up-right::after { content: ''; position: absolute; bottom: -15px; left: 20px; border-left: 12px solid transparent; border-right: 12px solid transparent; border-top: 15px solid #4361ee; }
    #chat-window.dir-up-right::before { content: ''; position: absolute; bottom: -12px; left: 21px; border-left: 11px solid transparent; border-right: 11px solid transparent; border-top: 14px solid white; z-index: 1; }

    #chat-window.dir-down-right { top: 85px; left: 0; bottom: auto; right: auto; }
    #chat-window.dir-down-right::after { content: ''; position: absolute; top: -15px; left: 20px; border-left: 12px solid transparent; border-right: 12px solid transparent; border-bottom: 15px solid #4361ee; }
    #chat-window.dir-down-right::before { content: ''; position: absolute; top: -12px; right: 21px; border-left: 11px solid transparent; border-right: 11px solid transparent; border-bottom: 14px solid white; z-index: 1; }

    .chat-header {
        padding: 15px; background-color: #f8faff; border-bottom: 1px solid #eef2ff;
        display: flex; justify-content: space-between; align-items: center;
        cursor: grab;
    }
    .chat-header h3 { margin: 0; font-size: 1rem; color: #4361ee; font-weight: 700; pointer-events: none;}
    .close-btn { background: none; border: none; color: #aaa; font-size: 1.5rem; cursor: pointer; padding: 0; }

    .chat-body {
        flex: 1; padding: 15px; background-color: white;
        overflow-y: auto; display: flex; flex-direction: column; gap: 10px;
    }
    .msg { padding: 10px 14px; border-radius: 15px; max-width: 85%; line-height: 1.5; font-size: 0.9rem; word-break: keep-all;}
    .ai-msg { background-color: #f0f4ff; color: #333; align-self: flex-start; border-bottom-left-radius: 2px;}
    .user-msg { background-color: #4361ee; color: white; align-self: flex-end; border-bottom-right-radius: 2px;}

    .chat-footer { padding: 12px; background: white; border-top: 1px solid #f0f0f0; display: flex; flex-direction: column; gap: 8px; }
    .chat-options { display: flex; gap: 6px; align-items: center; }
    .chat-options label { font-size: 0.75rem; color: #64748b; font-weight: 600; display: flex; align-items: center; gap: 4px; white-space: nowrap; }
    .chat-options input[type="date"], .chat-options select { padding: 6px; border: 1px solid #e0e0e0; border-radius: 8px; font-size: 0.75rem; font-family: inherit; background: white; min-width: 0; }
    .chat-options input[type="date"] { flex: 1; }
    .chat-footer button:disabled { background: #a5b4fc; cursor: wait; }
    .plan-list { margin: 6px 0 0; padding-left: 16px; }
    .plan-list li { margin: 2px 0; }
    .plan-phase { display: inline-block; background: #e0e7ff; color: #3730a3; border-radius: 6px; padding: 1px 6px; margin: 2px 2px 0 0; font-size: 0.75rem; font-weight: 600; }
    .chat-footer input { flex: 1; padding: 10px; border: 1px solid #e0e0e0; border-radius: 10px; outline: none; font-size: 0.85rem; }
    .chat-footer button { padding: 8px 15px; border-radius: 10px; background: #4361ee; color: white; border: none; cursor: pointer; font-weight: bold; font-size: 0.85rem; white-space: nowrap; }

    /* 계획 만드는 중 표시 */
    .msg-loading .stage { display: flex; align-items: center; gap: 8px; font-weight: 600; color: #3730a3; }
    .msg-loading .dots { display: inline-flex; gap: 3px; }
    .msg-loading .dots i { width: 6px; height: 6px; border-radius: 50%; background: #6366f1; animation: chatDot 1s infinite; }
    .msg-loading .dots i:nth-child(2) { animation-delay: .15s; } .msg-loading .dots i:nth-child(3) { animation-delay: .3s; }
    .msg-loading .bar { height: 4px; background: #e0e7ff; border-radius: 999px; overflow: hidden; margin: 8px 0 6px; }
    .msg-loading .bar span { display: block; height: 100%; width: 0; background: #4361ee; border-radius: 999px; transition: width 1s linear; }
    .msg-loading small { color: #64748b; }
    @keyframes chatDot { 0%,100% { opacity: .25; } 50% { opacity: 1; } }
    .retry-btn { margin-top: 8px; padding: 6px 12px !important; font-size: 0.8rem !important; border-radius: 8px; background: #4361ee; color: #fff; border: none; cursor: pointer; font-weight: 700; }
    /* 완료 알림: 챗봇 버튼 배지 + 화면 위 토스트 */
    #chat-icon.has-new::after { content: ''; position: absolute; top: 2px; right: 2px; width: 14px; height: 14px; border-radius: 50%; background: #ef4444; border: 2px solid #fff; }
    #chat-icon { position: relative; }
    #chat-icon.has-new { animation: chatNudge 1.2s ease-in-out 2; }
    @keyframes chatNudge { 0%,100% { transform: rotate(0); } 25% { transform: rotate(-10deg); } 75% { transform: rotate(10deg); } }
    .chat-toast { position: fixed; top: 84px; right: 24px; z-index: 10001; max-width: 360px; background: #fff; border: 1px solid #c7d2fe; border-left: 4px solid #4361ee; border-radius: 12px; box-shadow: 0 10px 30px rgba(15,23,42,.15); padding: 12px 14px; font-size: 0.9rem; color: #1e293b; display: flex; gap: 10px; align-items: flex-start; animation: toastIn .3s ease-out; font-family: 'Pretendard', sans-serif; }
    .chat-toast.error { border-left-color: #ef4444; border-color: #fecaca; }
    .chat-toast .t-body { flex: 1; line-height: 1.5; }
    .chat-toast a { display: inline-block; margin-top: 6px; color: #4361ee; font-weight: 700; text-decoration: none; }
    .chat-toast button { background: none; border: none; font-size: 1.1rem; color: #94a3b8; cursor: pointer; padding: 0 2px; }
    @keyframes toastIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: none; } }

    /* 모바일: 아래 탭바 위에 버튼, 창은 화면 폭에 맞춤 */
    @media (max-width: 768px) {
        #chat-widget-container { right: 16px; bottom: calc(84px + env(safe-area-inset-bottom, 0px)); }
        #chat-icon { width: 56px; height: 56px; }
        #chat-window { width: calc(100vw - 32px); height: min(520px, calc(100dvh - 220px)); }
        #chat-window.dir-up-left, #chat-window.dir-up-right { bottom: 72px; }
        #chat-window.dir-down-left, #chat-window.dir-down-right { top: 72px; }
        #chat-window[class]::before, #chat-window[class]::after { display: none !important; }
        .chat-toast { top: calc(68px + env(safe-area-inset-top, 0px)); left: 12px; right: 12px; max-width: none; }
    }

    @keyframes chatFadeIn {
        from { opacity: 0; transform: scale(0.95); }
        to { opacity: 1; transform: scale(1); }
    }
</style>

<div id="chat-widget-container" style="visibility: hidden;">
    <div id="chat-window" class="dir-up-left">
        <div class="chat-header" id="chat-header-handle">
            <h3>SyncDay AI 에이전트</h3>
            <button class="close-btn" id="close-chat">&times;</button>
        </div>
        <div class="chat-body" id="chat-messages">
            <div class="msg ai-msg">안녕하세요! 목표와 마감일을 알려 주시면 마감일까지 매일 할 일로 나눠서 투두에 넣어 드릴게요.</div>
        </div>
        <div class="chat-footer">
            <input type="text" id="chat-input" placeholder="목표 입력 (예: 토익 800점 달성)" maxlength="200">
            <div class="chat-options">
                <label>마감일 <input type="date" id="chat-deadline"></label>
                <select id="chat-minutes" aria-label="하루 투자 시간">
                    <option value="30">하루 30분</option>
                    <option value="60" selected>하루 1시간</option>
                    <option value="90">하루 1시간 30분</option>
                    <option value="120">하루 2시간</option>
                </select>
            </div>
            <button id="send-btn">계획 만들기</button>
        </div>
    </div>
    <div id="chat-icon">
        <img src="${chatbotImageUrl}" alt="AI Assistant">
    </div>
</div>
`;

document.body.insertAdjacentHTML('beforeend', chatWidgetCode);

const container = document.getElementById('chat-widget-container');
const icon = document.getElementById('chat-icon');
const windowEl = document.getElementById('chat-window');
const headerHandle = document.getElementById('chat-header-handle');
const closeBtn = document.getElementById('close-chat');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const chatMessages = document.getElementById('chat-messages');

// 3. 💾 상태 불러오기
const savedLeft = sessionStorage.getItem('chatLeft');
const savedTop = sessionStorage.getItem('chatTop');
const isChatOpen = sessionStorage.getItem('chatOpen') === 'true';
const savedMessages = sessionStorage.getItem('chatMessages');
const savedDir = sessionStorage.getItem('chatDir');

if (savedLeft && savedTop) {
    container.style.left = savedLeft;
    container.style.top = savedTop;
    container.style.right = 'auto';
    container.style.bottom = 'auto';
}
if (savedDir) windowEl.className = savedDir;
if (isChatOpen) windowEl.style.display = 'flex';
if (savedMessages) chatMessages.innerHTML = savedMessages;

// 휴대폰: 아래 메뉴바(탭바) 윗선. 챗봇이 이 아래로 내려가지 않게 함
function chatBottomLimit() {
    const bar = document.getElementById('sidebar-left');
    if (bar && window.innerWidth <= 768 && getComputedStyle(bar).position === 'fixed') {
        return bar.getBoundingClientRect().top - 10;
    }
    return window.innerHeight - 15;
}
const isMobileChat = () => window.innerWidth <= 768;

// 메시지 창 위치: 휴대폰에서는 화면 폭에 맞추고, 챗봇 버튼 위/아래 중 넓은 쪽에 붙임 (버튼을 옮기면 창도 따라감)
function placeChatWindow() {
    const w = windowEl.style;
    if (!isMobileChat()) {
        w.position = ''; w.left = ''; w.right = ''; w.top = ''; w.bottom = ''; w.width = ''; w.height = '';
        return;
    }
    if (windowEl.style.display !== 'flex') return;
    const r = icon.getBoundingClientRect();
    const limit = chatBottomLimit();
    const gap = 10, topSafe = 12;
    const spaceAbove = r.top - gap - topSafe;
    const spaceBelow = limit - r.bottom - gap;
    w.position = 'fixed'; w.left = '16px'; w.right = '16px'; w.width = 'auto';
    if (spaceAbove >= spaceBelow) {
        w.top = 'auto'; w.bottom = (window.innerHeight - r.top + gap) + 'px';
        w.height = Math.max(240, Math.min(520, spaceAbove)) + 'px';
    } else {
        w.bottom = 'auto'; w.top = (r.bottom + gap) + 'px';
        w.height = Math.max(240, Math.min(520, spaceBelow)) + 'px';
    }
}

// 저장된 위치가 지금 화면 밖이면(넓은 화면 → 휴대폰, 화면 회전 등) 기본 위치(오른쪽 아래)로 되돌림
function resetChatPosition() {
    container.style.left = ''; container.style.top = '';
    container.style.right = ''; container.style.bottom = '';
    windowEl.classList.remove('dir-down-left', 'dir-up-right', 'dir-down-right');
    windowEl.classList.add('dir-up-left');
}
function keepChatInView() {
    if (container.style.left || container.style.top) {
        const rect = container.getBoundingClientRect();
        const out = rect.right > window.innerWidth || rect.bottom > chatBottomLimit() + 10 || rect.left < 0 || rect.top < 0;
        if (out) {
            resetChatPosition();
            try { sessionStorage.removeItem('chatLeft'); sessionStorage.removeItem('chatTop'); sessionStorage.setItem('chatDir', windowEl.className); } catch (e) {}
        }
    }
    placeChatWindow();
}
keepChatInView();
let chatResizeTimer;
window.addEventListener('resize', () => { clearTimeout(chatResizeTimer); chatResizeTimer = setTimeout(keepChatInView, 150); });

container.style.visibility = 'visible';
chatMessages.scrollTop = chatMessages.scrollHeight;

function saveState() {
    sessionStorage.setItem('chatLeft', container.style.left);
    sessionStorage.setItem('chatTop', container.style.top);
    sessionStorage.setItem('chatOpen', windowEl.style.display === 'flex');
    sessionStorage.setItem('chatMessages', chatMessages.innerHTML);
    sessionStorage.setItem('chatDir', windowEl.className);
}

// 5. 드래그앤드롭 변수 (클릭 보정 추가)
let isDragging = false;
let hasMoved = false; 
let shiftX, shiftY;
let startX, startY; // 💡 시작 좌표를 기억하여 미세 떨림 방지

// 6. 다운 이벤트
function onDragStart(e) {
    if(e.target.id === 'close-chat') return; 

    isDragging = true;
    hasMoved = false;
    
    const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
    const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;

    startX = clientX;
    startY = clientY;

    const rect = container.getBoundingClientRect();
    container.style.right = 'auto';
    container.style.bottom = 'auto';
    container.style.left = rect.left + 'px';
    container.style.top = rect.top + 'px';

    shiftX = clientX - rect.left;
    shiftY = clientY - rect.top;
    
    container.style.transition = 'none';
}

// 7. 이동 이벤트
function onDragMove(e) {
    if (!isDragging) return;

    const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
    const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;

    if (Math.abs(clientX - startX) > 5 || Math.abs(clientY - startY) > 5) {
        hasMoved = true;
    }

    if (!hasMoved) return; 
    
    e.preventDefault();

    let newLeft = clientX - shiftX;
    let newTop = clientY - shiftY;

    const padding = 15;
    const maxLeft = window.innerWidth - container.offsetWidth - padding;
    const maxTop = chatBottomLimit() - container.offsetHeight; // 휴대폰: 아래 메뉴바 위까지만

    newLeft = Math.max(padding, Math.min(newLeft, maxLeft));
    newTop = Math.max(padding, Math.min(newTop, maxTop));

    container.style.left = newLeft + 'px';
    container.style.top = newTop + 'px';
    placeChatWindow(); // 창이 열려 있으면 버튼을 따라 움직임
}

// 8. 드래그 종료
function onDragEnd() {
    if (!isDragging) return;
    isDragging = false;

    if (hasMoved) {
        container.style.transition = 'left 0.3s cubic-bezier(0.25, 1, 0.5, 1), top 0.3s cubic-bezier(0.25, 1, 0.5, 1)';

        const rect = container.getBoundingClientRect();
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        const edgePadding = 25;

        const closeToLeft = rect.left + container.offsetWidth / 2 < windowWidth / 2;
        const closeToTop = rect.top + container.offsetHeight / 2 < windowHeight / 2;

        if (closeToLeft) {
            container.style.left = edgePadding + 'px';
        } else {
            container.style.left = (windowWidth - container.offsetWidth - edgePadding) + 'px';
        }

        const maxTop = Math.min(windowHeight - edgePadding, chatBottomLimit()) - container.offsetHeight;
        let finalTop = Math.max(edgePadding, Math.min(rect.top, maxTop));
        container.style.top = finalTop + 'px';

        windowEl.classList.remove('dir-up-left', 'dir-down-left', 'dir-up-right', 'dir-down-right');
        
        if (!closeToLeft && !closeToTop) { windowEl.classList.add('dir-up-left'); } 
        else if (!closeToLeft && closeToTop) { windowEl.classList.add('dir-down-left'); } 
        else if (closeToLeft && !closeToTop) { windowEl.classList.add('dir-up-right'); } 
        else if (closeToLeft && closeToTop) { windowEl.classList.add('dir-down-right'); }
        
        saveState();
        setTimeout(placeChatWindow, 320); // 가장자리로 붙는 애니메이션이 끝난 뒤 창 위치 맞춤
    }
}

icon.addEventListener('mousedown', onDragStart);
headerHandle.addEventListener('mousedown', onDragStart);
window.addEventListener('mousemove', onDragMove);
window.addEventListener('mouseup', onDragEnd);

icon.addEventListener('touchstart', onDragStart, { passive: true });
headerHandle.addEventListener('touchstart', onDragStart, { passive: true });
window.addEventListener('touchmove', onDragMove, { passive: false });
window.addEventListener('touchend', onDragEnd);

// 9. 클릭하여 열기/닫기 로직
icon.addEventListener('click', () => {
    if (hasMoved) return; 
    windowEl.style.display = windowEl.style.display === 'flex' ? 'none' : 'flex'; // 첫 클릭에 바로 열리도록
    if (windowEl.style.display === 'flex') icon.classList.remove('has-new');
    placeChatWindow();
    saveState();
});

closeBtn.addEventListener('click', (e) => { 
    e.stopPropagation();
    windowEl.style.display = 'none'; 
    saveState();
});

// ==========================================
// 10. 목표 → 날짜별 계획 만들기 (Supabase Edge Function 'decompose-goal' 호출)
//     Gemini API 키는 서버(Supabase Secrets)에만 있고, 브라우저에는 없습니다.
// ==========================================
const deadlineInput = document.getElementById('chat-deadline');
const minutesSelect = document.getElementById('chat-minutes');
const WEEK_KO = ['일', '월', '화', '수', '목', '금', '토'];
let isPlanning = false;

function localDateStr(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function formatDay(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const wd = WEEK_KO[new Date(y, m - 1, d).getDay()];
    return `${m}/${d}(${wd})`;
}
// 캘린더의 '휴무일 설정'을 AI 계획에도 반영
//  - 일반 모드(기본값): 토·일 휴무 / 스케줄 모드: 직접 고른 요일 휴무
function getRestDays() {
    const setting = typeof getRestSetting === 'function' ? getRestSetting() : null;
    if (setting && setting.type === 'weekly') return setting.days;
    return [0, 6];
}
function restDaysLabel(days) {
    if (!days.length) return '휴무 없음';
    const order = [1, 2, 3, 4, 5, 6, 0];
    return '휴무 ' + order.filter(d => days.includes(d)).map(d => WEEK_KO[d]).join('·');
}

// 마감일 기본값: 오늘부터 30일 뒤
deadlineInput.min = localDateStr();
if (!deadlineInput.value) {
    const d = new Date(); d.setDate(d.getDate() + 30);
    deadlineInput.value = localDateStr(d);
}

function addAiMessage(html, isError = false) {
    const style = isError ? ' style="color: #e63946; font-weight: bold;"' : '';
    chatMessages.innerHTML += `<div class="msg ai-msg"${style}>${html}</div>`;
    chatMessages.scrollTop = chatMessages.scrollHeight;
    saveState();
}

// 계획이 저장되면 지금 열려 있는 화면(홈/캘린더/투두)을 새로고침
function refreshPlannerViews() {
    if (typeof loadUrgentTodos === 'function') loadUrgentTodos();
    if (typeof updateRoutineProgress === 'function') updateRoutineProgress();
    if (typeof loadWeeklyRecord === 'function') loadWeeklyRecord();
    if (typeof fetchTodos === 'function') fetchTodos();
    if (typeof miniCalendar !== 'undefined' && miniCalendar) miniCalendar.refetchEvents();
    if (typeof calendar !== 'undefined' && calendar) calendar.refetchEvents();
}

// ===== 계획 만드는 동안: 단계 표시 / 끝나면: 알림 =====
const PLAN_STAGES = [
    [0, '목표를 분석하고 있어요'],
    [4, '마감일까지 쓸 수 있는 날을 계산하고 있어요'],
    [9, '날짜별 할 일로 나누고 있어요'],
    [20, 'AI 서버가 붐벼서 다시 시도하고 있어요'],
    [45, '거의 다 됐어요. 조금만 기다려 주세요'],
];
function loadingHtml(sec) {
    const stage = PLAN_STAGES.filter(st => sec >= st[0]).pop()[1];
    const pct = Math.min(95, Math.round(100 * (1 - Math.exp(-sec / 14))));
    return `<div class="stage"><span class="dots"><i></i><i></i><i></i></span>${stage}</div>
        <div class="bar"><span style="width:${pct}%"></span></div>
        <small>${sec}초 · 창을 닫거나 다른 화면으로 가도 괜찮아요. 완성되면 알려 드릴게요.</small>`;
}
function startLoading(id, startedAt) {
    const el = document.getElementById(id);
    if (!el) return null;
    const tick = () => { const n = document.getElementById(id); if (n) n.innerHTML = loadingHtml(Math.floor((Date.now() - startedAt) / 1000)); };
    tick();
    return setInterval(tick, 1000);
}

function showChatToast(html, { error = false, link = null } = {}) {
    document.querySelectorAll('.chat-toast').forEach(t => t.remove());
    const t = document.createElement('div');
    t.className = 'chat-toast' + (error ? ' error' : '');
    t.setAttribute('role', 'status');
    t.innerHTML = `<div class="t-body">${html}${link ? `<br><a href="${link.href}">${link.label} ›</a>` : ''}</div><button type="button" aria-label="닫기">×</button>`;
    t.querySelector('button').addEventListener('click', () => t.remove());
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 9000);
}

// 결과가 나왔을 때: 챗봇 창이 닫혀 있으면 배지, 다른 탭을 보고 있으면 탭 제목, 화면 위 토스트
const baseTitle = document.title;
function notifyPlanDone(html, { error = false } = {}) {
    if (windowEl.style.display !== 'flex') icon.classList.add('has-new');
    const onTodo = /todo\.html$/.test(location.pathname);
    showChatToast(html, { error, link: (!error && !onTodo) ? { href: 'todo.html', label: '투두에서 보기' } : null });
    if (document.hidden) document.title = (error ? '(!) ' : '(1) 계획 완성 · ') + baseTitle;
    if (!error && navigator.vibrate) { try { navigator.vibrate(120); } catch (e) {} }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) document.title = baseTitle; });

// 다른 화면으로 이동해도 결과를 알려 주기 위한 표시 (같은 탭 안에서만)
function setPending(v) { try { v ? sessionStorage.setItem('chatPending', JSON.stringify(v)) : sessionStorage.removeItem('chatPending'); } catch (e) {} }
function getPending() { try { return JSON.parse(sessionStorage.getItem('chatPending')); } catch (e) { return null; } }

let lastRequest = null;

async function sendMessage(retryReq) {
    const req = retryReq || {
        goal: chatInput.value.trim(),
        deadline: deadlineInput.value,
        minutesPerDay: Number(minutesSelect.value),
    };
    const { goal, deadline, minutesPerDay } = req;
    if (!goal || isPlanning) return;
    if (!deadline) { addAiMessage('마감일을 선택해 주세요.', true); return; }

    isPlanning = true;
    sendBtn.disabled = true;
    if (typeof ensureRestSetting === 'function') await ensureRestSetting();
    const restDays = getRestDays();
    lastRequest = { goal, deadline, minutesPerDay };
    if (!retryReq) {
        chatMessages.innerHTML += `<div class="msg user-msg">${escapeHtml(goal)}<br><small>마감 ${formatDay(deadline)} · 하루 ${minutesPerDay}분 · ${restDaysLabel(restDays)}</small></div>`;
        chatInput.value = '';
    }
    const startedAt = Date.now();
    const loadingId = 'loading-' + startedAt;
    chatMessages.innerHTML += `<div id="${loadingId}" class="msg ai-msg msg-loading"></div>`;
    const timer = startLoading(loadingId, startedAt);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    setPending({ goal, startedAt });
    saveState();

    try {
        const { data, error } = await window.supabaseClient.functions.invoke('decompose-goal', {
            body: { goal, deadline, today: localDateStr(), minutesPerDay, restDays }
        });
        if (error) {
            let message = '계획을 만들지 못했어요. 잠시 후 다시 시도해 주세요.';
            let code = '';
            try { const body = await error.context.json(); if (body && body.error) { message = body.error; code = body.code || ''; } } catch (e) {}
            const err = new Error(message); err.code = code; err.retryable = !error.context || !error.context.status || error.context.status >= 500;
            throw err;
        }

        const tasks = data.tasks || [];
        const phases = (data.phases || []).map(p => `<span class="plan-phase">${escapeHtml(p.name)} ${formatDay(p.start)}~${formatDay(p.end)}</span>`).join('');
        // 전체 개수보다 '오늘(또는 첫날) 할 일'만 강조해 부담을 줄임
        const todayStr = localDateStr();
        const firstDay = tasks.length ? (tasks.some(t => t.date === todayStr) ? todayStr : tasks[0].date) : null;
        const firstTasks = tasks.filter(t => t.date === firstDay);
        const firstLabel = firstDay === todayStr ? '오늘은 이것만 하면 돼요' : `첫 할 일은 ${formatDay(firstDay)}에 시작해요`;
        const preview = firstTasks.map(t => `<li>${escapeHtml(t.title)} · ${t.minutes}분</li>`).join('');
        const capped = data.capped ? '<br><small>기간이 길어서 앞으로 90일 동안의 계획만 먼저 만들었어요.</small>' : '';

        document.getElementById(loadingId)?.remove();
        addAiMessage(`✅ <b>${escapeHtml(data.goal)}</b> 계획 완성! 마감까지 매일 조금씩 나눠 두었어요.`
            + (phases ? `<div style="margin-top:6px">${phases}</div>` : '')
            + (preview ? `<div style="margin-top:8px"><b>${firstLabel}</b></div><ul class="plan-list">${preview}</ul>` : '')
            + capped
            + '<small>나머지는 투두 화면에서 날짜가 되면 하나씩 보여 드릴게요.</small>');
        notifyPlanDone(`✅ <b>${escapeHtml(data.goal)}</b> 계획이 완성됐어요!` + (firstTasks.length ? `<br>${escapeHtml(firstLabel)}: ${escapeHtml(firstTasks[0].title)}` : ''));
        refreshPlannerViews();
    } catch (err) {
        console.error('decompose-goal 오류:', err);
        document.getElementById(loadingId)?.remove();
        const canRetry = err.code === 'busy' || err.code === 'ai_failed' || err.code === 'empty' || err.retryable !== false;
        addAiMessage(escapeHtml(err.message || '오류가 생겼어요. 잠시 후 다시 시도해 주세요.')
            + (canRetry ? '<br><button type="button" class="retry-btn">같은 목표로 다시 시도</button>' : ''), true);
        notifyPlanDone(escapeHtml(err.message || '계획을 만들지 못했어요.'), { error: true });
    } finally {
        clearInterval(timer);
        setPending(null);
        isPlanning = false;
        sendBtn.disabled = false;
        saveState();
    }
}

// '다시 시도' 버튼 (저장된 대화에서도 동작하도록 위임)
chatMessages.addEventListener('click', (e) => {
    const b = e.target.closest('.retry-btn');
    if (!b || isPlanning) return;
    const req = lastRequest || (() => { try { return JSON.parse(sessionStorage.getItem('chatLastRequest')); } catch (x) { return null; } })();
    if (!req) return;
    b.remove();
    sendMessage(req);
});
// 페이지를 옮겨도 마지막 요청을 기억 (다시 시도용)
window.addEventListener('pagehide', () => { try { if (lastRequest) sessionStorage.setItem('chatLastRequest', JSON.stringify(lastRequest)); } catch (e) {} });

// 계획을 만드는 도중에 다른 화면으로 이동했다면: 새 화면에서 결과(목표 저장 여부)를 확인해 알려 줌
(function resumePending() {
    chatMessages.querySelectorAll('.msg-loading').forEach(n => n.remove()); // 이전 화면의 '만드는 중' 표시 정리
    const p = getPending();
    if (!p) return;
    const LIMIT = 120000;
    if (Date.now() - p.startedAt > LIMIT) { setPending(null); return; }
    const id = 'loading-' + p.startedAt;
    chatMessages.innerHTML += `<div id="${id}" class="msg ai-msg msg-loading"></div>`;
    const timer = startLoading(id, p.startedAt);
    const since = new Date(p.startedAt - 10000).toISOString();
    const check = async () => {
        try {
            const { data } = await window.supabaseClient.from('goals').select('goal_id, title, created_at')
                .eq('title', p.goal).gte('created_at', since).order('created_at', { ascending: false }).limit(1);
            if (data && data.length) {
                clearInterval(poll); clearInterval(timer); setPending(null);
                document.getElementById(id)?.remove();
                addAiMessage(`✅ <b>${escapeHtml(p.goal)}</b> 계획 완성! 투두 화면에서 날짜별 할 일을 확인해 보세요.`);
                notifyPlanDone(`✅ <b>${escapeHtml(p.goal)}</b> 계획이 완성됐어요!`);
                refreshPlannerViews();
                return;
            }
        } catch (e) {}
        if (Date.now() - p.startedAt > LIMIT) {
            clearInterval(poll); clearInterval(timer); setPending(null);
            document.getElementById(id)?.remove();
            addAiMessage('화면을 옮기는 사이 계획 결과를 받지 못했어요. 투두 화면에서 확인하거나 다시 시도해 주세요.'
                + '<br><button type="button" class="retry-btn">같은 목표로 다시 시도</button>', true);
        }
    };
    const poll = setInterval(check, 4000);
    setTimeout(check, 1500);
})();

sendBtn.addEventListener('click', () => sendMessage());
chatInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') sendMessage(); });