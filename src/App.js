import { useState } from 'react';
import './App.css';

const DUMMY_PAPERS = [
  { id:1, title:'경량 RFID 상호 인증 프로토콜의 설계 및 보안 분석', authors:'박재규, 이민호, 김수진', journal:'정보보호학회논문지', year:2022, doi:'10.13722/JKIICE.2022.26.4.512', oa:true, kci:'등재', abstract:'본 논문에서는 RFID 시스템에서의 저전력 상호 인증 프로토콜을 제안한다. 기존 프로토콜의 취약점을 분석하고, 해시 함수와 난수 생성기를 기반으로 하는 경량화된 인증 메커니즘을 설계하였다.', citations:14, lang:'한국어', pdfUrl:'https://www.kci.go.kr' },
  { id:2, title:'IoT 환경에서의 RFID 기반 저전력 인증 체계 연구', authors:'홍길동, 최영철', journal:'Journal of Information Security', year:2023, doi:'10.3745/JIPS.04.0261', oa:false, kci:'등재후보', abstract:'IoT 환경에서 자원 제약적인 디바이스를 위한 경량 인증 프로토콜을 설계하고 보안성을 분석한다.', citations:7, lang:'한국어', pdfUrl:'https://www.kci.go.kr' },
  { id:3, title:'Secure and Efficient RFID Authentication Protocol Using Elliptic Curve Cryptography', authors:'Kim J., Lee S., Park Y.', journal:'IEEE Access', year:2021, doi:'10.1109/ACCESS.2021.3098731', oa:true, kci:null, abstract:'We propose a lightweight RFID authentication protocol based on elliptic curve cryptography suitable for resource-constrained environments.', citations:32, lang:'영어', pdfUrl:'https://ieeexplore.ieee.org' },
  { id:4, title:'블록체인 기반 RFID 태그 인증 시스템의 프라이버시 보호 방안', authors:'이상호, 정민지', journal:'한국통신학회논문지', year:2023, doi:'10.7840/kics.2023.48.3.401', oa:false, kci:'등재', abstract:'블록체인 기술을 활용하여 RFID 태그의 프라이버시를 보호하는 새로운 인증 시스템을 제안한다.', citations:5, lang:'한국어', pdfUrl:'https://www.kci.go.kr' },
];

function Header({ query, onSearch, onLogoClick }) {
  const [val, setVal] = useState(query);
  return (
    <header className="ks-header">
      <div className="ks-logo" onClick={onLogoClick}>Korea <span>Scholar</span></div>
      <div className="ks-header-search">
        <input value={val} onChange={e=>setVal(e.target.value)} onKeyDown={e=>e.key==='Enter'&&onSearch(val)} placeholder="논문 제목, 저자, DOI, 키워드..." />
        <button onClick={()=>onSearch(val)}>검색</button>
      </div>
    </header>
  );
}

function HomePage({ onSearch }) {
  const [val, setVal] = useState('');
  return (
    <div className="ks-home">
      <div className="ks-home-logo">Korea <span>Scholar</span></div>
      <div className="ks-home-tagline">Korean Research, Open to the World</div>
      <div className="ks-home-searchbox">
        <input value={val} onChange={e=>setVal(e.target.value)} onKeyDown={e=>e.key==='Enter'&&onSearch(val)} placeholder="논문 제목, 저자, DOI, 키워드 검색..." />
        <button onClick={()=>onSearch(val)}>검색</button>
      </div>
      <div className="ks-badges">
        <span className="ks-badge">OpenAlex 480M+</span>
        <span className="ks-badge">KCI 2,363,624건</span>
        <span className="ks-badge ks-badge-green">무료 오픈액세스</span>
      </div>
      <div className="ks-footer-text">Integrated Academic Search: OpenAlex + KCI</div>
    </div>
  );
}

function ResultsPage({ query, onPaperClick, onSearch }) {
  const [filter, setFilter] = useState('전체');
  const filters = ['전체','오픈액세스','KCI등재','한국어','영어'];
  const filtered = DUMMY_PAPERS.filter(p => {
    if (filter==='오픈액세스') return p.oa;
    if (filter==='KCI등재') return p.kci==='등재';
    if (filter==='한국어') return p.lang==='한국어';
    if (filter==='영어') return p.lang==='영어';
    return true;
  });
  return (
    <div>
      <Header query={query} onSearch={onSearch} onLogoClick={()=>onSearch('')} />
      <div className="ks-results">
        <div className="ks-results-meta"><strong>{filtered.length}건</strong> 검색됨 — "{query}"</div>
        <div className="ks-filter-row">
          {filters.map(f=>(
            <span key={f} className={`ks-chip${filter===f?' active':''}`} onClick={()=>setFilter(f)}>{f}</span>
          ))}
        </div>
        {filtered.map(p=>(
          <div key={p.id} className="ks-card" onClick={()=>onPaperClick(p)}>
            <div className="ks-card-title">{p.title}</div>
            <div className="ks-card-meta">{p.authors} · {p.journal} · {p.year} · DOI: {p.doi}</div>
            <div className="ks-card-footer">
              <div className="ks-tags">
                {p.oa && <span className="ks-tag ks-tag-green">오픈액세스</span>}
                {p.kci && <span className="ks-tag ks-tag-blue">KCI {p.kci}</span>}
              </div>
              <button className="ks-pdf-btn" onClick={e=>{e.stopPropagation();window.open(p.pdfUrl,'_blank');}}>원문 PDF 보기 ↗</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailPage({ paper, onBack, onSearch }) {
  return (
    <div>
      <Header query={paper.title} onSearch={onSearch} onLogoClick={()=>onSearch('')} />
      <div className="ks-detail">
        <button className="ks-back-btn" onClick={onBack}>← 검색 결과로 돌아가기</button>
        <div className="ks-tags" style={{marginBottom:14}}>
          {paper.oa && <span className="ks-tag ks-tag-green">오픈액세스</span>}
          {paper.kci && <span className="ks-tag ks-tag-blue">KCI {paper.kci}</span>}
        </div>
        <h1 className="ks-detail-title">{paper.title}</h1>
        <div className="ks-detail-authors">{paper.authors}</div>
        <div className="ks-detail-journal">{paper.journal} · {paper.year}</div>
        <div className="ks-detail-cta">
          <button className="ks-cta-primary" onClick={()=>window.open(paper.pdfUrl,'_blank')}>원문 PDF 보기 ↗</button>
          <button className="ks-cta-secondary" onClick={()=>{navigator.clipboard.writeText(paper.doi);alert('DOI가 복사되었습니다.');}}>DOI 복사</button>
        </div>
        <hr className="ks-divider"/>
        <div className="ks-section-label">초록</div>
        <div className="ks-abstract">{paper.abstract}</div>
        <hr className="ks-divider"/>
        <div className="ks-section-label">서지 정보</div>
        <div className="ks-meta-grid">
          <div className="ks-meta-item"><div className="ks-meta-label">DOI</div><div className="ks-meta-value" style={{fontSize:12}}>{paper.doi}</div></div>
          <div className="ks-meta-item"><div className="ks-meta-label">피인용 수</div><div className="ks-meta-value">{paper.citations}회</div></div>
          <div className="ks-meta-item"><div className="ks-meta-label">언어</div><div className="ks-meta-value">{paper.lang}</div></div>
          <div className="ks-meta-item"><div className="ks-meta-label">출처</div><div className="ks-meta-value">{paper.kci ? 'KCI + OpenAlex' : 'OpenAlex'}</div></div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState('home');
  const [query, setQuery] = useState('');
  const [selectedPaper, setSelectedPaper] = useState(null);

  const handleSearch = (q) => {
    if (!q) { setScreen('home'); return; }
    setQuery(q);
    setScreen('results');
  };

  if (screen==='home') return <HomePage onSearch={handleSearch} />;
  if (screen==='results') return <ResultsPage query={query} onPaperClick={p=>{setSelectedPaper(p);setScreen('detail');}} onSearch={handleSearch} />;
  if (screen==='detail') return <DetailPage paper={selectedPaper} onBack={()=>setScreen('results')} onSearch={handleSearch} />;
}