// JS/main.js
let currentUserId = null;
let miniCalendar = null;

document.addEventListener('DOMContentLoaded', async function() {
    await checkSession();
    if(!currentUserId) return;

    // [에러 방어벽]: 하나의 위젯에 문제가 생겨도 다른 위젯은 정상 작동하도록 보호
    // 내 휴무일 설정(계정별)을 불러온 뒤 캘린더를 그림 → 캘린더 화면에서 바꾼 휴무일이 홈에도 똑같이 보임
    const restReady = typeof ensureRestSetting === 'function' ? ensureRestSetting() : Promise.resolve();
    restReady.finally(() => { try { initMiniCalendar(); } catch(e) { console.error("캘린더 로딩 에러:", e); } });
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
                // 캘린더 화면과 같은 규칙: 기본은 일 빨강·토 파랑, 직접 고른 휴무일이면 그 요일만 빨강
                const rest = typeof getRestSetting === 'function' ? getRestSetting() : { type: 'default', days: [] };
                dayNum.style.color = '#333333';
                if (rest.type === 'weekly') {
                    if (rest.days.includes(day)) dayNum.style.color = '#e63946';
                } else {
                    if (day === 0) dayNum.style.color = '#e63946';
                    else if (day === 6) dayNum.style.color = '#4361ee';
                }
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
                googleCalendarId: 'ko.south_korea.official#holiday@group.v.calendar.google.com', // 공식 공휴일만 (크리스마스 이브 등 기념일 제외)
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
        routineList.innerHTML = '<li class="empty-msg">오늘 할 루틴이 없어요.</li>';
        return;
    }
    routineList.innerHTML = '';
    // 홈에는 5개까지만, 나머지는 '더 보기'로 루틴 화면에서 (투두와 같은 방식)
    const HOME_ROUTINE_MAX = 5;
    const moreRoutines = Math.max(0, homeRoutines.length - HOME_ROUTINE_MAX);
    // To-do와 같은 체크박스 모양 (항목 전체를 눌러 체크/해제)
    homeRoutines.slice(0, HOME_ROUTINE_MAX).forEach(item => {
        const done = !!item.is_completed;
        routineList.innerHTML += `
            <li class="home-todo${done ? ' done' : ''}" role="checkbox" aria-checked="${done}" tabindex="0"
                onclick="toggleRoutine(${item.routine_id})"
                onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleRoutine(${item.routine_id})}">
                <span class="home-todo-box" aria-hidden="true"></span>
                <span class="home-todo-text">${escapeRoutineHtml(routineTitle(item))}</span>
            </li>`;
    });
    if (moreRoutines) routineList.insertAdjacentHTML('beforeend', `<li class="home-todo-more"><a href="habit.html">+${moreRoutines}개 더 보기 ›</a></li>`);
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
        const h = Math.round((counts[d] / max) * 70);
        const cls = 'weekly-day' + (d === today ? ' today' : '') + (future ? ' future' : '');
        return `<div class="${cls}" title="${m}/${dd} 완료 ${counts[d]}개">
            <span class="weekly-count">${future ? '' : counts[d]}</span>
            <div class="weekly-bar" style="height:${future ? 4 : Math.max(h, 4)}px"></div>
            <span class="weekly-label">${week[i]}</span></div>`;
    }).join('');
    const fmt = (d) => { const [, m, dd] = d.split('-').map(Number); return `${m}/${dd}`; };
    const rangeEl = document.getElementById('weekly-range');
    if (rangeEl) rangeEl.textContent = `${fmt(days[0])} ~ ${fmt(days[6])}`;
    const totalEl = document.getElementById('weekly-total');
    if (totalEl) totalEl.textContent = `총 ${total}개`;
    // 이번 주 기록이 없으면 빈 막대 대신 안내 한 줄
    let hint = document.getElementById('weekly-hint');
    if (!hint) { hint = document.createElement('p'); hint.id = 'weekly-hint'; hint.className = 'weekly-hint'; box.after(hint); }
    hint.textContent = total ? '' : '이번 주에 완료한 일이 아직 없어요. 하나씩 체크해 보세요!';
    hint.hidden = !!total;
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
            .sort((a, b) => rank(a) - rank(b));
        const moreCount = Math.max(0, items.length - 5);
        items.splice(5);

        if (items.length === 0) {
            list.innerHTML = '<li class="empty-msg">오늘 할 일이 없어요.</li>';
            return;
        }
        list.innerHTML = '';
        items.forEach(task => {
            const overdue = task.target_date && task.target_date < today
                ? '<span class="home-todo-late">밀림</span>' : '';
            // 항목 전체를 눌러 완료/해제 (휴대폰에서도 누르기 쉽게)
            const li = document.createElement('li');
            li.className = 'home-todo' + (task.is_completed ? ' done' : '');
            li.setAttribute('role', 'checkbox');
            li.setAttribute('aria-checked', task.is_completed ? 'true' : 'false');
            li.tabIndex = 0;
            li.innerHTML = `<span class="home-todo-box" aria-hidden="true"></span><span class="home-todo-text"></span>${overdue}`;
            li.querySelector('.home-todo-text').textContent = task.task_content;
            const toggle = () => toggleHomeTodo(task, li);
            li.addEventListener('click', toggle);
            li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
            list.appendChild(li);
        });
        if (moreCount) list.insertAdjacentHTML('beforeend', `<li class="home-todo-more"><a href="todo.html">+${moreCount}개 더 보기 ›</a></li>`);
    } catch(e) {
        console.error('긴급 투두 로딩 에러', e);
    }
}

// ===== 이번 주 요일별 달성 여부 (이번 주 기록을 눌렀을 때) =====
//  하루 달성률 = (그날 완료한 루틴 + 완료한 그날 날짜의 할 일) / (그날 해야 했던 루틴 + 그날 날짜의 할 일)
async function showWeeklyDetail() {
    const now = new Date();
    const today = localDateString(now);
    const days = [];
    for (let i = 0; i < 7; i++) days.push(localDateString(new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + i)));
    Swal.fire({ title: '이번 주 기록을 불러오는 중...', allowOutsideClick: false, didOpen: () => Swal.showLoading(), heightAuto: false });

    try {
        const [todoRes, routineRes, logRes] = await Promise.all([
            window.supabaseClient.from('ai_subtasks').select('task_id, is_completed, target_date').gte('target_date', days[0]).lte('target_date', days[6]),
            window.supabaseClient.from('routines').select('routine_id, repeat_rule, created_at'),
            window.supabaseClient.from('completion_logs').select('item_type, item_id, done_date').gte('done_date', days[0]).lte('done_date', days[6]),
        ]);
        if (todoRes.error || routineRes.error || logRes.error) throw (todoRes.error || routineRes.error || logRes.error);

        const todos = todoRes.data || [], routines = routineRes.data || [], logs = logRes.data || [];
        const week = ['일', '월', '화', '수', '목', '금', '토'];
        let achievedDays = 0, pastDays = 0;

        const rows = days.map((d, i) => {
            const [, m, dd] = d.split('-').map(Number);
            const dayTodos = todos.filter(t => String(t.target_date).slice(0, 10) === d);
            const dayLogs = logs.filter(l => String(l.done_date).slice(0, 10) === d);
            const dueRoutines = routines.filter(r => isRoutineDue(r.repeat_rule, d) && (!r.created_at || String(r.created_at).slice(0, 10) <= d));
            const doneRoutineIds = new Set(dayLogs.filter(l => l.item_type === 'routine').map(l => l.item_id));
            // 밀린 할 일을 그날 끝낸 기록도 '그날 한 일'로 셈 (홈 막대와 같은 기준)
            const dayTodoIds = new Set(dayTodos.map(t => t.task_id));
            const extraDone = new Set(dayLogs.filter(l => l.item_type === 'todo' && !dayTodoIds.has(l.item_id)).map(l => l.item_id)).size;
            const total = dayTodos.length + dueRoutines.length + extraDone;
            const done = dayTodos.filter(t => t.is_completed).length + dueRoutines.filter(r => doneRoutineIds.has(r.routine_id)).length + extraDone;
            const pct = total ? Math.round(done / total * 100) : 0;

            let state, cls;
            if (d > today) { state = '예정'; cls = 'future'; }
            else if (total === 0) { state = '할 일 없음'; cls = 'none'; }
            else if (pct === 100) { state = '✅ 달성'; cls = 'ok'; }
            else if (d === today) { state = `진행 중 ${pct}%`; cls = 'today'; }
            else { state = `미달성 ${pct}%`; cls = 'miss'; }
            if (d <= today && total > 0) { pastDays++; if (pct === 100) achievedDays++; }

            return `<div class="wk-row ${cls}${d === today ? ' is-today' : ''}">
                <span class="wk-day">${week[i]} <small>${m}/${dd}</small></span>
                <span class="wk-bar"><span style="width:${d > today ? 0 : pct}%"></span></span>
                <span class="wk-count">${d > today ? (total ? `할 일 ${total}개` : '') : (total ? `${done}/${total}` : '-')}</span>
                <span class="wk-state">${state}</span>
            </div>`;
        }).join('');

        const fmt = (d) => { const [, m, dd] = d.split('-').map(Number); return `${m}/${dd}`; };
        Swal.fire({
            title: '이번 주 달성 기록',
            html: `<p class="wk-sub">${fmt(days[0])} ~ ${fmt(days[6])} · 할 일이 있던 ${pastDays}일 중 <b>${achievedDays}일 달성</b></p>
                   <div class="wk-list">${rows}</div>
                   <p class="wk-note">달성 = 그날 해야 했던 루틴과 그날 날짜의 할 일을 모두 완료</p>`,
            confirmButtonText: '닫기', confirmButtonColor: '#4361ee', heightAuto: false, width: 520,
            didOpen: () => Swal.hideLoading() // 앞의 '불러오는 중' 표시가 남지 않게
        });
    } catch (e) {
        console.error('이번 주 기록 불러오기 실패:', e);
        Swal.fire({ title: '불러오지 못했어요', text: '잠시 후 다시 시도해 주세요.', icon: 'error', heightAuto: false });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const rec = document.getElementById('weekly-record');
    if (!rec) return;
    rec.addEventListener('click', showWeeklyDetail);
    rec.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showWeeklyDetail(); } });
});

// 홈 To-do 완료 체크: 바로 화면에 반영하고 DB 저장 → 달성률·이번 주 기록 갱신
async function toggleHomeTodo(task, li) {
    if (li.dataset.busy) return;
    li.dataset.busy = '1';
    const next = !task.is_completed;
    li.classList.toggle('done', next);
    li.setAttribute('aria-checked', next ? 'true' : 'false');
    const { error } = await window.supabaseClient.from('ai_subtasks').update({ is_completed: next }).eq('task_id', task.task_id);
    delete li.dataset.busy;
    if (error) {
        console.error('할 일 체크 실패:', error);
        li.classList.toggle('done', task.is_completed);
        li.setAttribute('aria-checked', task.is_completed ? 'true' : 'false');
        return;
    }
    task.is_completed = next;
    updateRoutineProgress();
    loadWeeklyRecord();
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
    const today = localDateString();
    const isPast = dateStr < today, isFuture = dateStr > today;

    Swal.fire({ title: '불러오는 중...', allowOutsideClick: false, heightAuto: false, didOpen: () => { Swal.showLoading(); } });

    try {
        // 그날 00:00 ~ 다음 날 00:00 사이에 시작하는 일정 (시간 칸은 글자가 아니라 날짜·시간 형식이라 범위로 찾음)
        const [sy, sm, sd] = dateStr.split('-').map(Number);
        const nextStr = localDateString(new Date(sy, sm - 1, sd + 1));
        const [schRes, datedRes, undatedRes, routineRes, logRes] = await Promise.all([
            window.supabaseClient.from('recommended_schedules').select('*')
                .gte('start_time', `${dateStr}T00:00:00`).lt('start_time', `${nextStr}T00:00:00`).order('start_time', { ascending: true }),
            window.supabaseClient.from('ai_subtasks').select('*').eq('target_date', dateStr),
            window.supabaseClient.from('ai_subtasks').select('*').is('target_date', null).gte('created_at', `${dateStr}T00:00:00`).lt('created_at', `${nextStr}T00:00:00`),
            window.supabaseClient.from('routines').select('*'),
            window.supabaseClient.from('completion_logs').select('item_type, item_id, title, done_date').eq('done_date', dateStr),
        ]);
        const schedules = schRes.data || [];
        const todos = [...(datedRes.data || []), ...(undatedRes.data || [])];
        const logs = (logRes.data || []).filter(l => String(l.done_date).slice(0, 10) === dateStr);

        // --- 할 일: 그날 날짜의 할 일 + (밀린 일이라도) 그날 완료한 기록
        const doneItems = [], leftItems = [];
        const seenTodo = new Set();
        todos.forEach(t => {
            seenTodo.add(t.task_id);
            const item = { title: t.task_content || '내용 없음', kind: '할 일', postpone: t.postpone_count || 0 };
            (t.is_completed ? doneItems : leftItems).push(item);
        });
        logs.filter(l => l.item_type === 'todo' && !seenTodo.has(l.item_id))
            .forEach(l => { seenTodo.add(l.item_id); doneItems.push({ title: l.title || '할 일', kind: '할 일' }); });

        // --- 루틴: 그날 해야 했던 루틴만 (매일/평일/주말 + 만든 날 이후), 완료 여부는 그날 기록으로
        const doneRoutineIds = new Set(logs.filter(l => l.item_type === 'routine').map(l => l.item_id));
        (routineRes.data || [])
            .filter(r => isRoutineDue(r.repeat_rule, dateStr) && (!r.created_at || String(r.created_at).slice(0, 10) <= dateStr))
            .forEach(r => {
                const doneToday = dateStr === today && r.is_completed && String(r.last_date || '').slice(0, 10) === today;
                const item = { title: routineTitle(r), kind: '루틴' };
                (doneRoutineIds.has(r.routine_id) || doneToday ? doneItems : leftItems).push(item);
            });

        const total = doneItems.length + leftItems.length;
        const pct = total ? Math.round(doneItems.length / total * 100) : 0;
        const esc = (v) => escapeRoutineHtml(v);
        const row = (it, done) => `<div class="sum-row${done ? ' done' : ''}">
                <span class="sum-box" aria-hidden="true"></span>
                <span class="sum-text">${esc(it.title)}</span>
                ${it.postpone ? `<span class="sum-tag late">미룸 ${it.postpone}</span>` : ''}
                <span class="sum-tag ${it.kind === '루틴' ? 'rt' : 'td'}">${it.kind}</span>
            </div>`;
        const section = (title, cls, items, done, emptyText) => `<div class="sum-section ${cls}">
                <div class="sum-title">${title} <small>${items.length}</small></div>
                ${items.length ? items.map(it => row(it, done)).join('') : `<div class="empty-summary">${emptyText}</div>`}
            </div>`;

        const week = ['일', '월', '화', '수', '목', '금', '토'];
        const title = `${sm}월 ${sd}일 (${week[new Date(sy, sm - 1, sd).getDay()]})`;
        let head;
        if (isFuture) head = `<div class="sum-head"><span>${total ? `예정된 할 일·루틴 <b>${total}개</b>` : '아직 예정된 할 일이 없어요'}</span></div>`;
        else if (!total) head = `<div class="sum-head"><span>이날은 할 일이 없었어요</span></div>`;
        else head = `<div class="sum-head"><span>${total}개 중 <b>${doneItems.length}개 완료</b>${pct === 100 ? ' · 모두 달성 🎉' : ''}</span><b class="sum-pct">${pct}%</b></div>
            <div class="sum-bar"><span style="width:${pct}%"></span></div>`;

        const leftTitle = isPast ? '⏳ 못 한 일' : (isFuture ? '🗓 예정' : '⏳ 남은 일');
        const scheduleHtml = `<div class="sum-section sch">
                <div class="sum-title">🗓 일정 <small>${schedules.length}</small></div>
                ${schedules.length ? schedules.map(item => {
                    const st = String(item.start_time || '');
                    const time = st.includes('T') ? st.split('T')[1].substring(0, 5) : (st.length > 10 ? st.substring(11, 16) : '종일');
                    return `<div class="sum-row sch-row"><span class="sum-time">${time}</span><span class="sum-text">${esc(item.schedule_title || '일정')}</span></div>`;
                }).join('') : '<div class="empty-summary">등록된 일정이 없어요.</div>'}
            </div>`;

        Swal.fire({
            title,
            html: `<div class="summary-container">
                    ${head}
                    ${isFuture ? '' : section('✅ 한 일', 'ok', doneItems, true, isPast ? '이날 완료한 일이 없어요.' : '아직 완료한 일이 없어요.')}
                    ${(leftItems.length || isFuture) ? section(leftTitle, isFuture ? 'plan' : 'left', leftItems, false, '예정된 할 일이 없어요.') : ''}
                    ${scheduleHtml}
                </div>`,
            position: 'bottom',
            showConfirmButton: false,
            showCloseButton: true,
            heightAuto: false,
            didOpen: () => Swal.hideLoading(),
            customClass: { popup: 'summary-bottom-sheet' }
        });

    } catch (error) {
        console.error('요약 데이터 로드 실패:', error);
        Swal.fire({ title: '오류', text: '데이터를 불러오지 못했어요.', icon: 'error', heightAuto: false });
    }
}
