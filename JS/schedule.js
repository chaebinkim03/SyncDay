// JS/schedule.js
let currentFilterColor = 'all';
let calendar;

// 공휴일(구글 캘린더) 일정인지 확인: 공휴일 묶음(id)이거나 구글 캘린더 링크가 붙은 일정
function isHolidayEvent(ev) {
    return (ev.source && ev.source.id === 'holidays') || (!!ev.url && ev.url.indexOf('google.com') !== -1);
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
            const day = info.date.getDay(); 
            const dayNum = info.el.querySelector('.fc-daygrid-day-number');
            if (dayNum) {
                const restSetting = getRestSetting();
                dayNum.style.color = '#333333'; 
                if (restSetting.type === 'default') {
                    if (day === 0) dayNum.style.color = '#e63946'; 
                    else if (day === 6) dayNum.style.color = '#4361ee'; 
                } else if (restSetting.type === 'weekly') {
                    if (restSetting.days.includes(day)) dayNum.style.color = '#e63946'; 
                }
            }
        },

        dayCellContent: function(info) {
            return { html: info.dayNumberText.replace('일', '').trim() };
        },

        selectable: true,
        
        eventSources: [
            {
                id: 'holidays',
                googleCalendarId: 'ko.south_korea#holiday@group.v.calendar.google.com',
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
                    <input id="swal-input-title" class="swal2-input" placeholder="일정 내용을 입력해 주세요" style="width: 85%; margin-bottom: 15px; box-sizing: border-box;">
                    
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
                showCancelButton: true, confirmButtonText: '저장', cancelButtonText: '취소'
            }).then(async (result) => {
                if (result.isConfirmed) {
                    const title = document.getElementById('swal-input-title').value;
                    const sDate = document.getElementById('swal-start-date').value;
                    const sTime = document.getElementById('swal-start-time').value;
                    const eDate = document.getElementById('swal-end-date').value;
                    const eTime = document.getElementById('swal-end-time').value;
                    const checkedColorRadio = document.querySelector('.event-color-radio:checked');
                    const color = checkedColorRadio ? checkedColorRadio.value : '#4361ee';
                    
                    if(title && sDate && eDate) {
                        const newEvent = { 
                            schedule_title: title, 
                            start_time: `${sDate}T${sTime}:00`, 
                            end_time: `${eDate}T${eTime}:00`,
                            color: color
                        };
                        const { error } = await window.supabaseClient.from('recommended_schedules').insert([newEvent]);
                        if (!error) { 
                            calendar.refetchEvents(); 
                        }
                    }
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
            const currentColor = info.event.backgroundColor;

            Swal.fire({
                title: '일정 상세 설정',
                html: `
                    <input id="edit-schedule-title" class="swal2-input" value="${info.event.title}" style="width: 85%; margin-bottom: 15px; box-sizing: border-box;">
                    
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
                        <label style="font-size: 14px; font-weight: bold; color: #545454; display: block; margin-bottom: 15px;">중요도 변경</label>
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
                cancelButtonText: '취소'
            }).then(async (result) => {
                if (result.isConfirmed) {
                    const newTitle = document.getElementById('edit-schedule-title').value;
                    const sDate = document.getElementById('edit-start-date').value;
                    const sTime = document.getElementById('edit-start-time').value;
                    const eDate = document.getElementById('edit-end-date').value;
                    const eTime = document.getElementById('edit-end-time').value;
                    const newColor = document.querySelector('input[name="edit-color"]:checked').value;
                    
                    if (newTitle && sDate && eDate) {
                        const updateData = { 
                            schedule_title: newTitle,
                            start_time: `${sDate}T${sTime}:00`,
                            end_time: `${eDate}T${eTime}:00`,
                            color: newColor
                        };
                        await window.supabaseClient.from('recommended_schedules')
                            .update(updateData)
                            .eq('schedule_id', info.event.id);
                        calendar.refetchEvents(); 
                    }
                } else if (result.isDenied) {
                    await window.supabaseClient.from('recommended_schedules').delete().eq('schedule_id', info.event.id);
                    calendar.refetchEvents();
                }
            });
        }
    });

    calendar.render();
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