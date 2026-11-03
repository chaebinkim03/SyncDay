// JS/main.js
let currentUserId = null;
let miniCalendar = null;

document.addEventListener('DOMContentLoaded', async function() {
    await checkSession();
    if(!currentUserId) return;

    // [에러 방어벽]: 하나의 위젯에 문제가 생겨도 다른 위젯은 정상 작동하도록 보호
    try { initMiniCalendar(); } catch(e) { console.error("캘린더 로딩 에러:", e); }
    try { updateRoutineProgress(); } catch(e) { console.error("달성도 및 루틴 로딩 에러:", e); }
    try { loadWeeklyRecord(); } catch(e) { console.error("완료 기록 로딩 에러:", e); }
    try { loadUrgentTodos(); } catch(e) { console.error("투두 로딩 에러:", e); }
});

async function checkSession() {
    if(window.supabaseClient) {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        if (!session) { 
            window.location.href = "../Login.html"; 
            return; 
        }
        currentUserId = session.user.id;
        const emailDisplay = document.getElementById('user-email-display');
        
        // 🚀 이메일 대신 닉네임 불러오기 로직 추가
        if(emailDisplay) {
            const { data, error } = await window.supabaseClient
                .from('profiles')
                .select('nickname')
                .eq('id', currentUserId)
                .single();
            
            if (data && data.nickname) {
                emailDisplay.innerText = data.nickname; // 설정한 닉네임이 있으면 닉네임 표시
            } else {
                emailDisplay.innerText = (session.user.user_metadata && session.user.user_metadata.full_name) || session.user.email; // 닉네임이 없으면 구글 이름 → 이메일
            }
        }
    }
}

function initMiniCalendar() {
    const calendarEl = document.getElementById('mini-calendar');
    if (!calendarEl) return;

    miniCalendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'ko',
        height: '100%',
        headerToolbar: { left: 'title', right: 'prev,next' }, 
        
        googleCalendarApiKey: 'AIzaSyCdgnHAhrQP9XuUFzMwbl0E-2ezWXZYQkw', 
        
        dayCellDidMount: function(info) {
            const day = info.date.getDay();
            const dayNum = info.el.querySelector('.fc-daygrid-day-number');
            if (dayNum) {
                if (day === 0) dayNum.style.color = '#e63946';
                else if (day === 6) dayNum.style.color = '#4361ee';
            }
        },
        dayCellContent: function(info) {
            return { html: info.dayNumberText.replace('일', '').trim() };
        },

        eventContent: function(arg) {
            return {
                html: `
                <div class="mini-event-line" style="background-color: ${arg.event.backgroundColor || '#ff9f43'};">
                    <span class="mini-event-title">${arg.event.title}</span>
                </div>
                `
            };
        },
        
        eventSources: [
            {
                googleCalendarId: 'ko.south_korea#holiday@group.v.calendar.google.com',
                color: '#ff9f43', 
                textColor: '#ffffff'
            },
            async function(info, successCallback, failureCallback) {
                try {
                    const { data, error } = await window.supabaseClient.from('recommended_schedules').select('*');
                    if (error) { failureCallback(error); } 
                    else {
                        const events = data.map(item => {
                            const localStart = item.start_time ? item.start_time.substring(0, 19) : null;
                            const localEnd = item.end_time ? item.end_time.substring(0, 19) : null;
                            return {
                                id: item.schedule_id, 
                                title: item.schedule_title, 
                                start: localStart, 
                                end: localEnd, 
                                backgroundColor: item.color || '#4361ee', 
                                borderColor: item.color || '#4361ee',
                                allDay: false
                            };
                        });
                        successCallback(events);
                    }
                } catch(e) { failureCallback(e); }
            }
        ],

        dateClick: showDaySummary,

        // 공휴일 등 일정을 눌러도 구글 캘린더로 넘어가지 않고, 그날 요약을 보여 줌
        eventClick: function(info) {
            info.jsEvent.preventDefault();
            showDaySummary({ dateStr: info.event.startStr.slice(0, 10) });
        }
    });
    
    miniCalendar.render();
    setTimeout(() => { miniCalendar.updateSize(); }, 100);
}

// 오늘 달성률 = (오늘 해야 하는 루틴 + 오늘 날짜의 투두) 중 완료한 비율 / 리스트에는 오늘 해야 하는 루틴만 표시
let homeRoutines = [];

async function updateRoutineProgress() {
    const { data: routinesData, error: routineError } = await window.supabaseClient
        .from('routines').select('*').order('created_at', { ascending: true });
    const { data: todosData, error: todoError } = await window.supabaseClient.from('ai_subtasks').select('*');

    if (routineError || todoError) {
        console.error("데이터 가져오기 오류:", routineError || todoError);
        return;
    }

    const todayStr = localDateString();
    // 날이 바뀐 루틴은 체크 해제 (루틴 페이지와 같은 규칙, JS/routine.js)
    const allRoutines = await normalizeRoutines(routinesData || []);
    // 반복 주기(매일/평일/주말)상 오늘 해야 하는 루틴만
    homeRoutines = allRoutines.filter(r => isRoutineDue(r.repeat_rule, todayStr));
    // 오늘 날짜의 투두만 (밀린 일·미래 일은 오늘 달성률에서 제외)
    const safeTodos = (todosData || []).filter(t => t.target_date && String(t.target_date).slice(0, 10) === todayStr);

    const totalItems = homeRoutines.length + safeTodos.length;
    const totalCompleted = homeRoutines.filter(r => r.is_completed).length + safeTodos.filter(t => t.is_completed).length;
    const percentage = totalItems === 0 ? 0 : Math.round((totalCompleted / totalItems) * 100);

    const progressText = document.getElementById('main-progress-text');
    const progressBar = document.getElementById('main-progress-bar');
    if (progressText) progressText.innerText = percentage + '%';
    const progressCount = document.getElementById('main-progress-count');
    if (progressCount) progressCount.textContent = totalItems === 0 ? '오늘 할 일이 없어요' : `${totalCompleted} / ${totalItems}개 완료`;
    if (progressBar) {
        progressBar.style.width = percentage + '%';
        progressBar.style.transition = 'width 0.5s ease-in-out';
        progressBar.style.backgroundColor = percentage === 100 ? '#2ecc71' : '#4361ee';
    }

    const routineList = document.getElementById('main-routine-list');
    if (!routineList) return;
    if (homeRoutines.length === 0) {
        routineList.innerHTML = '<li class="empty-msg">오늘 할 루틴이 없습니다.</li>';
        return;
    }
    routineList.innerHTML = '';
    homeRoutines.forEach(item => {
        const isDone = item.is_completed;
        const textStyle = isDone ? 'text-decoration: line-through; color: #aaa;' : 'color: #333;';
        const icon = isDone ? '✅' : '▶️';
        routineList.innerHTML += `
            <li onclick="toggleRoutine(${item.routine_id})" style="cursor: pointer; padding: 10px 0; border-bottom: 1px solid #eee; font-size: 15px; ${textStyle} transition: 0.2s;">
                ${icon} ${escapeRoutineHtml(routineTitle(item))}
            </li>`;
    });
}

// 루틴 완료 상태 변경 (홈에서 클릭) → 연속 일수·마지막 완료일까지 루틴 페이지와 같은 방식으로 저장
async function toggleRoutine(routineId) {
    const routine = homeRoutines.find(r => r.routine_id === routineId);
    if (!routine) return;
    if (await saveRoutineToggle(routine)) { updateRoutineProgress(); loadWeeklyRecord(); }
}

// 이번 주(일요일~토요일) 완료 기록 (completion_logs: DB가 루틴·투두 체크를 보고 자동으로 남기는 기록)
async function loadWeeklyRecord() {
    const box = document.getElementById('weekly-bars');
    if (!box) return;
    const now = new Date();
    const today = localDateString(now);
    const days = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + i); // 이번 주 일요일부터
        days.push(localDateString(d));
    }
    const { data, error } = await window.supabaseClient
        .from('completion_logs').select('done_date').gte('done_date', days[0]).lte('done_date', days[6]);
    if (error) { console.error('완료 기록 불러오기 실패:', error); return; }

    const counts = Object.fromEntries(days.map(d => [d, 0]));
    (data || []).forEach(r => { const d = String(r.done_date).slice(0, 10); if (d in counts) counts[d]++; });
    const max = Math.max(1, ...Object.values(counts));
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const week = ['일', '월', '화', '수', '목', '금', '토'];

    box.innerHTML = days.map((d, i) => {
        const [, m, dd] = d.split('-').map(Number);
        const future = d > today;
        const h = Math.round((counts[d] / max) * 44);
        const cls = 'weekly-day' + (d === today ? ' today' : '') + (future ? ' future' : '');
        return `<div class="${cls}" title="${m}/${dd} 완료 ${counts[d]}개">
            <span class="weekly-count">${future ? '' : (counts[d] || '')}</span>
            <div class="weekly-bar" style="height:${future ? 4 : Math.max(h, 4)}px"></div>
            <span class="weekly-label">${week[i]}</span></div>`;
    }).join('');
    const fmt = (d) => { const [, m, dd] = d.split('-').map(Number); return `${m}/${dd}`; };
    const rangeEl = document.getElementById('weekly-range');
    if (rangeEl) rangeEl.textContent = `${fmt(days[0])} ~ ${fmt(days[6])}`;
    const totalEl = document.getElementById('weekly-total');
    if (totalEl) totalEl.textContent = `총 ${total}개`;
}

// 오늘 날짜 문자열 (YYYY-MM-DD, 사용자 기기 기준)
function localDateString(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 홈 To-do: 오늘 할 일 → 밀린 할 일 → 날짜 없는 할 일 순서로 5개
async function loadUrgentTodos() {
    const list = document.getElementById('urgent-todo-list');
    if (!list) return;

    try {
        const today = localDateString();
        const { data, error } = await window.supabaseClient
            .from('ai_subtasks').select('*')
            .or(`target_date.is.null,target_date.lte.${today}`)
            .order('created_at', { ascending: false });

        if (error) throw error;
        const rank = (t) => t.target_date === today ? 0 : (t.target_date ? (t.is_completed ? 3 : 1) : 2);
        const items = (data || [])
            .filter(t => !(t.target_date && t.target_date < today && t.is_completed)) // 지난 날짜에 끝낸 일은 숨김
            .sort((a, b) => rank(a) - rank(b))
            .slice(0, 5);

        if (items.length === 0) {
            list.innerHTML = '<li class="empty-msg">오늘 할 일이 없습니다. AI 챗봇에 목표를 알려주세요.</li>';
            return;
        }
        list.innerHTML = '';
        items.forEach(task => {
            const textStyle = task.is_completed ? 'text-decoration: line-through; color: #aaa;' : 'color: #333;';
            const icon = task.is_completed ? '✅' : '⏳';
            const overdue = task.target_date && task.target_date < today
                ? ' <span style="font-size: 12px; color: #e63946; font-weight: 600;">밀림</span>' : '';
            const li = document.createElement('li');
            li.style.cssText = `padding: 10px 0; border-bottom: 1px solid #eee; font-size: 15px; ${textStyle}`;
            li.textContent = `${icon} ${task.task_content}`;
            li.insertAdjacentHTML('beforeend', overdue);
            list.appendChild(li);
        });
    } catch(e) {
        console.error('긴급 투두 로딩 에러', e);
    }
}

async function logout() {
    // 다른 계정으로 로그인했을 때 이전 챗봇 대화가 보이지 않도록 지움
    ['chatMessages', 'chatOpen', 'chatLeft', 'chatTop', 'chatDir'].forEach(k => sessionStorage.removeItem(k));
    if(window.supabaseClient) {
        await window.supabaseClient.auth.signOut();
        window.location.href = "../index.html"; // 로그아웃 후 소개 페이지(첫 화면)로
    }
}

// 홈 캘린더에서 날짜(또는 일정)를 눌렀을 때 그날 일정·할 일 요약
async function showDaySummary(info) {
    const dateStr = info.dateStr; 
    
    Swal.fire({
        title: '데이터를 불러오는 중...',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });

    try {
        const { data: schedules } = await window.supabaseClient.from('recommended_schedules').select('*').like('start_time', `${dateStr}%`);
        const { data: datedTodos } = await window.supabaseClient.from('ai_subtasks').select('*').eq('target_date', dateStr);
        const { data: undatedTodos } = await window.supabaseClient.from('ai_subtasks').select('*').is('target_date', null).gte('created_at', `${dateStr}T00:00:00`).lte('created_at', `${dateStr}T23:59:59`);
        const todos = [...(datedTodos || []), ...(undatedTodos || [])];
        const { data: routines } = await window.supabaseClient.from('routines').select('*');

        const createListHTML = (items, type) => {
            if (!items || items.length === 0) return `<div class="empty-summary">등록된 항목이 없습니다.</div>`;
            
            return items.map(item => {
                if (type === 'schedule') {
                    const time = item.start_time.includes('T') ? item.start_time.split('T')[1].substring(0, 5) : '종일';
                    return `<div class="summary-item">⏰ ${time} - <strong>${item.schedule_title}</strong></div>`;
                } else if (type === 'todo') {
                    const isDone = item.is_completed; 
                    const title = item.task_content || '내용 없음'; 
                    return `<div class="summary-item ${isDone ? 'item-completed' : ''}">${isDone ? '✅' : '⬜️'} <span style="${isDone ? 'text-decoration: line-through; color: #94a3b8;' : ''}">${title}</span></div>`;
                } else if (type === 'routine') {
                    const isDone = item.is_completed; 
                    const title = item.routine_title || item.title || item.routine_name || '진행중인 루틴'; 
                    return `<div class="summary-item ${isDone ? 'item-completed' : ''}">${isDone ? '🔁' : '▶️'} <span style="${isDone ? 'text-decoration: line-through; color: #94a3b8;' : ''}">${title}</span></div>`;
                }
            }).join('');
        };

        Swal.fire({
            title: `${dateStr.split('-')[1]}월 ${dateStr.split('-')[2]}일 요약`,
            html: `
                <div class="summary-container">
                    <div class="summary-section"><div class="summary-title" style="color: #4361ee;">🗓️ 오늘의 일정</div>${createListHTML(schedules, 'schedule')}</div>
                    <div class="summary-section"><div class="summary-title" style="color: #e63946;">🎯 투두 완료 현황</div>${createListHTML(todos, 'todo')}</div>
                    <div class="summary-section"><div class="summary-title" style="color: #2ecc71;">🔁 루틴 달성 현황</div>${createListHTML(routines, 'routine')}</div>
                </div>
            `,
            position: 'bottom',
            showConfirmButton: false,
            showCloseButton: true,
            customClass: { popup: 'summary-bottom-sheet' }
        });

    } catch (error) {
        console.error('요약 데이터 로드 실패:', error);
        Swal.fire('오류', '데이터를 불러오지 못했습니다.', 'error');
    }
}
