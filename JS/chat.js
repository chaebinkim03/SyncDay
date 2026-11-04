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

    /* 모바일: 아래 탭바 위에 버튼, 창은 화면 폭에 맞춤 */
    @media (max-width: 768px) {
        #chat-widget-container { right: 16px; bottom: calc(84px + env(safe-area-inset-bottom, 0px)); }
        #chat-icon { width: 56px; height: 56px; }
        #chat-window { width: calc(100vw - 32px); height: min(520px, calc(100dvh - 220px)); }
        #chat-window.dir-up-left, #chat-window.dir-up-right { bottom: 72px; }
        #chat-window.dir-down-left, #chat-window.dir-down-right { top: 72px; }
        #chat-window[class]::before, #chat-window[class]::after { display: none !important; }
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

async function sendMessage() {
    const goal = chatInput.value.trim();
    const deadline = deadlineInput.value;
    const minutesPerDay = Number(minutesSelect.value);
    if (!goal || isPlanning) return;
    if (!deadline) { addAiMessage('마감일을 선택해 주세요.', true); return; }

    isPlanning = true;
    sendBtn.disabled = true;
    if (typeof ensureRestSetting === 'function') await ensureRestSetting();
    const restDays = getRestDays();
    chatMessages.innerHTML += `<div class="msg user-msg">${escapeHtml(goal)}<br><small>마감 ${formatDay(deadline)} · 하루 ${minutesPerDay}분 · ${restDaysLabel(restDays)}</small></div>`;
    chatInput.value = '';
    const loadingId = 'loading-' + Date.now();
    chatMessages.innerHTML += `<div id="${loadingId}" class="msg ai-msg">⏳ 마감일까지 날짜별 계획을 만들고 있어요... (최대 30초)</div>`;
    chatMessages.scrollTop = chatMessages.scrollHeight;
    saveState();

    try {
        const { data, error } = await window.supabaseClient.functions.invoke('decompose-goal', {
            body: { goal, deadline, today: localDateStr(), minutesPerDay, restDays }
        });
        if (error) {
            let message = '계획을 만들지 못했어요. 잠시 후 다시 시도해 주세요.';
            try { const body = await error.context.json(); if (body && body.error) message = body.error; } catch (e) {}
            throw new Error(message);
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
        refreshPlannerViews();
    } catch (err) {
        console.error('decompose-goal 오류:', err);
        document.getElementById(loadingId)?.remove();
        addAiMessage(escapeHtml(err.message || '오류가 생겼어요. 잠시 후 다시 시도해 주세요.'), true);
    } finally {
        isPlanning = false;
        sendBtn.disabled = false;
        saveState();
    }
}

sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') sendMessage(); });