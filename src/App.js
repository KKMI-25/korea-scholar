import { useState } from 'react';
import './App.css';

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
  const [papers, setPapers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState('전체');
  const filters = ['전체','오픈액세스','한국어'];

  useState(() => {
    if (!query) return;
    setLoading(true);
    fetch(`https://api.openalex.org/works?search=${encodeURIComponent(query)}&per_page=20&mailto=kkmi.hello@gmail.com`)
      .then(r=>r.json())
      .then(data=>{
        setPapers(data.results||[]);
        setTotal(data.meta?.count||0);
        setLoading(false);
      })
      .catch(()=>setLoading(false));
  }, [query]);

  const filtered = papers.filter(p => {
    if (filter==='오픈액세스') return p.open_access?.is_oa;
    if (filter==='한국어') return p.language==='ko';
    return true;
  });

  return (
    <div>
      <Header query={query} onSearch={onSearch} onLogoClick={()=>onSearch('')} />
      <div className="ks-results">
        {loading ? (
          <div className="ks-loading">검색 중...</div>
        ) : (
          <>
            <div className="ks-results-meta"><strong>{total.toLocaleString()}건</strong> 검색됨 — "{query}"</div>
            <div className="ks-filter-row">
              {filters.map(f=>(
                <span key={f} className={`ks-chip${filter===f?' active':''}`} onClick={()=>setFilter(f)}>{f}</span>
              ))}
            </div>
            {filtered.length===0 && <div className="ks-empty">검색 결과가 없습니다.</div>}
            {filtered.map(p=>{
              const title = p.title || '(제목 없음)';
              const authors = p.authorships?.slice(0,3).map(a=>a.author?.display_name).filter(Boolean).join(', ') || '저자 미상';
              const journal = p.primary_location?.source?.display_name || '';
              const year = p.publication_year || '';
              const doi = p.doi?.replace('https://doi.org/','') || '';
              const isOA = p.open_access?.is_oa;
              const pdfUrl = p.open_access?.oa_url || p.doi || '#';
              return (
                <div key={p.id} className="ks-card" onClick={()=>onPaperClick(p)}>
                  <div className="ks-card-title">{title}</div>
                  <div className="ks-card-meta">{authors}{journal&&` · ${journal}`}{year&&` · ${year}`}{doi&&` · DOI: ${doi}`}</div>
                  <div className="ks-card-footer">
                    <div className="ks-tags">
                      {isOA && <span className="ks-tag ks-tag-green">오픈액세스</span>}
                      {p.language==='ko' && <span className="ks-tag ks-tag-blue">한국어</span>}
                    </div>
                    {isOA && pdfUrl !== '#'
                      ? <button className="ks-pdf-btn ks-pdf-oa" onClick={e=>{e.stopPropagation();window.open(pdfUrl,'_blank');}}>무료 PDF 바로 보기 ↗</button>
                      : <button className="ks-pdf-btn ks-pdf-google" onClick={e=>{e.stopPropagation();window.open(`https://www.google.com/search?q=${encodeURIComponent(title)}+filetype:pdf`,'_blank');}}>구글에서 원문 찾기 ↗</button>
                    }
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

function DetailPage({ paper, onBack, onSearch }) {
  const title = paper.title || '(제목 없음)';
  const authors = paper.authorships?.map(a=>a.author?.display_name).filter(Boolean).join(', ') || '저자 미상';
  const journal = paper.primary_location?.source?.display_name || '';
  const year = paper.publication_year || '';
  const doi = paper.doi?.replace('https://doi.org/','') || '';
  const isOA = paper.open_access?.is_oa;
  const pdfUrl = paper.open_access?.oa_url || paper.doi || '#';
  const abstract = paper.abstract_inverted_index ? '초록 정보가 있습니다. 원문을 확인하세요.' : '초록 정보가 없습니다.';
  const citations = paper.cited_by_count || 0;

  return (
    <div>
      <Header query={title} onSearch={onSearch} onLogoClick={()=>onSearch('')} />
      <div className="ks-detail">
        <button className="ks-back-btn" onClick={onBack}>← 검색 결과로 돌아가기</button>
        <div className="ks-tags" style={{marginBottom:14}}>
          {isOA && <span className="ks-tag ks-tag-green">오픈액세스</span>}
          {paper.language==='ko' && <span className="ks-tag ks-tag-blue">한국어</span>}
        </div>
        <h1 className="ks-detail-title">{title}</h1>
        <div className="ks-detail-authors">{authors}</div>
        <div className="ks-detail-journal">{journal}{year&&` · ${year}`}</div>
        <div className="ks-detail-cta">
          <button className="ks-cta-primary" onClick={()=>window.open(pdfUrl,'_blank')}>원문 PDF 보기 ↗</button>
          <button className="ks-cta-secondary" onClick={()=>{navigator.clipboard.writeText(doi);alert('DOI가 복사되었습니다.');}}>DOI 복사</button>
        </div>
        <hr className="ks-divider"/>
        <div className="ks-section-label">초록</div>
        <div className="ks-abstract">{abstract}</div>
        <hr className="ks-divider"/>
        <div className="ks-section-label">서지 정보</div>
        <div className="ks-meta-grid">
          <div className="ks-meta-item"><div className="ks-meta-label">DOI</div><div className="ks-meta-value" style={{fontSize:12}}>{doi||'-'}</div></div>
          <div className="ks-meta-item"><div className="ks-meta-label">피인용 수</div><div className="ks-meta-value">{citations.toLocaleString()}회</div></div>
          <div className="ks-meta-item"><div className="ks-meta-label">언어</div><div className="ks-meta-value">{paper.language==='ko'?'한국어':'영어'}</div></div>
          <div className="ks-meta-item"><div className="ks-meta-label">출처</div><div className="ks-meta-value">OpenAlex</div></div>
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