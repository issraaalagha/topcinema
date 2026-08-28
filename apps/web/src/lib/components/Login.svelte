<script>
  import { api } from '../api.js';

  let { onAuthenticated } = $props();

  let mode = $state('account'); // 'account' | 'master'
  let username = $state('');
  let password = $state('');
  let passcode = $state('');
  let remember = $state(true);
  let loading = $state(false);
  let error = $state('');
  let shake = $state(false);

  async function handleSubmit(e) {
    if (e) e.preventDefault();
    if (loading) return;
    if (mode === 'account' && (!username || !password)) return;
    if (mode === 'master' && !passcode) return;

    loading = true;
    error = '';

    try {
      const payload =
        mode === 'account'
          ? { username: username.trim(), password }
          : { passcode: passcode.trim() };

      const res = await api.login(payload, remember);
      if (res.ok) {
        if (onAuthenticated) onAuthenticated(res);
      } else {
        triggerError(res.error || 'بيانات الدخول غير صحيحة');
      }
    } catch (err) {
      triggerError(err.message || 'بيانات الدخول غير صحيحة');
    } finally {
      loading = false;
    }
  }

  function triggerError(msg) {
    error = msg;
    shake = true;
    setTimeout(() => (shake = false), 600);
  }
</script>

<div class="gate-overlay">
  <div class="gate-backdrop"></div>
  <div class="gate-card {shake ? 'shake' : ''}">
    <div class="gate-header">
      <img class="gate-logo" src="/icons/logo-mark.png" alt="FreeWatch" width="72" height="72" />
      <h2 class="gate-wordmark">free<em>watch</em><span class="tld">.uk</span></h2>
      <p class="subtitle">منصة خاصة — الدخول متاح لحسابات المسجّلين فقط</p>
    </div>

    <div class="mode-tabs">
      <button type="button" class="mode-tab" class:active={mode === 'account'} onclick={() => { mode = 'account'; error = ''; }}>
        حسابي
      </button>
      <button type="button" class="mode-tab" class:active={mode === 'master'} onclick={() => { mode = 'master'; error = ''; }}>
        رمز المالك
      </button>
    </div>

    <form onsubmit={handleSubmit}>
      {#if mode === 'account'}
        <input
          class="field"
          type="text"
          placeholder="اسم المستخدم"
          bind:value={username}
          autocomplete="username"
        />
        <input
          class="field"
          type="password"
          placeholder="كلمة المرور"
          bind:value={password}
          autocomplete="current-password"
        />
      {:else}
        <input
          class="field"
          type="password"
          placeholder="رمز المالك السحري"
          bind:value={passcode}
          autocomplete="current-password"
        />
      {/if}

      <label class="remember-row">
        <input type="checkbox" bind:checked={remember} />
        <span>تذكرني على هذا الجهاز</span>
      </label>

      {#if error}
        <p class="error-msg">⚠️ {error}</p>
      {/if}

      <button type="submit" class="submit-btn" disabled={loading}>
        {loading ? 'جارٍ الدخول…' : 'دخول'}
      </button>
    </form>

    <p class="gate-footer">الدخول بالدعوة فقط — الحسابات تُنشأ من لوحة التحكم</p>
  </div>
</div>

<style>
  .gate-overlay {
    position: fixed;
    inset: 0;
    z-index: 999;
    display: grid;
    place-items: center;
    padding: 20px;
  }
  .gate-backdrop {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(1200px 600px at 70% -10%, rgba(229, 9, 20, 0.25), transparent 60%),
      radial-gradient(900px 500px at 10% 110%, rgba(59, 130, 246, 0.15), transparent 60%),
      var(--bg, #0b0d12);
  }
  .gate-card {
    position: relative;
    width: 100%;
    max-width: 420px;
    padding: 34px 30px 24px;
    border-radius: 18px;
    background: rgba(18, 20, 26, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.09);
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.7);
    text-align: center;
  }
  .shake {
    animation: shake 0.5s;
  }
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    20%, 60% { transform: translateX(-9px); }
    40%, 80% { transform: translateX(9px); }
  }
  .gate-logo {
    width: 72px;
    height: 72px;
    margin: 0 auto 12px;
    border-radius: 18px;
    box-shadow: 0 12px 34px rgba(0, 0, 0, 0.6);
  }
  .gate-wordmark {
    font-size: 26px;
    font-weight: 900;
    letter-spacing: -0.6px;
    direction: ltr;
    color: #fff;
    margin-bottom: 6px;
  }
  .gate-wordmark em {
    font-style: normal;
    background: linear-gradient(135deg, var(--accent, #e50914), #ff4d57);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .gate-wordmark .tld {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.45);
    -webkit-text-fill-color: rgba(255, 255, 255, 0.45);
    margin-inline-start: 4px;
  }
  h2 {
    font-size: 21px;
    font-weight: 800;
    margin-bottom: 6px;
  }
  .subtitle {
    color: rgba(255, 255, 255, 0.55);
    font-size: 13px;
    margin-bottom: 20px;
  }
  .mode-tabs {
    display: flex;
    gap: 8px;
    background: rgba(255, 255, 255, 0.05);
    padding: 5px;
    border-radius: 12px;
    margin-bottom: 20px;
  }
  .mode-tab {
    flex: 1;
    padding: 9px;
    border: 0;
    border-radius: 9px;
    background: transparent;
    color: rgba(255, 255, 255, 0.55);
    font-weight: 700;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;
  }
  .mode-tab.active {
    background: #e50914;
    color: #fff;
    box-shadow: 0 4px 14px rgba(229, 9, 20, 0.4);
  }
  .field {
    width: 100%;
    padding: 13px 16px;
    margin-bottom: 12px;
    border-radius: 11px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.05);
    color: #fff;
    font-size: 14.5px;
    text-align: center;
    letter-spacing: 0.5px;
    outline: none;
    transition: border 0.2s;
  }
  .field:focus {
    border-color: rgba(229, 9, 20, 0.7);
  }
  .remember-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: rgba(255, 255, 255, 0.55);
    font-size: 12.5px;
    margin: 4px 0 14px;
    cursor: pointer;
  }
  .error-msg {
    color: #ff6b74;
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 12px;
  }
  .submit-btn {
    width: 100%;
    padding: 13px;
    border: 0;
    border-radius: 11px;
    background: linear-gradient(135deg, #e50914, #b20710);
    color: #fff;
    font-weight: 800;
    font-size: 15px;
    cursor: pointer;
    transition: transform 0.15s, opacity 0.15s;
  }
  .submit-btn:hover:not(:disabled) {
    transform: translateY(-1px);
  }
  .submit-btn:disabled {
    opacity: 0.6;
    cursor: wait;
  }
  .gate-footer {
    margin-top: 18px;
    color: rgba(255, 255, 255, 0.35);
    font-size: 11.5px;
  }
</style>
