// JS/signup.js

// 버튼을 찾아서 '클릭' 이벤트를 달아줍니다.
document.getElementById('signup-btn').addEventListener('click', async () => {
    // 사용자가 입력한 이메일과 비밀번호 가져오기
    const emailValue = document.getElementById('email').value;
    const passwordValue = document.getElementById('password').value;

    // 빈칸 검사
    if(!emailValue || !passwordValue) {
        alert("이메일과 비밀번호를 모두 입력해주세요.");
        return;
    }

    // Supabase로 회원가입 요청 보내기 (JS/supabase.js에서 만든 객체 사용)
    const { data, error } = await window.supabaseClient.auth.signUp({
        email: emailValue,
        password: passwordValue,
        options: {
            data: { username: "새로운유저" } // 임시 닉네임
        }
    });

    // 결과 확인
    if (error) {
        alert("가입 실패: " + error.message);
    } else {
        alert("회원가입 성공! Supabase DB를 확인해보세요.");
        console.log("가입 정보:", data);
        
        // 가입 성공 후 로그인 페이지로 이동시키려면 아래 주석을 해제하세요.
        window.location.href = "Login.html"; 
    }
});