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

// 💬 1:1 문의창 활성화
function openInquiryModal() {
    document.getElementById('inquiry-text').value = '';
    document.getElementById('inquiry-modal').classList.add('active');
}

// 모든 모달 팝업 비활성화
function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// 문의 등록 가상 모의 핸들러
function submitInquiry() {
    const text = document.getElementById('inquiry-text').value.trim();
    if(!text) return alert("문의하실 내용을 입력해주세요.");
    
    alert("문의가 성공적으로 접수되었습니다.\n빠른 시일 내에 이메일로 답변 드리겠습니다!");
    closeModal('inquiry-modal');
}

// 인증 해제 및 리다이렉트
async function logout() {
    // 다른 계정으로 로그인했을 때 이전 챗봇 대화가 보이지 않도록 지움
    ['chatMessages', 'chatOpen', 'chatLeft', 'chatTop', 'chatDir'].forEach(k => sessionStorage.removeItem(k));
    await window.supabaseClient.auth.signOut();
    window.location.href = "../index.html"; // 로그아웃 후 소개 페이지(첫 화면)로
}