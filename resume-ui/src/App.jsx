import React, { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { DataFormDispatcher, ProfileManager } from './DataForms';
import {
  buildAuthedApiUrl,
  clearStoredSession,
  getBrowserSupabaseClient,
  installApiFetchInterceptor,
  setStoredSession
} from './auth';
import './index.css';

const setupMonaco = (monaco) => {
  if (!monaco.languages.getLanguages().some(({ id }) => id === 'latex')) {
    monaco.languages.register({ id: 'latex' });
    monaco.languages.setMonarchTokensProvider('latex', {
      tokenizer: {
        root: [
          [/%.*/, 'comment'],
          [/\\begin\{[a-zA-Z0-9_*-]+\}/, 'keyword'],
          [/\\end\{[a-zA-Z0-9_*-]+\}/, 'keyword'],
          [/\\[a-zA-Z@*]+/, 'keyword'],
          [/[{}[\]]/, 'delimiter'],
          [/\$[^$]*\$/, 'string'],
        ]
      }
    });
  }
};

function LoadingScreen({ label }) {
  return (
    <div className="app-container" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="glass-panel" style={{ maxWidth: '520px', margin: 0, textAlign: 'center' }}>
        <h2 className="panel-title" style={{ marginBottom: '0.75rem' }}>Resume Builder Studio</h2>
        <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          {label || 'Loading workspace...'}
        </p>
      </div>
    </div>
  );
}

function WorkspaceErrorScreen({ message, onRetry }) {
  return (
    <div className="app-container" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
      <div className="glass-panel" style={{ maxWidth: '540px', width: '100%', margin: 0 }}>
        <div className="soft-pill" style={{ marginBottom: '1rem', alignSelf: 'flex-start' }}>Workspace setup issue</div>
        <h2 className="panel-title" style={{ marginBottom: '0.75rem' }}>We couldn&apos;t prepare your account yet</h2>
        <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          {message || 'The backend did not finish initializing your workspace. Try again and we’ll retry the bootstrap step.'}
        </p>
        <div className="action-row" style={{ justifyContent: 'flex-start', marginTop: '1.25rem', marginBottom: 0 }}>
          <button className="primary-button" onClick={onRetry}>Retry setup</button>
        </div>
      </div>
    </div>
  );
}

function AuthGate({ supabaseClient }) {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      setStatus('Email and password are both required.');
      return;
    }

    if (!supabaseClient) {
      setStatus('Supabase is not configured correctly yet.');
      return;
    }

    setIsSubmitting(true);
    setStatus(mode === 'signin' ? 'Signing you in...' : 'Creating your account...');

    try {
      const response = mode === 'signin'
        ? await supabaseClient.auth.signInWithPassword({ email: email.trim(), password })
        : await supabaseClient.auth.signUp({ email: email.trim(), password });

      if (response.error) throw response.error;
      if (response.data?.session) {
        setStoredSession(response.data.session);
      }

      setStatus(
        mode === 'signin'
          ? 'Signed in successfully.'
          : 'Account created. If email confirmation is enabled in Supabase, confirm your email before signing in.'
      );
    } catch (error) {
      setStatus(error.message || 'Authentication failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="app-container" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '1.5rem' }}>
      <div className="glass-panel" style={{ maxWidth: '1040px', width: '100%', margin: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(320px, 460px)', gap: '1.5rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', justifyContent: 'center' }}>
          <div className="soft-pill" style={{ alignSelf: 'flex-start' }}>Secure multi-user workspace</div>
          <h1 className="panel-title" style={{ margin: 0, fontSize: '2.4rem', lineHeight: 1.1 }}>Sign in, initialize your account, then step into onboarding.</h1>
          <p style={{ color: 'var(--text-secondary)', margin: 0, lineHeight: 1.7, maxWidth: '60ch' }}>
            Your Supabase account is now the front door. After sign-in, the backend provisions your private workspace, creates your database-backed resume documents, and then takes you straight into onboarding if anything still needs to be filled in.
          </p>
          <div style={{ display: 'grid', gap: '0.8rem', marginTop: '0.25rem' }}>
            {[
              '1. Authenticate with Supabase using email and password.',
              '2. Initialize your private settings and empty resume documents in the backend.',
              '3. Continue into onboarding, then unlock the full app.'
            ].map((step) => (
              <div key={step} className="surface-block" style={{ padding: '0.9rem 1rem' }}>
                {step}
              </div>
            ))}
          </div>
        </div>

        <div className="surface-block" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', justifyContent: 'center' }}>
          <div>
            <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Account access</div>
            <h2 className="panel-title" style={{ marginBottom: '0.75rem' }}>{mode === 'signin' ? 'Sign in to continue' : 'Create your account'}</h2>
            <p style={{ color: 'var(--text-secondary)', marginTop: 0, lineHeight: 1.6 }}>
              Use the same email each time so your generated resumes, tracker history, and profile data stay attached to one workspace.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              className={mode === 'signin' ? 'primary-button' : 'secondary-button'}
              onClick={() => setMode('signin')}
              style={{ flex: 1 }}
            >
              Sign In
            </button>
            <button
              className={mode === 'signup' ? 'primary-button' : 'secondary-button'}
              onClick={() => setMode('signup')}
              style={{ flex: 1 }}
            >
              Create Account
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              autoComplete="email"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            />
            <button className="primary-button" onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? 'Working...' : (mode === 'signin' ? 'Sign In' : 'Create Account')}
            </button>
          </div>

          {status && (
            <div className={`status-banner ${status.toLowerCase().includes('success') || status.toLowerCase().includes('confirm') ? 'info' : 'warning'}`}>
              {status}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function App() {
  const [appConfig, setAppConfig] = useState(null);
  const [supabaseClient, setSupabaseClient] = useState(null);
  const [authState, setAuthState] = useState({
    ready: false,
    user: null
  });
  const [workspaceState, setWorkspaceState] = useState({
    loading: true,
    error: '',
    refreshToken: 0
  });
  const [activeTab, setActiveTab] = useState('generator');
  const [onboardingState, setOnboardingState] = useState({
    loading: true,
    needsOnboarding: false,
    fileStatuses: [],
    settings: { provider: 'google', selectedModel: 'gemini-2.5-flash-lite', dailyApplicationGoal: 5 },
    models: [],
    providers: [],
    pdflatex: { installed: false, version: '' }
  });
  const [generatorState, setGeneratorState] = useState({
    jd: '',
    template: 'Software_Gen.tex',
    templatesList: ['Software_Gen.tex', 'Hardware_Gen.tex', 'DA_Gen.tex'],
    output: null,
    pdfs: [],
    metrics: null,
    coverLetter: '',
    isGenerating: false,
    pdfOpen: false,
    clOpen: false,
    hasGeneratedResume: false
  });

  useEffect(() => {
    let cancelled = false;
    let authSubscription = null;

    fetch('/api/app-config')
      .then((res) => res.json())
      .then(async (data) => {
        if (cancelled) return;
        setAppConfig(data);

        if (!data?.authEnabled) {
          setAuthState({ ready: true, user: null });
          return;
        }

        installApiFetchInterceptor();
        const client = getBrowserSupabaseClient(data.supabase);
        setSupabaseClient(client);

        const sessionResult = await client.auth.getSession();
        if (cancelled) return;
        const session = sessionResult.data?.session || null;
        setStoredSession(session);
        setAuthState({
          ready: true,
          user: session?.user || null
        });

        const authResult = client.auth.onAuthStateChange((_event, nextSession) => {
          setStoredSession(nextSession);
          setAuthState({
            ready: true,
            user: nextSession?.user || null
          });
        });
        authSubscription = authResult.data.subscription;
      })
      .catch(() => {
        if (cancelled) return;
        setAuthState({ ready: true, user: null });
      });

    return () => {
      cancelled = true;
      authSubscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const canLoadWorkspace = appConfig && authState.ready && (!appConfig.authEnabled || authState.user);
    if (!canLoadWorkspace) return;
    let cancelled = false;
    const endpoint = appConfig.authEnabled ? '/api/workspace-bootstrap' : '/api/onboarding-status';
    const requestInit = appConfig.authEnabled ? { method: 'POST' } : undefined;

    setWorkspaceState((prev) => ({ ...prev, loading: true, error: '' }));
    setOnboardingState((prev) => ({ ...prev, loading: true }));

    fetch(endpoint, requestInit)
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        const onboardingPayload = appConfig.authEnabled ? data.onboarding : data;
        setOnboardingState({
          loading: false,
          needsOnboarding: !!onboardingPayload?.needsOnboarding,
          fileStatuses: onboardingPayload?.fileStatuses || [],
          settings: onboardingPayload?.settings || { provider: 'google', selectedModel: 'gemini-2.5-flash-lite', dailyApplicationGoal: 5 },
          models: onboardingPayload?.models || [],
          providers: onboardingPayload?.providers || [],
          pdflatex: onboardingPayload?.pdflatex || { installed: false, version: '' }
        });
        setWorkspaceState((prev) => ({ ...prev, loading: false, error: '' }));
      })
      .catch((error) => {
        if (cancelled) return;
        setOnboardingState((prev) => ({ ...prev, loading: false }));
        setWorkspaceState((prev) => ({
          ...prev,
          loading: false,
          error: error?.message || 'Failed to prepare your workspace.'
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [appConfig, authState.ready, authState.user, workspaceState.refreshToken]);

  if (!appConfig || !authState.ready) {
    return <LoadingScreen label="Loading production-ready workspace..." />;
  }

  if (appConfig.authEnabled && !authState.user) {
    return <AuthGate supabaseClient={supabaseClient} />;
  }

  if (workspaceState.loading) {
    return <LoadingScreen label="Preparing your workspace and checking onboarding..." />;
  }

  if (workspaceState.error) {
    return (
      <WorkspaceErrorScreen
        message={workspaceState.error}
        onRetry={() => setWorkspaceState((prev) => ({ ...prev, refreshToken: prev.refreshToken + 1 }))}
      />
    );
  }

  const handleSignOut = async () => {
    if (!supabaseClient) return;
    await supabaseClient.auth.signOut();
    clearStoredSession();
  };

  return (
    <div className="app-container">
      <header className="header">
        <h1>Resume Builder Studio</h1>
        <div style={{display: 'flex', alignItems: 'center', gap: '0.75rem'}}>
          <div style={{color: 'var(--text-secondary)', fontSize: '0.875rem'}}>AI-Powered LaTeX Generation</div>
          {appConfig.authEnabled && authState.user?.email && (
            <div className="soft-pill">{authState.user.email}</div>
          )}
          <button
            className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => setActiveTab('profile')}
            style={{padding: '0.55rem 0.9rem', border: '1px solid rgba(255,255,255,0.08)'}}
          >
            🛠️ Profile & AI
          </button>
          {appConfig.authEnabled && (
            <button
              className="secondary-button"
              onClick={handleSignOut}
              style={{padding: '0.55rem 0.9rem'}}
            >
              Sign Out
            </button>
          )}
        </div>
      </header>
      
      <main className="main-content">
        <aside className="sidebar">
          <div 
            className={`nav-item ${activeTab === 'generator' ? 'active' : ''}`}
            onClick={() => setActiveTab('generator')}
          >
            ⚡ AI Generator
          </div>
          <div 
            className={`nav-item ${activeTab === 'data' ? 'active' : ''}`}
            onClick={() => setActiveTab('data')}
          >
            📁 Data Management
          </div>
          <div 
            className={`nav-item ${activeTab === 'templates' ? 'active' : ''}`}
            onClick={() => setActiveTab('templates')}
          >
            📄 Wireframe Templates
          </div>
          <div 
            className={`nav-item ${activeTab === 'generic' ? 'active' : ''}`}
            onClick={() => setActiveTab('generic')}
          >
            📝 Generic Resumes
          </div>
          <div 
            className={`nav-item ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            📜 History & Edit
          </div>
          <div 
            className={`nav-item ${activeTab === 'tracker' ? 'active' : ''}`}
            onClick={() => setActiveTab('tracker')}
          >
            🎯 Apply Tracker
          </div>
        </aside>
        
        {activeTab === 'generator' && <GeneratorView state={generatorState} setState={setGeneratorState} appConfig={appConfig} />}
        {activeTab === 'profile' && <ProfileSettingsView appConfig={appConfig} />}
        {activeTab === 'data' && <DataManagementView />}
        {activeTab === 'templates' && <TemplatesView type="wireframes" />}
        {activeTab === 'generic' && <TemplatesView type="generic" />}
        {activeTab === 'history' && <HistoryView appConfig={appConfig} />}
        {activeTab === 'tracker' && <ApplicationsView />}
        
      </main>

      <footer className="app-footer">
        <span>Created with <span className="app-footer-heart">♥</span> by Alexmercel</span>
        <a href="https://www.linkedin.com/in/jaishah9" target="_blank" rel="noreferrer">LinkedIn</a>
        <a href="https://github.com/alexmercel/" target="_blank" rel="noreferrer">GitHub</a>
      </footer>

      {!onboardingState.loading && onboardingState.needsOnboarding && (
        <OnboardingOverlay
          appConfig={appConfig}
          onboardingState={onboardingState}
          onComplete={() => {
            setOnboardingState((prev) => ({ ...prev, needsOnboarding: false }));
            setActiveTab('profile');
          }}
        />
      )}
    </div>
  );
}

function getCompilerModeLabel(compilerMode) {
  return compilerMode === 'remote' ? 'Remote Compiler' : 'Worker Mode';
}

function LatexInstallHelp({ pdflatexStatus, requiresLocalPdflatex = true, compilerMode = 'worker' }) {
  return (
    <div className="surface-block" style={{padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.55rem'}}>
      <div style={{display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center'}}>
        <div style={{fontWeight: 700}}>LaTeX / PDF Engine</div>
        <span className={`soft-pill ${pdflatexStatus.installed || !requiresLocalPdflatex ? 'success' : ''}`}>
          {requiresLocalPdflatex ? (pdflatexStatus.installed ? 'Installed' : 'Missing') : getCompilerModeLabel(compilerMode)}
        </span>
      </div>
      {!requiresLocalPdflatex && (
        <>
          <div style={{color: 'var(--text-secondary)', lineHeight: 1.6}}>
            {compilerMode === 'remote'
              ? 'PDF compilation is routed through the managed remote LaTeX compiler in production mode.'
              : 'PDF compilation is routed to the dedicated LaTeX worker in production mode.'}
          </div>
          <div style={{color: 'var(--text-secondary)', lineHeight: 1.6}}>
            This web app does not need a local <code>pdflatex</code> installation when {compilerMode === 'remote' ? 'remote compiler mode' : 'worker mode'} is enabled.
          </div>
        </>
      )}
      {requiresLocalPdflatex && pdflatexStatus.installed && (
        <div style={{color: 'var(--text-secondary)', lineHeight: 1.6}}>
          {pdflatexStatus.version || 'pdflatex detected on this machine.'}
        </div>
      )}
      {requiresLocalPdflatex && !pdflatexStatus.installed && (
        <>
          <div style={{color: 'var(--text-secondary)', lineHeight: 1.6}}>
            PDF generation needs <code>pdflatex</code> installed and available in PATH.
          </div>
          <div style={{color: 'var(--text-secondary)', lineHeight: 1.6}}>
            Complete the LaTeX setup during onboarding, then reopen the app if needed.
          </div>
        </>
      )}
    </div>
  );
}

function LatexSetupWizard({ pdflatexStatus, requiresLocalPdflatex = true, compilerMode = 'worker' }) {
  const [platformInfo, setPlatformInfo] = useState({
    label: 'Your system',
    recommendedDistribution: 'MiKTeX or TeX Live',
    installUrl: '',
    alternateUrl: '',
    installSteps: []
  });
  const [packages, setPackages] = useState([]);
  const [checkState, setCheckState] = useState({ status: '', output: '', success: false });

  useEffect(() => {
    fetch('/api/system-check')
      .then(res => res.json())
      .then(data => {
        if (data.platform) setPlatformInfo(data.platform);
        if (data.packages) setPackages(data.packages);
      })
      .catch(() => {});
  }, []);

  const runReadinessCheck = () => {
    if (!requiresLocalPdflatex) {
      setCheckState({
        status: compilerMode === 'remote'
          ? 'Remote compiler mode is enabled. Validate the external compile service and Blob storage instead of this local machine.'
          : 'Worker mode is enabled. Run the readiness check inside the LaTeX worker image or container instead.',
        output: '',
        success: true
      });
      return;
    }
    setCheckState({ status: 'Running readiness check...', output: '', success: false });
    fetch('/api/latex-setup-check', { method: 'POST' })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'LaTeX readiness check failed.');
        setCheckState({
          status: 'LaTeX setup is ready for this app.',
          output: data.output || '',
          success: true
        });
      })
      .catch((error) => {
        setCheckState({
          status: error.message || 'LaTeX readiness check failed.',
          output: '',
          success: false
        });
      });
  };

  return (
    <div className="surface-block latex-setup-card" style={{padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem'}}>
      <div style={{display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center'}}>
        <div style={{fontWeight: 700}}>LaTeX / PDF Engine</div>
        <span className={`soft-pill ${pdflatexStatus.installed || !requiresLocalPdflatex ? 'success' : ''}`}>
          {requiresLocalPdflatex ? (pdflatexStatus.installed ? 'Installed' : 'Missing') : getCompilerModeLabel(compilerMode)}
        </span>
      </div>
      <div className="latex-setup-grid">
        <div className="surface-block latex-setup-panel">
          <div className="latex-setup-eyebrow">Recommended setup</div>
          <div style={{fontWeight: 700, marginTop: '0.25rem'}}>{platformInfo.label}: {platformInfo.recommendedDistribution}</div>
          <div style={{color: 'var(--text-secondary)', marginTop: '0.6rem', lineHeight: 1.6}}>
            Use the official installer for your OS, then reopen the app and run the readiness check.
          </div>
          <div className="action-row" style={{justifyContent: 'flex-start', marginTop: '0.9rem', marginBottom: 0}}>
            {platformInfo.installUrl && (
              <a className="secondary-button" href={platformInfo.installUrl} target="_blank" rel="noreferrer">
                Open Installer
              </a>
            )}
            {platformInfo.alternateUrl && (
              <a className="secondary-button" href={platformInfo.alternateUrl} target="_blank" rel="noreferrer">
                Alternate Option
              </a>
            )}
          </div>
        </div>

        <div className="surface-block latex-setup-panel">
          <div className="latex-setup-eyebrow">Template packages</div>
          <div style={{color: 'var(--text-secondary)', marginTop: '0.35rem', lineHeight: 1.6}}>
            The wizard checks the package set your resume templates actually use.
          </div>
          <div className="generator-chip-wrap" style={{marginTop: '0.75rem'}}>
            {packages.length
              ? packages.map((pkg) => <span key={pkg} className="generator-chip">{pkg}</span>)
              : <span className="generator-chip">No packages detected</span>}
          </div>
        </div>
      </div>
      {!requiresLocalPdflatex && (
        <div style={{color: 'var(--text-secondary)', lineHeight: 1.6}}>
          {compilerMode === 'remote'
            ? 'This environment is configured to offload PDF compilation to the remote compiler service. The installer links and readiness check are only needed for local inline compilation environments.'
            : 'This environment is configured to offload PDF compilation to the LaTeX worker. The installer links and readiness check are only needed for the worker image or any machine that runs the worker process.'}
        </div>
      )}
      {requiresLocalPdflatex && pdflatexStatus.installed && (
        <div style={{color: 'var(--text-secondary)', lineHeight: 1.6}}>
          {pdflatexStatus.version || 'pdflatex detected on this machine.'}
        </div>
      )}
      {requiresLocalPdflatex && !pdflatexStatus.installed && (
        <>
          <div style={{color: 'var(--text-secondary)', lineHeight: 1.6}}>
            PDF generation needs <code>pdflatex</code> installed and available in PATH.
          </div>
          <div className="latex-setup-steps">
            {platformInfo.installSteps.map((step) => (
              <div key={step} className="latex-setup-step">{step}</div>
            ))}
          </div>
        </>
      )}
      <div className="action-row" style={{justifyContent: 'flex-start', marginBottom: 0}}>
        <button className="primary-button" onClick={runReadinessCheck}>
          {requiresLocalPdflatex ? 'Run Readiness Check' : (compilerMode === 'remote' ? 'How To Validate Remote Mode' : 'How To Validate Worker')}
        </button>
      </div>
      {checkState.status && (
        <div className={`status-banner ${checkState.success ? 'info' : 'warning'}`}>
          {checkState.status}
          {checkState.output ? ` ${checkState.output}` : ''}
        </div>
      )}
    </div>
  );
}

function OnboardingOverlay({ appConfig, onboardingState, onComplete }) {
  const [provider, setProvider] = useState(onboardingState.settings?.provider || 'google');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(onboardingState.settings?.selectedModel || 'gemini-2.5-flash-lite');
  const [availableModels, setAvailableModels] = useState(onboardingState.models?.length ? onboardingState.models : [
    'gemini-3.1-flash-lite-preview',
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite'
  ]);
  const [resumeFile, setResumeFile] = useState(null);
  const [status, setStatus] = useState('');
  const [result, setResult] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const providerOptions = onboardingState.providers?.length ? onboardingState.providers : (appConfig?.providers || []);
  const missingFiles = onboardingState.fileStatuses.filter((file) => !file.exists || !file.hasContent);
  const pdflatex = onboardingState.pdflatex || { installed: false, version: '' };
  const providerLabel = providerOptions.find((item) => item.id === provider)?.name || 'Provider';
  const requiresLocalPdflatex = appConfig?.latex?.requiresLocalPdflatex !== false;

  useEffect(() => {
    const isInitialProvider = provider === onboardingState.settings?.provider;
    if (isInitialProvider && onboardingState.models?.length) {
      setAvailableModels(onboardingState.models);
      if (!onboardingState.models.includes(model)) {
        setModel(onboardingState.models[0]);
      }
      return;
    }

    fetch(`/api/models?provider=${provider}`)
      .then((res) => res.json())
      .then((data) => {
        const nextModels = data.models?.length ? data.models : [];
        if (!nextModels.length) return;
        setAvailableModels(nextModels);
        if (!nextModels.includes(model)) {
          setModel(nextModels[0]);
        }
      })
      .catch(() => {});
  }, [provider]);

  const handleImport = () => {
    if (!resumeFile) {
      setStatus('Upload a resume file to continue.');
      return;
    }

    setIsImporting(true);
    setStatus('Parsing resume and creating your workspace...');
    setResult(null);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64Data = String(reader.result || '').split(',')[1] || '';
        const res = await fetch('/api/onboarding-import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider,
            providerApiKey: apiKey,
            selectedModel: model,
            fileName: resumeFile.name,
            mimeType: resumeFile.type || 'application/pdf',
            base64Data
          })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Onboarding import failed.');
        setResult(data);
        setStatus('Setup complete. Review the checklist and start using the app.');
      } catch (error) {
        setStatus(error.message || 'Onboarding import failed.');
      } finally {
        setIsImporting(false);
      }
    };
    reader.onerror = () => {
      setIsImporting(false);
      setStatus('Failed to read the uploaded resume file.');
    };
    reader.readAsDataURL(resumeFile);
  };

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-shell modal-shell">
        <div style={{display: 'flex', flexDirection: 'column', gap: '0.75rem'}}>
          <div className="soft-pill" style={{alignSelf: 'flex-start'}}>Initial setup required</div>
          <h2 style={{margin: 0, fontSize: '2rem'}}>Set up your resume workspace</h2>
          <p style={{margin: 0, color: 'var(--text-secondary)', lineHeight: 1.6}}>
            Some required data files are missing or empty. Upload an existing resume and we&apos;ll extract whatever we can into the app&apos;s markdown format so you can keep editing later from Data Management or Profile & AI.
          </p>
        </div>

        <div className="onboarding-grid">
          <div className="surface-block" style={{padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem'}}>
            <div>
              <div style={{fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', marginBottom: '0.5rem'}}>Required files</div>
              <div style={{display: 'flex', flexWrap: 'wrap', gap: '0.5rem'}}>
                {missingFiles.map((file) => (
                  <span key={file.fileName} className="generator-chip">{file.fileName}</span>
                ))}
              </div>
            </div>

            <div style={{display: 'flex', flexDirection: 'column', gap: '0.35rem'}}>
              <label style={{fontSize: '0.875rem', color: 'var(--text-secondary)', fontWeight: 'bold'}}>Provider</label>
              <select value={provider} onChange={(e) => setProvider(e.target.value)}>
                {providerOptions.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </div>

            <div style={{display: 'flex', flexDirection: 'column', gap: '0.35rem'}}>
              <label style={{fontSize: '0.875rem', color: 'var(--text-secondary)', fontWeight: 'bold'}}>{providerLabel} API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={`Optional if ${providerLabel} is already configured on the server`}
              />
            </div>

            <div style={{display: 'flex', flexDirection: 'column', gap: '0.35rem'}}>
              <label style={{fontSize: '0.875rem', color: 'var(--text-secondary)', fontWeight: 'bold'}}>{providerLabel} Model</label>
              <select value={model} onChange={(e) => setModel(e.target.value)}>
                {availableModels.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>

            <div style={{display: 'flex', flexDirection: 'column', gap: '0.35rem'}}>
              <label style={{fontSize: '0.875rem', color: 'var(--text-secondary)', fontWeight: 'bold'}}>Upload Resume</label>
              <input type="file" accept=".pdf,.txt,.md,.doc,.docx" onChange={(e) => setResumeFile(e.target.files?.[0] || null)} />
              <div style={{color: 'var(--text-secondary)', fontSize: '0.8rem'}}>
                PDF works best. We&apos;ll extract profile details, education, projects, skills, and work experience where possible.
              </div>
            </div>

            <div className="action-row" style={{justifyContent: 'flex-start', marginBottom: 0}}>
              <button className="primary-button" onClick={handleImport} disabled={isImporting}>
                {isImporting ? 'Setting up...' : 'Parse Resume and Create Files'}
              </button>
            </div>

            {status && (
              <div className={`status-banner ${result ? 'info' : 'warning'}`}>
                {status}
              </div>
            )}

            <LatexSetupWizard pdflatexStatus={pdflatex} requiresLocalPdflatex={requiresLocalPdflatex} compilerMode={appConfig?.latex?.mode} />
          </div>

          <div className="surface-block" style={{padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem'}}>
            <div style={{fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)'}}>Setup checklist</div>

            {!result && (
              <div style={{color: 'var(--text-secondary)', lineHeight: 1.6}}>
                After parsing, you&apos;ll see every created markdown file and the saved AI configuration here before entering the app.
              </div>
            )}

            {result && (
              <>
                <div style={{display: 'flex', flexDirection: 'column', gap: '0.75rem'}}>
                  {result.createdFiles?.map((file) => (
                    <div key={file.fileName} className="surface-block" style={{padding: '0.9rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                      <span>{file.fileName}</span>
                      <span className="soft-pill success">{file.created ? 'Created' : 'Skipped'}</span>
                    </div>
                  ))}
                </div>

                <div className="surface-block" style={{padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem'}}>
                  <div style={{display: 'flex', justifyContent: 'space-between', gap: '1rem'}}>
                    <span>{providerLabel} API key</span>
                    <span className="soft-pill success">{result.savedSettings?.providerKeyConfigured ? 'Stored / Ready' : 'Missing'}</span>
                  </div>
                  <div style={{display: 'flex', justifyContent: 'space-between', gap: '1rem'}}>
                    <span>Provider</span>
                    <span className="soft-pill success">{result.savedSettings?.provider || provider}</span>
                  </div>
                  <div style={{display: 'flex', justifyContent: 'space-between', gap: '1rem'}}>
                    <span>Selected model</span>
                    <span className="soft-pill success">{result.savedSettings?.selectedModel || model}</span>
                  </div>
                </div>

                <div className="action-row" style={{justifyContent: 'flex-start', marginBottom: 0}}>
                  <button className="primary-button" onClick={onComplete}>Start Using the App</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function GeneratorView({ state, setState, appConfig }) {
  const {
    jd,
    template,
    templatesList,
    output,
    pdfs,
    metrics,
    coverLetter,
    isGenerating,
    pdfOpen,
    clOpen,
    hasGeneratedResume
  } = state;
  const [pdflatexStatus, setPdflatexStatus] = useState({ installed: true, version: '' });
  const [isHumanizing, setIsHumanizing] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const [jdActionStatus, setJdActionStatus] = useState('');
  const resultsRef = React.useRef(null);
  const latexConfig = appConfig?.latex || { mode: 'inline', requiresLocalPdflatex: true };
  const requiresLocalPdflatex = latexConfig.requiresLocalPdflatex !== false;
  const updateGeneratorState = (patch) => {
    setState((prev) => ({ ...prev, ...patch }));
  };

  const watchGenerationJob = (jobId, pdfFileName) => {
    const jobPoll = setInterval(() => {
      fetch(`/api/generation-jobs/${jobId}`)
        .then(res => res.json())
        .then((data) => {
          const job = data.job;
          if (!job) return;
          if (job.status === 'queued') {
            updateGeneratorState({ output: `[QUEUE] Waiting for LaTeX worker to start compilation...` });
            return;
          }
          if (job.status === 'running') {
            updateGeneratorState({
              output: `[QUEUE] Compiling PDF in worker (attempt ${job.attemptCount || 1}/${job.maxAttempts || 3})...`
            });
            return;
          }
          clearInterval(jobPoll);
          if (job.status === 'completed') {
            updateGeneratorState({
              isGenerating: false,
              output: 'Resume package generated successfully.',
              hasGeneratedResume: true,
              pdfs: pdfFileName ? [{ name: pdfFileName, time: Date.now() }] : []
            });
            setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
            return;
          }
          updateGeneratorState({
            isGenerating: false,
            output: `Error: ${job.errorMessage || 'Queued compilation failed.'}`
          });
        })
        .catch(() => {
          clearInterval(jobPoll);
          updateGeneratorState({
            isGenerating: false,
            output: 'Failed to track queued LaTeX compilation.'
          });
        });
    }, 1200);
  };
  
  // Reset UI when JD is cleared
  useEffect(() => {
    if (!jd.trim()) {
      updateGeneratorState({
        output: null,
        metrics: null,
        coverLetter: '',
        pdfs: [],
        pdfOpen: false,
        clOpen: false,
        hasGeneratedResume: false
      });
    }
  }, [jd]);
  
  // Fetch available templates
  useEffect(() => {
    fetch('/api/templates/wireframes')
      .then(res => res.json())
      .then(data => {
         if (data.templates && data.templates.length > 0) {
            updateGeneratorState({
              templatesList: data.templates,
              template: data.templates.includes(template) ? template : data.templates[0]
            });
         }
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    fetch('/api/system-check')
      .then(res => res.json())
      .then(data => {
        if (data.pdflatex) setPdflatexStatus(data.pdflatex);
      })
      .catch(() => {
        setPdflatexStatus({ installed: false, version: '' });
      });
  }, []);

  const triggerGenerate = (nextJd = jd) => {
    if (!nextJd.trim()) { updateGeneratorState({ output: 'Please paste a Job Description first!' }); return; }
    updateGeneratorState({
      isGenerating: true,
      output: 'Triggering Gemini API Integration...',
      metrics: null,
      coverLetter: '',
      pdfs: [],
      pdfOpen: false,
      clOpen: false,
      hasGeneratedResume: false
    });

    const pollInterval = setInterval(() => {
       fetch('/api/status')
         .then(res => res.json())
         .then(d => { if (d.status && d.status !== 'Idle') updateGeneratorState({ output: `[LIVE] ${d.status}` }); })
         .catch(() => {});
    }, 800);

    fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: nextJd, template })
    })
    .then(res => res.json())
    .then(data => {
      clearInterval(pollInterval);
      if (data.success && data.queued && data.job?.id) {
        updateGeneratorState({
          output: data.message || 'Resume drafted. Waiting for worker compilation...',
          metrics: data.metrics || null,
          coverLetter: data.coverLetter || '',
          hasGeneratedResume: true,
          pdfs: []
        });
        watchGenerationJob(data.job.id, data.filename || data.job.pdfFileName);
        setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
        return;
      }
      updateGeneratorState({ isGenerating: false });
      if (data.success) {
        updateGeneratorState({
          output: 'Resume package generated successfully.',
          metrics: data.metrics || null,
          coverLetter: data.coverLetter || '',
          hasGeneratedResume: true,
          pdfs: data.filename ? [{ name: data.filename, time: Date.now() }] : []
        });
        setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
      } else {
        updateGeneratorState({ output: 'Error: ' + data.error });
      }
    })
    .catch(() => {
      clearInterval(pollInterval);
      updateGeneratorState({
        isGenerating: false,
        output: 'Failed to connect to local API.'
      });
    });
  };

  const handleGenerate = () => {
    triggerGenerate(jd);
  };

  const handleHumanizeCoverLetter = () => {
    if (!coverLetter.trim() || isHumanizing) return;
    setIsHumanizing(true);
    fetch('/api/humanize-cover-letter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coverLetter, jd })
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Failed to humanize cover letter.');
        updateGeneratorState({ coverLetter: data.coverLetter || coverLetter });
      })
      .catch((error) => {
        updateGeneratorState({ output: `Error: ${error.message}` });
      })
      .finally(() => setIsHumanizing(false));
  };

  const handleCopyCoverLetter = async () => {
    if (!coverLetter.trim()) return;
    try {
      await navigator.clipboard.writeText(coverLetter);
      setCopyStatus('Copied');
      setTimeout(() => setCopyStatus(''), 1800);
    } catch {
      setCopyStatus('Copy failed');
      setTimeout(() => setCopyStatus(''), 1800);
    }
  };

  const handlePasteJd = async () => {
    try {
      const clipboardText = await navigator.clipboard.readText();
      if (!clipboardText.trim()) {
        setJdActionStatus('Clipboard is empty');
        setTimeout(() => setJdActionStatus(''), 1800);
        return;
      }
      updateGeneratorState({
        jd: '',
        output: null,
        metrics: null,
        coverLetter: '',
        pdfs: [],
        pdfOpen: false,
        clOpen: false,
        hasGeneratedResume: false
      });
      updateGeneratorState({ jd: clipboardText });
      setJdActionStatus('Pasted and generating...');
      setTimeout(() => setJdActionStatus(''), 1800);
      triggerGenerate(clipboardText);
    } catch {
      setJdActionStatus('Paste failed');
      setTimeout(() => setJdActionStatus(''), 1800);
    }
  };

  const handleClearJd = () => {
    updateGeneratorState({ jd: '' });
    setJdActionStatus('Cleared');
    setTimeout(() => setJdActionStatus(''), 1400);
  };

  const hasResults = hasGeneratedResume && (pdfs.length > 0 || !!coverLetter || !!metrics);
  const atsScore = metrics?.optimizationPercentage || 0;
  const atsTone = !metrics
    ? 'muted'
    : atsScore >= 90
      ? 'excellent'
      : atsScore >= 70
        ? 'warning'
        : 'danger';
  const scoreSummary = metrics ? [
    { label: 'JD Skills', value: metrics.jdKeywords?.length || 0, tone: 'default' },
    { label: 'Matched', value: metrics.matchedKeywords?.length || 0, tone: 'success' }
  ] : [
    { label: 'JD Skills', value: '--', tone: 'muted' },
    { label: 'Matched', value: '--', tone: 'muted' }
  ];
  const latestPdf = pdfs[0];

  return (
    <div className="hide-scrollbar" style={{padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', height: 'calc(100vh - 120px)', overflowY: 'auto', width: '100%', boxSizing: 'border-box'}}>

      <div className="glass-panel" style={{margin: 0, padding: '1.5rem', minHeight: '240px'}}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap'}}>
          <p style={{color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0, maxWidth: '700px'}}>
            {metrics ? 'Latest generation insights and keyword coverage.' : 'Generate a resume to populate match analytics and extracted skills.'}
          </p>
          {!metrics && (
            <div className="soft-pill">
              No resumes generated yet
            </div>
          )}
        </div>

        <div className="generator-scoreboard">
          <div className="generator-score-metrics">
            {scoreSummary.map((item) => (
              <div key={item.label} className={`generator-score-card ${item.tone}`}>
                <div className="generator-score-label">{item.label}</div>
                <div className="generator-score-value">{item.value}</div>
              </div>
            ))}
            <div className={`generator-score-card generator-score-meter-card ${atsTone}`}>
              <div className="generator-score-label">ATS Match</div>
              <div
                className={`generator-meter ${metrics ? 'is-active' : ''} ${atsTone}`}
                style={{ '--meter-value': `${metrics ? atsScore : 0}`, '--meter-color': metrics ? undefined : 'rgba(255,255,255,0.2)' }}
              >
                <div className="generator-meter-ring">
                  <div className="generator-meter-core">
                    <div className="generator-meter-value">{metrics ? `${atsScore}%` : '--%'}</div>
                    <div className="generator-meter-caption">
                      {metrics ? (atsScore >= 90 ? 'Excellent fit' : atsScore >= 70 ? 'Strong fit' : 'Needs work') : 'Awaiting run'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="generator-score-details">
            <div>
              <h4 style={{color: metrics ? '#a855f7' : 'var(--text-secondary)', margin: '0 0 0.75rem 0', fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '1px', opacity: metrics ? 0.9 : 0.7}}>Extracted Skills</h4>
              <div className={`generator-chip-wrap ${metrics ? '' : 'muted'}`}>
                {metrics
                  ? (metrics.jdKeywords || []).map(k => <span key={k} className="generator-chip">{k}</span>)
                  : ['Python', 'AWS', 'Leadership', 'Analytics'].map(k => <span key={k} className="generator-chip">{k}</span>)}
              </div>
            </div>

            <div>
              <h4 style={{color: metrics ? '#10b981' : 'var(--text-secondary)', margin: '0 0 0.75rem 0', fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '1px', opacity: metrics ? 0.9 : 0.7}}>Matched Keywords</h4>
              <div className={`generator-chip-wrap ${metrics ? '' : 'muted'}`}>
                {metrics
                  ? (metrics.matchedKeywords || []).map(k => <span key={k} className="generator-chip success">{k}</span>)
                  : ['Tailored bullets', 'ATS score', 'Impact verbs'].map(k => <span key={k} className="generator-chip success">{k}</span>)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="glass-panel" style={{margin: 0, minHeight: hasResults ? '340px' : '460px', flex: '0 0 auto'}}>
        <h2 className="panel-title">🎯 Target Job Description</h2>
        <div style={{display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1, minHeight: 0}}>
          <p style={{color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0}}>
            Paste the role details below, choose a base template, and generate a tailored resume package. This section stays spacious until a fresh resume is created.
          </p>
          <div className="jd-toolbar">
            <div style={{color: 'var(--text-secondary)', fontSize: '0.8rem'}}>
              {jdActionStatus || `${jd.trim() ? `${jd.trim().split(/\s+/).length} words loaded` : 'No job description loaded'}`}
            </div>
            <div className="jd-toolbar-actions">
              <button className="secondary-button" type="button" onClick={handlePasteJd} style={{padding: '0.45rem 0.8rem', fontSize: '0.85rem'}}>
                Paste & Generate
              </button>
              <button className="secondary-button" type="button" onClick={handleClearJd} disabled={!jd.trim()} style={{padding: '0.45rem 0.75rem', fontSize: '0.85rem', minWidth: '42px', opacity: jd.trim() ? 1 : 0.55}}>
                ×
              </button>
            </div>
          </div>
          <textarea
            placeholder="e.g. Seeking a Backend Software Engineer with experience in Python, AWS, and Distributed Systems..."
            style={{minHeight: hasResults ? '220px' : '320px', flex: hasResults ? '0 0 auto' : 1}}
            value={jd}
            onChange={(e) => updateGeneratorState({ jd: e.target.value })}
          />
          <div style={{display: 'flex', gap: '1rem', alignItems: 'center'}}>
            <select style={{flex: 1}} value={template} onChange={(e) => updateGeneratorState({ template: e.target.value })}>
              {templatesList.map(t => <option key={t} value={t}>Base Template: {t}</option>)}
            </select>
            <button
              className="primary-button"
              onClick={handleGenerate}
              disabled={isGenerating || (requiresLocalPdflatex && !pdflatexStatus.installed)}
              style={{ opacity: (isGenerating || (requiresLocalPdflatex && !pdflatexStatus.installed)) ? 0.7 : 1, minWidth: '210px' }}
            >
              {isGenerating ? '⏳ Generating...' : '🚀 Auto-Generate Resume'}
            </button>
          </div>
          {!pdflatexStatus.installed && requiresLocalPdflatex && (
            <LatexInstallHelp pdflatexStatus={pdflatexStatus} compilerMode={latexConfig.mode} />
          )}
          {!requiresLocalPdflatex && (
            <div className="status-banner info">
              {latexConfig.mode === 'remote'
                ? 'PDF compilation is configured for the remote LaTeX compiler, so this web app does not need a local `pdflatex` install in production.'
                : 'PDF compilation is configured for the dedicated LaTeX worker, so this web app does not need a local `pdflatex` install in production.'}
            </div>
          )}
          {/* Live status strip while running */}
          {isGenerating && output && (
            <div className="status-banner info">
              {output}
            </div>
          )}
          {!isGenerating && output && !hasResults && (
            <div className="status-banner warning">
              {output}
            </div>
          )}
        </div>
      </div>

      <div ref={resultsRef} className="generator-results-grid" style={{ alignItems: 'start', width: '100%' }}>

          <div className="glass-panel" style={{margin: 0, minHeight: '220px'}}>
            <div
              onClick={() => latestPdf && updateGeneratorState({ pdfOpen: !pdfOpen })}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
            >
              <h2 className="panel-title" style={{margin: 0}}>
                📄 AI Resume
                {latestPdf && <span style={{fontSize: '0.875rem', color: '#10b981', marginLeft: '0.75rem'}}>Ready</span>}
              </h2>
              <span style={{ fontSize: '1.25rem', color: 'var(--text-secondary)', transition: 'transform 0.2s', transform: pdfOpen ? 'rotate(180deg)' : 'rotate(0deg)', display: 'inline-block', opacity: latestPdf ? 1 : 0.45 }}>▾</span>
            </div>
            {!latestPdf && (
              <p style={{margin: '1rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem'}}>
                This card stays folded until a new resume is generated.
              </p>
            )}
            {latestPdf && !pdfOpen && (
              <p style={{margin: '1rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem'}}>
                Resume preview is folded. Open this card to inspect the latest generated PDF.
              </p>
            )}

            {latestPdf && pdfOpen && (
              <div style={{ marginTop: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', overflow: 'hidden', minHeight: latestPdf ? '700px' : '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)' }}>
                {latestPdf ? (
                  <iframe src={buildAuthedApiUrl(`/api/output/${latestPdf.name}?req=${latestPdf.time}`)} style={{width:'100%',height:'700px',border:'none'}} title="Resume Preview" />
                ) : (
                  <div style={{ color: '#f59e0b', padding: '2rem', textAlign: 'center', lineHeight: 1.6 }}>Your resume is still syncing. Re-open this card in a moment.</div>
                )}
              </div>
            )}
          </div>

          <div className="glass-panel" style={{margin: 0, minHeight: '220px'}}>
            <div
              onClick={() => coverLetter && updateGeneratorState({ clOpen: !clOpen })}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: coverLetter ? 'pointer' : 'default', userSelect: 'none' }}
            >
              <h2 className="panel-title" style={{margin: 0}}>
                📝 AI Cover Letter
                {coverLetter && <span style={{fontSize: '0.875rem', color: '#10b981', marginLeft: '0.75rem'}}>Ready</span>}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                {coverLetter && (
                  <button
                    className="secondary-button"
                    style={{padding: '0.4rem 0.8rem', fontSize: '0.875rem'}}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopyCoverLetter();
                    }}
                  >
                    {copyStatus || 'Copy Text'}
                  </button>
                )}
                {coverLetter && (
                  <button
                    className="secondary-button"
                    style={{padding: '0.4rem 0.8rem', fontSize: '0.875rem'}}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleHumanizeCoverLetter();
                    }}
                  >
                    {isHumanizing ? 'Humanizing...' : 'Humanization Pass'}
                  </button>
                )}
                {coverLetter && (
                  <button
                    className="primary-button"
                    style={{padding: '0.4rem 0.8rem', fontSize: '0.875rem', background: '#3b82f6'}}
                    onClick={(e) => {
                      e.stopPropagation();
                      const blob = new Blob([coverLetter], { type: 'text/plain;charset=utf-8' });
                      const link = document.createElement('a');
                      link.href = URL.createObjectURL(blob);
                      link.download = latestPdf ? latestPdf.name.replace('.pdf', '_Cover_Letter.txt') : 'Cover_Letter.txt';
                      link.click();
                    }}
                  >
                    Export as Text (.txt)
                  </button>
                )}
                <span style={{ fontSize: '1.25rem', color: 'var(--text-secondary)', transition: 'transform 0.2s', transform: clOpen ? 'rotate(180deg)' : 'rotate(0deg)', display: 'inline-block', opacity: coverLetter ? 1 : 0.45 }}>▾</span>
              </div>
            </div>

            {!coverLetter && (
              <p style={{margin: '1rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem'}}>
                This card will unlock after a new resume package includes a cover letter.
              </p>
            )}

            {coverLetter && !clOpen && (
              <p style={{margin: '1rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem'}}>
                Cover letter is folded. Open this card when you are ready to review or edit it.
              </p>
            )}

            {coverLetter && clOpen && (
              <textarea
                style={{
                  marginTop: '1rem', width: '100%', height: '650px',
                  background: 'rgba(0,0,0,0.3)', color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)', borderRadius: '8px',
                  padding: '1.5rem', fontFamily: 'inherit', fontSize: '0.95rem',
                  lineHeight: 1.6, resize: 'vertical'
                }}
                value={coverLetter}
                onChange={(e) => updateGeneratorState({ coverLetter: e.target.value })}
              />
            )}
          </div>
        </div>
    </div>
  );
}

function ProfileSettingsView({ appConfig }) {
  const [profileContent, setProfileContent] = useState('');
  const [profileStatus, setProfileStatus] = useState('');
  const [settingsStatus, setSettingsStatus] = useState('');
  const [testStatus, setTestStatus] = useState('');
  const [testResponse, setTestResponse] = useState('');
  const [pdflatexStatus, setPdflatexStatus] = useState({ installed: false, version: '' });
  const [provider, setProvider] = useState('google');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gemini-2.5-flash-lite');
  const [dailyGoal, setDailyGoal] = useState('5');
  const [providerKeyConfigured, setProviderKeyConfigured] = useState(false);
  const [keySource, setKeySource] = useState('none');
  const [providerEntries, setProviderEntries] = useState(appConfig?.providers || []);
  const requiresLocalPdflatex = appConfig?.latex?.requiresLocalPdflatex !== false;
  const [models, setModels] = useState([
    'gemini-3.1-flash-lite-preview',
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite'
  ]);

  useEffect(() => {
    fetch('/api/providers')
      .then(res => res.json())
      .then(data => {
        if (data.providers?.length) {
          setProviderEntries(data.providers);
        }
      })
      .catch(() => {});

    fetch('/api/data/profile.md')
      .then(res => res.json())
      .then(data => setProfileContent(data.content || ''))
      .catch(() => setProfileContent(''));

    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        if (data.settings) {
          setProvider(data.settings.provider || 'google');
          setApiKey('');
          setModel(data.settings.selectedModel || data.settings.geminiModel || 'gemini-2.5-flash-lite');
          setDailyGoal(String(data.settings.dailyApplicationGoal || 5));
          setProviderKeyConfigured(!!data.settings.providerKeyConfigured);
          setKeySource(data.settings.keySource || 'none');
        }
        if (data.providers?.length) setProviderEntries(data.providers);
        if (data.models?.length) setModels(data.models);
      })
      .catch(console.error);

    fetch('/api/system-check')
      .then(res => res.json())
      .then(data => {
        if (data.pdflatex) setPdflatexStatus(data.pdflatex);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    fetch(`/api/models?provider=${provider}`)
      .then(res => res.json())
      .then(data => {
        if (data.models?.length) {
          setModels(data.models);
          if (!data.models.includes(model)) {
            setModel(data.models[0]);
          }
        }
      })
      .catch(() => {});
  }, [provider]);

  useEffect(() => {
    const activeProvider = providerEntries.find((item) => item.id === provider);
    setProviderKeyConfigured(!!activeProvider?.configured);
    setKeySource(activeProvider?.keySource || 'none');
  }, [provider, providerEntries]);

  const saveProfile = (newMd) => {
    setProfileStatus('Saving profile...');
    fetch('/api/data/profile.md', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: newMd })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setProfileContent(newMd);
          setProfileStatus('Profile saved.');
          setTimeout(() => setProfileStatus(''), 2000);
        } else {
          setProfileStatus('Failed to save profile.');
        }
      })
      .catch(() => setProfileStatus('Failed to save profile.'));
  };

  const discardProfile = () => {
    setProfileStatus('Reloading profile...');
    fetch('/api/data/profile.md')
      .then(res => res.json())
      .then(data => {
        setProfileContent(data.content || '');
        setProfileStatus('Profile reloaded.');
        setTimeout(() => setProfileStatus(''), 2000);
      })
      .catch(() => setProfileStatus('Failed to reload profile.'));
  };

  const saveSettings = () => {
    setSettingsStatus('Saving AI settings...');
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider,
        providerApiKey: apiKey,
        selectedModel: model,
        dailyApplicationGoal: dailyGoal
      })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setSettingsStatus('AI settings saved.');
          if (data.settings?.provider) setProvider(data.settings.provider);
          if (data.settings?.selectedModel) setModel(data.settings.selectedModel);
          if (data.providers?.length) setProviderEntries(data.providers);
          if (data.models?.length) setModels(data.models);
          setProviderKeyConfigured(!!data.settings?.providerKeyConfigured);
          setKeySource(data.settings?.keySource || 'none');
          setApiKey('');
          setTimeout(() => setSettingsStatus(''), 2000);
        } else {
          setSettingsStatus('Failed to save AI settings.');
        }
      })
      .catch(() => setSettingsStatus('Failed to save AI settings.'));
  };

  const testSettings = () => {
    setTestStatus('Testing connection...');
    setTestResponse('');
    fetch('/api/test-llm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider,
        providerApiKey: apiKey,
        selectedModel: model
      })
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'LLM test failed.');
        setTestStatus(`Connected successfully with ${data.provider} / ${data.model}.`);
        setTestResponse(data.response || '');
      })
      .catch((error) => {
        setTestStatus(error.message || 'LLM test failed.');
      });
  };

  return (
    <div className="grid-2" style={{margin: '1.5rem', height: 'calc(100vh - 120px)'}}>
      <div className="glass-panel" style={{margin: 0, overflow: 'hidden'}}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem'}}>
          <h2 className="panel-title" style={{margin: 0}}>Profile</h2>
          {profileStatus && <span style={{color: 'var(--text-secondary)'}}>{profileStatus}</span>}
        </div>
        <p style={{color: 'var(--text-secondary)', marginTop: 0}}>
          Manage your personal identity fields here. This is now the only place to edit `profile.md`.
        </p>
        <div style={{flex: 1, minHeight: 0, overflow: 'hidden'}}>
          <ProfileManager rawMarkdown={profileContent} onSave={saveProfile} onDiscard={discardProfile} />
        </div>
      </div>

      <div className="glass-panel" style={{margin: 0, overflowY: 'auto'}}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem'}}>
          <h2 className="panel-title" style={{margin: 0}}>AI Settings</h2>
          {settingsStatus && <span style={{color: 'var(--text-secondary)'}}>{settingsStatus}</span>}
        </div>
        <p style={{color: 'var(--text-secondary)', marginTop: 0}}>
          Choose your preferred provider, securely save an optional per-user API key, and test the model used by generation and highlight flows.
        </p>

        <div className="surface-block" style={{padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem'}}>
          <LatexInstallHelp pdflatexStatus={pdflatexStatus} requiresLocalPdflatex={requiresLocalPdflatex} compilerMode={appConfig?.latex?.mode} />

          <div style={{display: 'flex', flexDirection: 'column', gap: '0.35rem'}}>
            <label style={{fontSize: '0.875rem', color: 'var(--text-secondary)', fontWeight: 'bold'}}>Provider</label>
            <select value={provider} onChange={(e) => setProvider(e.target.value)}>
              {(appConfig?.providers || []).map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </div>

          <div style={{display: 'flex', flexDirection: 'column', gap: '0.35rem'}}>
            <label style={{fontSize: '0.875rem', color: 'var(--text-secondary)', fontWeight: 'bold'}}>Provider API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Leave blank to keep the current key or use a server-managed key"
            />
            <div style={{color: 'var(--text-secondary)', fontSize: '0.8rem'}}>
              {providerKeyConfigured
                ? (keySource === 'server'
                    ? 'This provider is currently using a server-managed key.'
                    : 'A per-user key is already stored securely. Enter a new key only if you want to replace it.')
                : 'No key is stored yet for this provider.'}
            </div>
          </div>

          <div style={{display: 'flex', flexDirection: 'column', gap: '0.35rem'}}>
            <label style={{fontSize: '0.875rem', color: 'var(--text-secondary)', fontWeight: 'bold'}}>Selected Model</label>
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              {models.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>

          <div style={{display: 'flex', flexDirection: 'column', gap: '0.35rem'}}>
            <label style={{fontSize: '0.875rem', color: 'var(--text-secondary)', fontWeight: 'bold'}}>Daily Apply Goal</label>
            <input
              type="number"
              min="1"
              max="25"
              value={dailyGoal}
              onChange={(e) => setDailyGoal(e.target.value)}
              placeholder="5"
            />
          </div>

          <div className="action-row" style={{justifyContent: 'flex-start', marginBottom: 0}}>
            <button className="primary-button" onClick={saveSettings}>Save AI Settings</button>
            <button className="secondary-button" onClick={testSettings}>Test API Key</button>
          </div>

          {testStatus && (
            <div className={`status-banner ${testStatus.includes('successfully') ? 'info' : 'warning'}`}>
              {testStatus}
            </div>
          )}

          {testResponse && (
            <div className="surface-block" style={{padding: '1rem'}}>
              <div style={{fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', marginBottom: '0.5rem'}}>LLM Response</div>
              <div style={{whiteSpace: 'pre-wrap', lineHeight: 1.6}}>{testResponse}</div>
            </div>
          )}

          <div className="surface-block" style={{padding: '1rem'}}>
            <div style={{fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', marginBottom: '0.5rem'}}>Available models</div>
            <div style={{display: 'flex', flexWrap: 'wrap', gap: '0.5rem'}}>
              {models.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="generator-chip"
                  onClick={() => setModel(item)}
                  style={{
                    border: item === model ? '1px solid rgba(99, 102, 241, 0.55)' : '1px solid transparent',
                    background: item === model ? 'rgba(99, 102, 241, 0.22)' : undefined,
                    color: item === model ? '#c7d2fe' : undefined
                  }}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DataManagementView() {
  const [activeFile, setActiveFile] = useState('projects.md');
  const [content, setContent] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    fetch(`/api/data/${activeFile}`)
      .then(res => res.json())
      .then(data => {
        if (data.content !== undefined) setContent(data.content);
        else setContent('File not found or empty.');
        setStatus('');
      })
      .catch(err => {
        setContent('Error loading file.');
        console.error(err);
      });
  }, [activeFile]);

  const handleSave = (newMd) => {
    setStatus('Saving...');
    fetch(`/api/data/${activeFile}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: newMd })
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
         setContent(newMd);
         setStatus('Saved!');
         setTimeout(() => setStatus(''), 2000);
      } else {
         setStatus('Error saving');
         setTimeout(() => setStatus(''), 2000);
      }
    })
    .catch(() => setStatus('Error saving'));
  };

  const handlePreview = (newMd) => {
    setContent(newMd);
    setStatus('AI Preview Active. Unsaved.');
  };

  const handleDiscard = () => {
    setStatus('Discarding...');
    fetch(`/api/data/${activeFile}`)
      .then(res => res.json())
      .then(data => {
         setContent(data.content || '');
         setStatus('Discarded Changes');
         setTimeout(() => setStatus(''), 2000);
      })
      .catch(() => setStatus('Error discarding'));
  };

  const files = ['projects.md', 'workex.md', 'education.md', 'skills.md'];

  return (
    <div className="glass-panel" style={{height: 'calc(100vh - 120px)'}}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem'}}>
        <h2 className="panel-title" style={{margin: 0}}>Data Management (Single Source of Truth)</h2>
        {status && <span style={{color: 'var(--text-secondary)'}}>{status}</span>}
      </div>
      <p style={{color: 'var(--text-secondary)'}}>
        Manage your base information. This content is dynamically injected into templates during generation.
      </p>
      <div style={{display: 'flex', gap: '1rem', height: '100%', minHeight: 0}}>
        <div style={{width: '200px', display: 'flex', flexDirection: 'column', gap: '0.5rem'}}>
          {files.map(file => (
            <div 
              key={file}
              className={`nav-item ${activeFile === file ? 'active' : ''}`}
              onClick={() => setActiveFile(file)}
            >
              {file}
            </div>
          ))}
        </div>
        <div style={{flex: 1, paddingLeft: '1rem', borderLeft: '1px solid var(--border-color)', height: '100%', overflow: 'hidden'}}>
          <DataFormDispatcher 
            activeFile={activeFile} 
            rawMarkdown={content} 
            onSave={handleSave} 
            onPreview={handlePreview} 
            onDiscard={handleDiscard} 
          />
        </div>
      </div>
    </div>
  );
}

function TemplatesView({ type = 'wireframes' }) {
  const [files, setFiles] = useState([]);
  const [templateEntries, setTemplateEntries] = useState({});
  const [activeFile, setActiveFile] = useState('');
  const [content, setContent] = useState('');
  const [status, setStatus] = useState('');
  const [activeSubTab, setActiveSubTab] = useState('editor'); // 'preview', 'editor'
  const [compileStatus, setCompileStatus] = useState('');
  const [compileError, setCompileError] = useState('');
  const [lastWorkingContent, setLastWorkingContent] = useState('');
  const [renderTimestamp, setRenderTimestamp] = useState(0);

  const loadTemplates = () => {
    fetch(`/api/templates/${type}`)
      .then(res => res.json())
      .then(data => {
         if (data.templates) {
            setFiles(data.templates);
            setTemplateEntries(
              Object.fromEntries((data.entries || []).map((entry) => [entry.name, entry]))
            );
            if (data.templates.length > 0 && (!data.templates.includes(activeFile))) {
               setActiveFile(data.templates[0]);
            }
         }
      })
      .catch(console.error);
  };

  useEffect(() => {
    loadTemplates();
  }, [type]);

  useEffect(() => {
    if (activeFile) {
       fetch(`/api/template/${type}/${activeFile}`)
         .then(res => res.json())
         .then(data => {
            if (data.content !== undefined) {
              setContent(data.content);
              setLastWorkingContent(data.content);
              setTemplateEntries((prev) => ({
                ...prev,
                [activeFile]: {
                  name: activeFile,
                  source: data.source || prev[activeFile]?.source || 'shared'
                }
              }));
            } else {
              setContent('Error loading file.');
              setLastWorkingContent('');
            }
            setStatus('');
            setCompileStatus('');
            setCompileError('');
         })
         .catch(console.error);
    }
  }, [activeFile, type]);

  const handleSave = () => {
    setStatus('Saving...');
    return fetch(`/api/template/${type}/${activeFile}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
         setTemplateEntries((prev) => ({
           ...prev,
           [activeFile]: {
             name: activeFile,
             source: data.source || 'user'
           }
         }));
         setStatus('Saved!');
         setTimeout(() => setStatus(''), 2000);
         return true;
      }
      setStatus('Error');
      return false;
    })
    .catch(() => {
      setStatus('Error');
      return false;
    });
  };

  const handleCompile = async () => {
    setCompileStatus('Compiling...');
    setCompileError('');
    const saved = await handleSave();
    if (saved) {
       fetch(`/api/compile-template/${type}/${activeFile}`, { method: 'POST' })
         .then(res => res.json())
         .then(compData => {
            if (compData.success) {
              setCompileStatus('Success!');
              setCompileError('');
              setLastWorkingContent(content);
              setTimeout(() => setCompileStatus(''), 2000);
              setRenderTimestamp(Date.now()); // refresh iframe
            } else {
              setCompileStatus('Error Compiling');
              setCompileError(compData.error || 'Failed to compile template preview.');
            }
         })
         .catch((error) => {
           setCompileStatus('Error Compiling');
           setCompileError(error.message || 'Failed to compile template preview.');
         });
    }
  };

  const handleUndoCompileFailure = () => {
    if (!activeFile || !lastWorkingContent) return;
    setStatus('Restoring...');
    setContent(lastWorkingContent);
    fetch(`/api/template/${type}/${activeFile}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: lastWorkingContent })
    })
      .then(res => res.json())
      .then((data) => {
        if (!data.success) throw new Error('Failed to restore template.');
        setStatus('Restored last working version.');
        setCompileStatus('');
        setCompileError('');
        setTimeout(() => setStatus(''), 2000);
      })
      .catch(() => {
        setStatus('Restore failed');
      });
  };

  const handleNewTemplate = () => {
    const name = prompt(`Enter a name for the new ${type} (e.g. Layout.tex):`);
    if (!name) return;
    const finalName = name.endsWith('.tex') ? name : name + '.tex';
    
    // Create new boilerplate
    fetch(`/api/template/${type}/${finalName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '\\documentclass{article}\n\\begin{document}\n% New Scaffold\n\\end{document}' })
    }).then(res => res.json()).then(data => {
       if (data.success) {
         loadTemplates();
         setActiveFile(finalName);
       }
    });
  };

  return (
    <div className="glass-panel" style={{height: 'calc(100vh - 120px)'}}>
	      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem'}}>
	        <h2 className="panel-title" style={{margin: 0}}>
	           {type === 'wireframes' ? 'LaTeX Wireframe Templates' : 'Private Generic Resumes'}
	        </h2>
	        <div style={{display: 'flex', gap: '0.5rem'}}>
          <button className="secondary-button" onClick={handleSave} style={{padding: '0.5rem 1rem'}}>
            {status || 'Save Template'}
          </button>
	          <button className="primary-button" onClick={handleCompile}>
	            {compileStatus || 'Save & Preview PDF'}
	          </button>
	        </div>
	      </div>
	      {compileError && (
	        <div className="status-banner warning" style={{marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap'}}>
	          <span style={{flex: '1 1 320px'}}>{compileError}</span>
	          <button className="secondary-button" onClick={handleUndoCompileFailure}>
	            Undo to Last Working Version
	          </button>
	        </div>
	      )}
	      <p style={{color: 'var(--text-secondary)'}}>
	        {type === 'wireframes' 
	          ? 'Starter wireframes are shared, but any edit or new template you save becomes private to your account.'
	          : 'Generic resumes are private to your account only. Nothing in this area is shared across users.'}
      </p>
      <div style={{display: 'flex', gap: '1rem', height: '100%', minHeight: 0}}>
        {/* Left Sidebar */}
        <div style={{width: '250px', display: 'flex', flexDirection: 'column', gap: '0.5rem', overflowY: 'auto'}}>
          {files.map(file => (
            <div 
              key={file}
              className={`nav-item ${activeFile === file ? 'active' : ''}`}
              onClick={() => setActiveFile(file)}
            >
              <div style={{display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center'}}>
                <span>{file}</span>
                <span className={`soft-pill ${templateEntries[file]?.source === 'user' ? 'success' : ''}`} style={{fontSize: '0.68rem'}}>
                  {templateEntries[file]?.source === 'user' ? 'Private' : 'Starter'}
                </span>
              </div>
            </div>
          ))}
          <button className="secondary-button" onClick={handleNewTemplate} style={{ marginTop: '1rem', padding: '0.75rem', background: 'transparent', borderStyle: 'dashed', color: 'var(--text-secondary)' }}>
            + New Template
          </button>
        </div>

        {/* Right Editor / Preview Split */}
        <div style={{flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden'}}>
          <div className="toolbar-tabs">
             <button 
                className={`nav-item ${activeSubTab === 'editor' ? 'active' : ''}`}
                onClick={() => setActiveSubTab('editor')}
                style={{padding: '0.5rem 1rem'}}
             >Inline TeX Editor</button>
             <button 
                className={`nav-item ${activeSubTab === 'preview' ? 'active' : ''}`}
                onClick={() => setActiveSubTab('preview')}
                style={{padding: '0.5rem 1rem'}}
             >Live PDF Preview</button>
          </div>
          
          <div style={{flex: 1, overflow: 'hidden', display: 'flex'}}>
            {activeSubTab === 'editor' && (
              <div className="editor-shell" style={{flex: 1, height: '100%'}}>
                 <Editor
                   height="100%"
                   language="latex"
                   theme="vs-dark"
                   value={content}
                   onChange={(val) => setContent(val || '')}
                   options={{ minimap: { enabled: false }, fontSize: 13, wordWrap: 'on' }}
                   beforeMount={setupMonaco}
                 />
              </div>
            )}
            {activeSubTab === 'preview' && (
              <iframe 
                src={buildAuthedApiUrl(`/api/template-pdf/${type}/${activeFile}?req=${renderTimestamp}`)}
                style={{width: '100%', height: '100%', border: 'none', borderRadius: '4px'}}
                title="Template Preview"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function HistoryView({ appConfig }) {
  const [history, setHistory] = useState([]);
  const [activeItem, setActiveItem] = useState(null);
  const [activeSubTab, setActiveSubTab] = useState('preview'); // 'preview', 'editor', 'jd', 'coverLetter'
  const [texContent, setTexContent] = useState('');
  const [compileStatus, setCompileStatus] = useState('');
  const [compileError, setCompileError] = useState('');
  const [lastWorkingTexContent, setLastWorkingTexContent] = useState('');
  const latexConfig = appConfig?.latex || { mode: 'inline' };

  // Fetch history list
  useEffect(() => {
    fetch('/api/history')
      .then(res => res.json())
      .then(data => {
         if (data.history) setHistory(data.history);
      })
      .catch(console.error);
  }, []);

  // When an item is clicked, load its TeX content
  useEffect(() => {
    if (activeItem) {
       fetch(`/api/tex/${activeItem.company}.tex`)
         .then(res => res.json())
         .then(data => {
            if (data.content) {
              setTexContent(data.content);
              setLastWorkingTexContent(data.content);
            }
            setCompileStatus('');
            setCompileError('');
         })
         .catch(console.error);
    }
  }, [activeItem]);

  const handleCompile = () => {
    setCompileStatus('Compiling...');
    setCompileError('');
    // 1. Save TeX
    fetch(`/api/tex/${activeItem.company}.tex`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: texContent })
    }).then(res => res.json()).then(data => {
       if (data.success) {
          // 2. Re-Render PDF
          fetch(`/api/compile/${activeItem.company}.tex`, { method: 'POST' })
            .then(res => res.json())
            .then(compData => {
               if (compData.success && compData.queued && compData.job?.id) {
                 setCompileStatus('Queued for worker...');
                 const jobPoll = setInterval(() => {
                   fetch(`/api/generation-jobs/${compData.job.id}`)
                     .then(res => res.json())
                     .then((jobData) => {
                       const job = jobData.job;
                       if (!job) return;
                       if (job.status === 'queued') {
                         setCompileStatus('Queued for worker...');
                         return;
                       }
                       if (job.status === 'running') {
                         setCompileStatus(`Worker compiling (${job.attemptCount || 1}/${job.maxAttempts || 3})...`);
                         return;
                       }
                       clearInterval(jobPoll);
                       if (job.status === 'completed') {
                         setCompileStatus('Success!');
                         setCompileError('');
                         setLastWorkingTexContent(texContent);
                         setTimeout(() => setCompileStatus(''), 2000);
                         setActiveItem({ ...activeItem, timestamp: Date.now() });
                         return;
                       }
                       setCompileStatus('Error Compiling');
                       setCompileError(job.errorMessage || 'Failed to compile PDF.');
                     })
                     .catch(() => {
                       clearInterval(jobPoll);
                       setCompileStatus('Error Compiling');
                       setCompileError('Failed to track worker compilation.');
                     });
                 }, 1200);
                 return;
               }
               if (compData.success) {
                 setCompileStatus('Success!');
                 setCompileError('');
                 setLastWorkingTexContent(texContent);
                 setTimeout(() => setCompileStatus(''), 2000);
                 // Force iframe refresh by toggling active item timestamp mapping
                 setActiveItem({...activeItem, timestamp: Date.now()});
               } else {
                 setCompileStatus('Error Compiling');
                 setCompileError(compData.error || 'Failed to compile PDF.');
               }
            })
            .catch((error) => {
              setCompileStatus('Error Compiling');
              setCompileError(error.message || 'Failed to compile PDF.');
            });
       }
    });
  };

  const handleUndoCompileFailure = () => {
    if (!activeItem || !lastWorkingTexContent) return;
    setTexContent(lastWorkingTexContent);
    fetch(`/api/tex/${activeItem.company}.tex`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: lastWorkingTexContent })
    })
      .then(res => res.json())
      .then((data) => {
        if (!data.success) throw new Error('Failed to restore TeX file.');
        setCompileStatus('');
        setCompileError('');
      })
      .catch((error) => {
        setCompileError(error.message || 'Failed to restore TeX file.');
      });
  };

  return (
    <div className="history-layout" style={{margin: '1.5rem', height: 'calc(100vh - 120px)'}}>
      <div className="glass-panel history-archive-panel" style={{margin: 0, overflowY: 'auto'}}>
        <h2 className="panel-title">Generated Archive</h2>
        <div style={{display: 'flex', flexDirection: 'column', gap: '0.75rem'}}>
          {history.length === 0 && <p style={{color: 'var(--text-secondary)'}}>No resumes generated yet.</p>}
          {history.map(item => (
            <div 
              key={item.timestamp}
              onClick={() => setActiveItem(item)}
              className={`archive-item ${activeItem?.timestamp === item.timestamp ? 'active' : ''}`}
            >
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
                <h3 style={{margin: '0 0 0.25rem 0', color: '#fff'}}>{item.company}</h3>
                <span style={{fontSize: '0.75rem', color: 'var(--text-secondary)'}}>
                  {new Date(item.timestamp).toLocaleDateString()}
                </span>
              </div>
              <div style={{fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.75rem'}}>
                Template: {item.template}
              </div>
              <div style={{fontSize: '0.8rem', color: item.coverLetter ? '#86efac' : 'var(--text-secondary)', marginBottom: '0.75rem'}}>
                {item.coverLetter ? 'Cover letter saved' : 'No cover letter saved'}
              </div>
              <div style={{display: 'flex', gap: '0.5rem', flexWrap: 'wrap'}} onClick={e => e.stopPropagation()}>
                 <a href={buildAuthedApiUrl(`/api/output/${item.company}.pdf`)} download className="primary-button" style={{textDecoration: 'none', fontSize: '0.75rem', padding: '0.4rem 0.8rem'}}>
                   ⬇ Download PDF
                 </a>
                 {item.coverLetterFile && (
                   <a href={buildAuthedApiUrl(`/api/cover-letter/${item.coverLetterFile}`)} download className="secondary-button" style={{textDecoration: 'none', fontSize: '0.75rem', padding: '0.4rem 0.8rem'}}>
                     ⬇ Cover Letter
                   </a>
                 )}
              </div>
            </div>
          ))}
        </div>
      </div>
      
      <div className="glass-panel history-preview-panel" style={{margin: 0, display: 'flex', flexDirection: 'column'}}>
        {!activeItem ? (
           <div style={{display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)'}}>
             Select a resume from the archive to view or edit.
           </div>
        ) : (
	          <>
              {latexConfig.mode !== 'inline' && (
                <div className="status-banner info" style={{margin: '0 0 1rem 0'}}>
                  {latexConfig.mode === 'remote'
                    ? 'Recompiles are handled by the remote LaTeX compiler in production mode.'
                    : 'Recompiles are queued to the dedicated LaTeX worker in production mode.'}
                </div>
              )}
	            {compileError && (
	              <div className="status-banner warning" style={{margin: '0 0 1rem 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap'}}>
	                <span style={{flex: '1 1 320px'}}>{compileError}</span>
	                <button className="secondary-button" onClick={handleUndoCompileFailure}>
	                  Undo to Last Working Version
	                </button>
	              </div>
	            )}
	            <div className="toolbar-tabs">
	               <button 
	                  className={`nav-item ${activeSubTab === 'preview' ? 'active' : ''}`}
	                  onClick={() => setActiveSubTab('preview')}
	               >Preview PDF</button>
               <button 
                  className={`nav-item ${activeSubTab === 'editor' ? 'active' : ''}`}
                  onClick={() => setActiveSubTab('editor')}
               >Inline TeX Editor</button>
               <button 
                  className={`nav-item ${activeSubTab === 'jd' ? 'active' : ''}`}
                  onClick={() => setActiveSubTab('jd')}
               >Original Job Description</button>
	               <button 
	                  className={`nav-item ${activeSubTab === 'coverLetter' ? 'active' : ''}`}
	                  onClick={() => setActiveSubTab('coverLetter')}
	               >Cover Letter</button>
	               {activeSubTab === 'editor' && (
	                 <button className="primary-button history-toolbar-action" onClick={handleCompile}>
	                   {compileStatus || 'Save & Re-Render PDF'}
	                 </button>
	               )}
	            </div>
            
            <div style={{flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column'}}>
               {activeSubTab === 'preview' && (
                 <iframe 
                   src={buildAuthedApiUrl(`/api/output/${activeItem.company}.pdf?req=${activeItem.timestamp}`)}
                   style={{width: '100%', height: '100%', border: 'none', borderRadius: '4px'}}
                   title="Archive Preview"
                 />
               )}
               {activeSubTab === 'jd' && (
                 <div className="surface-block" style={{flex: 1, overflowY: 'auto', padding: '1rem', whiteSpace: 'pre-wrap'}}>
                   {activeItem.jd}
                 </div>
               )}
               {activeSubTab === 'coverLetter' && (
                 activeItem.coverLetter ? (
                   <div style={{display: 'flex', flexDirection: 'column', flex: 1, gap: '1rem'}}>
                     <div style={{display: 'flex', justifyContent: 'flex-end'}}>
                       {activeItem.coverLetterFile && (
                         <a href={buildAuthedApiUrl(`/api/cover-letter/${activeItem.coverLetterFile}`)} download className="secondary-button" style={{textDecoration: 'none'}}>
                           Download Cover Letter
                         </a>
                       )}
                     </div>
                     <textarea
                       readOnly
                       value={activeItem.coverLetter}
                       style={{
                         flex: 1,
                         minHeight: '420px',
                         background: 'rgba(0,0,0,0.3)',
                         color: 'var(--text-primary)',
                         border: '1px solid var(--border-color)',
                         borderRadius: '12px',
                         padding: '1.25rem',
                         lineHeight: 1.6,
                         resize: 'none'
                       }}
                     />
                   </div>
                 ) : (
                   <div style={{display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)'}}>
                     No archived cover letter is available for this resume.
                   </div>
                 )
               )}
	               {activeSubTab === 'editor' && (
	                 <div className="history-editor-pane">
	                   <div className="editor-shell" style={{flex: 1, minHeight: 0}}>
	                     <Editor
	                       height="100%"
	                       language="latex"
	                       theme="vs-dark"
                       value={texContent}
                       onChange={(val) => setTexContent(val || '')}
                       options={{ minimap: { enabled: false }, fontSize: 13, wordWrap: 'on' }}
	                       beforeMount={setupMonaco}
	                     />
	                   </div>
	                 </div>
	               )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ApplicationsView() {
  const [applications, setApplications] = useState([]);
  const [hoveredDay, setHoveredDay] = useState(null);
  const [activeDayDetails, setActiveDayDetails] = useState(null);
  const [dailyGoal, setDailyGoal] = useState(5);

  const getCompanyLabelFromFilename = (item) => {
    const filename = String(item?.filename || '').replace(/\.pdf$/i, '').trim();
    if (!filename) return item?.company || 'Untitled Company';
    return filename
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  useEffect(() => {
    fetch('/api/applications')
      .then(res => res.json())
      .then(data => setApplications(data.applications || []))
      .catch(console.error);

    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        const goal = Number(data.settings?.dailyApplicationGoal || 5);
        setDailyGoal(Number.isFinite(goal) ? goal : 5);
      })
      .catch(console.error);
  }, []);

  const today = new Date();
  const applicationsByDay = applications.reduce((acc, item) => {
    const key = item.appliedOn;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
  const dailySeries = Array.from({ length: 7 }, (_, idx) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - idx));
    const key = date.toISOString().slice(0, 10);
    const dayApplications = applicationsByDay[key] || [];
    return {
      key,
      label: date.toLocaleDateString(undefined, { weekday: 'short' }),
      fullDate: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
      count: dayApplications.length,
      applications: dayApplications
    };
  });

  const todaysCount = dailySeries[dailySeries.length - 1]?.count || 0;
  const weeklyTotal = dailySeries.reduce((sum, day) => sum + day.count, 0);
  const currentStreak = [...dailySeries].reverse().reduce((acc, day) => {
    if (acc.broken) return acc;
    if (day.count >= dailyGoal) return { value: acc.value + 1, broken: false };
    return { value: acc.value, broken: true };
  }, { value: 0, broken: false }).value;
  const selectedDay = hoveredDay || dailySeries[dailySeries.length - 1];
  const chartMax = Math.max(dailyGoal, ...dailySeries.map((day) => day.count));

  return (
    <>
    <div className="hide-scrollbar" style={{padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', height: 'calc(100vh - 120px)', overflowY: 'auto', width: '100%', boxSizing: 'border-box'}}>
      <div className="glass-panel" style={{margin: 0, padding: '0.95rem 1.1rem', flex: '0 0 auto'}}>
        <div style={{display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start'}}>
          <div>
            <h2 className="panel-title" style={{marginBottom: '0.25rem', fontSize: '1.1rem'}}>Daily Apply Quest</h2>
            <p style={{margin: 0, color: 'var(--text-secondary)', lineHeight: 1.45, fontSize: '0.9rem'}}>
              Every successful resume generation is counted automatically here. Aim for at least {dailyGoal} tailored resumes per day, track momentum, and keep the streak alive.
            </p>
          </div>
          <div className="soft-pill success">Goal: {dailyGoal}/day</div>
        </div>

        <div className="applications-summary-grid">
          <div className="generator-score-card">
            <div className="generator-score-label">Applied Today</div>
            <div className="generator-score-value">{todaysCount}</div>
          </div>
          <div className="generator-score-card success">
            <div className="generator-score-label">7-Day Total</div>
            <div className="generator-score-value">{weeklyTotal}</div>
          </div>
          <div className={`generator-score-card ${currentStreak > 0 ? 'excellent' : 'warning'}`}>
            <div className="generator-score-label">{dailyGoal}+/Day Streak</div>
            <div className="generator-score-value">{currentStreak}</div>
          </div>
        </div>
      </div>

      <div className="glass-panel" style={{margin: 0, flex: '1 1 auto', minHeight: '460px'}}>
        <div style={{display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap'}}>
          <h2 className="panel-title" style={{margin: 0}}>Interactive Apply Graph</h2>
          <div className="soft-pill">{selectedDay.label}: {selectedDay.count} applications</div>
        </div>

        <div className="applications-chart-card">
          <div className="applications-goal-line" style={{ bottom: `${(dailyGoal / chartMax) * 100}%` }}>
            <span>Goal {dailyGoal}</span>
          </div>
          <div className="applications-chart">
            {dailySeries.map((day) => (
              <button
                key={day.key}
                type="button"
                className={`applications-bar ${day.count >= dailyGoal ? 'hit-goal' : ''} ${selectedDay.key === day.key ? 'active' : ''}`}
                style={{ height: `${Math.max(10, (day.count / chartMax) * 100)}%` }}
                onMouseEnter={() => setHoveredDay(day)}
                onFocus={() => setHoveredDay(day)}
                onMouseLeave={() => setHoveredDay(null)}
                onBlur={() => setHoveredDay(null)}
                onClick={() => setActiveDayDetails(day)}
              >
                <span className="applications-bar-count">{day.count}</span>
                <span className="applications-bar-label">{day.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
    {activeDayDetails && (
      <div className="onboarding-overlay" onClick={() => setActiveDayDetails(null)}>
        <div
          className="modal-shell applications-day-modal"
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem'}}>
            <div>
              <h3 style={{margin: 0}}>Applications for {activeDayDetails.fullDate}</h3>
              <div style={{color: 'var(--text-secondary)', marginTop: '0.35rem'}}>
                {activeDayDetails.count} generated {activeDayDetails.count === 1 ? 'resume' : 'resumes'}
              </div>
            </div>
            <button className="secondary-button" type="button" onClick={() => setActiveDayDetails(null)}>Close</button>
          </div>
          <div className="applications-day-list">
            {activeDayDetails.applications.length ? activeDayDetails.applications.map((item) => (
              <div key={item.id || `${item.company}-${item.filename}`} className="surface-block" style={{padding: '1rem'}}>
                <div style={{fontWeight: 700}}>{getCompanyLabelFromFilename(item)}</div>
                <div style={{color: 'var(--text-secondary)', marginTop: '0.55rem', fontSize: '0.86rem'}}>
                  {item.updatedAt ? new Date(item.updatedAt).toLocaleString() : item.appliedOn}
                </div>
              </div>
            )) : (
              <div style={{color: 'var(--text-secondary)'}}>No generated resumes were logged for this day.</div>
            )}
          </div>
        </div>
      </div>
    )}
    </>
  );
}

export default App;
