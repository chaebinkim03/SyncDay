// JS/settings.js
let currentUser = null;

// 페이지 로드 시 유저 데이터 및 닉네임 상태 초기화
document.addEventListener('DOMContentLoaded', async () => {
    if(window.supabaseClient) {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        if (!session) { window.location.href = "../Login.html"; return; }
        currentUser = session.user;

        document.getElementById('user-info-text').innerText = `로그인된 계정: ${currentUser.email}`;
        
        // 프로필 테이블에서 기존 닉네임 조회
        const { data, error } = await window.supabaseClient.from('profiles').select('nickname').eq('id', currentUser.id).single();
        const displayEl = document.getElementById('user-email-display');
        
        if (data && data.nickname) {
            document.getElementById('nickname-input').value = data.nickname;
            displayEl.innerText = data.nickname; // 닉네임 존재 시 사이드바에 적용
        } else {
            displayEl.innerText = (currentUser.user_metadata && currentUser.user_metadata.full_name) || currentUser.email; // 없으면 구글 이름 → 이메일
        }
        loadInquiries();
        loadNotices();
    }
});

// 닉네임 저장 및 실시간 반영
async function saveNickname() {
    const nickname = document.getElementById('nickname-input').value.trim();
    if(!nickname) return alert('닉네임을 입력해주세요.');
    
    const { error } = await window.supabaseClient.from('profiles').upsert({ id: currentUser.id, nickname: nickname });
    
    if(error) { 
        alert('저장에 실패했습니다. DB에 profiles 테이블이 있는지 확인해주세요.'); 
    } else {
        const status = document.getElementById('nickname-status');
        status.style.display = 'block';
        document.getElementById('user-email-display').innerText = nickname; // 실시간 변경
        setTimeout(() => status.style.display = 'none', 3000);
    }
}

// 📢 공지사항 세부 내용 팝업 활성화
function openNoticeModal(title, content, date) {
    document.getElementById('notice-modal-title').innerText = title;
    document.getElementById('notice-modal-date').innerText = date;
    document.getElementById('notice-modal-body').innerText = content;
    document.getElementById('notice-modal').classList.add('active');
}

// 📢 공지사항: notices 테이블 (운영자가 Supabase Table Editor에서 작성)
let notices = [];
async function loadNotices() {
    const box = document.getElementById('notice-list');
    if (!box) return;
    const { data, error } = await window.supabaseClient
        .from('notices').select('id, category, title, content, is_pinned, created_at')
        .order('is_pinned', { ascending: false }).order('created_at', { ascending: false }).limit(20);
    if (error) {
        console.error('공지사항 불러오기 실패:', error);
        box.innerHTML = '<p class="notice-empty">공지사항을 불러오지 못했습니다.</p>';
        return;
    }
    notices = data || [];
    if (notices.length === 0) { box.innerHTML = '<p class="notice-empty">등록된 공지사항이 없습니다.</p>'; return; }
    box.innerHTML = notices.map((n, i) => `
        <div class="notice-item" role="button" tabindex="0" onclick="openNotice(${i})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openNotice(${i})}">
            <span class="notice-date">${String(n.created_at).slice(0, 10)}</span>
            ${n.is_pinned ? '<span class="notice-pin" title="고정 공지">📌</span>' : ''}<strong>[${escapeSettingsHtml(n.category || '안내')}]</strong> ${escapeSettingsHtml(n.title)}
        </div>`).join('');
}
function openNotice(index) {
    const n = notices[index];
    if (n) openNoticeModal(n.title, n.content || '', String(n.created_at).slice(0, 10));
}

// 💬 1:1 문의창 활성화
function openInquiryModal() {
    document.getElementById('inquiry-text').value = '';
    document.getElementById('inquiry-modal').classList.add('active');
}

// 모든 모달 팝업 비활성화
function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// 💬 1:1 문의: inquiries 테이블에 저장 → 운영자가 Supabase에서 답변을 적으면 '내 문의 내역'에 표시
function escapeSettingsHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function submitInquiry() {
    const textEl = document.getElementById('inquiry-text');
    const btn = document.getElementById('inquiry-submit');
    const text = textEl.value.trim();
    if (!text) return alert("문의하실 내용을 입력해주세요.");
    if (text.length > 2000) return alert("문의 내용은 2000자 이내로 적어주세요.");
    if (!currentUser) return alert("로그인 정보를 불러오는 중입니다. 잠시 후 다시 시도해주세요.");

    if (btn) { btn.disabled = true; btn.textContent = '접수 중...'; }
    const { error } = await window.supabaseClient.from('inquiries').insert({ content: text, email: currentUser.email });
    if (btn) { btn.disabled = false; btn.textContent = '문의 접수하기'; }

    if (error) {
        console.error('문의 저장 실패:', error);
        return alert("문의를 접수하지 못했습니다. 잠시 후 다시 시도해주세요.");
    }
    alert(`문의가 접수되었습니다.\n답변은 아래 '내 문의 내역'에서 확인할 수 있어요.`);
    closeModal('inquiry-modal');
    loadInquiries();
}

let myInquiries = [];

async function loadInquiries() {
    const box = document.getElementById('inquiry-list');
    if (!box || !currentUser) return;
    const { data, error } = await window.supabaseClient
        .from('inquiries').select('content, answer, answered_at, created_at')
        .order('created_at', { ascending: false }).limit(10);
    if (error) { console.error('문의 내역 불러오기 실패:', error); box.innerHTML = ''; return; }
    myInquiries = data || [];
    if (myInquiries.length === 0) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="inquiry-list-title">내 문의 내역 <small>눌러서 자세히 보기</small></div>' + myInquiries.map((q, i) => {
        const date = String(q.created_at).slice(0, 10);
        const status = q.answer ? '<span class="inquiry-status done">답변 완료</span>' : '<span class="inquiry-status">답변 대기</span>';
        const answer = q.answer ? `<div class="inquiry-answer"><b>답변</b> ${escapeSettingsHtml(q.answer)}</div>` : '';
        return `<div class="inquiry-item" role="button" tabindex="0" onclick="openInquiryDetail(${i})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openInquiryDetail(${i})}">
            <div class="inquiry-head">${status}<span class="inquiry-date">${date}</span></div>
            <div class="inquiry-q">${escapeSettingsHtml(q.content)}</div>${answer}</div>`;
    }).join('');
}

// 문의 하나를 눌렀을 때: 질문과 답변 전체를 팝업으로
function openInquiryDetail(index) {
    const q = myInquiries[index];
    if (!q) return;
    const status = q.answer ? '<span class="inquiry-status done">답변 완료</span>' : '<span class="inquiry-status">답변 대기</span>';
    const answered = q.answered_at ? ` · 답변 ${String(q.answered_at).slice(0, 10)}` : '';
    document.getElementById('inquiry-detail-meta').innerHTML = `${status}<span class="inquiry-date">문의 ${String(q.created_at).slice(0, 10)}${answered}</span>`;
    document.getElementById('inquiry-detail-q').textContent = q.content;
    document.getElementById('inquiry-detail-a').innerHTML = q.answer
        ? `<div class="detail-label answer">답변</div><div class="detail-text">${escapeSettingsHtml(q.answer)}</div>`
        : '<div class="detail-wait">아직 답변이 없어요. 확인 후 이곳에 답변을 남겨 드릴게요.</div>';
    document.getElementById('inquiry-detail-modal').classList.add('active');
}

// 인증 해제 및 리다이렉트
async function logout() {
    // 다른 계정으로 로그인했을 때 이전 챗봇 대화가 보이지 않도록 지움
    ['chatMessages', 'chatOpen', 'chatLeft', 'chatTop', 'chatDir'].forEach(k => sessionStorage.removeItem(k));
    await window.supabaseClient.auth.signOut();
    window.location.href = "../index.html"; // 로그아웃 후 소개 페이지(첫 화면)로
}
// 팝업 바깥(어두운 부분)을 누르거나 Esc를 누르면 닫기
document.addEventListener('click', (e) => {
    if (e.target.classList && e.target.classList.contains('modal-overlay')) e.target.classList.remove('active');
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
});
