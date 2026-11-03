// JS/routine.js
// 루틴 공통 규칙: 홈(main.js)과 루틴 페이지(habit.js)가 같은 기준으로 동작하도록 한 곳에 모았습니다.
//  - 반복 주기(매일/평일/주말)에 맞는 날에만 '오늘 할 루틴'으로 셈
//  - 날이 바뀌면 체크 해제, 해야 하는 날을 빠뜨리면 연속 일수 0으로
//  - 체크/해제할 때 연속 일수와 마지막 완료일 계산

// 오늘 날짜 (YYYY-MM-DD, 사용자 기기 시간 기준)
function routineToday(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function routineShiftDate(dateStr, days) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return routineToday(new Date(y, m - 1, d + days));
}

// 이 날짜가 반복 주기에 해당하는 날인지
function isRoutineDue(rule, dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const wd = new Date(y, m - 1, d).getDay();
    if (rule === '평일') return wd >= 1 && wd <= 5;
    if (rule === '주말') return wd === 0 || wd === 6;
    return true; // '매일' 또는 값이 없는 예전 루틴
}

// 기준 날짜 직전의 '해야 했던 날'
function previousDueDate(rule, dateStr) {
    for (let i = 1; i <= 7; i++) {
        const d = routineShiftDate(dateStr, -i);
        if (isRoutineDue(rule, d)) return d;
    }
    return routineShiftDate(dateStr, -1);
}

function routineTitle(r) {
    return r.routine_name || r.routine_title || r.title || '이름 없는 루틴';
}

function escapeRoutineHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 날이 바뀐 루틴 정리 (화면 값과 DB를 함께 갱신)
async function normalizeRoutines(list) {
    const today = routineToday();
    const jobs = [];
    for (const r of list || []) {
        const updates = {};
        if (r.is_completed && r.last_date !== today) updates.is_completed = false;
        const missed = r.last_date !== today && (!r.last_date || r.last_date < previousDueDate(r.repeat_rule, today));
        if ((r.streak || 0) > 0 && missed) updates.streak = 0;
        if (Object.keys(updates).length > 0) {
            Object.assign(r, updates);
            jobs.push(window.supabaseClient.from('routines').update(updates).eq('routine_id', r.routine_id));
        }
    }
    const results = await Promise.all(jobs);
    results.forEach(res => { if (res && res.error) console.error('루틴 초기화 실패:', res.error); });
    return list || [];
}

// 체크(또는 해제)할 때 저장할 값
function routineToggleValues(r) {
    const today = routineToday();
    const prevDue = previousDueDate(r.repeat_rule, today);
    if (!r.is_completed) {
        const continued = r.last_date === prevDue; // 직전에 해야 했던 날도 했으면 연속
        return { is_completed: true, streak: continued ? (r.streak || 0) + 1 : 1, last_date: today };
    }
    const streak = Math.max((r.streak || 0) - 1, 0);
    return { is_completed: false, streak, last_date: streak > 0 ? prevDue : null };
}

// 루틴 체크/해제 저장 (홈·루틴 페이지 공용)
async function saveRoutineToggle(r) {
    const values = routineToggleValues(r);
    const { error } = await window.supabaseClient.from('routines').update(values).eq('routine_id', r.routine_id);
    if (error) {
        console.error('루틴 상태 저장 실패:', error);
        if (window.Swal) Swal.fire({ title: '저장 실패', text: '루틴 상태를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.', icon: 'error', heightAuto: false });
        else alert('루틴 상태를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.');
        return false;
    }
    Object.assign(r, values);
    return true;
}
