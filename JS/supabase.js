// JS/supabase.js

// 1. Supabase에서 복사한 URL과 anon KEY를 여기에 넣으세요!
const SUPABASE_URL = 'https://qjedeuwihuscotrbnomf.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_i6oKWoQ0BrmhQfXWW10_-A_AE9BJjrI';

// 2. Supabase 클라이언트 초기화 (전역 변수로 설정하여 다른 파일에서 사용 가능하게 함)
if (!window.supabaseClient) {
    window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log("✅ Supabase 데이터베이스 연결 완료!");
}
// 3. 휴무일 설정: 계정마다 DB(profiles.rest_setting)에 저장
//    - 브라우저에는 계정별 사본만 둠 (계정을 바꾸면 각자 설정, PC·휴대폰도 같은 설정)
//    - { type: 'default' } = 토·일 휴무, { type: 'weekly', days: [요일 번호] } = 직접 고른 요일 휴무
const REST_DEFAULT = { type: 'default', days: [] };
let restUserId = null;

function restCacheKey() { return 'userRestSetting:' + (restUserId || 'guest'); }

function getRestSetting() {
    try {
        const s = JSON.parse(localStorage.getItem(restCacheKey()));
        if (s && (s.type === 'default' || s.type === 'weekly')) return { type: s.type, days: Array.isArray(s.days) ? s.days : [] };
    } catch (e) {}
    return { ...REST_DEFAULT };
}

async function loadRestSetting() {
    try {
        localStorage.removeItem('userRestSetting'); // 예전 방식(모든 계정 공용) 값은 지움
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        if (!session) return getRestSetting();
        restUserId = session.user.id;
        const { data, error } = await window.supabaseClient
            .from('profiles').select('rest_setting').eq('id', restUserId).maybeSingle();
        if (error) throw error;
        localStorage.setItem(restCacheKey(), JSON.stringify(data && data.rest_setting ? data.rest_setting : REST_DEFAULT));
    } catch (e) {
        console.warn('휴무일 설정 불러오기 실패 (브라우저 사본 사용):', e);
    }
    return getRestSetting();
}

// 페이지마다 한 번만 불러옴
function ensureRestSetting() {
    if (!window.restSettingReady) window.restSettingReady = loadRestSetting();
    return window.restSettingReady;
}

async function saveRestSetting(setting) {
    await ensureRestSetting();
    const value = { type: setting.type === 'weekly' ? 'weekly' : 'default', days: setting.type === 'weekly' ? setting.days : [] };
    localStorage.setItem(restCacheKey(), JSON.stringify(value));
    if (!restUserId) return { error: new Error('로그인이 필요합니다.') };
    return window.supabaseClient.from('profiles').upsert({ id: restUserId, rest_setting: value });
}
