// JS/schedule.js
let currentFilterColor = 'all';
let calendar;

// 공휴일(구글 캘린더) 일정인지 확인: 공휴일 묶음(id)이거나 구글 캘린더 링크가 붙은 일정
function isHolidayEvent(ev) {
    return (ev.source && ev.source.id === 'holidays') || (!!ev.url && ev.url.indexOf('google.com') !== -1);
}

function escapeScheduleHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 일정 입력창 검사: 제목 필수, 종료가 시작보다 늦어야 함. 문제가 있으면 창 안에 안내하고 저장하지 않음
function readScheduleForm(prefix, colorName) {
    const v = (id) => (document.getElementById(`${prefix}-${id}`)?.value || '').trim();
    const title = v('title'), sDate = v('start-date'), sTime = v('start-time'), eDate = v('end-date'), eTime = v('end-time');
    const color = document.querySelector(`input[name="${colorName}"]:checked`)?.value || '#4361ee';
    if (!title) { Swal.showValidationMessage('일정 내용을 입력해 주세요.'); return false; }
    if (title.length > 100) { Swal.showValidationMessage('일정 내용은 100자 이내로 적어 주세요.'); return false; }
    if (!sDate || !sTime || !eDate || !eTime) { Swal.showValidationMessage('시작과 종료 날짜·시간을 모두 정해 주세요.'); return false; }
    if (`${eDate}T${eTime}` <= `${sDate}T${sTime}`) { Swal.showValidationMessage('종료 시간은 시작 시간보다 늦어야 해요.'); return false; }
    return { schedule_title: title, start_time: `${sDate}T${sTime}:00`, end_time: `${eDate}T${eTime}:00`, color };
}

function initCalendar() {
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl) return;

    if (calendar) {
        calendar.destroy();
    }

    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'ko',
        buttonText: { today: '오늘', month: '월', week: '주' },
        // 표 높이를 내용에 맞춤 → 일정이 늘어나도 카드 밖으로 삐져나오지 않음
        height: 'auto',
        views: { timeGridWeek: { height: 680 } }, // 주간 시간표는 고정 높이 + 안에서 스크롤
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek' },
        googleCalendarApiKey: 'AIzaSyCdgnHAhrQP9XuUFzMwbl0E-2ezWXZYQkw', 

        displayEventTime: false, 
        
        // ⭐️ 추가된 부분: 주간 뷰(timeGridWeek) 상단의 '종일(all-day)' 칸을 아예 숨깁니다.
        allDaySlot: false, 

        eventDidMount: function(info) {
            const currentMonth = calendar.getDate().getMonth(); 
            const eventMonth = info.event.start.getMonth(); 
            if (currentMonth !== eventMonth) {
                info.el.style.display = 'none';
            }
        },

      // 공휴일(주황색)만 얇은 선으로 뼈대 생성
        eventContent: function(arg) {
            if (isHolidayEvent(arg.event)) {
                return {
                    html: `
                        <div class="pastel-holiday-label">
                            ${arg.event.title}
                        </div>
                    `
                };
            }
            return true;
        },
        
        dayCellDidMount: function(info) {
            const kind = restKind(info.date.getDay());
            const dayNum = info.el.querySelector('.fc-daygrid-day-number');
            if (dayNum) dayNum.style.color = REST_COLORS[kind] || '#333333';
        },

        // 주간 보기의 날짜 머리글(예: 11/9 (월))도 휴무일 색으로
        dayHeaderDidMount: function(info) {
            if (!info.view.type.startsWith('timeGrid')) return;
            const kind = restKind(info.date.getDay());
            const a = info.el.querySelector('.fc-col-header-cell-cushion') || info.el;
            if (REST_COLORS[kind]) a.style.color = REST_COLORS[kind];
        },

        dayCellContent: function(info) {
            return { html: info.dayNumberText.replace('일', '').trim() };
        },

        selectable: true,
        
        eventSources: [
            {
                id: 'holidays',
                googleCalendarId: 'ko.south_korea.official#holiday@group.v.calendar.google.com', // 공식 공휴일만 (크리스마스 이브 등 기념일 제외)
                color: '#ff9f43', 
                // textColor: '#ffffff',
                className: 'holiday-event-wrapper' 
            },
            async function(info, successCallback, failureCallback) {
                const { data, error } = await window.supabaseClient.from('recommended_schedules').select('*');
                if (error) { failureCallback(error); } 
                else {
                    let filteredData = data;
                    if (currentFilterColor !== 'all') {
                        filteredData = data.filter(item => item.color === currentFilterColor);
                    }
                    
                    const events = filteredData.map(item => {
                        const localStart = item.start_time ? item.start_time.substring(0, 19) : null;
                        const localEnd = item.end_time ? item.end_time.substring(0, 19) : null;

                        return {
                            id: item.schedule_id, 
                            title: item.schedule_title, 
                            start: localStart, 
                            end: localEnd, 
                            backgroundColor: item.color || '#4361ee', 
                            borderColor: item.color || '#4361ee',
                            display: 'block',
                            allDay: false 
                        };
                    });
                    successCallback(events);
                }
            }
        ],

        dateClick: function(info) {
            const dateStr = info.dateStr.split('T')[0]; 
            
            let defaultStart = "09:00";
            let defaultEnd = "10:00";

            if (info.view.type === 'timeGridWeek' && info.dateStr.includes('T')) {
                defaultStart = info.dateStr.split('T')[1].substring(0, 5);
                let [hour, min] = defaultStart.split(':').map(Number);
                defaultEnd = `${String((hour + 1) % 24).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
            }

            Swal.fire({
                title: `새 일정 추가`, 
                html: `
                    <input id="swal-title" class="swal2-input" maxlength="100" placeholder="일정 내용을 입력해 주세요" style="width: 85%; margin-bottom: 15px; box-sizing: border-box;">
                    
                    <div style="text-align: left; width: 85%; margin: 0 auto 10px auto;">
                        <label style="font-size: 12px; color: #666; font-weight: bold; margin-left: 5px;">시작 일시</label>
                        <div style="display: flex; gap: 5px; margin-top: 5px;">
                            <input type="date" id="swal-start-date" class="swal2-input" value="${dateStr}" style="margin: 0; width: 55%; font-size: 14px; padding: 0 10px;">
                            <input type="time" id="swal-start-time" class="swal2-input" value="${defaultStart}" style="margin: 0; width: 45%; font-size: 14px; padding: 0 10px;">
                        </div>
                    </div>

                    <div style="text-align: left; width: 85%; margin: 0 auto 20px auto;">
                        <label style="font-size: 12px; color: #666; font-weight: bold; margin-left: 5px;">종료 일시</label>
                        <div style="display: flex; gap: 5px; margin-top: 5px;">
                            <input type="date" id="swal-end-date" class="swal2-input" value="${dateStr}" style="margin: 0; width: 55%; font-size: 14px; padding: 0 10px;">
                            <input type="time" id="swal-end-time" class="swal2-input" value="${defaultEnd}" style="margin: 0; width: 45%; font-size: 14px; padding: 0 10px;">
                        </div>
                    </div>

                    <div style="text-align: center; width: 100%; margin: 0 auto;">
                        <label style="font-size: 14px; font-weight: bold; color: #545454; display: block; margin-bottom: 15px;">색상 선택</label>
                        <div style="display: flex; justify-content: center; gap: 15px; font-size: 14px;">
                            <label style="cursor: pointer; display: flex; align-items: center; gap: 5px;">
                                <input type="radio" name="event-color" value="#4361ee" class="event-color-radio" checked> 🔵 기본
                            </label>
                            <label style="cursor: pointer; display: flex; align-items: center; gap: 5px;">
                                <input type="radio" name="event-color" value="#e63946" class="event-color-radio"> 🔴 중요
                            </label>
                            <label style="cursor: pointer; display: flex; align-items: center; gap: 5px;">
                                <input type="radio" name="event-color" value="#2ecc71" class="event-color-radio"> 🟢 개인
                            </label>
                        </div>
                    </div>
                `,
                showCancelButton: true, confirmButtonText: '저장', cancelButtonText: '취소', heightAuto: false,
                preConfirm: () => readScheduleForm('swal', 'event-color')
            }).then(async (result) => {
                if (result.isConfirmed && result.value) {
                    const { error } = await window.supabaseClient.from('recommended_schedules').insert([result.value]);
                    if (error) {
                        console.error('일정 저장 실패:', error);
                        Swal.fire({ title: '저장하지 못했어요', text: '잠시 후 다시 시도해 주세요.', icon: 'error', heightAuto: false });
                        return;
                    }
                    calendar.refetchEvents();
                }
            });
        },

        eventClick: function(info) {
            info.jsEvent.preventDefault(); // 구글 캘린더 링크로 넘어가지 않게
            if (isHolidayEvent(info.event)) {
                Swal.fire('안내', '공휴일은 수정하거나 삭제할 수 없어요.', 'info');
                return;
            }

            const startDate = info.event.startStr.split('T')[0];
            const startTime = info.event.startStr.includes('T') ? info.event.startStr.split('T')[1].substring(0, 5) : '09:00';
            
            let endDate = startDate;
            let endTime = '10:00';
            if (info.event.endStr) {
                endDate = info.event.endStr.split('T')[0];
                endTime = info.event.endStr.includes('T') ? info.event.endStr.split('T')[1].substring(0, 5) : '10:00';
            }
            const knownColors = ['#4361ee', '#e63946', '#2ecc71'];
            const currentColor = knownColors.includes(info.event.backgroundColor) ? info.event.backgroundColor : '#4361ee';

            Swal.fire({
                title: '일정 상세 설정',
                html: `
                    <input id="edit-title" class="swal2-input" maxlength="100" value="${escapeScheduleHtml(info.event.title)}" style="width: 85%; margin-bottom: 15px; box-sizing: border-box;">
                    
                    <div style="text-align: left; width: 85%; margin: 0 auto 10px auto;">
                        <label style="font-size: 12px; color: #666; font-weight: bold; margin-left: 5px;">시작 일시</label>
                        <div style="display: flex; gap: 5px; margin-top: 5px;">
                            <input type="date" id="edit-start-date" class="swal2-input" value="${startDate}" style="margin: 0; width: 55%; font-size: 14px; padding: 0 10px;">
                            <input type="time" id="edit-start-time" class="swal2-input" value="${startTime}" style="margin: 0; width: 45%; font-size: 14px; padding: 0 10px;">
                        </div>
                    </div>

                    <div style="text-align: left; width: 85%; margin: 0 auto 20px auto;">
                        <label style="font-size: 12px; color: #666; font-weight: bold; margin-left: 5px;">종료 일시</label>
                        <div style="display: flex; gap: 5px; margin-top: 5px;">
                            <input type="date" id="edit-end-date" class="swal2-input" value="${endDate}" style="margin: 0; width: 55%; font-size: 14px; padding: 0 10px;">
                            <input type="time" id="edit-end-time" class="swal2-input" value="${endTime}" style="margin: 0; width: 45%; font-size: 14px; padding: 0 10px;">
                        </div>
                    </div>

                    <div style="text-align: center; width: 100%; margin: 0 auto;">
                        <label style="font-size: 14px; font-weight: bold; color: #545454; display: block; margin-bottom: 15px;">색상 선택</label>
                        <div style="display: flex; justify-content: center; gap: 15px; font-size: 14px;">
                            <label style="cursor: pointer;"><input type="radio" name="edit-color" value="#4361ee" ${currentColor === '#4361ee' ? 'checked' : ''}> 🔵 기본</label>
                            <label style="cursor: pointer;"><input type="radio" name="edit-color" value="#e63946" ${currentColor === '#e63946' ? 'checked' : ''}> 🔴 중요</label>
                            <label style="cursor: pointer;"><input type="radio" name="edit-color" value="#2ecc71" ${currentColor === '#2ecc71' ? 'checked' : ''}> 🟢 개인</label>
                        </div>
                    </div>
                `,
                showDenyButton: true,
                showCancelButton: true,
                confirmButtonText: '수정 완료',
                denyButtonText: '삭제',
                cancelButtonText: '취소',
                heightAuto: false,
                preConfirm: () => readScheduleForm('edit', 'edit-color')
            }).then(async (result) => {
                if (result.isConfirmed && result.value) {
                    const { error } = await window.supabaseClient.from('recommended_schedules')
                        .update(result.value).eq('schedule_id', info.event.id);
                    if (error) {
                        console.error('일정 수정 실패:', error);
                        Swal.fire({ title: '수정하지 못했어요', text: '잠시 후 다시 시도해 주세요.', icon: 'error', heightAuto: false });
                        return;
                    }
                    calendar.refetchEvents();
                } else if (result.isDenied) {
                    // 삭제는 되돌릴 수 없으니 한 번 더 확인
                    const ok = await Swal.fire({
                        title: '일정을 삭제할까요?', text: `'${info.event.title}' 일정이 삭제돼요.`, icon: 'warning',
                        showCancelButton: true, confirmButtonText: '삭제', cancelButtonText: '취소', confirmButtonColor: '#dc2626', heightAuto: false
                    });
                    if (!ok.isConfirmed) return;
                    const { error } = await window.supabaseClient.from('recommended_schedules').delete().eq('schedule_id', info.event.id);
                    if (error) {
                        console.error('일정 삭제 실패:', error);
                        Swal.fire({ title: '삭제하지 못했어요', text: '잠시 후 다시 시도해 주세요.', icon: 'error', heightAuto: false });
                        return;
                    }
                    calendar.refetchEvents();
                }
            });
        }
    });

    calendar.render();
}

// 휴무일 표시: 'rest' = 쉬는 날(빨강), 'sat' = 기본 설정의 토요일(파랑, 쉬는 날), null = 평일
const REST_COLORS = { rest: '#e63946', sat: '#4361ee' };
function restKind(day) {
    const s = getRestSetting();
    if (s.type === 'weekly') return s.days.includes(day) ? 'rest' : null;
    return day === 0 ? 'rest' : day === 6 ? 'sat' : null;
}

document.addEventListener('DOMContentLoaded', () => { ensureRestSetting().finally(initCalendar); }); // 내 휴무일 설정을 불러온 뒤 캘린더 표시

window.filterEvents = function(color, element) {
    currentFilterColor = color;
    const allButtons = document.querySelectorAll('.filter-btn');
    allButtons.forEach(btn => {
        btn.style.border = "1px solid #ccc";
        btn.style.color = "#333";
        btn.style.fontWeight = "normal";
        btn.classList.remove('active-filter');
    });

    if (element) {
        element.style.border = "2px solid #4361ee";
        element.style.color = "#4361ee";
        element.style.fontWeight = "bold";
        element.classList.add('active-filter');
    }
    if (calendar) calendar.refetchEvents(); 
};

window.openRestDaySettings = function() {
    Swal.fire({
        title: '휴무일 설정',
        html: `
            <div style="text-align: center; margin-bottom: 15px;">
                <label style="font-weight: bold; font-size: 15px; display: block; margin-bottom: 15px;">근무/휴무 형태:</label>
                <div style="display: flex; justify-content: center; gap: 20px; font-size: 14px; margin-bottom: 10px;">
                    <label style="cursor: pointer; display: flex; align-items: center; gap: 5px;">
                        <input type="radio" name="rest-type" value="default" class="rest-type-radio"> 일반 (토, 일 기본)
                    </label>
                    <label style="cursor: pointer; display: flex; align-items: center; gap: 5px;">
                        <input type="radio" name="rest-type" value="weekly" class="rest-type-radio"> 스케줄 (매주 지정)
                    </label>
                </div>
            </div>
            
            <div id="weekly-options" style="display: none; text-align: center; background: #f8f9fa; padding: 15px; border-radius: 8px; width: 85%; margin: 0 auto; box-sizing: border-box;">
                <label style="font-weight: bold; font-size: 14px; display: block; margin-bottom: 10px;">휴무 요일 선택 (다중 선택 가능):</label>
                <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                    <label><input type="checkbox" class="rest-day-cb" value="1"> 월</label>
                    <label><input type="checkbox" class="rest-day-cb" value="2"> 화</label>
                    <label><input type="checkbox" class="rest-day-cb" value="3"> 수</label>
                    <label><input type="checkbox" class="rest-day-cb" value="4"> 목</label>
                    <label><input type="checkbox" class="rest-day-cb" value="5"> 금</label>
                    <label><input type="checkbox" class="rest-day-cb" value="6"> 토</label>
                    <label><input type="checkbox" class="rest-day-cb" value="0"> 일</label>
                </div>
            </div>
        `,
        didOpen: () => {
            const weeklyOptions = document.getElementById('weekly-options');
            const radios = document.querySelectorAll('.rest-type-radio');
            const currentSetting = getRestSetting();
            
            radios.forEach(radio => {
                if (radio.value === currentSetting.type) radio.checked = true;
                radio.addEventListener('change', (e) => {
                    weeklyOptions.style.display = e.target.value === 'weekly' ? 'block' : 'none';
                });
            });
            
            if (currentSetting.type === 'weekly') {
                weeklyOptions.style.display = 'block';
                document.querySelectorAll('.rest-day-cb').forEach(cb => {
                    if (currentSetting.days.includes(parseInt(cb.value))) cb.checked = true;
                });
            }
        },
        showCancelButton: true, confirmButtonText: '저장', cancelButtonText: '취소'
    }).then(async (result) => {
        if (result.isConfirmed) {
            const checkedRadio = document.querySelector('.rest-type-radio:checked');
            const type = checkedRadio ? checkedRadio.value : 'default';
            let days = [];
            if (type === 'weekly') {
                document.querySelectorAll('.rest-day-cb:checked').forEach(cb => { days.push(parseInt(cb.value)); });
            }
            const { error } = await saveRestSetting({ type, days });
            if (error) {
                console.error('휴무일 저장 실패:', error);
                Swal.fire('저장 실패', '이 기기에만 적용됐어요. 잠시 후 다시 저장해 주세요.', 'warning').then(() => { initCalendar(); });
                return;
            }
            Swal.fire('적용 완료', '캘린더와 AI 계획에 휴무일을 반영했어요.', 'success').then(() => { 
                initCalendar(); 
            });
        }
    });
};