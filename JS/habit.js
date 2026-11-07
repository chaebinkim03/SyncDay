// JS/habit.js
let habits = [];

document.addEventListener('DOMContentLoaded', fetchHabits);

// 날짜 계산·초기화·연속 일수 규칙은 JS/routine.js에 있습니다. (홈 화면과 같은 기준)

async function fetchHabits() {
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    if(!session) return;

    const { data, error } = await window.supabaseClient
        .from('routines')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: true });

    if (error) { console.error('루틴 불러오기 실패:', error); return; }
    habits = await normalizeRoutines(data); // 날이 바뀌었으면 체크 해제, 빠뜨린 날이 있으면 연속 일수 0
    renderHabits();
}

// [UPDATE] 루틴 달성 상태 토글 및 연속 일수 계산
async function toggleHabit(id) {
    const habit = habits.find(h => h.routine_id === id);
    if (!habit) return;
    if (!isRoutineDue(habit.repeat_rule, routineToday())) return; // 오늘 할 날이 아닌 루틴
    if (await saveRoutineToggle(habit)) renderHabits();
}

// [CREATE] 루틴 추가
async function addHabit() {
    const name = document.getElementById('routine-input').value;
    // 선택된 라디오 버튼의 값 가져오기
    const rule = document.querySelector('input[name="freq-input"]:checked').value;
    const { data: { session } } = await window.supabaseClient.auth.getSession();

    if (!name.trim()) { Swal.fire({ title: '알림', text: '루틴 이름을 입력해 주세요.', icon: 'warning', heightAuto: false }); return; }

    await window.supabaseClient.from('routines').insert([{
        user_id: session.user.id,
        routine_name: name,
        repeat_rule: rule,
        is_completed: false,
        streak: 0,
        last_date: null // 새 루틴 생성 시 날짜 초기화
    }]);
    
    document.getElementById('routine-input').value = '';
    fetchHabits();
}

// [DELETE] 루틴 삭제
async function deleteHabit(id) {
    await window.supabaseClient.from('routines').delete().eq('routine_id', id);
    fetchHabits();
}

function showHabitOptions(id) {
    const habit = habits.find(h => h.routine_id === id);
    if (!habit) return;

    const rules = ['매일', '평일', '주말'];
    
    // 수정 모달창에서도 드롭다운 대신 라디오 버튼을 사용하도록 HTML 구성
    const optionsHtml = rules.map(r => `
        <label style="cursor: pointer; display: flex; align-items: center; gap: 5px; font-size: 15px; margin-right: 15px;">
            <input type="radio" name="edit-habit-rule" value="${r}" ${habit.repeat_rule === r ? 'checked' : ''}> ${r}
        </label>
    `).join('');

    Swal.fire({
        title: '루틴 관리',
        html: `
            <div style="text-align: left; padding: 0 10px;">
                <label style="font-size: 14px; font-weight: bold; display: block; margin-bottom: 5px;">루틴 이름</label>
                <input id="edit-habit-name" class="swal2-input" value="${escapeRoutineHtml(routineTitle(habit))}" style="width: 100%; margin: 0 0 15px 0; box-sizing: border-box;">

                <label style="font-size: 14px; font-weight: bold; display: block; margin-bottom: 8px; text-align: center;">반복 주기 변경</label>
                <div style="display: flex; align-items: center; justify-content: center; gap: 10px; padding: 10px 0;">
                    ${optionsHtml}
                </div>
            </div>
        `,
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonText: '저장',
        denyButtonText: '삭제',
        cancelButtonText: '취소',
        confirmButtonColor: '#4361ee',
        denyButtonColor: '#d33',
        heightAuto: false
    }).then(async (result) => {
        if (result.isConfirmed) {
            const newName = document.getElementById('edit-habit-name').value.trim();
            // 수정 모달창에서 선택된 라디오 버튼 값 가져오기
            const newRule = document.querySelector('input[name="edit-habit-rule"]:checked').value;
            
            if (!newName) {
                Swal.fire({ title: '알림', text: '루틴 이름을 입력해 주세요.', icon: 'warning', heightAuto: false });
                return;
            }
            await updateHabit(id, newName, newRule);
        } else if (result.isDenied) {
            Swal.fire({
                title: '루틴을 삭제할까요?',
                text: '이 루틴과 연속 기록이 삭제돼요.',
                showCancelButton: true,
                confirmButtonText: '삭제',
                cancelButtonText: '취소',
                confirmButtonColor: '#d33',
                heightAuto: false
            }).then((res) => { if (res.isConfirmed) deleteHabit(id); });
        }
    });
}

// [UPDATE] 루틴 이름 및 주기 변경
async function updateHabit(id, newName, newRule) {
    const { error } = await window.supabaseClient
        .from('routines')
        .update({ routine_name: newName, repeat_rule: newRule })
        .eq('routine_id', id);

    if (!error) {
        fetchHabits();
        Swal.fire({ title: '변경됨', text: '루틴을 수정했어요.', icon: 'success', heightAuto: false });
    } else {
        console.error("루틴 변경 실패:", error);
        Swal.fire({ title: '오류', text: '변경하지 못했어요.', icon: 'error', heightAuto: false });
    }
}

function renderHabits() {
    const list = document.getElementById('routine-list');
    if(!list) return;
    list.innerHTML = '';
    const today = routineToday();

    habits.forEach(h => {
        const due = isRoutineDue(h.repeat_rule, today);
        const name = escapeRoutineHtml(routineTitle(h));
        const li = document.createElement('li');
        li.style.cssText = `display: flex; align-items: center; padding: 15px 20px; background: white; margin-bottom: 10px; border-radius: 8px; border: 1px solid #eaeaea; box-shadow: 0 2px 4px rgba(0,0,0,0.02); gap: 15px; ${due ? '' : 'opacity: 0.6;'}`;

        li.innerHTML = `
            <input type="checkbox" ${h.is_completed ? 'checked' : ''} ${due ? '' : 'disabled title="오늘은 쉬는 날이에요"'}
                onclick="toggleHabit(${h.routine_id})"
                style="width: 22px; height: 22px; accent-color: #4361ee; cursor: ${due ? 'pointer' : 'not-allowed'};">

            <div style="flex-grow:1; cursor: pointer;" onclick="showHabitOptions(${h.routine_id})">
                <div style="font-weight:bold; font-size:1.1rem; color: ${h.is_completed ? '#aaa' : '#2c3e50'}; ${h.is_completed ? 'text-decoration: line-through;' : ''}">
                    ${name}
                    ${h.streak > 0 ? `<span style="margin-left: 8px; color: #ff9f43; font-size: 0.9rem;">🔥 ${h.streak}일 연속</span>` : ''}
                </div>
                <div style="font-size:0.85rem; color:#7f8c8d; margin-top: 5px;">📅 주기: ${escapeRoutineHtml(h.repeat_rule || '매일')}${due ? '' : ' · 오늘은 쉬는 날'}</div>
            </div>

            <button onclick="showHabitOptions(${h.routine_id})" style="background: none; border: none; font-size: 20px; cursor: pointer; color: #888; padding: 5px;">⚙️</button>
        `;
        list.appendChild(li);
    });
}
