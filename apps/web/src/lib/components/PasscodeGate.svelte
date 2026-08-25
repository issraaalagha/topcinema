<script>
  import { api } from '../api.js';

  let { onAuthenticated } = $props();

  let passcode = $state('');
  let remember = $state(true);
  let loading = $state(false);
  let error = $state('');
  let shake = $state(false);

  async function handleLogin(e) {
    if (e) e.preventDefault();
    if (!passcode || loading) return;

    loading = true;
    error = '';

    try {
      const res = await api.login(passcode, remember);
      if (res.ok) {
        if (onAuthenticated) onAuthenticated();
      } else {
        triggerError(res.error || 'رمز المرور غير صحيح');
      }
    } catch (err) {
      triggerError(err.message || 'رمز المرور غير صحيح');
    } finally {
      loading = false;
    }
  }

  function triggerError(msg) {
    error = msg;
    shake = true;
    setTimeout(() => (shake = false), 600);
    passcode = '';
  }

  function pressKey(digit) {
    if (passcode.length < 12) {
      passcode += digit;
      if (passcode.length === 4) {
        handleLogin();
      }
    }
  }

  function backspace() {
    passcode = passcode.slice(0, -1);
  }
</script>

<div class="gate-overlay">
  <div class="gate-backdrop"></div>
  <div class="gate-card {shake ? 'shake' : ''}">
    <div class="gate-header">
      <div class="brand-logo">TC</div>
      <h2>بوابة الدخول الخاصة 🔐</h2>
      <p class="subtitle">أدخل رمز المرور السحابي لفتح مكتبة توب سينما</p>
    </div>

    <form onsubmit={handleLogin} class="gate-form">
      <div class="dots-display">
        {#each [0, 1, 2, 3] as idx}
          <div class="pin-dot {passcode.length > idx ? 'filled' : ''}"></div>
        {/each}
      </div>

      <input
        type="password"
        class="hidden-input"
        bind:value={passcode}
        placeholder="أدخل الرمز…"
        autocomplete="current-password"
      />

      <!-- Quick Keypad -->
      <div class="keypad">
        {#each ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as digit}
          <button type="button" class="key-btn" onclick={() => pressKey(digit)}>
            {digit}
          </button>
        {/each}
        <button type="button" class="key-btn action-key" onclick={backspace} aria-label="حذف">
          ⌫
        </button>
        <button type="button" class="key-btn" onclick={() => pressKey('0')}>
          0
        </button>
        <button type="submit" class="key-btn submit-key" disabled={loading} aria-label="دخول">
          {#if loading}
            <div class="mini-spinner"></div>
          {:else}
            ✓
          {/if}
        </button>
      </div>

      {#if error}
        <div class="error-banner" role="alert">
          <span>⚠️ {error}</span>
        </div>
      {/if}

      <div class="remember-row">
        <label class="checkbox-label">
          <input type="checkbox" bind:checked={remember} />
          <span>تذكر هذا الجهاز (سنة كاملة)</span>
        </label>
      </div>
    </form>
  </div>
</div>

<style>
  .gate-overlay {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: grid;
    place-items: center;
    padding: 20px;
    background: rgba(3, 7, 18, 0.88);
    backdrop-filter: blur(16px);
  }
  .gate-backdrop {
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at 50% 30%, rgba(229, 9, 20, 0.15), transparent 70%);
    pointer-events: none;
  }
  .gate-card {
    position: relative;
    width: 100%;
    max-width: 360px;
    background: rgba(18, 22, 34, 0.85);
    border: 1px solid var(--border-glass);
    border-radius: var(--radius-lg);
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.8), 0 0 40px rgba(229, 9, 20, 0.1);
    padding: 32px 26px;
    text-align: center;
    backdrop-filter: blur(20px);
    transition: transform var(--transition-normal);
  }
  .gate-card.shake {
    animation: shake 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
  }
  @keyframes shake {
    10%, 90% { transform: translate3d(-2px, 0, 0); }
    20%, 80% { transform: translate3d(4px, 0, 0); }
    30%, 50%, 70% { transform: translate3d(-6px, 0, 0); }
    40%, 60% { transform: translate3d(6px, 0, 0); }
  }
  .brand-logo {
    width: 52px;
    height: 52px;
    border-radius: 14px;
    background: linear-gradient(135deg, #e50914, #b20710);
    color: #fff;
    font-size: 20px;
    font-weight: 900;
    display: grid;
    place-items: center;
    margin: 0 auto 16px;
    box-shadow: 0 8px 24px var(--accent-glow);
  }
  h2 {
    font-size: 21px;
    font-weight: 800;
    margin-bottom: 6px;
    letter-spacing: -0.3px;
  }
  .subtitle {
    font-size: 13px;
    color: var(--text-muted);
    margin-bottom: 24px;
    line-height: 1.5;
  }
  .dots-display {
    display: flex;
    justify-content: center;
    gap: 14px;
    margin-bottom: 24px;
  }
  .pin-dot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.2);
    background: transparent;
    transition: all var(--transition-fast);
  }
  .pin-dot.filled {
    background: var(--accent);
    border-color: var(--accent);
    box-shadow: 0 0 10px var(--accent-glow);
    transform: scale(1.15);
  }
  .hidden-input {
    opacity: 0;
    position: absolute;
    pointer-events: none;
  }
  .keypad {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    max-width: 280px;
    margin: 0 auto 20px;
  }
  .key-btn {
    height: 54px;
    border-radius: var(--radius-pill);
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--border-glass);
    color: var(--text);
    font-size: 20px;
    font-weight: 700;
    display: grid;
    place-items: center;
    cursor: pointer;
    transition: all var(--transition-fast);
  }
  .key-btn:hover {
    background: rgba(255, 255, 255, 0.12);
    border-color: var(--border-hover);
    transform: scale(1.05);
  }
  .key-btn:active {
    transform: scale(0.95);
    background: var(--accent);
    color: #fff;
  }
  .action-key {
    font-size: 16px;
    color: var(--text-muted);
  }
  .submit-key {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
    font-size: 18px;
    box-shadow: 0 4px 14px var(--accent-glow);
  }
  .submit-key:hover {
    background: var(--accent-hover);
  }
  .mini-spinner {
    width: 20px;
    height: 20px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  .error-banner {
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #ff6b6b;
    font-size: 13px;
    font-weight: 600;
    padding: 8px 14px;
    border-radius: var(--radius-sm);
    margin-bottom: 16px;
  }
  .remember-row {
    font-size: 13px;
    color: var(--text-secondary);
  }
  .checkbox-label {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    user-select: none;
  }
  .checkbox-label input {
    accent-color: var(--accent);
    cursor: pointer;
  }
</style>
