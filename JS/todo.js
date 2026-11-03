// JS/todo.js
let todos = [];
let goals = [];
const justDone = new Set();   // 이번에 체크한 할 일은 새로고침 전까지 목록에 남겨 둠 (체크하자마자 사라지지 않게)
const openGroups = new Set(); // 펼쳐 둔 '이후 할 일' 묶음

document.addEventListener('DOMContentLoaded', fetchTodos);

// [READ] 투두 리스트 가져오기
async function fetchTodos() {
    const { data, error } = await window.supabaseClient
        .from('ai_subtasks')
        .select('*')
        .order('target_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true });
    
    if (error) { console.error('투두 불러오기 실패:', error); return; }
    todos = data || [];

    const { data: goalData, error: goalError } = await window.supabaseClient
        .from('goals').select('*').order('created_at', { ascending: false });
    if (goalError) console.error('목표 불러오기 실패:', goalError);
    goals = goalData || [];

    renderCoach();
    renderGoals();
    renderTodos();
}

// [CREATE] 투두 추가
async function addTodo() {
    const content = document.getElementById('todo-input').value.trim();
    if (!content) { Swal.fire('알림', '내용을 입력해주세요.', 'warning'); return; }

    await window.supabaseClient.from('ai_subtasks').insert([{
        task_content: content,
        is_completed: false,
        target_date: todayString() // 직접 추가한 할 일은 오늘 날짜로
    }]);
    
    document.getElementById('todo-input').value = '';
    fetchTodos();
}

// [UPDATE] 완료 여부 토글
async function toggleTodo(id, status) {
    if (!status) justDone.add(id);
    await window.supabaseClient.from('ai_subtasks').update({ is_completed: !status }).eq('task_id', id);
    fetchTodos();
}

// [DELETE] 투두 삭제
async function deleteTodo(id) {
    await window.supabaseClient.from('ai_subtasks').delete().eq('task_id', id);
    fetchTodos();
}

// [MODAL] 투두 상세 관리 (날짜 이동 및 중요도 변경 기능 포함)
function showTodoOptions(id) {
    const todo = todos.find(t => t.task_id === id);
    if (!todo) return;
    
    // DB에 날짜 데이터가 없다면 오늘 날짜를 기본값으로 설정
    const currentDate = todo.target_date ? todo.target_date.split('T')[0] : new Date().toISOString().split('T')[0];

    Swal.fire({
        title: '투두 관리',
        html: `
            <div style="text-align: left; padding: 0 10px;">
                <label style="font-size: 14px; font-weight: bold; display: block; margin-bottom: 5px;">할 일 내용</label>
                <input id="edit-todo-content" class="swal2-input" value="${escapeTodoHtml(todo.task_content)}" style="width: 100%; margin: 0 0 15px 0; box-sizing: border-box;">
                
                <label style="font-size: 14px; font-weight: bold; display: block; margin-bottom: 5px;">날짜 이동</label>
                <input type="date" id="edit-todo-date" class="swal2-input" value="${currentDate}" style="width: 100%; margin: 0 0 8px 0; box-sizing: border-box;">
                <button type="button" onclick="postponeOneDay()" style="background: #fff7ed; color: #c2410c; border: 1px solid #fed7aa; border-radius: 6px; padding: 6px 12px; font-weight: 600; cursor: pointer;">하루 미루기</button>
                ${todo.postpone_count ? `<span style="font-size: 13px; color: #c2410c; margin-left: 8px;">지금까지 ${todo.postpone_count}번 미룸</span>` : ''}
                <p style="font-size: 12px; color: #94a3b8; margin: 8px 0 0;">날짜를 뒤로 옮기면 '미룬 횟수'가 올라갑니다.</p>
            </div>
        `,
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonText: '수정',
        denyButtonText: '삭제',
        cancelButtonText: '취소',
        heightAuto: false
    }).then(async (result) => {
        if (result.isConfirmed) {
            const newContent = document.getElementById('edit-todo-content').value;
            const newDate = document.getElementById('edit-todo-date').value;
            
            if (newContent) {
                await window.supabaseClient.from('ai_subtasks').update({
                    task_content: newContent,
                    target_date: newDate
                }).eq('task_id', id);
                fetchTodos(); // 리스트 새로고침
                Swal.fire({
                    title: '수정됨', 
                    text: '할 일이 업데이트 되었습니다.', 
                    icon: 'success', 
                    heightAuto: false // 성공 알림창에서도 덜컹거림 방지
                });
            }
        } else if (result.isDenied) {
            deleteTodo(id);
        }
    });
}

// 날짜 도우미
function todayString(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function escapeTodoHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
// 날짜 배지: 오늘 / 지남 / 예정
function dateBadge(dateStr) {
    if (!dateStr) return '';
    const d = dateStr.split('T')[0];
    const today = todayString();
    const [, m, day] = d.split('-').map(Number);
    const label = d === today ? '오늘' : `${m}/${day}`;
    const color = d === today ? '#4361ee' : (d < today ? '#e63946' : '#64748b');
    return `<span style="min-width: 48px; text-align: center; font-size: 12px; font-weight: 700; color: ${color}; background: #f1f5f9; border-radius: 6px; padding: 3px 6px;">${label}</span>`;
}

// 모달의 '하루 미루기': 날짜 칸을 (오늘과 현재 날짜 중 늦은 날) + 1일로 바꿈 → '수정'을 누르면 저장
function postponeOneDay() {
    const input = document.getElementById('edit-todo-date');
    if (!input) return;
    const base = input.value && input.value > todayString() ? input.value : todayString();
    const [y, m, d] = base.split('-').map(Number);
    input.value = todayString(new Date(y, m - 1, d + 1));
}

function daysBetween(from, to) {
    const [y1, m1, d1] = from.split('-').map(Number);
    const [y2, m2, d2] = to.split('-').map(Number);
    return Math.round((new Date(y2, m2 - 1, d2) - new Date(y1, m1 - 1, d1)) / 86400000);
}

// ===== 미루기 코칭 =====
// 2번 이상 미뤘거나, 날짜가 2일 이상 지난 미완료 할 일을 골라 "더 작게 나눠 보기"를 제안
function coachCandidates() {
    const today = todayString();
    return todos
        .filter(t => !t.is_completed && t.target_date)
        .map(t => ({ ...t, overdue: Math.max(0, daysBetween(String(t.target_date).slice(0, 10), today)) }))
        .filter(t => (t.postpone_count || 0) >= 2 || t.overdue >= 2)
        .sort((a, b) => ((b.postpone_count || 0) - (a.postpone_count || 0)) || (b.overdue - a.overdue))
        .slice(0, 2);
}

function renderCoach() {
    const box = document.getElementById('coach-section');
    if (!box) return;
    const list = coachCandidates();
    box.hidden = list.length === 0;
    box.innerHTML = list.map(t => {
        const reason = (t.postpone_count || 0) >= 2
            ? `'${escapeTodoHtml(t.task_content)}'을(를) ${t.postpone_count}번 미뤘어요.`
            : `'${escapeTodoHtml(t.task_content)}'이(가) ${t.overdue}일째 밀려 있어요.`;
        return `<div class="coach-card">
            <span class="coach-icon" aria-hidden="true">⏳</span>
            <div class="coach-text"><strong>${reason}</strong><span>부담이 커서 그럴 수 있어요. AI가 바로 시작할 수 있는 작은 단계로 나눠 드릴까요?</span></div>
            <button class="coach-btn" onclick="splitTask(${t.task_id}, this)">AI로 작게 나누기</button>
        </div>`;
    }).join('');
}

async function splitTask(taskId, btn) {
    if (btn) { btn.disabled = true; btn.textContent = '나누는 중...'; }
    if (typeof ensureRestSetting === 'function') await ensureRestSetting();
    const restDays = typeof getRestDays === 'function' ? getRestDays() : [0, 6];
    try {
        const { data, error } = await window.supabaseClient.functions.invoke('decompose-goal', {
            body: { mode: 'split', taskId, today: todayString(), restDays }
        });
        if (error) {
            let message = '할 일을 나누지 못했습니다. 잠시 후 다시 시도해주세요.';
            try { const body = await error.context.json(); if (body && body.error) message = body.error; } catch (e) {}
            throw new Error(message);
        }
        const items = data.steps.map(s => {
            const [, m, d] = s.date.split('-').map(Number);
            return `<li style="margin: 4px 0;"><b>${m}/${d}</b> ${escapeTodoHtml(s.title)} · ${s.minutes}분</li>`;
        }).join('');
        Swal.fire({
            title: '작게 나눴어요',
            html: `<p style="margin: 0 0 10px;">'${escapeTodoHtml(data.original)}'을(를) ${data.steps.length}단계로 나눠 다시 배치했습니다.</p><ul style="text-align: left; display: inline-block; margin: 0;">${items}</ul>`,
            icon: 'success', heightAuto: false
        });
        fetchTodos();
    } catch (e) {
        console.error('미루기 코칭 오류:', e);
        Swal.fire({ title: '나누지 못했어요', text: e.message, icon: 'error', heightAuto: false });
        if (btn) { btn.disabled = false; btn.textContent = 'AI로 작게 나누기'; }
    }
}

// ===== 내 목표 =====
function renderGoals() {
    const box = document.getElementById('goal-list');
    if (!box) return;
    if (goals.length === 0) {
        box.innerHTML = '<p class="empty-msg" style="padding: 16px 0;">아직 목표가 없습니다. 오른쪽 아래 AI 챗봇에 목표와 마감일을 알려주세요.</p>';
        return;
    }
    const today = todayString();
    box.innerHTML = goals.map(g => {
        const mine = todos.filter(t => t.goal_id === g.goal_id);
        const done = mine.filter(t => t.is_completed).length;
        const todayLeft = mine.filter(t => !t.is_completed && t.target_date && String(t.target_date).slice(0, 10) <= today).length;
        const pct = mine.length ? Math.round(done / mine.length * 100) : 0;
        let dday = '';
        if (g.deadline) {
            const left = daysBetween(today, String(g.deadline).slice(0, 10));
            dday = left > 0 ? `D-${left}` : (left === 0 ? 'D-day' : '기간 종료');
        }
        return `<div class="goal-item">
            <div>
                <div class="goal-title">${escapeTodoHtml(g.title)}</div>
                <div class="goal-meta">${g.deadline ? `마감 ${String(g.deadline).slice(0, 10)} · ${dday} · ` : ''}<b style="color:#4361ee">오늘 ${todayLeft}개</b> · 완료 ${done}/${mine.length}</div>
            </div>
            <button class="goal-delete" onclick="deleteGoal(${g.goal_id})">목표 삭제</button>
            <div class="goal-progress"><div class="progress-track"><div class="progress-bar" style="width: ${pct}%"></div></div><span>${pct}%</span></div>
        </div>`;
    }).join('');
}

async function deleteGoal(goalId) {
    const goal = goals.find(g => g.goal_id === goalId);
    if (!goal) return;
    const count = todos.filter(t => t.goal_id === goalId).length;
    const result = await Swal.fire({
        title: '목표를 삭제할까요?',
        html: `'${escapeTodoHtml(goal.title)}' 목표와 할 일 ${count}개가 함께 삭제됩니다.<br><small>완료 기록은 남습니다.</small>`,
        icon: 'warning', showCancelButton: true, confirmButtonText: '삭제', cancelButtonText: '취소',
        confirmButtonColor: '#dc2626', heightAuto: false
    });
    if (!result.isConfirmed) return;
    const { error } = await window.supabaseClient.from('goals').delete().eq('goal_id', goalId);
    if (error) {
        console.error('목표 삭제 실패:', error);
        Swal.fire({ title: '삭제 실패', text: '목표를 삭제하지 못했습니다. 잠시 후 다시 시도해주세요.', icon: 'error', heightAuto: false });
        return;
    }
    fetchTodos();
}

// [RENDER] 화면에 투두 리스트 렌더링
// 한꺼번에 다 보이면 부담스러우니, 오늘 할 일(+밀린 일)만 펼쳐 보이고 이후 할 일은 목표별로 접어 둠
function dayOf(t) { return t.target_date ? String(t.target_date).slice(0, 10) : null; }

function todoItemHtml(t) {
    return `<li class="todo-item">
            <input type="checkbox" ${t.is_completed ? 'checked' : ''} onclick="toggleTodo(${t.task_id}, ${t.is_completed})" style="width: 20px; height: 20px; cursor: pointer; flex-shrink: 0;">
            ${dateBadge(t.target_date)}
            ${t.postpone_count ? `<span class="postpone-badge" title="미룬 횟수">미룸 ${t.postpone_count}</span>` : ''}
            <span onclick="showTodoOptions(${t.task_id})" style="flex-grow:1; font-size: 16px; cursor: pointer; ${t.is_completed ? 'text-decoration:line-through; color:#aaa;' : 'color:#333;'}">
                ${escapeTodoHtml(t.task_content)}
            </span>
            <button onclick="showTodoOptions(${t.task_id})" style="background: none; border: none; font-size: 20px; cursor: pointer; color: #888;" title="관리">⚙️</button>
        </li>`;
}

function toggleGroup(key, el) {
    if (el.open) openGroups.add(key); else openGroups.delete(key);
}

function renderTodos() {
    const list = document.getElementById('todo-list');
    if(!list) return;
    const today = todayString();

    // 오늘 목록: 날짜 없음 / 오늘 / 밀린 미완료 + 이번에 체크한 것
    const todayItems = todos.filter(t => {
        const d = dayOf(t);
        if (justDone.has(t.task_id)) return true;
        if (d === today) return true;
        return !t.is_completed && (!d || d < today); // 날짜 없는 일·밀린 일은 끝내기 전까지만
    });
    const later = todos.filter(t => { const d = dayOf(t); return d && d > today && !justDone.has(t.task_id); });

    const leftToday = todayItems.filter(t => !t.is_completed).length;
    let html = `<li class="todo-section-title">오늘 할 일 <span>${leftToday ? `${leftToday}개 남음` : ''}</span></li>`;
    if (todayItems.length === 0) {
        html += `<li class="todo-empty">오늘 할 일이 없어요. 푹 쉬어도 괜찮아요 🙂</li>`;
    } else {
        html += todayItems.map(todoItemHtml).join('');
        if (leftToday === 0) html += `<li class="todo-empty">오늘 할 일을 모두 끝냈어요! 🎉</li>`;
    }

    // 이후 할 일: 목표별로 접어서 한 줄로
    if (later.length) {
        const groups = [];
        goals.forEach(g => {
            const items = later.filter(t => t.goal_id === g.goal_id);
            if (items.length) groups.push({ key: 'g' + g.goal_id, title: g.title, items });
        });
        const etc = later.filter(t => !t.goal_id || !goals.some(g => g.goal_id === t.goal_id));
        if (etc.length) groups.push({ key: 'etc', title: '직접 추가한 할 일', items: etc });

        html += `<li class="todo-section-title later">이후 할 일</li>`;
        html += groups.map(gr => {
            const next = gr.items.find(t => !t.is_completed);
            const nextLabel = next ? `다음: ${dateBadgeText(dayOf(next))} ${escapeTodoHtml(next.task_content)}` : '';
            return `<li class="todo-group"><details ${openGroups.has(gr.key) ? 'open' : ''} ontoggle="toggleGroup('${gr.key}', this)">
                <summary><span class="todo-group-title">${escapeTodoHtml(gr.title)}</span><span class="todo-group-count">${gr.items.length}개</span><span class="todo-group-next">${nextLabel}</span></summary>
                <ul class="todo-group-list">${gr.items.map(todoItemHtml).join('')}</ul>
            </details></li>`;
        }).join('');
    }
    list.innerHTML = html;
}

function dateBadgeText(d) {
    if (!d) return '';
    const [, m, day] = d.split('-').map(Number);
    return `${m}/${day}`;
}
