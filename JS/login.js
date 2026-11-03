// JS/login.js
// 구글 계정 하나로 회원가입과 로그인을 같이 처리합니다.
// (처음 로그인하는 구글 계정은 Supabase가 자동으로 회원을 만들어 줍니다.)

const MAIN_PAGE = new URL('Pages/main.html', window.location.href).href;

// 이미 로그인된 상태라면 바로 메인으로 이동
(async () => {
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    if (session) window.location.replace(MAIN_PAGE);
})();

// 구글 로그인 후 돌아왔을 때 세션이 생기면 메인으로 이동
window.supabaseClient.auth.onAuthStateChange((event, session) => {
    if (session) window.location.replace(MAIN_PAGE);
});

document.getElementById('google-login-btn').addEventListener('click', async () => {
    const errorEl = document.getElementById('auth-error');
    errorEl.hidden = true;

    const { error } = await window.supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: MAIN_PAGE,
            queryParams: { prompt: 'select_account' } // 여러 구글 계정 중 고를 수 있게
        }
    });

    if (error) {
        console.error(error);
        errorEl.textContent = '구글 로그인을 시작하지 못했습니다. 잠시 후 다시 시도해주세요.';
        errorEl.hidden = false;
    }
});
