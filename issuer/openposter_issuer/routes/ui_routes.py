from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import HTMLResponse

router = APIRouter()


@router.get("/auth", response_class=HTMLResponse)
async def issuer_auth_page(return_to: str = "http://localhost:3000/register"):
    safe_return = return_to.replace("\\", "\\\\").replace("'", "\\'")
    html = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>OpenPoster Issuer</title>
    <style>
      :root {{
        color-scheme: light dark;
        --bg: #f5f2eb;
        --fg: #17120c;
        --muted: #675f56;
        --panel: rgba(255,255,255,0.82);
        --line: rgba(87,66,36,0.16);
        --accent: #ff1a1a;
        --accent-2: #0b5345;
      }}
      @media (prefers-color-scheme: dark) {{
        :root {{
          --bg: #120f0b;
          --fg: #f6efe6;
          --muted: #c7b7a6;
          --panel: rgba(28,24,19,0.82);
          --line: rgba(255,255,255,0.12);
        }}
      }}
      * {{ box-sizing: border-box; }}
      body {{
        margin: 0;
        font-family: Inter, ui-sans-serif, system-ui, sans-serif;
        color: var(--fg);
        background:
          radial-gradient(circle at top left, rgba(255,26,26,0.18), transparent 28%),
          radial-gradient(circle at bottom right, rgba(11,83,69,0.16), transparent 26%),
          linear-gradient(180deg, var(--bg) 0%, color-mix(in srgb, var(--bg) 80%, #fff 20%) 100%);
        min-height: 100vh;
      }}
      .shell {{
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 32px 16px;
      }}
      .wrap {{
        width: 100%;
        max-width: 640px;
      }}
      .hero {{
        text-align: center;
        margin-bottom: 22px;
      }}
      .logo-card {{
        width: 92px;
        height: 92px;
        margin: 0 auto 18px;
        border-radius: 28px;
        display: grid;
        place-items: center;
        background: color-mix(in srgb, var(--panel) 88%, transparent);
        border: 1px solid var(--line);
        backdrop-filter: blur(10px);
        box-shadow: 0 24px 80px rgba(0,0,0,0.12);
      }}
      .logo-card img {{ width: 54px; height: 54px; display: block; }}
      h1 {{
        margin: 0 0 8px;
        font-size: clamp(2rem, 5vw, 3rem);
        line-height: 1;
        letter-spacing: -0.04em;
      }}
      .sub {{
        margin: 0;
        color: var(--muted);
        font-size: 1.05rem;
      }}
      .card {{
        border-radius: 28px;
        border: 1px solid var(--line);
        background: var(--panel);
        backdrop-filter: blur(14px);
        padding: 28px;
        box-shadow: 0 24px 80px rgba(0,0,0,0.14);
      }}
      .row {{
        display: flex;
        gap: 10px;
        margin: 16px 0 0;
      }}
      .row button {{ flex: 1; }}
      @media (max-width: 640px) {{
        .row {{
          flex-direction: column;
        }}
      }}
      label {{
        display: block;
        font-weight: 700;
        margin: 18px 0 8px;
      }}
      input {{
        width: 100%;
        border-radius: 14px;
        border: 1px solid var(--line);
        background: rgba(255,255,255,0.7);
        color: inherit;
        padding: 14px 16px;
        font: inherit;
      }}
      @media (prefers-color-scheme: dark) {{
        input {{ background: rgba(18,16,13,0.82); }}
      }}
      button {{
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 16px 18px;
        font: inherit;
        font-weight: 800;
        cursor: pointer;
        transition: background-color 160ms ease, color 160ms ease, border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
      }}
      .primary,
      .secondary {{
        background: transparent;
        color: inherit;
      }}
      .primary:hover,
      .primary:focus-visible,
      .secondary:hover,
      .secondary:focus-visible {{
        background: var(--accent);
        border-color: var(--accent);
        color: white;
        box-shadow: 0 14px 32px rgba(255, 26, 26, 0.22);
        outline: none;
        transform: translateY(-1px);
      }}
      .ghost {{
        background: transparent;
        color: var(--muted);
        padding: 0;
        border: 0;
        border-radius: 0;
        font-weight: 700;
        text-decoration: underline;
        text-underline-offset: 0.2em;
      }}
      .body {{
        color: var(--muted);
        line-height: 1.5;
      }}
      .eyebrow {{
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 14px;
        padding: 8px 12px;
        border-radius: 999px;
        border: 1px solid var(--line);
        background: color-mix(in srgb, var(--panel) 78%, transparent);
        color: var(--muted);
        font-size: 0.92rem;
        font-weight: 700;
      }}
      .status {{
        margin-top: 16px;
        min-height: 22px;
        color: var(--muted);
      }}
      .error {{ color: #c0352b; }}
      .step {{ display: none; }}
      .step.active {{ display: block; }}
      .code {{
        margin-top: 14px;
        font-size: 2rem;
        font-weight: 900;
        letter-spacing: 0.35em;
        text-align: center;
        padding: 14px 16px;
        border: 1px dashed var(--line);
        border-radius: 18px;
      }}
      .code-grid {{
        display: grid;
        grid-template-columns: repeat(6, minmax(0, 1fr));
        gap: 10px;
        margin-top: 14px;
      }}
      .code-digit {{
        width: 100%;
        text-align: center;
        font-size: 1.9rem;
        font-weight: 900;
        letter-spacing: 0;
        padding: 16px 0;
        border-radius: 18px;
      }}
      .hint {{
        margin-top: 12px;
        color: var(--muted);
        font-size: 0.95rem;
      }}
      .section-title {{
        margin: 18px 0 6px;
        font-size: 1.1rem;
        font-weight: 800;
      }}
      .question {{
        margin: 8px 0 0;
        font-size: 1.25rem;
        font-weight: 800;
        text-align: center;
      }}
      .choice {{
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 6px;
        text-align: left;
      }}
      .choice strong {{
        font-size: 1rem;
      }}
      .choice span {{
        color: rgba(255,255,255,0.9);
        font-weight: 500;
        line-height: 1.35;
      }}
      .choice.secondary span {{
        color: var(--muted);
      }}
      .primary:hover span,
      .primary:focus-visible span,
      .secondary:hover span,
      .secondary:focus-visible span {{
        color: rgba(255,255,255,0.9);
      }}
      .link-row {{
        display: flex;
        justify-content: center;
        margin-top: 20px;
      }}
      .top-link {{
        margin-top: 18px;
      }}
    </style>
  </head>
  <body>
    <div class="shell">
      <div class="wrap">
        <div class="hero">
          <div class="logo-card"><img src="/static/op-logo-small.svg" alt="OpenPoster" /></div>
          <div class="eyebrow">OpenPoster Issuer</div>
          <h1>Welcome to OpenPoster!</h1>
          <p class="sub">Sign in or create your OpenPoster account to continue.</p>
        </div>

        <div class="card">
          <div id="home-step" class="step active">
            <p class="question">Do you already have an OpenPoster account?</p>
            <div class="row" style="margin-top:22px;">
              <button id="go-login" class="primary choice" type="button">
                <strong>Yes - Login using Passkey</strong>
                <span>Use the passkey you already created for your OpenPoster account.</span>
              </button>
              <button id="go-register" class="secondary choice secondary" type="button">
                <strong>No - Register now</strong>
                <span>Verify your email, then create your first OpenPoster passkey.</span>
              </button>
            </div>
            <div class="link-row">
              <button id="go-recovery" class="ghost" type="button">I can't access my Passkey</button>
            </div>
          </div>

          <div id="login-step" class="step">
            <div class="section-title">Login using your passkey</div>
            <div class="body" style="margin-top: 12px;">
              Use the passkey you already set up with OpenPoster. This is the quickest and safest way back into your account.
            </div>
            <div class="row" style="margin-top:18px;">
              <button id="login-passkey" class="primary" type="button">Yes - Login using Passkey</button>
            </div>
            <div class="link-row top-link">
              <button id="login-recovery-link" class="ghost" type="button">I can't access my Passkey</button>
            </div>
          </div>

          <div id="register-step" class="step">
            <div class="section-title">Create your OpenPoster account</div>
            <div class="body" style="margin-top: 18px;">
              We'll verify your email first, then help you create your passkey.
            </div>

            <div class="section-title">1. Verify your email</div>
            <label for="email">Email</label>
            <input id="email" type="email" autocomplete="email" />

            <div id="display-name-wrap">
              <div class="section-title">2. Choose your display name</div>
              <label for="display_name">Display name</label>
              <input id="display_name" autocomplete="name" />
            </div>

            <div class="row" style="margin-top:18px;">
              <button id="start-email" class="primary" type="button">Send code</button>
            </div>

            <div id="verify-wrap" style="display:none;">
              <label for="email_code">6-digit code</label>
              <div id="email_code_grid" class="code-grid" role="group" aria-label="Email verification code">
                <input class="code-digit" inputmode="numeric" pattern="[0-9]*" maxlength="1" autocomplete="one-time-code" aria-label="Verification code digit 1" />
                <input class="code-digit" inputmode="numeric" pattern="[0-9]*" maxlength="1" aria-label="Verification code digit 2" />
                <input class="code-digit" inputmode="numeric" pattern="[0-9]*" maxlength="1" aria-label="Verification code digit 3" />
                <input class="code-digit" inputmode="numeric" pattern="[0-9]*" maxlength="1" aria-label="Verification code digit 4" />
                <input class="code-digit" inputmode="numeric" pattern="[0-9]*" maxlength="1" aria-label="Verification code digit 5" />
                <input class="code-digit" inputmode="numeric" pattern="[0-9]*" maxlength="1" aria-label="Verification code digit 6" />
              </div>
              <div id="dev-code" class="code" style="display:none;"></div>
              <div class="row" style="margin-top:18px;">
                <button id="verify-email" class="primary" type="button">Verify email</button>
              </div>
            </div>

            <div id="passkey-wrap" style="display:none;">
              <div class="section-title">3. Create your passkey</div>
              <div class="body" style="margin-top: 18px;">
                Email verified. Now create a passkey to finish.
              </div>
              <div class="row" style="margin-top:18px;">
                <button id="create-passkey" class="primary" type="button">Create passkey</button>
              </div>
            </div>

            <div class="link-row top-link">
              <button id="register-back" class="ghost" type="button">Back</button>
            </div>
          </div>

          <div id="recovery-step" class="step">
            <div class="section-title">Recover access to your account</div>
            <div class="body" style="margin-top: 18px;">
              If you can't access your passkey anymore, verify your email and we'll let you create a new one.
            </div>

            <div class="section-title">1. Verify your email</div>
            <label for="recovery_email">Email</label>
            <input id="recovery_email" type="email" autocomplete="email" />

            <div class="row" style="margin-top:18px;">
              <button id="start-recovery-email" class="primary" type="button">Send code</button>
            </div>

            <div id="recovery-verify-wrap" style="display:none;">
              <label for="recovery_email_code">6-digit code</label>
              <div id="recovery_code_grid" class="code-grid" role="group" aria-label="Recovery verification code">
                <input class="recovery-code-digit code-digit" inputmode="numeric" pattern="[0-9]*" maxlength="1" autocomplete="one-time-code" aria-label="Recovery code digit 1" />
                <input class="recovery-code-digit code-digit" inputmode="numeric" pattern="[0-9]*" maxlength="1" aria-label="Recovery code digit 2" />
                <input class="recovery-code-digit code-digit" inputmode="numeric" pattern="[0-9]*" maxlength="1" aria-label="Recovery code digit 3" />
                <input class="recovery-code-digit code-digit" inputmode="numeric" pattern="[0-9]*" maxlength="1" aria-label="Recovery code digit 4" />
                <input class="recovery-code-digit code-digit" inputmode="numeric" pattern="[0-9]*" maxlength="1" aria-label="Recovery code digit 5" />
                <input class="recovery-code-digit code-digit" inputmode="numeric" pattern="[0-9]*" maxlength="1" aria-label="Recovery code digit 6" />
              </div>
              <div id="recovery-dev-code" class="code" style="display:none;"></div>
              <div class="row" style="margin-top:18px;">
                <button id="verify-recovery-email" class="primary" type="button">Verify email</button>
              </div>
            </div>

            <div id="recovery-passkey-wrap" style="display:none;">
              <div class="section-title">2. Create a new passkey</div>
              <div class="body" style="margin-top: 18px;">
                Your email is verified. Create a new passkey to recover access.
              </div>
              <div class="row" style="margin-top:18px;">
                <button id="create-recovery-passkey" class="primary" type="button">Create new passkey</button>
              </div>
            </div>

            <div class="link-row top-link">
              <button id="recovery-back" class="ghost" type="button">Back</button>
            </div>
          </div>

          <div id="status" class="status"></div>
        </div>
      </div>
    </div>

    <script>
      const returnTo = '{safe_return}';
      let mode = 'home';
      let proofToken = null;
      let recoveryProofToken = null;
      let accountExists = false;
      let recoveryAccountExists = true;
      const homeStep = document.getElementById('home-step');
      const loginStep = document.getElementById('login-step');
      const registerStep = document.getElementById('register-step');
      const recoveryStep = document.getElementById('recovery-step');
      const verifyWrap = document.getElementById('verify-wrap');
      const passkeyWrap = document.getElementById('passkey-wrap');
      const recoveryVerifyWrap = document.getElementById('recovery-verify-wrap');
      const recoveryPasskeyWrap = document.getElementById('recovery-passkey-wrap');
      const devCode = document.getElementById('dev-code');
      const recoveryDevCode = document.getElementById('recovery-dev-code');
      const statusEl = document.getElementById('status');
      const displayNameWrap = document.getElementById('display-name-wrap');
      const codeInputs = Array.from(document.querySelectorAll('#email_code_grid .code-digit'));
      const recoveryCodeInputs = Array.from(document.querySelectorAll('#recovery_code_grid .recovery-code-digit'));
      const apiBase = window.location.origin;

      function apiUrl(path) {{
        return new URL(path, apiBase).toString();
      }}

      function errorMessage(error, fallback) {{
        if (error instanceof TypeError && /fetch/i.test(error.message || '')) {{
          return 'We could not reach the issuer. Please check that OpenPoster is still running and try again.';
        }}
        if (error instanceof Error && error.message) {{
          return error.message;
        }}
        return fallback;
      }}

      function passkeyErrorMessage(error, fallback) {{
        if (!(error instanceof Error)) return fallback;
        if (error.name === 'NotAllowedError') {{
          return 'Passkey setup was cancelled. Please try again when you are ready.';
        }}
        if (error.name === 'InvalidStateError') {{
          return 'This passkey is already registered. Try logging in instead.';
        }}
        if (error.name === 'SecurityError') {{
          return 'Passkey setup needs a secure browser context. Try again from the OpenPoster issuer page on localhost.';
        }}
        if (error.name === 'TypeError') {{
          return 'Your browser could not start passkey setup with these options. I am adjusting this flow now.';
        }}
        return error.message || fallback;
      }}

      function compact(value) {{
        if (Array.isArray(value)) {{
          const out = value.map(compact).filter(item => item !== undefined);
          return out.length ? out : undefined;
        }}
        if (value && typeof value === 'object' && !(value instanceof Uint8Array)) {{
          const out = Object.fromEntries(
            Object.entries(value)
              .map(([key, val]) => [key, compact(val)])
              .filter(([, val]) => val !== undefined)
          );
          return Object.keys(out).length ? out : undefined;
        }}
        if (value === null || value === undefined) return undefined;
        return value;
      }}

      function currentCode(inputs) {{
        return inputs.map(input => input.value || '').join('');
      }}

      function focusCodeDigit(inputs, index) {{
        const bounded = Math.max(0, Math.min(index, inputs.length - 1));
        inputs[bounded]?.focus();
      }}

      function fillCode(inputs, text) {{
        const digits = (text || '').replace(/\\D/g, '').slice(0, inputs.length).split('');
        if (!digits.length) return;
        inputs.forEach((input, index) => {{
          input.value = digits[index] || '';
        }});
        focusCodeDigit(inputs, Math.min(digits.length, inputs.length - 1));
      }}

      function b64urlToBytes(base64url) {{
        const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
        const base64 = (base64url + pad).replace(/-/g, '+').replace(/_/g, '/');
        const binary = atob(base64);
        return Uint8Array.from(binary, c => c.charCodeAt(0));
      }}

      function bytesToB64url(bytes) {{
        const bin = Array.from(new Uint8Array(bytes), b => String.fromCharCode(b)).join('');
        return btoa(bin).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/g, '');
      }}

      function toPublicKeyOptions(options) {{
        const root = options.publicKey || options.public_key || options;
        const pk = {{
          ...root,
          pubKeyCredParams: root.pubKeyCredParams || root.pub_key_cred_params || [],
          excludeCredentials: root.excludeCredentials || root.exclude_credentials || undefined,
          allowCredentials: root.allowCredentials || root.allow_credentials || undefined,
          authenticatorSelection: root.authenticatorSelection || root.authenticator_selection || undefined,
          attestationFormats: root.attestationFormats || root.attestation_formats || undefined,
        }};
        if (pk.user) {{
          pk.user = {{
            ...pk.user,
            displayName: pk.user.displayName || pk.user.display_name || pk.user.name,
          }};
        }}
        if (pk.authenticatorSelection) {{
          pk.authenticatorSelection = {{
            ...pk.authenticatorSelection,
            authenticatorAttachment: pk.authenticatorSelection.authenticatorAttachment || pk.authenticatorSelection.authenticator_attachment || null,
            residentKey: pk.authenticatorSelection.residentKey || pk.authenticatorSelection.resident_key || null,
            userVerification: pk.authenticatorSelection.userVerification || pk.authenticatorSelection.user_verification || null,
            requireResidentKey: pk.authenticatorSelection.requireResidentKey ?? pk.authenticatorSelection.require_resident_key ?? false,
          }};
        }}
        if (pk.challenge) pk.challenge = b64urlToBytes(pk.challenge);
        if (pk.user?.id) pk.user.id = b64urlToBytes(pk.user.id);
        if (pk.excludeCredentials) {{
          pk.excludeCredentials = pk.excludeCredentials.map(c => ({{ ...c, id: b64urlToBytes(c.id) }}));
        }}
        if (pk.allowCredentials) {{
          pk.allowCredentials = pk.allowCredentials.map(c => ({{ ...c, id: b64urlToBytes(c.id) }}));
        }}
        return compact(pk);
      }}

      function setStep(next) {{
        mode = next;
        homeStep.className = next === 'home' ? 'step active' : 'step';
        loginStep.className = next === 'login' ? 'step active' : 'step';
        registerStep.className = next === 'register' ? 'step active' : 'step';
        recoveryStep.className = next === 'recovery' ? 'step active' : 'step';
        setStatus('');
      }}

      function setStatus(message, isError = false) {{
        statusEl.textContent = message || '';
        statusEl.className = isError ? 'status error' : 'status';
      }}

      async function finishAuth(json) {{
        const token = encodeURIComponent(json.token || '');
        const user = encodeURIComponent(JSON.stringify(json.user || null));
        window.location.href = `${{returnTo}}#issuer_token=${{token}}&issuer_user=${{user}}`;
      }}

      async function startEmail() {{
        setStatus('Sending your email code…');
        const email = document.getElementById('email').value.trim();
        try {{
          const r = await fetch('/v1/auth/email/start', {{
            method: 'POST',
            headers: {{ 'content-type': 'application/json' }},
            body: JSON.stringify({{ email }}),
          }});
          const json = await r.json().catch(() => null);
          if (!r.ok) {{
            const msg = json?.error?.message || 'email start failed';
            setStatus(msg, true);
            return;
          }}
          accountExists = !!json.account_exists;
          verifyWrap.style.display = 'block';
          codeInputs.forEach(input => {{ input.value = ''; }});
          devCode.style.display = json.dev_code ? 'block' : 'none';
          devCode.textContent = json.dev_code || '';
          displayNameWrap.style.display = json.account_exists ? 'none' : 'block';
          focusCodeDigit(codeInputs, 0);
          setStatus('Code sent. Enter the 6-digit code to continue.');
        }} catch (e) {{
          setStatus(errorMessage(e, 'email start failed'), true);
        }}
      }}

      async function verifyEmail() {{
        setStatus('Verifying code…');
        const email = document.getElementById('email').value.trim();
        const code = currentCode(codeInputs);
        if (code.length !== 6) {{
          setStatus('Enter all 6 digits to continue.', true);
          return;
        }}
        try {{
          const r = await fetch(apiUrl('/v1/auth/email/verify'), {{
            method: 'POST',
            headers: {{ 'content-type': 'application/json' }},
            body: JSON.stringify({{ email, code }}),
          }});
          const json = await r.json().catch(() => null);
          if (!r.ok) {{
            setStatus(json?.error?.message || 'verification failed', true);
            return;
          }}
          proofToken = json.proof_token;
          accountExists = !!json.account_exists;
          passkeyWrap.style.display = 'block';
          setStatus(accountExists ? 'Email verified. Create a new passkey to recover access.' : 'Email verified. Create your passkey.');
        }} catch (e) {{
          setStatus(errorMessage(e, 'verification failed'), true);
        }}
      }}

      async function startRecoveryEmail() {{
        setStatus('Sending your recovery code…');
        const email = document.getElementById('recovery_email').value.trim();
        try {{
          const r = await fetch(apiUrl('/v1/auth/email/start'), {{
            method: 'POST',
            headers: {{ 'content-type': 'application/json' }},
            body: JSON.stringify({{ email }}),
          }});
          const json = await r.json().catch(() => null);
          if (!r.ok) {{
            setStatus(json?.error?.message || 'email start failed', true);
            return;
          }}
          recoveryAccountExists = !!json.account_exists;
          recoveryVerifyWrap.style.display = 'block';
          recoveryCodeInputs.forEach(input => {{ input.value = ''; }});
          recoveryDevCode.style.display = json.dev_code ? 'block' : 'none';
          recoveryDevCode.textContent = json.dev_code || '';
          recoveryPasskeyWrap.style.display = 'none';
          focusCodeDigit(recoveryCodeInputs, 0);
          setStatus('Code sent. Enter the 6-digit code to continue.');
        }} catch (e) {{
          setStatus(errorMessage(e, 'email start failed'), true);
        }}
      }}

      async function verifyRecoveryEmail() {{
        setStatus('Verifying code…');
        const email = document.getElementById('recovery_email').value.trim();
        const code = currentCode(recoveryCodeInputs);
        if (code.length !== 6) {{
          setStatus('Enter all 6 digits to continue.', true);
          return;
        }}
        try {{
          const r = await fetch(apiUrl('/v1/auth/email/verify'), {{
            method: 'POST',
            headers: {{ 'content-type': 'application/json' }},
            body: JSON.stringify({{ email, code }}),
          }});
          const json = await r.json().catch(() => null);
          if (!r.ok) {{
            setStatus(json?.error?.message || 'verification failed', true);
            return;
          }}
          recoveryProofToken = json.proof_token;
          recoveryAccountExists = !!json.account_exists;
          if (!recoveryAccountExists) {{
            setStatus('We could not find an account for that email. Choose "Register now" instead.', true);
            return;
          }}
          recoveryPasskeyWrap.style.display = 'block';
          setStatus('Email verified. Create a new passkey to recover access.');
        }} catch (e) {{
          setStatus(errorMessage(e, 'verification failed'), true);
        }}
      }}

      async function createPasskey() {{
        setStatus(accountExists ? 'Creating your new passkey…' : 'Creating your passkey…');
        const displayName = document.getElementById('display_name').value.trim();
        try {{
          const begin = await fetch(apiUrl('/v1/auth/passkeys/register/begin'), {{
            method: 'POST',
            headers: {{ 'content-type': 'application/json' }},
            body: JSON.stringify({{ proof_token: proofToken, display_name: displayName || null }}),
          }});
          const beginJson = await begin.json().catch(() => null);
          if (!begin.ok) {{
            setStatus(beginJson?.error?.message || 'passkey registration failed', true);
            return;
          }}
          let credential;
          try {{
            credential = await navigator.credentials.create({{
              publicKey: toPublicKeyOptions(beginJson.options),
            }});
          }} catch (e) {{
            setStatus(passkeyErrorMessage(e, 'passkey registration failed'), true);
            return;
          }}
          if (!credential) {{
            setStatus('Passkey creation was cancelled.', true);
            return;
          }}
          const response = credential.response;
          const complete = await fetch(apiUrl('/v1/auth/passkeys/register/complete'), {{
            method: 'POST',
            headers: {{ 'content-type': 'application/json' }},
            body: JSON.stringify({{
              proof_token: proofToken,
              challenge_id: beginJson.challenge_id,
              display_name: displayName || null,
              credential: {{
                id: credential.id,
                rawId: bytesToB64url(credential.rawId),
                type: credential.type,
                response: {{
                  clientDataJSON: bytesToB64url(response.clientDataJSON),
                  attestationObject: bytesToB64url(response.attestationObject),
                }},
              }},
            }}),
          }});
          const completeJson = await complete.json().catch(() => null);
          if (!complete.ok) {{
            setStatus(completeJson?.error?.message || 'passkey registration failed', true);
            return;
          }}
          await finishAuth(completeJson);
        }} catch (e) {{
          setStatus(errorMessage(e, 'passkey registration failed'), true);
        }}
      }}

      async function createRecoveryPasskey() {{
        setStatus('Creating your new passkey…');
        const email = document.getElementById('recovery_email').value.trim();
        try {{
          const begin = await fetch(apiUrl('/v1/auth/passkeys/register/begin'), {{
            method: 'POST',
            headers: {{ 'content-type': 'application/json' }},
            body: JSON.stringify({{ proof_token: recoveryProofToken, display_name: email }}),
          }});
          const beginJson = await begin.json().catch(() => null);
          if (!begin.ok) {{
            setStatus(beginJson?.error?.message || 'passkey registration failed', true);
            return;
          }}
          let credential;
          try {{
            credential = await navigator.credentials.create({{
              publicKey: toPublicKeyOptions(beginJson.options),
            }});
          }} catch (e) {{
            setStatus(passkeyErrorMessage(e, 'passkey registration failed'), true);
            return;
          }}
          if (!credential) {{
            setStatus('Passkey creation was cancelled.', true);
            return;
          }}
          const response = credential.response;
          const complete = await fetch(apiUrl('/v1/auth/passkeys/register/complete'), {{
            method: 'POST',
            headers: {{ 'content-type': 'application/json' }},
            body: JSON.stringify({{
              proof_token: recoveryProofToken,
              challenge_id: beginJson.challenge_id,
              display_name: email,
              credential: {{
                id: credential.id,
                rawId: bytesToB64url(credential.rawId),
                type: credential.type,
                response: {{
                  clientDataJSON: bytesToB64url(response.clientDataJSON),
                  attestationObject: bytesToB64url(response.attestationObject),
                }},
              }},
            }}),
          }});
          const completeJson = await complete.json().catch(() => null);
          if (!complete.ok) {{
            setStatus(completeJson?.error?.message || 'passkey registration failed', true);
            return;
          }}
          await finishAuth(completeJson);
        }} catch (e) {{
          setStatus(errorMessage(e, 'passkey registration failed'), true);
        }}
      }}

      async function loginWithPasskey() {{
        setStatus('Waiting for your passkey…');
        try {{
          const begin = await fetch(apiUrl('/v1/auth/passkeys/login/begin'), {{
            method: 'POST',
            headers: {{ 'content-type': 'application/json' }},
            body: JSON.stringify({{}}),
          }});
          const beginJson = await begin.json().catch(() => null);
          if (!begin.ok) {{
            setStatus(beginJson?.error?.message || 'passkey login failed', true);
            return;
          }}
          const assertion = await navigator.credentials.get({{
            publicKey: toPublicKeyOptions(beginJson.options),
          }});
          if (!assertion) {{
            setStatus('Passkey sign-in was cancelled.', true);
            return;
          }}
          const response = assertion.response;
          const complete = await fetch(apiUrl('/v1/auth/passkeys/login/complete'), {{
            method: 'POST',
            headers: {{ 'content-type': 'application/json' }},
            body: JSON.stringify({{
              challenge_id: beginJson.challenge_id,
              credential: {{
                id: assertion.id,
                rawId: bytesToB64url(assertion.rawId),
                type: assertion.type,
                response: {{
                  clientDataJSON: bytesToB64url(response.clientDataJSON),
                  authenticatorData: bytesToB64url(response.authenticatorData),
                  signature: bytesToB64url(response.signature),
                  userHandle: response.userHandle ? bytesToB64url(response.userHandle) : null,
                }},
              }},
            }}),
          }});
          const completeJson = await complete.json().catch(() => null);
          if (!complete.ok) {{
            setStatus(completeJson?.error?.message || 'passkey login failed', true);
            return;
          }}
          await finishAuth(completeJson);
        }} catch (e) {{
          setStatus(errorMessage(e, 'passkey login failed'), true);
        }}
      }}

      document.getElementById('go-login').addEventListener('click', () => setStep('login'));
      document.getElementById('go-register').addEventListener('click', () => setStep('register'));
      document.getElementById('go-recovery').addEventListener('click', () => setStep('recovery'));
      document.getElementById('login-recovery-link').addEventListener('click', () => setStep('recovery'));
      document.getElementById('register-back').addEventListener('click', () => setStep('home'));
      document.getElementById('recovery-back').addEventListener('click', () => setStep('home'));
      document.getElementById('start-email').addEventListener('click', startEmail);
      document.getElementById('verify-email').addEventListener('click', verifyEmail);
      document.getElementById('create-passkey').addEventListener('click', createPasskey);
      document.getElementById('start-recovery-email').addEventListener('click', startRecoveryEmail);
      document.getElementById('verify-recovery-email').addEventListener('click', verifyRecoveryEmail);
      document.getElementById('create-recovery-passkey').addEventListener('click', createRecoveryPasskey);
      document.getElementById('login-passkey').addEventListener('click', loginWithPasskey);
      function wireCodeInputs(inputs, onEnter) {{
        inputs.forEach((input, index) => {{
          input.addEventListener('input', (event) => {{
            const nextValue = (event.target.value || '').replace(/\\D/g, '').slice(-1);
            event.target.value = nextValue;
            if (nextValue && index < inputs.length - 1) focusCodeDigit(inputs, index + 1);
          }});
          input.addEventListener('keydown', (event) => {{
            if (event.key === 'Backspace') {{
              if (input.value) {{
                input.value = '';
                event.preventDefault();
                return;
              }}
              if (index > 0) {{
                event.preventDefault();
                focusCodeDigit(inputs, index - 1);
              }}
            }}
            if (event.key === 'ArrowLeft') {{
              event.preventDefault();
              focusCodeDigit(inputs, index - 1);
            }}
            if (event.key === 'ArrowRight') {{
              event.preventDefault();
              focusCodeDigit(inputs, index + 1);
            }}
            if (event.key === 'Enter' && currentCode(inputs).length === 6) {{
              event.preventDefault();
              void onEnter();
            }}
          }});
          input.addEventListener('paste', (event) => {{
            event.preventDefault();
            fillCode(inputs, event.clipboardData.getData('text'));
          }});
        }});
      }}
      wireCodeInputs(codeInputs, verifyEmail);
      wireCodeInputs(recoveryCodeInputs, verifyRecoveryEmail);
      setStep('home');
    </script>
  </body>
</html>"""
    return HTMLResponse(html)
