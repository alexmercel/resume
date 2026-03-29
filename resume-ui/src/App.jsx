import React, { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { DataFormDispatcher, ProfileManager } from './DataForms';
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
          [/[\{\}\[\]]/, 'delimiter'],
          [/\$[^\$]*\$/, 'string'],
        ]
      }
    });
  }
};

function App() {
  const [activeTab, setActiveTab] = useState('generator');
  const [onboardingState, setOnboardingState] = useState({
    loading: true,
    needsOnboarding: false,
    fileStatuses: [],
    settings: { geminiApiKey: '', geminiModel: 'gemini-2.5-flash-lite' },
    models: []
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
    fetch('/api/onboarding-status')
      .then(res => res.json())
      .then(data => {
        setOnboardingState({
          loading: false,
          needsOnboarding: !!data.needsOnboarding,
          fileStatuses: data.fileStatuses || [],
          settings: data.settings || { geminiApiKey: '', geminiModel: 'gemini-2.5-flash-lite' },
          models: data.models || []
        });
      })
      .catch(() => {
        setOnboardingState((prev) => ({ ...prev, loading: false }));
      });
  }, []);
  
  return (
    <div className="app-container">
      <header className="header">
        <h1>Resume Builder Studio</h1>
        <div style={{display: 'flex', alignItems: 'center', gap: '0.75rem'}}>
          <div style={{color: 'var(--text-secondary)', fontSize: '0.875rem'}}>AI-Powered LaTeX Generation</div>
          <button
            className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => setActiveTab('profile')}
            style={{padding: '0.55rem 0.9rem', border: '1px solid rgba(255,255,255,0.08)'}}
          >
            🛠️ Profile & AI
          </button>
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
        </aside>
        
        {activeTab === 'generator' && <GeneratorView state={generatorState} setState={setGeneratorState} />}
        {activeTab === 'profile' && <ProfileSettingsView />}
        {activeTab === 'data' && <DataManagementView />}
        {activeTab === 'templates' && <TemplatesView type="wireframes" />}
        {activeTab === 'generic' && <TemplatesView type="generic" />}
        {activeTab === 'history' && <HistoryView />}
        
      </main>

      {!onboardingState.loading && onboardingState.needsOnboarding && (
        <OnboardingOverlay
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

function OnboardingOverlay({ onboardingState, onComplete }) {
  const [apiKey, setApiKey] = useState(onboardingState.settings?.geminiApiKey || '');
  const [model, setModel] = useState(onboardingState.settings?.geminiModel || 'gemini-2.5-flash-lite');
  const [resumeFile, setResumeFile] = useState(null);
  const [status, setStatus] = useState('');
  const [result, setResult] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const models = onboardingState.models?.length ? onboardingState.models : [
    'gemini-3.1-flash-lite-preview',
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite'
  ];
  const missingFiles = onboardingState.fileStatuses.filter((file) => !file.exists || !file.hasContent);

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
            geminiApiKey: apiKey,
            geminiModel: model,
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
              <label style={{fontSize: '0.875rem', color: 'var(--text-secondary)', fontWeight: 'bold'}}>Gemini API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste your Google AI Studio API key"
              />
            </div>

            <div style={{display: 'flex', flexDirection: 'column', gap: '0.35rem'}}>
              <label style={{fontSize: '0.875rem', color: 'var(--text-secondary)', fontWeight: 'bold'}}>Gemini Model</label>
              <select value={model} onChange={(e) => setModel(e.target.value)}>
                {models.map((item) => (
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
                    <span>Gemini API key</span>
                    <span className="soft-pill success">{result.savedSettings?.geminiApiKey ? 'Stored' : 'Missing'}</span>
                  </div>
                  <div style={{display: 'flex', justifyContent: 'space-between', gap: '1rem'}}>
                    <span>Gemini model</span>
                    <span className="soft-pill success">{result.savedSettings?.geminiModel || model}</span>
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

function GeneratorView({ state, setState }) {
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
  const resultsRef = React.useRef(null);
  const updateGeneratorState = (patch) => {
    setState((prev) => ({ ...prev, ...patch }));
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

  // Poll for PDFs
  useEffect(() => {
    const fetchPdfs = () => {
      fetch('/api/outputs')
        .then(res => res.json())
        .then(data => {
          if (data.files) updateGeneratorState({ pdfs: data.files });
        })
        .catch(console.error);
    };
    fetchPdfs();
    const interval = setInterval(fetchPdfs, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleGenerate = () => {
    if (!jd.trim()) { updateGeneratorState({ output: 'Please paste a Job Description first!' }); return; }
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
      body: JSON.stringify({ prompt: jd, template })
    })
    .then(res => res.json())
    .then(data => {
      clearInterval(pollInterval);
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
                  ? (metrics.jdKeywords || []).slice(0, 12).map(k => <span key={k} className="generator-chip">{k}</span>)
                  : ['Python', 'AWS', 'Leadership', 'Analytics'].map(k => <span key={k} className="generator-chip">{k}</span>)}
              </div>
            </div>

            <div>
              <h4 style={{color: metrics ? '#10b981' : 'var(--text-secondary)', margin: '0 0 0.75rem 0', fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '1px', opacity: metrics ? 0.9 : 0.7}}>Matched Keywords</h4>
              <div className={`generator-chip-wrap ${metrics ? '' : 'muted'}`}>
                {metrics
                  ? (metrics.matchedKeywords || []).slice(0, 12).map(k => <span key={k} className="generator-chip success">{k}</span>)
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
              disabled={isGenerating}
              style={{ opacity: isGenerating ? 0.7 : 1, minWidth: '210px' }}
            >
              {isGenerating ? '⏳ Generating...' : '🚀 Auto-Generate Resume'}
            </button>
          </div>
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
                📄 Generated Resume
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
                  <iframe src={`/api/output/${latestPdf.name}?req=${latestPdf.time}`} style={{width:'100%',height:'700px',border:'none'}} title="Resume Preview" />
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
                    className="primary-button"
                    style={{padding: '0.4rem 0.8rem', fontSize: '0.875rem', background: '#3b82f6'}}
                    onClick={(e) => {
                      e.stopPropagation();
                      const docContent = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${coverLetter.replace(/\n/g, '<br/>')}</body></html>`;
                      const blob = new Blob([docContent], { type: 'application/msword;charset=utf-8' });
                      const link = document.createElement('a');
                      link.href = URL.createObjectURL(blob);
                      link.download = latestPdf ? latestPdf.name.replace('.pdf', '_Cover_Letter.doc') : 'Cover_Letter.doc';
                      link.click();
                    }}
                  >
                    Export as Word (.doc)
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

function ProfileSettingsView() {
  const [profileContent, setProfileContent] = useState('');
  const [profileStatus, setProfileStatus] = useState('');
  const [settingsStatus, setSettingsStatus] = useState('');
  const [testStatus, setTestStatus] = useState('');
  const [testResponse, setTestResponse] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gemini-2.5-flash-lite');
  const [models, setModels] = useState([
    'gemini-3.1-flash-lite-preview',
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite'
  ]);

  useEffect(() => {
    fetch('/api/data/profile.md')
      .then(res => res.json())
      .then(data => setProfileContent(data.content || ''))
      .catch(() => setProfileContent(''));

    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        if (data.settings) {
          setApiKey(data.settings.geminiApiKey || '');
          setModel(data.settings.geminiModel || 'gemini-2.5-flash-lite');
        }
        if (data.models?.length) setModels(data.models);
      })
      .catch(console.error);
  }, []);

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
      body: JSON.stringify({ geminiApiKey: apiKey, geminiModel: model })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setSettingsStatus('AI settings saved.');
          if (data.settings?.geminiModel) setModel(data.settings.geminiModel);
          if (data.models?.length) setModels(data.models);
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
      body: JSON.stringify({ geminiApiKey: apiKey, geminiModel: model })
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'LLM test failed.');
        setTestStatus(`Connected successfully with ${data.model}.`);
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
          Save your Gemini API key locally, choose the model used by generation and highlight flows, and test the connection with a sample hello-world request.
        </p>

        <div className="surface-block" style={{padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem'}}>
          <div style={{display: 'flex', flexDirection: 'column', gap: '0.35rem'}}>
            <label style={{fontSize: '0.875rem', color: 'var(--text-secondary)', fontWeight: 'bold'}}>Gemini API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Paste your Google AI Studio API key"
            />
          </div>

          <div style={{display: 'flex', flexDirection: 'column', gap: '0.35rem'}}>
            <label style={{fontSize: '0.875rem', color: 'var(--text-secondary)', fontWeight: 'bold'}}>Gemini Model</label>
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              {models.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
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
            <div style={{fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', marginBottom: '0.5rem'}}>Included models</div>
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
  const [activeFile, setActiveFile] = useState('');
  const [content, setContent] = useState('');
  const [status, setStatus] = useState('');
  const [activeSubTab, setActiveSubTab] = useState('editor'); // 'preview', 'editor'
  const [compileStatus, setCompileStatus] = useState('');
  const [renderTimestamp, setRenderTimestamp] = useState(Date.now());

  const loadTemplates = () => {
    fetch(`/api/templates/${type}`)
      .then(res => res.json())
      .then(data => {
         if (data.templates) {
            setFiles(data.templates);
            if (data.templates.length > 0 && (!data.templates.includes(activeFile))) {
               setActiveFile(data.templates[0]);
            }
         }
      })
      .catch(console.error);
  };

  useEffect(() => {
    setFiles([]);
    setActiveFile('');
    setContent('');
    loadTemplates();
  }, [type]);

  useEffect(() => {
    if (activeFile) {
       fetch(`/api/template/${type}/${activeFile}`)
         .then(res => res.json())
         .then(data => {
            if (data.content !== undefined) setContent(data.content);
            else setContent('Error loading file.');
            setStatus('');
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
    const saved = await handleSave();
    if (saved) {
       fetch(`/api/compile-template/${type}/${activeFile}`, { method: 'POST' })
         .then(res => res.json())
         .then(compData => {
            if (compData.success) {
              setCompileStatus('Success!');
              setTimeout(() => setCompileStatus(''), 2000);
              setRenderTimestamp(Date.now()); // refresh iframe
            } else {
              setCompileStatus('Error Compiling');
            }
         });
    }
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
           {type === 'wireframes' ? 'LaTeX Wireframe Templates' : 'Generic Ready Resumes'}
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
      <p style={{color: 'var(--text-secondary)'}}>
        {type === 'wireframes' 
          ? 'Directly modify the structural `.tex` code for all AI generation wireframes.'
          : 'Manage and tweak your complete generic ready-to-use resume distributions.'}
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
              {file}
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
                src={`/api/template-pdf/${type}/${activeFile}?req=${renderTimestamp}`}
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

function HistoryView() {
  const [history, setHistory] = useState([]);
  const [activeItem, setActiveItem] = useState(null);
  const [activeSubTab, setActiveSubTab] = useState('preview'); // 'preview', 'editor', 'jd', 'coverLetter'
  const [texContent, setTexContent] = useState('');
  const [compileStatus, setCompileStatus] = useState('');

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
            if (data.content) setTexContent(data.content);
         })
         .catch(console.error);
    }
  }, [activeItem]);

  const handleCompile = () => {
    setCompileStatus('Compiling...');
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
               if (compData.success) {
                 setCompileStatus('Success!');
                 setTimeout(() => setCompileStatus(''), 2000);
                 // Force iframe refresh by toggling active item timestamp mapping
                 setActiveItem({...activeItem, timestamp: Date.now()});
               } else {
                 setCompileStatus('Error Compiling');
               }
            });
       }
    });
  };

  return (
    <div className="grid-2" style={{margin: '1.5rem', height: 'calc(100vh - 120px)'}}>
      <div className="glass-panel" style={{margin: 0, overflowY: 'auto'}}>
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
                 <a href={`/api/output/${item.company}.pdf`} download className="primary-button" style={{textDecoration: 'none', fontSize: '0.75rem', padding: '0.4rem 0.8rem'}}>
                   ⬇ Download PDF
                 </a>
                 {item.coverLetterFile && (
                   <a href={`/api/cover-letter/${item.coverLetterFile}`} download className="secondary-button" style={{textDecoration: 'none', fontSize: '0.75rem', padding: '0.4rem 0.8rem'}}>
                     ⬇ Cover Letter
                   </a>
                 )}
              </div>
            </div>
          ))}
        </div>
      </div>
      
      <div className="glass-panel" style={{margin: 0, display: 'flex', flexDirection: 'column'}}>
        {!activeItem ? (
           <div style={{display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)'}}>
             Select a resume from the archive to view or edit.
           </div>
        ) : (
          <>
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
            </div>
            
            <div style={{flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column'}}>
               {activeSubTab === 'preview' && (
                 <iframe 
                   src={`/api/output/${activeItem.company}.pdf?req=${activeItem.timestamp}`}
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
                         <a href={`/api/cover-letter/${activeItem.coverLetterFile}`} download className="secondary-button" style={{textDecoration: 'none'}}>
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
                 <div style={{display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden'}}>
                   <div className="editor-shell" style={{flex: 1, marginBottom: '1rem'}}>
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
                   <button className="primary-button" onClick={handleCompile} style={{alignSelf: 'flex-end'}}>
                     {compileStatus || 'Save & Re-Render PDF'}
                   </button>
                 </div>
               )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
