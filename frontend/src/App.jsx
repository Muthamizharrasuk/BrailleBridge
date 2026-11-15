import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { translateToBraille } from './braille/client.js';
import UnifiedBraillePreview from './components/UnifiedBraillePreview.jsx';
import HardwareStatusSection from './components/HardwareStatusSection.jsx';
import DocumentFeature from './features/DocumentFeature.jsx';
import SpeechFeature from './features/SpeechFeature.jsx';
import TextFeature from './features/TextFeature.jsx';

const CameraPanel = lazy(() => import('../camera/src/components/CameraPanel.jsx'));

const features = [
  { id: 'text', number: '01', title: 'Text to Braille', description: 'Type or paste text and translate with Liblouis.', status: 'Available' },
  { id: 'speech', number: '02', title: 'Speech to Braille', description: 'Capture speech, review the transcript, then translate.', status: 'Available' },
  { id: 'camera', number: '03', title: 'Camera to Braille', description: 'Photograph printed pages with accessible guidance.', status: 'Available' },
  { id: 'document', number: '04', title: 'Document to Braille', description: 'Extract and review PDF, TXT, or DOCX text privately.', status: 'Available' },
];

const route = () => {
  const id = globalThis.location?.hash?.slice(1) || 'home';
  return ['home', ...features.map((feature) => feature.id)].includes(id) ? id : 'home';
};

function GradeSelector({ grade, setGrade }) {
  return <fieldset className="grade-selector">
    <legend>Braille grade</legend>
    {[1, 2].map((value) => <label key={value} className={grade === value ? 'selected' : ''}>
      <input type="radio" name="braille-grade" value={value} checked={grade === value} onChange={() => setGrade(value)} /> Grade {value}
    </label>)}
  </fieldset>;
}

function Home() {
  return <>
    <section className="hero" aria-labelledby="home-heading">
      <div>
        <p className="eyebrow">ONE BRIDGE · MANY WAYS TO COMMUNICATE</p>
        <h1 id="home-heading">Words in.<br /><span>Braille out.</span></h1>
        <p className="hero-copy">Type, speak, scan printed text, or open a document. BrailleBridge turns reviewed words into Grade 1 or Grade 2 Braille with a clear three-cell preview.</p>
        <a className="primary-button hero-action" href="#text">Start with text</a>
      </div>
      <div className="hero-braille" aria-hidden="true"><span>⠃</span><span>⠗</span><span>⠇</span></div>
    </section>
    <section className="feature-section" aria-labelledby="choose-heading">
      <div className="section-heading-row"><div><p className="eyebrow">CHOOSE AN INPUT</p><h2 id="choose-heading">How would you like to begin?</h2></div><p>Every available mode uses the same Braille API and output model.</p></div>
      <div className="feature-grid">{features.map((feature) => <article className={`feature-card ${feature.status === 'Planned' ? 'planned' : ''}`} key={feature.id}>
        <div className="card-top"><span>{feature.number}</span><span className="availability">{feature.status}</span></div>
        <h3>{feature.title}</h3><p>{feature.description}</p>
        <a href={`#${feature.id}`} aria-label={`Open ${feature.title}`}>{feature.status === 'Planned' ? 'View roadmap' : 'Open tool'} <span aria-hidden="true">→</span></a>
      </article>)}</div>
    </section>
  </>;
}

export default function App() {
  const [active, setActive] = useState(route);
  const [grade, setGrade] = useState(1);
  const [cameraOutput, setCameraOutput] = useState(null);
  const mainRef = useRef(null);
  useEffect(() => {
    const update = () => {
      setActive(route()); globalThis.scrollTo?.({ top: 0, behavior: 'smooth' });
      setTimeout(() => mainRef.current?.focus(), 0);
    };
    globalThis.addEventListener?.('hashchange', update);
    return () => globalThis.removeEventListener?.('hashchange', update);
  }, []);
  useEffect(() => setCameraOutput(null), [grade]);
  const cameraTranslate = (text) => translateToBraille(text, { source: 'camera', grade });

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <header className="site-header">
      <a className="brand" href="#home" aria-label="BrailleBridge home"><span className="brand-mark" aria-hidden="true">⠿</span><span>BrailleBridge</span></a>
      <nav aria-label="Primary navigation"><a href="#home" aria-current={active === 'home' ? 'page' : undefined}>Home</a>{features.map((feature) => <a key={feature.id} href={`#${feature.id}`} aria-current={active === feature.id ? 'page' : undefined}>{feature.title.replace(' to Braille', '')}</a>)}</nav>
      <GradeSelector grade={grade} setGrade={setGrade} />
    </header>
    <main ref={mainRef} id="main-content" tabIndex="-1">
      {active === 'home' && <Home />}
      {active === 'text' && <TextFeature grade={grade} />}
      {active === 'speech' && <SpeechFeature grade={grade} />}
      {active === 'camera' && <>
        <Suspense fallback={<p className="loading-panel" role="status">Loading camera tools…</p>}>
          <CameraPanel grade={grade} translate={cameraTranslate} showPreview={false} onTranslation={(payload) => setCameraOutput(payload)} />
        </Suspense>
        {cameraOutput && <UnifiedBraillePreview translation={cameraOutput.result} text={cameraOutput.text} grade={grade} source="camera" />}
      </>}
      {active === 'document' && <DocumentFeature grade={grade} />}
    </main>
    <HardwareStatusSection />
    <footer><span>BrailleBridge</span><span>Accessible communication, one cell at a time.</span></footer>
  </div>;
}
