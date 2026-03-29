import React, { useState, useEffect } from 'react';

// ============================================
// SHARED UI COMPONENTS
// ============================================
function FormCard({ title, onRemove, children }) {
  return (
    <div className="surface-block" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ margin: 0, fontSize: '1.125rem' }}>{title || 'New Item'}</h3>
        {onRemove && (
           <button className="danger-button" onClick={onRemove} style={{ padding: '0.5rem 1rem' }}>
             Delete Card
           </button>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {children}
      </div>
    </div>
  );
}

function InputField({ label, value, onChange, placeholder, isTextarea }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1 }}>
      <label style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>{label}</label>
      {isTextarea ? (
        <textarea 
          style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: '#fff', resize: 'vertical', minHeight: '80px', fontFamily: 'inherit', lineHeight: '1.5' }}
          value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        />
      ) : (
        <input 
          style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: '#fff' }}
          value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        />
      )}
    </div>
  );
}

function BulletList({ bullets, setBullets, label }) {
  const updateBullet = (idx, valObj) => {
    const newB = [...bullets];
    newB[idx] = valObj;
    setBullets(newB);
  };
  const removeBullet = (idx) => setBullets(bullets.filter((_, i) => i !== idx));
  const addBullet = () => setBullets([...bullets, { text: '', dirty: true }]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <label style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>{label || "Bullet Points"}</label>
      {bullets.map((b, idx) => {
         const isHighlighted = b.text.includes('**');
         const displayAiMark = isHighlighted && !b.dirty;
         
         return (
         <div key={idx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
            <span style={{ paddingTop: '0.75rem', color: displayAiMark ? '#A855F7' : 'var(--text-secondary)', fontWeight: displayAiMark ? 'bold' : 'normal', fontSize: displayAiMark ? '1rem' : '0.875rem' }}>
              {displayAiMark ? '✨' : '•'}
            </span>
            <textarea 
              style={{ flex: 1, padding: '0.75rem', background: displayAiMark ? 'rgba(168, 85, 247, 0.1)' : 'rgba(255,255,255,0.05)', border: displayAiMark ? '1px solid #A855F7' : '1px solid var(--border-color)', color: '#fff', resize: 'vertical', minHeight: '44px', fontFamily: 'inherit', lineHeight: '1.5' }}
              value={b.text} 
              onChange={e => updateBullet(idx, { text: e.target.value, dirty: true })} 
              placeholder="Bullet point..."
            />
            <button onClick={() => removeBullet(idx)} style={{ background: 'transparent', border: 'none', color: 'var(--error-color)', cursor: 'pointer', padding: '0.75rem', fontSize: '1.25rem', lineHeight: '1' }}>✕</button>
         </div>
      )})}
      <button onClick={addBullet} className="secondary-button" style={{ alignSelf: 'flex-start', fontSize: '0.875rem', padding: '0.5rem 1rem' }}>+ Add Bullet</button>
    </div>
  );
}

function DiffModal({ originalMarkdown, aiMarkdown, onApply, onCancel }) {
   const [diffLines, setDiffLines] = useState([]);
   const [selectedLines, setSelectedLines] = useState(new Set());
   
   useEffect(() => {
       const orig = (originalMarkdown || '').trim().split('\n');
       const ai = (aiMarkdown || '').trim().split('\n');
       const diffs = [];
       const max = Math.max(orig.length, ai.length);
       for (let i = 0; i < max; i++) {
           const oLine = orig[i] || '';
           const aLine = ai[i] || '';
           if (oLine !== aLine) {
               diffs.push({ index: i, original: oLine, proposed: aLine });
           }
       }
       setDiffLines(diffs);
       setSelectedLines(new Set(diffs.map(d => d.index)));
   }, [originalMarkdown, aiMarkdown]);

   const handleApply = () => {
       const orig = (originalMarkdown || '').trim().split('\n');
       const ai = (aiMarkdown || '').trim().split('\n');
       const finalLines = [];
       const max = Math.max(orig.length, ai.length);
       for(let i = 0; i < max; i++) {
           if (selectedLines.has(i)) finalLines.push(ai[i] || '');
           else finalLines.push(orig[i] || '');
       }
       onApply(finalLines.join('\n'));
   };

   return (
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
         <div className="modal-shell" style={{ width: '90%', maxWidth: '900px', maxHeight: '80vh', overflowY: 'auto', padding: '2rem', display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ marginTop: 0, color: '#fff' }}>Review AI Highlights</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>Select which highlighted metrics you want to keep. Unchecked lines will safely discard the AI's proposal.</p>
            
            {diffLines.length === 0 ? (
               <div className="surface-block" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', borderStyle: 'dashed' }}>No actionable highlight changes were proposed by the AI.</div>
            ) : (
               <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto', paddingRight: '0.5rem' }}>
                  {diffLines.map(diff => (
                     <div key={diff.index} className="surface-block" style={{ display: 'flex', gap: '1rem', padding: '1.25rem', borderLeft: selectedLines.has(diff.index) ? '4px solid #10b981' : '4px solid transparent' }}>
                        <input 
                           type="checkbox" 
                           checked={selectedLines.has(diff.index)} 
                           onChange={(e) => {
                              const s = new Set(selectedLines);
                              if(e.target.checked) s.add(diff.index);
                              else s.delete(diff.index);
                              setSelectedLines(s);
                           }} 
                           style={{ marginTop: '0.25rem', width: '20px', height: '20px', cursor: 'pointer' }} 
                        />
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.875rem' }}>   
                           <div style={{ color: 'var(--text-secondary)' }}>
                              <strong style={{ color: '#ef4444', display: 'block', marginBottom: '0.25rem' }}>Original:</strong> {diff.original}
                           </div>
                           <div className="surface-block" style={{ color: '#fff', padding: '0.75rem' }}>
                              <strong style={{ color: '#10b981', display: 'block', marginBottom: '0.25rem' }}>AI Proposed:</strong> {diff.proposed}
                           </div>
                        </div>
                     </div>
                  ))}
               </div>
            )}
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
               <button className="secondary-button" onClick={onCancel}>Cancel AI Highlights</button>
               <button className="primary-button" onClick={handleApply}>Apply Selected Highlights</button>
            </div>
         </div>
      </div>
   );
}

function AIHighlightButton({ getMarkdown, onPreview }) {
   const [loading, setLoading] = useState(false);
   const [diffState, setDiffState] = useState(null);
   
   const handleHighlight = async () => {
      setLoading(true);
      const markdown = getMarkdown();
      const lines = markdown.split('\n');
      const linesToHighlight = [];
      const lineMap = [];
      
      lines.forEach((line, index) => {
         let t = line.trim();
         if (!t || t.startsWith('#') || t.match(/^\*[^*]+\*$/)) return;
         
         const isDirty = t.includes('<!--DIRTY-->');
         t = t.replace(' <!--DIRTY-->', '');
         
         if (!isDirty && t.includes('**')) return;
         if (t.startsWith('- ')) {
            linesToHighlight.push(t);
            lineMap.push(index);
         }
      });
      
      if (linesToHighlight.length === 0) {
         setLoading(false);
         alert('✨ All your actionable points are already highlighted!');
         return;
      }
      
      try {
         const res = await fetch('/api/highlight', {
            method: 'POST', body: JSON.stringify({ content: linesToHighlight.join('\n') })
         });
         const data = await res.json();
         if (data.content) {
            const aiLines = data.content.split('\n').filter(l => l.trim().startsWith('- '));
            const newLines = [...lines];
            aiLines.forEach((aiLine, i) => {
               const origIdx = lineMap[i];
               if (origIdx !== undefined && aiLine !== linesToHighlight[i]) {
                  newLines[origIdx] = aiLine;
               }
            });
            setDiffState({ orig: markdown.replace(/ <!--DIRTY-->/g, ''), ai: newLines.join('\n').replace(/ <!--DIRTY-->/g, '') });
         } else {
            alert('Highlight Failed: ' + data.error);
         }
      } catch (e) {
         alert('Failed to connect to AI instance.');
      }
      setLoading(false);
   };
   
   return (
      <>
         <button onClick={handleHighlight} disabled={loading} className="primary-button" style={{ padding: '0.5rem 1rem', background: 'linear-gradient(90deg, #A855F7, #EC4899)', cursor: loading ? 'wait' : 'pointer' }}>
            {loading ? '✨ Reasoning...' : '✨ AI Highlight'}
         </button>
         {diffState && (
            <DiffModal 
               originalMarkdown={diffState.orig} 
               aiMarkdown={diffState.ai} 
               onApply={(finalMarkdown) => {
                  onPreview(finalMarkdown + '\n');
                  setDiffState(null);
               }}
               onCancel={() => setDiffState(null)} 
            />
         )}
      </>
   );
}

function PillInput({ skills, setSkills, label }) {
  const [inputValue, setInputValue] = useState('');

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
       e.preventDefault();
       const values = inputValue.split(',').map(s => s.trim()).filter(s => s);
       const updated = [...skills];
       values.forEach(val => {
          if (!updated.includes(val)) updated.push(val);
       });
       if (updated.length !== skills.length) setSkills(updated);
       setInputValue('');
    } else if (e.key === 'Backspace' && !inputValue && skills.length > 0) {
       setSkills(skills.slice(0, -1));
    }
  };

  const removeSkill = (sk) => setSkills(skills.filter(s => s !== sk));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1 }}>
      <label style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>{label}</label>
      <div 
         className="surface-block"
         style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', padding: '0.5rem', minHeight: '44px', alignItems: 'center' }}
         onClick={() => document.getElementById('pill-input-field')?.focus()}
      >
         {skills.map(s => {
            const isBold = s.startsWith('**') && s.endsWith('**');
            const display = isBold ? s.replace(/\*\*/g, '') : s;
            return (
            <div key={s} style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', background: isBold ? 'rgba(168, 85, 247, 0.3)' : 'rgba(99, 102, 241, 0.22)', padding: '0.25rem 0.5rem', borderRadius: '999px', fontSize: '0.875rem', fontWeight: isBold ? 800 : 500, border: isBold ? '1px solid #A855F7' : '1px solid rgba(99, 102, 241, 0.18)' }}>
               {isBold && <span style={{ fontSize: '0.75rem', marginRight: '0.125rem' }}>✨</span>}
               <span style={{ color: isBold ? '#e9d5ff' : '#fff' }}>{display}</span>
               <button onClick={(e) => { e.stopPropagation(); removeSkill(s); }} style={{ background: 'transparent', border: 'none', color: '#fff', marginLeft: '0.25rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', padding: '0 0.125rem' }}>✕</button>
            </div>
         )})}
         <input 
            id="pill-input-field"
            style={{ flex: 1, minWidth: '120px', background: 'transparent', border: 'none', color: '#fff', outline: 'none', fontSize: '0.875rem', padding: '0.25rem 0' }}
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a skill and press Enter or Comma..."
         />
      </div>
    </div>
  );
}

// ============================================
// 0. PROFILE MANAGER
// ============================================
export function ProfileManager({ rawMarkdown, onSave, onDiscard }) {
  const [profile, setProfile] = useState({ name: '', location: '', phone: '', email: '', linkedin: '' });

  useEffect(() => {
    if (!rawMarkdown) return;
    const lines = rawMarkdown.split('\n');
    const parsed = { name: '', location: '', phone: '', email: '', linkedin: '' };
    lines.forEach(l => {
      const match = l.match(/-\s*\*\*(.*?):\*\*\s*(.*)/);
      if (match) {
        const key = match[1].toLowerCase();
        if (parsed[key] !== undefined) parsed[key] = match[2].trim();
      }
    });
    setProfile(parsed);
  }, [rawMarkdown]);

  const getMarkdown = () => {
    return `# Personal Profile\n\n- **Name:** ${profile.name}\n- **Location:** ${profile.location}\n- **Phone:** ${profile.phone}\n- **Email:** ${profile.email}\n- **LinkedIn:** ${profile.linkedin}\n`;
  };

  const handleSave = () => {
    onSave(getMarkdown());
  };

  const updateProfile = (field, val) => setProfile({ ...profile, [field]: val });

  return (
    <div className="section-scroll">
      <div className="action-row">
        <button className="danger-button" onClick={onDiscard}>Discard Current Changes</button>
        <button className="primary-button" onClick={handleSave}>Save Config to Disk</button>
      </div>
      <FormCard title="Personal Identity Headers">
         <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
            <InputField label="Full Name" value={profile.name} onChange={v => updateProfile('name', v)} placeholder="E.g. John Doe" />
            <InputField label="Location / Mapping" value={profile.location} onChange={v => updateProfile('location', v)} placeholder="E.g. Los Angeles, CA" />
         </div>
         <div style={{ display: 'flex', gap: '1rem' }}>
            <InputField label="Phone Number" value={profile.phone} onChange={v => updateProfile('phone', v)} placeholder="E.g. +1 123-456-7890" />
            <InputField label="Email Address" value={profile.email} onChange={v => updateProfile('email', v)} placeholder="E.g. john@example.com" />
            <InputField label="LinkedIn URL Node" value={profile.linkedin} onChange={v => updateProfile('linkedin', v)} placeholder="E.g. linkedin.com/in/johndoe" />
         </div>
      </FormCard>
    </div>
  );
}

// ============================================
// 1. PROJECTS MANAGER
// ============================================
function ProjectsManager({ rawMarkdown, onSave, onPreview, onDiscard }) {
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    if (!rawMarkdown) return;
    const sections = rawMarkdown.split(/^## /m).slice(1);
    const parsed = sections.map((sec, idx) => {
      const lines = sec.trim().split('\n');
      const title = lines[0].trim();
      let dates = '';
      const bullets = [];
      lines.slice(1).forEach(l => {
        const tl = l.trim();
        if (!tl) return;
        if (tl.startsWith('*') && tl.endsWith('*') && !tl.startsWith('-')) dates = tl.replace(/\*/g, '');
        else if (tl.startsWith('- ')) bullets.push({ text: tl.substring(2).replace(' <!--DIRTY-->', ''), dirty: false });
        else bullets.push({ text: tl.replace(' <!--DIRTY-->', ''), dirty: false });
      });
      return { id: `proj-${idx}`, title, dates, bullets };
    });
    setProjects(parsed);
  }, [rawMarkdown]);

  const getMarkdown = () => {
    let out = '# Projects\n\n';
    projects.forEach(p => {
      out += `## ${p.title}\n`;
      if (p.dates) out += `*${p.dates}*\n`;
      p.bullets.forEach(b => out += `- ${b.text}${b.dirty ? ' <!--DIRTY-->' : ''}\n`);
      out += '\n';
    });
    return out.trim();
  };

  const handleSave = () => {
    onSave(getMarkdown().replace(/ <!--DIRTY-->/g, '') + '\n');
  };

  const updateProj = (id, field, val) => setProjects(projects.map(p => p.id === id ? { ...p, [field]: val } : p));
  const removeProj = (id) => setProjects(projects.filter(p => p.id !== id));
  const addProj = () => setProjects([{ id: Math.random().toString(), title: '', dates: '', bullets: [] }, ...projects]);

  return (
    <div className="section-scroll">
      <div className="action-row">
        <AIHighlightButton getMarkdown={getMarkdown} onPreview={onPreview} />
        <button className="danger-button" onClick={onDiscard}>Discard Current Changes</button>
        <button className="secondary-button" onClick={addProj}>+ Add Project</button>
        <button className="primary-button" onClick={handleSave}>Save Config to Disk</button>
      </div>
      {projects.map(p => (
        <FormCard key={p.id} title={p.title} onRemove={() => removeProj(p.id)}>
          <div style={{ display: 'flex', gap: '1rem' }}>
             <InputField label="Project Title" value={p.title} onChange={v => updateProj(p.id, 'title', v)} placeholder="E.g. Healthcare App" />
             <InputField label="Dates / Year" value={p.dates} onChange={v => updateProj(p.id, 'dates', v)} placeholder="E.g. 2026" />
          </div>
          <BulletList bullets={p.bullets} setBullets={v => updateProj(p.id, 'bullets', v)} />
        </FormCard>
      ))}
    </div>
  );
}

// ============================================
// 2. EDUCATION MANAGER
// ============================================
function EducationManager({ rawMarkdown, onSave, onPreview, onDiscard }) {
  const [education, setEducation] = useState([]);

  useEffect(() => {
    if (!rawMarkdown) return;
    const sections = rawMarkdown.split(/^## /m).slice(1);
    const parsed = sections.map((sec, idx) => {
      const lines = sec.trim().split('\n');
      const titleLine = lines[0].trim();
      let school = titleLine, location = '';
      if (titleLine.includes('|')) {
         const parts = titleLine.split('|');
         location = parts.pop().trim();
         school = parts.join('|').trim();
      } else if (titleLine.includes(',')) {
         const parts = titleLine.split(',');
         school = parts[0].trim();
         location = parts.slice(1).join(',').trim();
      }
      
      let startDate = '', endDate = '', degree = '', major = '', gpa = '', coursework = '';
      const bullets = [];
      
      lines.slice(1).forEach(l => {
         const tl = l.trim();
         if (!tl) return;
         if (tl.startsWith('**') && tl.endsWith('**') && !tl.startsWith('-')) {
             let dStr = tl.replace(/\*\*/g, '');
             if (dStr.includes('--')) {
                const lp = dStr.split('--');
                startDate = lp[0].trim();
                endDate = lp.slice(1).join('--').trim();
             } else if (dStr.includes('-')) {
                const lp = dStr.split('-');
                startDate = lp[0].trim();
                endDate = lp.slice(1).join('-').trim();
             } else {
                startDate = dStr;
             }
         }
         else if (tl.startsWith('- **') && tl.includes('Coursework:')) coursework = tl.replace(/- \*\*.*Coursework:\*\*/i, '').trim();
         else if (tl.startsWith('- **') && tl.match(/- \*\*(C?GPA):\*\*/i)) {
            gpa = tl.replace(/- \*\*(C?GPA):\*\*/i, '').trim();
         } else if (tl.startsWith('- **') && !tl.includes('Coursework:')) {
            let degLine = tl.replace(/^- \*\*/, '');
            if (degLine.includes('|')) {
               const parts = degLine.split('|');
               degLine = parts[0].replace(/\*\*/g, '').trim();
               gpa = parts[1].replace(/.*GPA:/i, '').trim();
            } else {
               degLine = degLine.replace(/\*\*/g, '').trim();
            }
            if (degLine.toLowerCase().includes(' in ')) {
               const inIndex = degLine.toLowerCase().indexOf(' in ');
               degree = degLine.substring(0, inIndex).trim();
               major = degLine.substring(inIndex + 4).trim();
            } else {
               degree = degLine;
               major = '';
            }
         } else if (tl.startsWith('- ')) {
            bullets.push({ text: tl.substring(2).replace(' <!--DIRTY-->', ''), dirty: false });
         }
      });
      return { id: `edu-${idx}`, school, location, startDate, endDate, degree, major, gpa, coursework, bullets };
    });
    setEducation(parsed);
  }, [rawMarkdown]);

  const getMarkdown = () => {
    let out = '# Education\n\n';
    education.forEach(ed => {
      out += `## ${ed.school}${ed.location ? ', ' + ed.location : ''}\n`;
      if (ed.startDate || ed.endDate) {
         let dates = ed.startDate || '';
         if (ed.endDate) dates += (ed.startDate ? ' -- ' : '') + ed.endDate;
         out += `**${dates}**\n`;
      }
      if (ed.degree || ed.major) {
         let dStr = ed.degree || '';
         if (ed.major) dStr += ` in ${ed.major}`;
         out += `- **${dStr}**`;
         if (ed.gpa) out += ` | GPA: ${ed.gpa}`;
         out += '\n';
      } else if (ed.gpa) {
         out += `- **CGPA:** ${ed.gpa}\n`;
      }
      if (ed.coursework) out += `- **Relevant Coursework:** ${ed.coursework}\n`;
      ed.bullets.forEach(b => out += `- ${b.text}${b.dirty ? ' <!--DIRTY-->' : ''}\n`);
      out += '\n';
    });
    return out.trim();
  };

  const handleSave = () => {
    onSave(getMarkdown().replace(/ <!--DIRTY-->/g, '') + '\n');
  };

  const updateEd = (id, field, val) => setEducation(education.map(e => e.id === id ? { ...e, [field]: val } : e));
  const removeEd = (id) => setEducation(education.filter(e => e.id !== id));
  const addEd = () => setEducation([{ id: Math.random().toString(), school: '', location: '', startDate: '', endDate: '', degree: 'Master of Science', major: '', gpa: '', coursework: '', bullets: [] }, ...education]);

  return (
    <div className="section-scroll">
      <div className="action-row">
        <AIHighlightButton getMarkdown={getMarkdown} onPreview={onPreview} />
        <button className="danger-button" onClick={onDiscard}>Discard Current Changes</button>
        <button className="secondary-button" onClick={addEd}>+ Add Education</button>
        <button className="primary-button" onClick={handleSave}>Save Config to Disk</button>
      </div>
      {education.map(e => (
        <FormCard key={e.id} title={e.school} onRemove={() => removeEd(e.id)}>
          <div style={{ display: 'flex', gap: '1rem' }}>
             <InputField label="School Name" value={e.school} onChange={v => updateEd(e.id, 'school', v)} placeholder="E.g. University of Southern California" />
             <InputField label="Location" value={e.location} onChange={v => updateEd(e.id, 'location', v)} placeholder="E.g. Los Angeles, CA" />
             <InputField label="Start Date" value={e.startDate} onChange={v => updateEd(e.id, 'startDate', v)} placeholder="E.g. Aug 2024" />
             <InputField label="End Date" value={e.endDate} onChange={v => updateEd(e.id, 'endDate', v)} placeholder="E.g. May 2026 or Present" />
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
             <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '250px' }}>
                <label style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>Degree Level</label>
                <select 
                  style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '6px' }}
                  value={['Bachelor of Science', 'Bachelor of Arts', 'Master of Science', 'Master of Arts', 'B.Tech.', 'Ph.D.', ''].includes(e.degree) ? e.degree : 'Other'} 
                  onChange={ev => {
                    if (ev.target.value === 'Other') {
                       updateEd(e.id, 'degree', 'Custom Degree');
                    } else {
                       updateEd(e.id, 'degree', ev.target.value);
                    }
                  }}
                >
                  <option value="Bachelor of Science">Bachelor of Science</option>
                  <option value="Bachelor of Arts">Bachelor of Arts</option>
                  <option value="Master of Science">Master of Science</option>
                  <option value="Master of Arts">Master of Arts</option>
                  <option value="B.Tech.">B.Tech.</option>
                  <option value="Ph.D.">Ph.D.</option>
                  <option value="Other">Other (Type Custom)</option>
                  <option value="">None / Hidden</option>
                </select>
                
                {!['Bachelor of Science', 'Bachelor of Arts', 'Master of Science', 'Master of Arts', 'B.Tech.', 'Ph.D.', ''].includes(e.degree) && (
                   <input 
                     style={{ marginTop: '0.5rem', padding: '0.75rem', background: 'rgba(0,0,0,0.2)', border: '1px dashed var(--error-color)', color: '#fff', borderRadius: '6px' }}
                     value={e.degree === 'Custom Degree' ? '' : e.degree}
                     onChange={ev => updateEd(e.id, 'degree', ev.target.value)}
                     placeholder="Type custom degree..."
                     autoFocus
                   />
                )}
             </div>
             <InputField label="Major" value={e.major} onChange={v => updateEd(e.id, 'major', v)} placeholder="E.g. Computer Science" />
             <div style={{ width: '150px' }}>
               <InputField label="GPA / CGPA" value={e.gpa} onChange={v => updateEd(e.id, 'gpa', v)} placeholder="E.g. 3.7/4.0" />
             </div>
          </div>
          <InputField label="Relevant Coursework" value={e.coursework} onChange={v => updateEd(e.id, 'coursework', v)} isTextarea placeholder="Comma separated list of courses..." />
          <BulletList bullets={e.bullets} setBullets={v => updateEd(e.id, 'bullets', v)} label="Additional Bullets" />
        </FormCard>
      ))}
    </div>
  );
}

// ============================================
// 3. SKILLS MANAGER
// ============================================
function SkillsManager({ rawMarkdown, onSave, onPreview, onDiscard }) {
  const [skills, setSkills] = useState([]);

  useEffect(() => {
    if (!rawMarkdown) return;
    const sections = rawMarkdown.split(/^## /m).slice(1);
    const parsed = sections.map((sec, idx) => {
      const lines = sec.trim().split('\n');
      const title = lines[0].trim();
      
      const subs = [];
      let curSub = { name: '', items: [] };

      lines.slice(1).forEach(l => {
         const t = l.replace(/^- /, '').trim();
         if (t) {
            if (t.startsWith('**') && t.includes(':**')) {
               const nEnd = t.indexOf(':**');
               const sName = t.substring(2, nEnd).trim();
               const remainder = t.substring(nEnd + 3).trim();
               
               curSub = { id: Math.random().toString(), name: sName, items: remainder.split(',').map(s=>s.trim()).filter(s=>s) };
               subs.push(curSub);
            } else {
               if (!curSub.name && subs.length === 0) {
                  curSub = { id: Math.random().toString(), name: '', items: [] };
                  subs.push(curSub);
               }
               curSub.items.push(...t.split(',').map(s=>s.trim()).filter(s=>s));
            }
         }
      });
      return { id: `skill-${idx}`, category: title, subs };
    });
    setSkills(parsed);
  }, [rawMarkdown]);

  const getMarkdown = () => {
    let out = '# Technical Skills\n\n';
    skills.forEach(s => {
      out += `## ${s.category}\n`;
      s.subs.forEach(sub => {
         if (sub.items && sub.items.length > 0) {
            if (sub.name) {
               out += `- **${sub.name}:** ${sub.items.join(', ')}\n`;
            } else {
               out += `- ${sub.items.join(', ')}\n`;
            }
         }
      });
      out += '\n';
    });
    return out.trim();
  };

  const handleSave = () => {
    onSave(getMarkdown() + '\n');
  };

  const updateSkill = (id, field, val) => setSkills(skills.map(s => s.id === id ? { ...s, [field]: val } : s));
  const removeSkill = (id) => setSkills(skills.filter(s => s.id !== id));
  const addSkill = () => setSkills([...skills, { id: Math.random().toString(), category: 'New Category', subs: [] }]);

  const updateSub = (catId, subId, field, val) => {
     setSkills(skills.map(s => s.id === catId ? { ...s, subs: s.subs.map(sub => sub.id === subId ? { ...sub, [field]: val } : sub) } : s));
  };
  const removeSub = (catId, subId) => {
     setSkills(skills.map(s => s.id === catId ? { ...s, subs: s.subs.filter(sub => sub.id !== subId) } : s));
  };
  const addSub = (catId) => {
     setSkills(skills.map(s => s.id === catId ? { ...s, subs: [...s.subs, { id: Math.random().toString(), name: '', items: [] }] } : s));
  };

  return (
    <div className="section-scroll">
      <div className="action-row">
        <AIHighlightButton getMarkdown={getMarkdown} onPreview={onPreview} />
        <button className="danger-button" onClick={onDiscard}>Discard Current Changes</button>
        <button className="secondary-button" onClick={addSkill}>+ Add Header Layer</button>
        <button className="primary-button" onClick={handleSave}>Save Config to Disk</button>
      </div>
      {skills.map(s => (
        <FormCard key={s.id} title={s.category} onRemove={() => removeSkill(s.id)}>
          <InputField label="Category Name" value={s.category} onChange={v => updateSkill(s.id, 'category', v)} placeholder="E.g. Languages" />
          
          <div style={{ marginTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem' }}>
             <label style={{ fontSize: '1rem', color: '#fff', fontWeight: 'bold', display: 'block', marginBottom: '1rem' }}>Sub-Categories</label>
             {s.subs.map(sub => (
               <div key={sub.id} className="surface-block" style={{ padding: '1rem', marginBottom: '1rem' }}>
                 <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
                   <button className="danger-button" onClick={() => removeSub(s.id, sub.id)} style={{ padding: '0.45rem 0.8rem', fontSize: '0.875rem' }}>Delete Sub</button>
                 </div>
                 <InputField label="Sub-Category Header (e.g., Cloud)" value={sub.name} onChange={v => updateSub(s.id, sub.id, 'name', v)} placeholder="Leave blank for raw skills..." />
                 <div style={{ marginTop: '-0.5rem' }}>
                   <PillInput label="" skills={sub.items} setSkills={v => updateSub(s.id, sub.id, 'items', v)} />
                 </div>
               </div>
             ))}
             <button onClick={() => addSub(s.id)} className="secondary-button" style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}>+ Sub-Category Block</button>
          </div>

        </FormCard>
      ))}
    </div>
  );
}

// ============================================
// 4. WORK EXPERIENCE MANAGER
// ============================================
function WorkExManager({ rawMarkdown, onSave, onPreview, onDiscard }) {
  const [companies, setCompanies] = useState([]);

  useEffect(() => {
    if (!rawMarkdown) return;
    const sections = rawMarkdown.split(/^## /m).slice(1);
    const parsed = sections.map((sec, idx) => {
      const lines = sec.trim().split('\n');
      const titleLine = lines[0].trim();
      let company = titleLine, location = '';
      if (titleLine.includes('|')) {
         const parts = titleLine.split('|');
         company = parts[0].trim();
         location = parts[1].trim();
      } else if (titleLine.includes(',')) {
         const parts = titleLine.split(',');
         company = parts[0].trim();
         location = parts.slice(1).join(',').trim();
      }
      
      const roles = [];
      let curRole = null;
      let globStartDate = '', globEndDate = '';
      
      lines.slice(1).forEach(l => {
         const tl = l.trim();
         if (!tl) return;
         if (tl.startsWith('**') && tl.endsWith('**') && !tl.startsWith('-')) {
            if (curRole) roles.push(curRole);
            curRole = { id: Math.random().toString(), title: tl.replace(/\*\*/g, ''), startDate: '', endDate: '', bullets: [] };
         } else if (tl.startsWith('*') && tl.endsWith('*') && !tl.startsWith('-')) {
            let dStr = tl.replace(/\*/g, '');
            let sDate = dStr, eDate = '';
            if (dStr.includes('--')) { sDate = dStr.split('--')[0].trim(); eDate = dStr.split('--').slice(1).join('--').trim(); }
            else if (dStr.includes('-')) { sDate = dStr.split('-')[0].trim(); eDate = dStr.split('-').slice(1).join('-').trim(); }

            if (curRole) { curRole.startDate = sDate; curRole.endDate = eDate; }
            else { globStartDate = sDate; globEndDate = eDate; }
         } else if (tl.startsWith('- ')) {
            if (!curRole) curRole = { id: Math.random().toString(), title: 'General Role', startDate: '', endDate: '', bullets: [] };
            curRole.bullets.push({ text: tl.substring(2).replace(' <!--DIRTY-->', ''), dirty: false });
         }
      });
      if (curRole) roles.push(curRole);
      
      return { id: `work-${idx}`, company, location, globStartDate, globEndDate, roles };
    });
    setCompanies(parsed);
  }, [rawMarkdown]);

  const getMarkdown = () => {
    let out = '# Experience\n\n';
    companies.forEach(comp => {
      let head = comp.company || '';
      if (comp.location) head += ` | ${comp.location}`;
      out += `## ${head}\n`;
      if (comp.globStartDate || comp.globEndDate) {
          let gDate = comp.globStartDate || '';
          if (comp.globEndDate) gDate += (comp.globStartDate ? ' -- ' : '') + comp.globEndDate;
          out += `*${gDate}*\n`;
      }
      comp.roles.forEach(role => {
         out += `\n**${role.title}**\n`;
         if (role.startDate || role.endDate) {
            let rDate = role.startDate || '';
            if (role.endDate) rDate += (role.startDate ? ' -- ' : '') + role.endDate;
            out += `*${rDate}*\n`;
         }
         role.bullets.forEach(b => out += `- ${b.text}${b.dirty ? ' <!--DIRTY-->' : ''}\n`);
      });
      out += '\n';
    });
    return out.trim();
  };

  const handleSave = () => {
    onSave(getMarkdown().replace(/ <!--DIRTY-->/g, '') + '\n');
  };

  const updateComp = (id, field, val) => setCompanies(companies.map(c => c.id === id ? { ...c, [field]: val } : c));
  const removeComp = (id) => setCompanies(companies.filter(c => c.id !== id));
  const addComp = () => setCompanies([{ id: Math.random().toString(), company: '', location: '', globStartDate: '', globEndDate: '', roles: [{ id: Math.random().toString(), title: '', startDate: '', endDate: '', bullets: [] }] }, ...companies]);
  
  const updateRole = (compId, roleId, field, val) => {
    setCompanies(companies.map(c => c.id === compId ? { ...c, roles: c.roles.map(r => r.id === roleId ? { ...r, [field]: val} : r) } : c));
  };
  const addRole = (compId) => {
    setCompanies(companies.map(c => c.id === compId ? { ...c, roles: [...c.roles, { id: Math.random().toString(), title: 'New Role', startDate: '', endDate: '', bullets: [] }] } : c));
  };
  const removeRole = (compId, roleId) => {
    setCompanies(companies.map(c => c.id === compId ? { ...c, roles: c.roles.filter(r => r.id !== roleId) } : c));
  };

  return (
    <div className="section-scroll">
      <div className="action-row">
        <AIHighlightButton getMarkdown={getMarkdown} onPreview={onPreview} />
        <button className="danger-button" onClick={onDiscard}>Discard Current Changes</button>
        <button className="secondary-button" onClick={addComp}>+ Add Company</button>
        <button className="primary-button" onClick={handleSave}>Save Config to Disk</button>
      </div>
      {companies.map(c => (
        <FormCard key={c.id} title={c.company} onRemove={() => removeComp(c.id)}>
          <div style={{ display: 'flex', gap: '1rem' }}>
             <InputField label="Company Name" value={c.company} onChange={v => updateComp(c.id, 'company', v)} placeholder="E.g. Accenture" />
             <InputField label="Location" value={c.location} onChange={v => updateComp(c.id, 'location', v)} placeholder="E.g. Bangalore, India" />
             <div style={{ width: '150px' }}>
                <InputField label="Overall Start" value={c.globStartDate} onChange={v => updateComp(c.id, 'globStartDate', v)} placeholder="(Optional)" />
             </div>
             <div style={{ width: '150px' }}>
                <InputField label="Overall End" value={c.globEndDate} onChange={v => updateComp(c.id, 'globEndDate', v)} placeholder="(Optional)" />
             </div>
          </div>
          <div style={{ marginTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem' }}>
             <label style={{ fontSize: '1rem', color: '#fff', fontWeight: 'bold', display: 'block', marginBottom: '1rem' }}>Roles</label>
             {c.roles.map(r => (
               <div key={r.id} className="surface-block" style={{ padding: '1rem', marginBottom: '1rem' }}>
                 <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
                   <button className="danger-button" onClick={() => removeRole(c.id, r.id)} style={{ padding: '0.45rem 0.8rem', fontSize: '0.875rem' }}>Delete Role</button>
                 </div>
                 <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                    <InputField label="Role Title" value={r.title} onChange={v => updateRole(c.id, r.id, 'title', v)} placeholder="E.g. Software Engineer" />
                    <InputField label="Start Date" value={r.startDate} onChange={v => updateRole(c.id, r.id, 'startDate', v)} placeholder="E.g. July 2022" />
                    <InputField label="End Date" value={r.endDate} onChange={v => updateRole(c.id, r.id, 'endDate', v)} placeholder="E.g. Aug 2024" />
                 </div>
                 <BulletList bullets={r.bullets} setBullets={v => updateRole(c.id, r.id, 'bullets', v)} />
               </div>
             ))}
             <button onClick={() => addRole(c.id)} className="secondary-button" style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}>+ Add Role</button>
          </div>
        </FormCard>
      ))}
    </div>
  );
}

// ============================================
// MAIN EXPORT DISPATCHER
// ============================================
export function DataFormDispatcher({ activeFile, rawMarkdown, onSave, onPreview, onDiscard }) {
   if (activeFile.includes('profile')) return <ProfileManager rawMarkdown={rawMarkdown} onSave={onSave} onDiscard={onDiscard} />;
   if (activeFile.includes('projects')) return <ProjectsManager rawMarkdown={rawMarkdown} onSave={onSave} onPreview={onPreview} onDiscard={onDiscard} />;
   if (activeFile.includes('education')) return <EducationManager rawMarkdown={rawMarkdown} onSave={onSave} onPreview={onPreview} onDiscard={onDiscard} />;
   if (activeFile.includes('skills')) return <SkillsManager rawMarkdown={rawMarkdown} onSave={onSave} onPreview={onPreview} onDiscard={onDiscard} />;
   if (activeFile.includes('workex')) return <WorkExManager rawMarkdown={rawMarkdown} onSave={onSave} onPreview={onPreview} onDiscard={onDiscard} />;
   
   return (
      <div style={{ padding: '2rem', color: 'var(--text-secondary)' }}>
         No specialized form manager available for {activeFile}.
      </div>
   );
}
