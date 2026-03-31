import React, { useState, useEffect } from 'react';
import { auth, db, signInWithGoogle, signInWithEmail, signUpWithEmail, logOut } from './firebase';
import { onAuthStateChanged, updatePassword, deleteUser, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { collection, addDoc, deleteDoc, doc, getDocs, query, where, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import './App.css';

// ==================== 언어 자동 감지 ====================
function detectLanguage() {
  const lang = (navigator.language || navigator.userLanguage || 'en').split('-')[0].toLowerCase();
  return ['ko','en','zh','ja','de','fr','es','pt','ar','vi','id','th','hi','tr','ru','mn'].includes(lang) ? lang : 'en';
}


// ==================== 참고문헌 생성 ====================
function generateCitation(paper, format) {
  const authors = paper.authorships?.map(a => a.author?.display_name).filter(Boolean) || [];
  const title = paper.title || '';
  const journal = paper.primary_location?.source?.display_name || '';
  const year = paper.publication_year || '';
  const doi = paper.doi?.replace('https://doi.org/', '') || '';
  const volume = paper.biblio?.volume || '';
  const issue = paper.biblio?.issue || '';
  const pages = paper.biblio?.first_page && paper.biblio?.last_page ? `${paper.biblio.first_page}-${paper.biblio.last_page}` : '';

  const formatAuthorsAPA = (authors) => {
    if (!authors.length) return '';
    return authors.map(a => {
      const parts = a.split(' ');
      const last = parts[parts.length - 1];
      const initials = parts.slice(0, -1).map(p => p[0] + '.').join(' ');
      return `${last}, ${initials}`;
    }).join(', ');
  };
  const formatAuthorsMLA = (authors) => {
    if (!authors.length) return '';
    if (authors.length === 1) return authors[0];
    const parts = authors[0].split(' ');
    const first = `${parts[parts.length-1]}, ${parts.slice(0,-1).join(' ')}`;
    return authors.length === 2 ? `${first}, and ${authors[1]}` : `${first}, et al`;
  };

  switch (format) {
    case 'APA': return `${formatAuthorsAPA(authors)} (${year}). ${title}. *${journal}*${volume?`, ${volume}`:''}${issue?`(${issue})`:''}${pages?`, ${pages}`:''}.${doi?` https://doi.org/${doi}`:''}`.trim();
    case 'Vancouver': return `${authors.join(', ')}. ${title}. ${journal}. ${year}${volume?`;${volume}`:''}${issue?`(${issue})`:''}${pages?`:${pages}`:''}.${doi?` doi:${doi}`:''}`.trim();
    case 'Chicago': return `${authors.join(', ')}. "${title}." *${journal}* ${volume}${issue?`, no. ${issue}`:''} (${year})${pages?`: ${pages}`:''}.${doi?` https://doi.org/${doi}`:''}`.trim();
    case 'MLA': return `${formatAuthorsMLA(authors)}. "${title}." *${journal}*, ${volume?`vol. ${volume}, `:''}${issue?`no. ${issue}, `:''}${year}${pages?`, pp. ${pages}`:''}.${doi?` doi:${doi}`:''}`.trim();
    default: return '';
  }
}

// ==================== 인용 버튼 ====================
function CitationButton({ paper }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState('');
  const formats = ['APA', 'Vancouver', 'Chicago', 'MLA'];

  const handleCopy = (format) => {
    navigator.clipboard.writeText(generateCitation(paper, format));
    setCopied(format);
    setTimeout(() => setCopied(''), 2000);
  };

  return (
    <div style={{position:'relative', display:'inline-block'}}>
      <button className="ks-pdf-btn" style={{borderColor:'#6b7280', color:'#6b7280'}}
        onClick={e => { e.stopPropagation(); setOpen(!open); }}>📋</button>
      {open && (
        <div onClick={e => e.stopPropagation()}
          style={{position:'absolute', right:0, top:'36px', background:'#fff', border:'1px solid #e5e7eb',
            borderRadius:'12px', padding:'12px', zIndex:200, width:'320px', boxShadow:'0 8px 24px rgba(0,0,0,0.12)'}}>
          <div style={{fontSize:'13px', fontWeight:'700', color:'#1a1a1a', marginBottom:'10px'}}>참고문헌 형식 선택</div>
          {formats.map(fmt => (
            <div key={fmt} style={{marginBottom:'8px'}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'4px'}}>
                <span style={{fontSize:'12px', fontWeight:'600', color:'#4b5563'}}>{fmt}</span>
                <button onClick={() => handleCopy(fmt)}
                  style={{fontSize:'11px', padding:'3px 10px', borderRadius:'6px', border:'1px solid #d1d5db',
                    background: copied===fmt ? '#1D9E75' : '#fff', color: copied===fmt ? '#fff' : '#374151', cursor:'pointer'}}>
                  {copied===fmt ? '✓ 복사됨' : '복사'}
                </button>
              </div>
              <div style={{fontSize:'11px', color:'#9ca3af', background:'#f9fafb', padding:'6px 8px',
                borderRadius:'6px', lineHeight:'1.5', wordBreak:'break-all'}}>
                {generateCitation(paper, fmt)}
              </div>
            </div>
          ))}
          <button onClick={() => setOpen(false)}
            style={{width:'100%', marginTop:'4px', padding:'6px', border:'none', background:'#f3f4f6',
              borderRadius:'6px', fontSize:'12px', color:'#6b7280', cursor:'pointer'}}>닫기</button>
        </div>
      )}
    </div>
  );
}

// ==================== OpenAlex 검색 ====================
async function searchOpenAlex(keyword, page = 1) {
  const res = await fetch(`https://api.openalex.org/works?search=${encodeURIComponent(keyword)}&per_page=10&page=${page}&mailto=kkmi.hello@gmail.com`);
  return await res.json();
}

// ==================== KCI 검색 ====================
async function searchKCI(keyword, page = 1) {
  try {
    const url = `/api/kci?title=${encodeURIComponent(keyword)}&displayCount=10&page=${page}`;
    const res = await fetch(url);
    const text = await res.text();
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, 'text/xml');

    const total = parseInt(xml.querySelector('total')?.textContent || '0', 10);
    const records = xml.querySelectorAll('record');
    const results = [];

    records.forEach(record => {
      const journalInfo = record.querySelector('journalInfo');
      const articleInfo = record.querySelector('articleInfo');
      if (!articleInfo) return;

      const articleId = articleInfo.getAttribute('article-id') || '';
      const titleOriginal = articleInfo.querySelector('article-title[lang="original"]')?.textContent || '';
      const titleEnglish = articleInfo.querySelector('article-title[lang="english"]')?.textContent || '';
      const categories = articleInfo.querySelector('article-categories')?.textContent || '';
      const fpage = articleInfo.querySelector('fpage')?.textContent || '';
      const lpage = articleInfo.querySelector('lpage')?.textContent || '';
      const orteOpenYn = articleInfo.querySelector('orte-open-yn')?.textContent || 'N';
      const doi = articleInfo.querySelector('doi')?.textContent || '';
      const uci = articleInfo.querySelector('uci')?.textContent || '';
      const citationCount = articleInfo.querySelector('citation-count');
      const kciCited = citationCount?.getAttribute('kci') || '0';
      const wosCited = citationCount?.getAttribute('wos') || '0';
      const paperUrl = articleInfo.querySelector('url')?.textContent || '';

      // 저자 파싱
      const authorNodes = articleInfo.querySelectorAll('author-group author');
      const authors = [];
      authorNodes.forEach(a => {
        const nameText = a.textContent?.trim() || '';
        const engName = a.getAttribute('english') || '';
        const orcId = a.getAttribute('orc-id') || '';
        authors.push({ display_name: nameText.split('(')[0].trim(), english: engName, orcId, raw: nameText });
      });

      // 초록 파싱
      const abstractOriginal = articleInfo.querySelector('abstract[lang="original"]')?.textContent || '';
      const abstractEnglish = articleInfo.querySelector('abstract[lang="english"]')?.textContent || '';

      // OpenAlex 호환 포맷으로 변환
      results.push({
        id: `kci-${articleId}`,
        title: titleOriginal || titleEnglish || '(제목 없음)',
        title_english: titleEnglish,
        publication_year: journalInfo?.querySelector('pub-year')?.textContent || '',
        language: 'ko',
        open_access: { is_oa: orteOpenYn === 'Y' },
        doi: doi || null,
        cited_by_count: parseInt(kciCited, 10) || 0,
        wos_cited: parseInt(wosCited, 10) || 0,
        authorships: authors.map(a => ({ author: { display_name: a.display_name } })),
        primary_location: {
          source: {
            display_name: journalInfo?.querySelector('journal-name')?.textContent || '',
            publisher: journalInfo?.querySelector('publisher-name')?.textContent || '',
          }
        },
        biblio: {
          volume: journalInfo?.querySelector('volume')?.textContent || '',
          issue: journalInfo?.querySelector('issue')?.textContent || '',
          first_page: fpage,
          last_page: lpage,
        },
        abstract_inverted_index: null,
        _abstract_text: abstractOriginal || abstractEnglish || '',
        _kci: {
          articleId, categories, uci, paperUrl,
          foreignListed: journalInfo?.querySelector('foreign-listed name')?.textContent || '',
          pubMon: journalInfo?.querySelector('pub-mon')?.textContent || '',
        },
        _source: 'kci',
      });
    });

    return { results, total };
  } catch (err) {
    console.warn('KCI API 호출 실패:', err);
    return { results: [], total: 0 };
  }
}

// ==================== 통합 검색 ====================
async function searchAll(keyword, page = 1) {
  const [oaData, kciData] = await Promise.allSettled([
    searchOpenAlex(keyword, page),
    searchKCI(keyword, page),
  ]);

  const oaResults = oaData.status === 'fulfilled' ? (oaData.value.results || []).map(r => ({ ...r, _source: 'openalex' })) : [];
  const kciResults = kciData.status === 'fulfilled' ? kciData.value.results : [];
  const oaTotal = oaData.status === 'fulfilled' ? (oaData.value.meta?.count || 0) : 0;
  const kciTotal = kciData.status === 'fulfilled' ? kciData.value.total : 0;

  // KCI 결과를 앞에, OpenAlex 결과를 뒤에 (한국 논문 우선)
  // 중복 제거: DOI가 같은 경우 KCI 우선
  const seen = new Set();
  const merged = [];
  [...kciResults, ...oaResults].forEach(paper => {
    const doi = paper.doi?.replace('https://doi.org/', '').toLowerCase();
    const key = doi || paper.id;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(paper);
    }
  });

  return { results: merged, oaTotal, kciTotal, totalCombined: oaTotal + kciTotal };
}

// ==================== 헤더 ====================
function Header({ user, onSearch, onShowAuth, lastQuery }) {
  const [searchInput, setSearchInput] = useState(lastQuery || '');
  useEffect(() => { setSearchInput(lastQuery || ''); }, [lastQuery]);

  return (
    <div className="ks-header">
      <div className="ks-header-left">
        <div className="ks-home-logo-small" onClick={() => onSearch(null)} style={{cursor:'pointer'}}>Korea <span>Scholar</span></div>
        <div className="ks-home-searchbox ks-header-search">
          <input type="text" value={searchInput} onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && searchInput.trim() && onSearch(searchInput.trim())} />
          <button onClick={() => searchInput.trim() && onSearch(searchInput.trim())}>검색</button>
        </div>
      </div>
      <div className="ks-header-right">
        {user ? (
          <>
            <button className="ks-nav-btn" onClick={() => onSearch('__library__')}>📖 내 서재</button>
            <button className="ks-nav-btn" onClick={() => onSearch('__mypage__')}>{user.displayName || user.email?.split('@')[0]}</button>
            <button className="ks-nav-btn" onClick={() => { logOut(); onSearch(null); }}>로그아웃</button>
          </>
        ) : (
          <button className="ks-nav-btn" onClick={onShowAuth}>로그인</button>
        )}
      </div>
    </div>
  );
}

// ==================== 논문 카드 ====================
function PaperCard({ paper, onPaperClick, user, bookmarks, onBookmark, onShowAuth, siteLang }) {
  const t = i18n[siteLang] || i18n.en;
  const title = paper.title || '(제목 없음)';
  const titleEn = paper.title_english || '';
  const authors = paper.authorships?.map(a => a.author?.display_name).filter(Boolean).join(', ') || '저자 미상';
  const journal = paper.primary_location?.source?.display_name || '';
  const year = paper.publication_year || '';
  const doi = paper.doi?.replace('https://doi.org/', '') || '';
  const isOA = paper.open_access?.is_oa;
  const isKCI = paper._source === 'kci';
  const pdfUrl = isKCI ? (paper._kci?.paperUrl || paper.doi || '#') : (paper.open_access?.oa_url || paper.doi || '#');
  const isBookmarked = bookmarks.some(b => b.paperId === paper.id);

  // 비영어 제목인 경우 영문 제목 병기 여부 판단
  const isNonLatin = /[가-힣\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\u0600-\u06FF]/.test(title);
  const showBilingual = isNonLatin && titleEn && title !== titleEn;

  return (
    <div className="ks-card" onClick={() => onPaperClick(paper)}>
      <div className="ks-card-title">{title}</div>
      {showBilingual && (
        <div style={{fontSize:'13px', color:'#6b7280', marginBottom:'6px', fontStyle:'italic', lineHeight:'1.5'}}>{titleEn}</div>
      )}
      <div className="ks-card-meta">{authors}{journal&&` · ${journal}`}{year&&` · ${year}`}{doi&&` · DOI: ${doi}`}</div>
      <div className="ks-card-footer">
        <div className="ks-tags">
          {isOA && <span className="ks-tag ks-tag-green">{t.openAccess}</span>}
          {paper.language==='ko' && <span className="ks-tag ks-tag-blue">{t.korean}</span>}
        </div>
        <div style={{display:'flex', gap:'6px', flexWrap:'wrap', justifyContent:'flex-end'}}>
          <CitationButton paper={paper} />
          <button className="ks-pdf-btn"
            style={{borderColor: isBookmarked?'#f5a623':'#ccc', color: isBookmarked?'#f5a623':'#888'}}
            onClick={e => { e.stopPropagation(); user ? onBookmark(paper) : onShowAuth(); }}>
            {isBookmarked ? t.saved : t.save}
          </button>
          {isKCI ? (
            <button className="ks-pdf-btn ks-pdf-oa" onClick={e => { e.stopPropagation(); window.open(paper._kci?.paperUrl || `https://www.kci.go.kr/kciportal/ci/sereArticleSearch/ciSereArtiView.kci?sereArticleSearchBean.artiId=${paper._kci?.articleId}`, '_blank'); }}>{t.viewOriginal}</button>
          ) : isOA && pdfUrl !== '#' ? (
            <button className="ks-pdf-btn ks-pdf-oa" onClick={e => { e.stopPropagation(); window.open(pdfUrl, '_blank'); }}>{t.freePDF}</button>
          ) : (
            <button className="ks-pdf-btn ks-pdf-google" onClick={e => { e.stopPropagation(); window.open(`https://www.google.com/search?q=${encodeURIComponent(title)}+filetype:pdf`, '_blank'); }}>{t.googleOriginal}</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ==================== 홈 ====================
function HomePage({ onSearch, user, onShowAuth, siteLang, onLangChange }) {
  const [query, setQuery] = useState('');
  const t = i18n[siteLang] || i18n.en;
  const isRTL = siteLang === 'ar';
  return (
    <div className="ks-home" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="ks-home-nav-area">
        {/* 언어 드롭다운 */}
        <div style={{position:'relative', display:'inline-block'}}>
          <button
            onClick={() => document.getElementById('lang-dropdown').classList.toggle('ks-lang-open')}
            style={{background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.25)',
              borderRadius:'8px', padding:'6px 14px', color:'#fff', cursor:'pointer',
              fontSize:'14px', display:'flex', alignItems:'center', gap:'6px'}}>
            {{'ko':'🇰🇷','en':'🇺🇸','zh':'🇨🇳','ja':'🇯🇵','de':'🇩🇪',
              'fr':'🇫🇷','es':'🇪🇸','pt':'🇧🇷','ar':'🇸🇦'}[siteLang]} {LANGUAGES[siteLang]} ▾
          </button>
          <div id="lang-dropdown"
            style={{display:'none', position:'absolute', right:0, top:'40px',
              background:'#1a2744', border:'1px solid rgba(255,255,255,0.15)',
              borderRadius:'10px', overflow:'hidden', zIndex:200, minWidth:'160px',
              boxShadow:'0 8px 24px rgba(0,0,0,0.4)'}}>
            {Object.entries(LANGUAGES).map(([code, label]) => (
              <button key={code}
                onClick={() => { onLangChange(code); document.getElementById('lang-dropdown').classList.remove('ks-lang-open'); }}
                style={{display:'flex', alignItems:'center', gap:'10px', width:'100%',
                  padding:'10px 16px', border:'none', cursor:'pointer', fontSize:'13px',
                  background: siteLang===code ? 'rgba(61,214,140,0.15)' : 'transparent',
                  color: siteLang===code ? '#3DD68C' : 'rgba(255,255,255,0.8)',
                  fontWeight: siteLang===code ? '700' : '400', textAlign:'left'}}>
                <span style={{fontSize:'18px'}}>
                  {FLAGS[code]}
                </span>
                {label}
              </button>
            ))}
          </div>
        </div>
        {user ? (
          <>
            <button className="ks-home-nav-btn" onClick={() => onSearch('__library__')}>{t.myLibrary}</button>
            <button className="ks-home-nav-btn" onClick={() => onSearch('__mypage__')}>{user.displayName || user.email?.split('@')[0]}</button>
            <button className="ks-home-nav-btn" onClick={logOut}>{t.logout}</button>
          </>
        ) : (
          <button className="ks-home-nav-btn" onClick={onShowAuth}>{t.login} / {t.signup}</button>
        )}
      </div>
      <div className="ks-home-logo">
        <span>📚</span>
        <span className="ks-home-logo-text">Korea <span>Scholar</span></span>
      </div>
      <p className="ks-home-tagline">{t.tagline}</p>
      <div className="ks-home-searchbox">
        <input type="text" placeholder={t.searchPlaceholder} value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && query.trim() && onSearch(query.trim())} />
        <button onClick={() => query.trim() && onSearch(query.trim())}>{t.search}</button>
      </div>
      <div className="ks-badges">
        <span className="ks-badge ks-badge-green">{t.badgeFree}</span>
        <span className="ks-badge">{t.badgePapers}</span>
        <span className="ks-badge">{t.badgeOA}</span>
      </div>
      <div style={{position:'fixed', bottom:'20px', left:'50%', transform:'translateX(-50%)',
        fontSize:'12px', color:'rgba(255,255,255,0.35)', textAlign:'center', whiteSpace:'nowrap'}}>
        Copyright ⓒ 2025{' '}
        <a href="https://www.kkmii.com/" target="_blank" rel="noreferrer"
          style={{color:'rgba(255,255,255,0.5)', textDecoration:'none', fontWeight:'500'}}>
          Korea Knowledge Media Research Institute CO., LTD.
        </a>
        {' '}All Rights Reserved.
      </div>
    </div>
  );
}

// ==================== 검색 결과 ====================
function ResultsPage({ query, onPaperClick, onSearch, onShowAuth, user, bookmarks, onBookmark, siteLang }) {
  const t = i18n[siteLang] || i18n.en;
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [oaTotal, setOaTotal] = useState(0);
  const [kciTotal, setKciTotal] = useState(0);
  const [sourceFilter, setSourceFilter] = useState('all');
  const [sortBy, setSortBy] = useState('relevance'); // 'relevance', 'newest', 'oldest', 'cited'

  useEffect(() => {
    setLoading(true); setPage(1);
    searchAll(query, 1).then(data => {
      setResults(data.results || []);
      setOaTotal(data.oaTotal || 0);
      setKciTotal(data.kciTotal || 0);
      setLoading(false);
    });
  }, [query]);

  const loadPage = (p) => {
    setLoading(true); setPage(p);
    searchAll(query, p).then(data => {
      setResults(data.results || []);
      setLoading(false);
      window.scrollTo(0, 0);
    });
  };

  // 필터 적용
  const filtered = results.filter(p => {
    if (!p.title) return false;
    if (sourceFilter === 'kci') return p._source === 'kci';
    if (sourceFilter === 'openalex') return p._source === 'openalex';
    if (sourceFilter === 'oa') return p.open_access?.is_oa;
    if (sourceFilter === 'free_pdf') {
      if (p._source === 'kci') return p.open_access?.is_oa;
      return p.open_access?.is_oa && p.open_access?.oa_url;
    }
    return true;
  });

  // 정렬 적용
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'newest') return (parseInt(b.publication_year) || 0) - (parseInt(a.publication_year) || 0);
    if (sortBy === 'oldest') return (parseInt(a.publication_year) || 0) - (parseInt(b.publication_year) || 0);
    if (sortBy === 'cited') return (b.cited_by_count || 0) - (a.cited_by_count || 0);
    return 0; // relevance = 기본 순서 유지
  });

  const totalDisplay = oaTotal + kciTotal;

  return (
    <div>
      <Header user={user} onSearch={onSearch} onShowAuth={onShowAuth} lastQuery={query} />
      {loading ? <div className="ks-loading">{t.searching}</div> : (
        <div className="ks-results">
          <div className="ks-results-meta" style={{display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'8px'}}>
            <div>
              <strong>{totalDisplay.toLocaleString()}</strong> {t.resultsFound}
            </div>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}
              style={{padding:'6px 12px', borderRadius:'8px', border:'1px solid #d1d5db', fontSize:'13px', color:'#374151', cursor:'pointer', background:'#fff'}}>
              <option value="relevance">{t.sortRelevance}</option>
              <option value="newest">{t.sortNewest}</option>
              <option value="oldest">{t.sortOldest}</option>
              <option value="cited">{t.sortCited}</option>
            </select>
          </div>
          <div className="ks-filter-row">
            {[
              { key: 'all', label: `${t.filterAll} (${results.filter(p => p.title).length})` },
              { key: 'kci', label: `${t.filterDomestic} (${results.filter(p => p._source === 'kci').length})` },
              { key: 'openalex', label: `${t.filterInternational} (${results.filter(p => p._source === 'openalex').length})` },
              { key: 'oa', label: `${t.filterOA} (${results.filter(p => p.open_access?.is_oa).length})` },
              { key: 'free_pdf', label: `${t.filterFreePDF} (${results.filter(p => p._source === 'kci' ? p.open_access?.is_oa : (p.open_access?.is_oa && p.open_access?.oa_url)).length})` },
            ].map(f => (
              <button key={f.key} className={`ks-chip ${sourceFilter === f.key ? 'active' : ''}`}
                onClick={() => setSourceFilter(f.key)}>{f.label}</button>
            ))}
          </div>
          {sorted.map(p => (
            <PaperCard key={p.id} paper={p} onPaperClick={onPaperClick}
              user={user} bookmarks={bookmarks} onBookmark={onBookmark} onShowAuth={onShowAuth} siteLang={siteLang} />
          ))}
          {sorted.length === 0 && (
            <div className="ks-card" style={{cursor:'default', color:'#888', textAlign:'center', padding:'40px'}}>
              {t.noResults}
            </div>
          )}
          <div className="ks-pagination">
            {page > 1 && <button className="ks-chip" onClick={() => loadPage(page-1)}>{t.prevPage}</button>}
            <span style={{fontSize:'14px', color:'#666'}}>{page} {t.pageUnit}</span>
            {results.length >= 10 && <button className="ks-chip" onClick={() => loadPage(page+1)}>{t.nextPage}</button>}
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== 논문 상세 ====================
function DetailPage({ paper, onBack, onSearch, onShowAuth, user, bookmarks, onBookmark, siteLang }) {
  const title = paper.title || '(제목 없음)';
  const authors = paper.authorships?.map(a => a.author?.display_name).filter(Boolean).join(', ') || '저자 미상';
  const journal = paper.primary_location?.source?.display_name || '';
  const year = paper.publication_year || '';
  const doi = paper.doi?.replace('https://doi.org/', '') || '';
  const isOA = paper.open_access?.is_oa;
  const isKCI = paper._source === 'kci';
  const pdfUrl = isKCI ? (paper._kci?.paperUrl || '#') : (paper.open_access?.oa_url || paper.doi || '#');
  const citations = paper.cited_by_count || 0;
  const isBookmarked = bookmarks.some(b => b.paperId === paper.id);
  const abstractText = paper._abstract_text || '';
  const categories = paper._kci?.categories || '';
  const titleEn = paper.title_english || '';

  return (
    <div>
      <Header user={user} onSearch={onSearch} onShowAuth={onShowAuth} />
      <div className="ks-results">
        <button className="ks-chip" onClick={onBack} style={{marginBottom:'20px'}}>{(i18n[siteLang]||i18n.en).backToResults}</button>
        <div className="ks-card" style={{cursor:'default'}}>
          <div className="ks-card-title" style={{fontSize:'20px', marginBottom:'8px'}}>{title}</div>
          {titleEn && title !== titleEn && (
            <div style={{fontSize:'14px', color:'#6b7280', marginBottom:'16px', fontStyle:'italic'}}>{titleEn}</div>
          )}
          <div className="ks-card-meta" style={{marginBottom:'16px'}}>
            {authors && <div><strong>{(i18n[siteLang]||i18n.en).author}:</strong> {authors}</div>}
            {journal && <div><strong>{(i18n[siteLang]||i18n.en).journal}:</strong> {journal}</div>}
            {year && <div><strong>{(i18n[siteLang]||i18n.en).pubYear}:</strong> {year}{isKCI && paper._kci?.pubMon ? `.${paper._kci.pubMon}` : ''}</div>}
            {paper.biblio?.volume && <div><strong>{(i18n[siteLang]||i18n.en).volIssue}:</strong> {paper.biblio.volume}{paper.biblio.issue ? `(${paper.biblio.issue})` : ''}{paper.biblio.first_page ? `, pp.${paper.biblio.first_page}-${paper.biblio.last_page}` : ''}</div>}
            {doi && <div><strong>DOI:</strong> {doi}</div>}
            {isKCI && paper._kci?.uci && <div><strong>UCI:</strong> {paper._kci.uci}</div>}
            {categories && <div><strong>{(i18n[siteLang]||i18n.en).researchField}:</strong> {categories}</div>}
            <div><strong>{(i18n[siteLang]||i18n.en).citedBy}:</strong> {citations}회{isKCI && paper.wos_cited ? ` (WoS: ${paper.wos_cited}회)` : ''}</div>
          </div>

          {abstractText && (
            <div style={{marginBottom:'16px'}}>
              <div style={{fontSize:'13px', fontWeight:'700', color:'#1a3a5c', marginBottom:'6px'}}>{(i18n[siteLang]||i18n.en).abstract}</div>
              <div style={{fontSize:'13px', lineHeight:'1.8', color:'#4b5563', background:'#f9fafb', padding:'14px', borderRadius:'8px'}}>
                {abstractText}
              </div>
            </div>
          )}

          <div className="ks-card-footer">
            <div className="ks-tags">
              {isOA && <span className="ks-tag ks-tag-green">{(i18n[siteLang]||i18n.en).openAccess}</span>}
            </div>
            <div style={{display:'flex', gap:'8px', flexWrap:'wrap'}}>
              <CitationButton paper={paper} />
              <button className="ks-pdf-btn"
                style={{borderColor: isBookmarked?'#f5a623':'#ccc', color: isBookmarked?'#f5a623':'#888'}}
                onClick={() => user ? onBookmark(paper) : onShowAuth()}>
                {isBookmarked ? (i18n[siteLang]||i18n.en).saved : (i18n[siteLang]||i18n.en).save}
              </button>
              {isKCI ? (
                <button className="ks-pdf-btn ks-pdf-oa" onClick={() => window.open(paper._kci?.paperUrl || `https://www.kci.go.kr/kciportal/ci/sereArticleSearch/ciSereArtiView.kci?sereArticleSearchBean.artiId=${paper._kci?.articleId}`, '_blank')}>{(i18n[siteLang]||i18n.en).viewOriginal}</button>
              ) : isOA && pdfUrl !== '#' ? (
                <button className="ks-pdf-btn ks-pdf-oa" onClick={() => window.open(pdfUrl, '_blank')}>{(i18n[siteLang]||i18n.en).freePDF}</button>
              ) : (
                <button className="ks-pdf-btn ks-pdf-google" onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(title)}+filetype:pdf`, '_blank')}>{(i18n[siteLang]||i18n.en).googleOriginal}</button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== 다국어 지원 ====================
const LANGUAGES = {
  ko: '한국어', en: 'English', zh: '中文', ja: '日本語',
  vi: 'Tiếng Việt', id: 'Bahasa Indonesia', th: 'ภาษาไทย', hi: 'हिन्दी',
  de: 'Deutsch', fr: 'Français', es: 'Español', pt: 'Português',
  ar: 'العربية', tr: 'Türkçe', ru: 'Русский', mn: 'Монгол'
};

const FLAGS = {
  ko:'🇰🇷', en:'🇺🇸', zh:'🇨🇳', ja:'🇯🇵', vi:'🇻🇳', id:'🇮🇩', th:'🇹🇭', hi:'🇮🇳',
  de:'🇩🇪', fr:'🇫🇷', es:'🇪🇸', pt:'🇧🇷', ar:'🇸🇦', tr:'🇹🇷', ru:'🇷🇺', mn:'🇲🇳'
};

const i18n = {
  ko: {
    login: '로그인', signup: '회원가입', googleLogin: 'Google로 계속하기',
    or: '또는', name: '이름 *', affiliation: '소속 기관 (예: 서울대학교)',
    position: '직책 (예: 교수, 박사과정, 연구원)', phone: '연락처 (선택)',
    email: '이메일 *', password: '비밀번호 *', passwordConfirm: '비밀번호 확인 *',
    privacyRequired: '[필수] 개인정보 수집 및 이용에 동의합니다',
    marketingOptional: '[선택] 마케팅 목적 개인정보 수집 및 이용에 동의합니다',
    alreadyHaveAccount: '이미 계정이 있으신가요? 로그인 →',
    noAccount: '계정이 없으신가요? 회원가입 →',
    search: '검색', myLibrary: '📖 내 서재', logout: '로그아웃',
    searchPlaceholder: '논문 제목, 저자, 키워드 검색...',
    tagline: '전 세계 학술 논문을 무료로 검색하세요',
    resultsFound: '건 검색됨', searching: '🔍 논문을 검색하는 중...',
    filterAll: '전체', filterDomestic: '국내 논문', filterInternational: '해외 논문',
    filterOA: '오픈액세스', filterFreePDF: '🆓 무료PDF',
    sortRelevance: '관련도순', sortNewest: '최신순', sortOldest: '오래된순', sortCited: '피인용순',
    prevPage: '← 이전', nextPage: '다음 →', pageUnit: '페이지',
    noResults: '해당 필터의 검색 결과가 없습니다.',
    openAccess: '오픈액세스', korean: '한국어',
    viewOriginal: '📄 원문 보기 ↗', freePDF: '무료 PDF ↗', googleOriginal: '구글 원문 ↗',
    citation: '📋 인용', saved: '★ 저장됨', save: '☆ 저장',
    backToResults: '← 검색 결과로', author: '저자', journal: '학술지', pubYear: '발행연도',
    volIssue: '권/호', researchField: '연구분야', citedBy: '피인용', abstract: '초록 (Abstract)',
    badgeFree: '무료 검색', badgePapers: '국내외 학술 논문', badgeOA: '오픈액세스',
  },
  en: {
    login: 'Log In', signup: 'Sign Up', googleLogin: 'Continue with Google',
    or: 'or', name: 'Full Name *', affiliation: 'Institution (e.g. Harvard University)',
    position: 'Position (e.g. Professor, PhD Student)', phone: 'Phone (optional)',
    email: 'Email *', password: 'Password *', passwordConfirm: 'Confirm Password *',
    privacyRequired: '[Required] I agree to the collection and use of personal information',
    marketingOptional: '[Optional] I agree to receive marketing communications',
    alreadyHaveAccount: 'Already have an account? Log In →',
    noAccount: "Don't have an account? Sign Up →",
    search: 'Search', myLibrary: '📖 My Library', logout: 'Log Out',
    searchPlaceholder: 'Search papers, authors, keywords...',
    tagline: 'Search academic papers worldwide for free',
    resultsFound: 'results found', searching: '🔍 Searching papers...',
    filterAll: 'All', filterDomestic: 'Domestic', filterInternational: 'International',
    filterOA: 'Open Access', filterFreePDF: '🆓 Free PDF',
    sortRelevance: 'Relevance', sortNewest: 'Newest', sortOldest: 'Oldest', sortCited: 'Most Cited',
    prevPage: '← Prev', nextPage: 'Next →', pageUnit: 'Page',
    noResults: 'No results found for this filter.',
    openAccess: 'Open Access', korean: 'Korean',
    viewOriginal: '📄 View Original ↗', freePDF: 'Free PDF ↗', googleOriginal: 'Google ↗',
    citation: '📋 Cite', saved: '★ Saved', save: '☆ Save',
    backToResults: '← Back to Results', author: 'Author', journal: 'Journal', pubYear: 'Year',
    volIssue: 'Vol/Issue', researchField: 'Field', citedBy: 'Cited by', abstract: 'Abstract',
    badgeFree: 'Free Search', badgePapers: 'Domestic & International', badgeOA: 'Open Access',
  },
  zh: {
    login: '登录', signup: '注册', googleLogin: '使用Google继续',
    or: '或者', name: '姓名 *', affiliation: '所属机构 (例: 北京大学)',
    position: '职称 (例: 教授, 博士生)', phone: '联系方式 (选填)',
    email: '邮箱 *', password: '密码 *', passwordConfirm: '确认密码 *',
    privacyRequired: '[必填] 同意收集和使用个人信息',
    marketingOptional: '[可选] 同意接收营销信息',
    alreadyHaveAccount: '已有账号？登录 →',
    noAccount: '没有账号？注册 →',
    search: '搜索', myLibrary: '📖 我的书库', logout: '退出',
    searchPlaceholder: '搜索论文、作者、关键词...',
    tagline: '免费搜索全球学术论文',
    resultsFound: '条结果', searching: '🔍 正在搜索...',
    filterAll: '全部', filterDomestic: '韩国论文', filterInternational: '国际论文',
    filterOA: '开放获取', filterFreePDF: '🆓 免费PDF',
    sortRelevance: '相关度', sortNewest: '最新', sortOldest: '最早', sortCited: '被引用数',
    prevPage: '← 上一页', nextPage: '下一页 →', pageUnit: '页',
    noResults: '没有结果。',
    openAccess: '开放获取', korean: '韩语',
    viewOriginal: '📄 查看原文 ↗', freePDF: '免费PDF ↗', googleOriginal: 'Google ↗',
    citation: '📋 引用', saved: '★ 已保存', save: '☆ 保存',
    backToResults: '← 返回', author: '作者', journal: '期刊', pubYear: '年份',
    volIssue: '卷/期', researchField: '领域', citedBy: '被引用', abstract: '摘要',
    badgeFree: '免费搜索', badgePapers: '国内外论文', badgeOA: '开放获取',
  },
  ja: {
    login: 'ログイン', signup: '会員登録', googleLogin: 'Googleで続ける',
    or: 'または', name: '氏名 *', affiliation: '所属機関 (例: 東京大学)',
    position: '職位 (例: 教授, 博士課程)', phone: '電話番号 (任意)',
    email: 'メールアドレス *', password: 'パスワード *', passwordConfirm: 'パスワード確認 *',
    privacyRequired: '[必須] 個人情報の収集・利用に同意します',
    marketingOptional: '[任意] マーケティング目的の個人情報収集・利用に同意します',
    alreadyHaveAccount: 'アカウントをお持ちの方はこちら →',
    noAccount: 'アカウントをお持ちでない方はこちら →',
    search: '検索', myLibrary: '📖 マイライブラリ', logout: 'ログアウト',
    searchPlaceholder: '論文・著者・キーワードを検索...',
    tagline: '世界中の学術論文を無料で検索',
    resultsFound: '件', searching: '🔍 検索中...',
    filterAll: 'すべて', filterDomestic: '韓国論文', filterInternational: '海外論文',
    filterOA: 'オープンアクセス', filterFreePDF: '🆓 無料PDF',
    sortRelevance: '関連度', sortNewest: '新しい順', sortOldest: '古い順', sortCited: '被引用順',
    prevPage: '← 前へ', nextPage: '次へ →', pageUnit: 'ページ',
    noResults: '結果がありません。',
    openAccess: 'オープンアクセス', korean: '韓国語',
    viewOriginal: '📄 原文 ↗', freePDF: '無料PDF ↗', googleOriginal: 'Google ↗',
    citation: '📋 引用', saved: '★ 保存済み', save: '☆ 保存',
    backToResults: '← 戻る', author: '著者', journal: '学術誌', pubYear: '発行年',
    volIssue: '巻/号', researchField: '分野', citedBy: '被引用', abstract: '要旨',
    badgeFree: '無料検索', badgePapers: '国内外の論文', badgeOA: 'オープンアクセス',
  },
  de: {
    login: 'Anmelden', signup: 'Registrieren', googleLogin: 'Mit Google fortfahren',
    or: 'oder', name: 'Name *', affiliation: 'Institution (z.B. Universität Berlin)',
    position: 'Position (z.B. Professor, Doktorand)', phone: 'Telefon (optional)',
    email: 'E-Mail *', password: 'Passwort *', passwordConfirm: 'Passwort bestätigen *',
    privacyRequired: '[Erforderlich] Ich stimme der Erhebung und Nutzung meiner Daten zu',
    marketingOptional: '[Optional] Ich stimme dem Empfang von Marketing-Kommunikation zu',
    alreadyHaveAccount: 'Bereits registriert? Anmelden →',
    noAccount: 'Noch kein Konto? Registrieren →',
    search: 'Suchen', myLibrary: '📖 Meine Bibliothek', logout: 'Abmelden',
    searchPlaceholder: 'Paper, Autoren, Stichwörter suchen...',
    tagline: 'Akademische Paper weltweit kostenlos suchen',
    resultsFound: 'Ergebnisse', searching: '🔍 Suche...',
    filterAll: 'Alle', filterDomestic: 'Korea', filterInternational: 'International',
    filterOA: 'Open Access', filterFreePDF: '🆓 Kostenlos',
    sortRelevance: 'Relevanz', sortNewest: 'Neueste', sortOldest: 'Älteste', sortCited: 'Meistzitiert',
    prevPage: '← Zurück', nextPage: 'Weiter →', pageUnit: 'Seite',
    noResults: 'Keine Ergebnisse.',
    openAccess: 'Open Access', korean: 'Koreanisch',
    viewOriginal: '📄 Original ↗', freePDF: 'Kostenlos PDF ↗', googleOriginal: 'Google ↗',
    citation: '📋 Zitieren', saved: '★ Gespeichert', save: '☆ Speichern',
    backToResults: '← Zurück', author: 'Autor', journal: 'Zeitschrift', pubYear: 'Jahr',
    volIssue: 'Bd./Nr.', researchField: 'Fachgebiet', citedBy: 'Zitiert', abstract: 'Zusammenfassung',
    badgeFree: 'Kostenlos', badgePapers: 'In- & Ausland', badgeOA: 'Open Access',
  },
  fr: {
    login: 'Connexion', signup: "S'inscrire", googleLogin: 'Continuer avec Google',
    or: 'ou', name: 'Nom complet *', affiliation: 'Établissement (ex: Université Paris)',
    position: 'Poste (ex: Professeur, Doctorant)', phone: 'Téléphone (optionnel)',
    email: 'E-mail *', password: 'Mot de passe *', passwordConfirm: 'Confirmer le mot de passe *',
    privacyRequired: '[Obligatoire] J\'accepte la collecte et l\'utilisation de mes données',
    marketingOptional: '[Optionnel] J\'accepte de recevoir des communications marketing',
    alreadyHaveAccount: 'Déjà un compte ? Se connecter →',
    noAccount: 'Pas de compte ? S\'inscrire →',
    search: 'Rechercher', myLibrary: '📖 Ma Bibliothèque', logout: 'Déconnexion',
    searchPlaceholder: 'Rechercher articles, auteurs, mots-clés...',
    tagline: 'Recherchez des articles académiques dans le monde entier gratuitement',
  },
  es: {
    login: 'Iniciar sesión', signup: 'Registrarse', googleLogin: 'Continuar con Google',
    or: 'o', name: 'Nombre completo *', affiliation: 'Institución (ej: Universidad de Madrid)',
    position: 'Cargo (ej: Profesor, Doctorando)', phone: 'Teléfono (opcional)',
    email: 'Correo electrónico *', password: 'Contraseña *', passwordConfirm: 'Confirmar contraseña *',
    privacyRequired: '[Obligatorio] Acepto la recopilación y uso de mis datos personales',
    marketingOptional: '[Opcional] Acepto recibir comunicaciones de marketing',
    alreadyHaveAccount: '¿Ya tienes cuenta? Iniciar sesión →',
    noAccount: '¿No tienes cuenta? Registrarse →',
    search: 'Buscar', myLibrary: '📖 Mi Biblioteca', logout: 'Cerrar sesión',
    searchPlaceholder: 'Buscar artículos, autores, palabras clave...',
    tagline: 'Busca artículos académicos en todo el mundo de forma gratuita',
  },
  pt: {
    login: 'Entrar', signup: 'Cadastrar', googleLogin: 'Continuar com o Google',
    or: 'ou', name: 'Nome completo *', affiliation: 'Instituição (ex: Universidade de São Paulo)',
    position: 'Cargo (ex: Professor, Doutorando)', phone: 'Telefone (opcional)',
    email: 'E-mail *', password: 'Senha *', passwordConfirm: 'Confirmar senha *',
    privacyRequired: '[Obrigatório] Concordo com a coleta e uso de dados pessoais',
    marketingOptional: '[Opcional] Concordo em receber comunicações de marketing',
    alreadyHaveAccount: 'Já tem conta? Entrar →',
    noAccount: 'Não tem conta? Cadastrar →',
    search: 'Buscar', myLibrary: '📖 Minha Biblioteca', logout: 'Sair',
    searchPlaceholder: 'Buscar artigos, autores, palavras-chave...',
    tagline: 'Pesquise artigos acadêmicos em todo o mundo gratuitamente',
  },
  ar: {
    login: 'تسجيل الدخول', signup: 'إنشاء حساب', googleLogin: 'المتابعة مع Google',
    or: 'أو', name: 'الاسم الكامل *', affiliation: 'المؤسسة (مثال: جامعة القاهرة)',
    position: 'المنصب (مثال: أستاذ, طالب دكتوراه)', phone: 'الهاتف (اختياري)',
    email: 'البريد الإلكتروني *', password: 'كلمة المرور *', passwordConfirm: 'تأكيد كلمة المرور *',
    privacyRequired: '[مطلوب] أوافق على جمع واستخدام بياناتي الشخصية',
    marketingOptional: '[اختياري] أوافق على تلقي اتصالات تسويقية',
    alreadyHaveAccount: 'لديك حساب بالفعل؟ تسجيل الدخول →',
    noAccount: 'ليس لديك حساب؟ إنشاء حساب →',
    search: 'بحث', myLibrary: '📖 مكتبتي', logout: 'تسجيل الخروج',
    searchPlaceholder: 'ابحث عن المقالات والمؤلفين والكلمات الرئيسية...',
    tagline: 'ابحث في الأوراق الأكاديمية حول العالم مجانًا',
    resultsFound: 'نتيجة', searching: '🔍 جاري البحث...',
    filterAll: 'الكل', filterDomestic: 'مقالات كورية', filterInternational: 'دولي',
    filterOA: 'وصول مفتوح', filterFreePDF: '🆓 PDF مجاني',
    sortRelevance: 'الصلة', sortNewest: 'الأحدث', sortOldest: 'الأقدم', sortCited: 'الأكثر استشهادًا',
    prevPage: '← السابق', nextPage: 'التالي →', pageUnit: 'صفحة',
    noResults: 'لا توجد نتائج لهذا الفلتر.',
    openAccess: 'وصول مفتوح', korean: 'كورية',
    viewOriginal: '📄 عرض الأصل ↗', freePDF: 'PDF مجاني ↗', googleOriginal: 'Google ↗',
    citation: '📋 اقتباس', saved: '★ محفوظ', save: '☆ حفظ',
    backToResults: '← رجوع', author: 'المؤلف', journal: 'المجلة', pubYear: 'السنة',
    volIssue: 'المجلد/العدد', researchField: 'المجال', citedBy: 'الاستشهادات', abstract: 'الملخص',
    badgeFree: 'مجاني', badgePapers: 'مقالات محلية ودولية', badgeOA: 'وصول مفتوح',
  },
  vi: {
    login: 'Đăng nhập', signup: 'Đăng ký', googleLogin: 'Tiếp tục với Google',
    or: 'hoặc', name: 'Họ tên *', affiliation: 'Cơ quan (VD: ĐHQG Hà Nội)',
    position: 'Chức vụ (VD: Giáo sư, NCS)', phone: 'Điện thoại (tùy chọn)',
    email: 'Email *', password: 'Mật khẩu *', passwordConfirm: 'Xác nhận mật khẩu *',
    privacyRequired: '[Bắt buộc] Đồng ý thu thập thông tin cá nhân', marketingOptional: '[Tùy chọn] Đồng ý nhận thông tin tiếp thị',
    alreadyHaveAccount: 'Đã có tài khoản? Đăng nhập →', noAccount: 'Chưa có? Đăng ký →',
    search: 'Tìm kiếm', myLibrary: '📖 Thư viện', logout: 'Đăng xuất',
    searchPlaceholder: 'Tìm bài báo, tác giả, từ khóa...', tagline: 'Tìm kiếm bài báo học thuật miễn phí',
    resultsFound: 'kết quả', searching: '🔍 Đang tìm kiếm...',
    filterAll: 'Tất cả', filterDomestic: 'Hàn Quốc', filterInternational: 'Quốc tế',
    filterOA: 'Truy cập mở', filterFreePDF: '🆓 PDF miễn phí',
    sortRelevance: 'Liên quan', sortNewest: 'Mới nhất', sortOldest: 'Cũ nhất', sortCited: 'Trích dẫn nhiều',
    prevPage: '← Trước', nextPage: 'Sau →', pageUnit: 'Trang',
    noResults: 'Không tìm thấy kết quả.',
    openAccess: 'Truy cập mở', korean: 'Tiếng Hàn',
    viewOriginal: '📄 Xem bản gốc ↗', freePDF: 'PDF miễn phí ↗', googleOriginal: 'Google ↗',
    citation: '📋 Trích dẫn', saved: '★ Đã lưu', save: '☆ Lưu',
    backToResults: '← Quay lại', author: 'Tác giả', journal: 'Tạp chí', pubYear: 'Năm',
    volIssue: 'Tập/Số', researchField: 'Lĩnh vực', citedBy: 'Trích dẫn', abstract: 'Tóm tắt',
    badgeFree: 'Miễn phí', badgePapers: 'Trong và ngoài nước', badgeOA: 'Truy cập mở',
  },
  id: {
    login: 'Masuk', signup: 'Daftar', googleLogin: 'Lanjutkan dengan Google',
    or: 'atau', name: 'Nama *', affiliation: 'Institusi (cth: UI)',
    position: 'Jabatan (cth: Profesor)', phone: 'Telepon (opsional)',
    email: 'Email *', password: 'Kata sandi *', passwordConfirm: 'Konfirmasi *',
    privacyRequired: '[Wajib] Menyetujui pengumpulan data pribadi', marketingOptional: '[Opsional] Setuju menerima info pemasaran',
    alreadyHaveAccount: 'Sudah punya akun? Masuk →', noAccount: 'Belum punya? Daftar →',
    search: 'Cari', myLibrary: '📖 Perpustakaan', logout: 'Keluar',
    searchPlaceholder: 'Cari artikel, penulis, kata kunci...', tagline: 'Cari artikel akademik gratis',
    resultsFound: 'hasil', searching: '🔍 Mencari...',
    filterAll: 'Semua', filterDomestic: 'Korea', filterInternational: 'Internasional',
    filterOA: 'Akses Terbuka', filterFreePDF: '🆓 PDF Gratis',
    sortRelevance: 'Relevansi', sortNewest: 'Terbaru', sortOldest: 'Terlama', sortCited: 'Terbanyak Dikutip',
    prevPage: '← Sebelum', nextPage: 'Selanjut →', pageUnit: 'Hal',
    noResults: 'Tidak ada hasil.',
    openAccess: 'Akses Terbuka', korean: 'Korea',
    viewOriginal: '📄 Lihat Asli ↗', freePDF: 'PDF Gratis ↗', googleOriginal: 'Google ↗',
    citation: '📋 Kutip', saved: '★ Tersimpan', save: '☆ Simpan',
    backToResults: '← Kembali', author: 'Penulis', journal: 'Jurnal', pubYear: 'Tahun',
    volIssue: 'Vol/No', researchField: 'Bidang', citedBy: 'Dikutip', abstract: 'Abstrak',
    badgeFree: 'Gratis', badgePapers: 'Domestik & Internasional', badgeOA: 'Akses Terbuka',
  },
  th: {
    login: 'เข้าสู่ระบบ', signup: 'สมัคร', googleLogin: 'ดำเนินการด้วย Google',
    or: 'หรือ', name: 'ชื่อ *', affiliation: 'สถาบัน', position: 'ตำแหน่ง', phone: 'โทร (ไม่บังคับ)',
    email: 'อีเมล *', password: 'รหัสผ่าน *', passwordConfirm: 'ยืนยันรหัส *',
    privacyRequired: '[จำเป็น] ยินยอมเก็บข้อมูลส่วนบุคคล', marketingOptional: '[ทางเลือก] ยินยอมรับข่าวสาร',
    alreadyHaveAccount: 'มีบัญชี? เข้าสู่ระบบ →', noAccount: 'ยังไม่มี? สมัคร →',
    search: 'ค้นหา', myLibrary: '📖 ห้องสมุด', logout: 'ออก',
    searchPlaceholder: 'ค้นหาบทความ ผู้แต่ง...', tagline: 'ค้นหาบทความวิชาการฟรี',
    resultsFound: 'ผลลัพธ์', searching: '🔍 กำลังค้นหา...',
    filterAll: 'ทั้งหมด', filterDomestic: 'เกาหลี', filterInternational: 'นานาชาติ',
    filterOA: 'เข้าถึงเปิด', filterFreePDF: '🆓 PDF ฟรี',
    sortRelevance: 'เกี่ยวข้อง', sortNewest: 'ใหม่สุด', sortOldest: 'เก่าสุด', sortCited: 'อ้างอิงมาก',
    prevPage: '← ก่อนหน้า', nextPage: 'ถัดไป →', pageUnit: 'หน้า',
    noResults: 'ไม่พบผลลัพธ์',
    openAccess: 'เข้าถึงเปิด', korean: 'เกาหลี',
    viewOriginal: '📄 ดูต้นฉบับ ↗', freePDF: 'PDF ฟรี ↗', googleOriginal: 'Google ↗',
    citation: '📋 อ้างอิง', saved: '★ บันทึกแล้ว', save: '☆ บันทึก',
    backToResults: '← กลับ', author: 'ผู้แต่ง', journal: 'วารสาร', pubYear: 'ปี',
    volIssue: 'ปีที่/ฉบับ', researchField: 'สาขา', citedBy: 'อ้างอิง', abstract: 'บทคัดย่อ',
    badgeFree: 'ฟรี', badgePapers: 'ในและต่างประเทศ', badgeOA: 'เข้าถึงเปิด',
  },
  hi: {
    login: 'लॉग इन', signup: 'साइन अप', googleLogin: 'Google से जारी रखें',
    or: 'या', name: 'नाम *', affiliation: 'संस्था', position: 'पद', phone: 'फोन (वैकल्पिक)',
    email: 'ईमेल *', password: 'पासवर्ड *', passwordConfirm: 'पासवर्ड पुष्टि *',
    privacyRequired: '[आवश्यक] डेटा संग्रह से सहमत', marketingOptional: '[वैकल्पिक] मार्केटिंग से सहमत',
    alreadyHaveAccount: 'खाता है? लॉग इन →', noAccount: 'खाता नहीं? साइन अप →',
    search: 'खोजें', myLibrary: '📖 पुस्तकालय', logout: 'लॉग आउट',
    searchPlaceholder: 'शोधपत्र, लेखक खोजें...', tagline: 'शोधपत्र मुफ्त में खोजें',
    resultsFound: 'परिणाम', searching: '🔍 खोज रहे हैं...',
    filterAll: 'सभी', filterDomestic: 'कोरियाई', filterInternational: 'अंतरराष्ट्रीय',
    filterOA: 'ओपन एक्सेस', filterFreePDF: '🆓 मुफ्त PDF',
    sortRelevance: 'प्रासंगिकता', sortNewest: 'नवीनतम', sortOldest: 'पुराना', sortCited: 'सर्वाधिक उद्धृत',
    prevPage: '← पिछला', nextPage: 'अगला →', pageUnit: 'पृष्ठ',
    noResults: 'कोई परिणाम नहीं।',
    openAccess: 'ओपन एक्सेस', korean: 'कोरियाई',
    viewOriginal: '📄 मूल देखें ↗', freePDF: 'मुफ्त PDF ↗', googleOriginal: 'Google ↗',
    citation: '📋 उद्धरण', saved: '★ सहेजा', save: '☆ सहेजें',
    backToResults: '← वापस', author: 'लेखक', journal: 'पत्रिका', pubYear: 'वर्ष',
    volIssue: 'खंड/अंक', researchField: 'क्षेत्र', citedBy: 'उद्धृत', abstract: 'सारांश',
    badgeFree: 'मुफ्त', badgePapers: 'घरेलू और अंतरराष्ट्रीय', badgeOA: 'ओपन एक्सेस',
  },
  tr: {
    login: 'Giriş', signup: 'Kayıt', googleLogin: 'Google ile devam',
    or: 'veya', name: 'Ad Soyad *', affiliation: 'Kurum', position: 'Pozisyon', phone: 'Tel (isteğe bağlı)',
    email: 'E-posta *', password: 'Şifre *', passwordConfirm: 'Şifre Onayı *',
    privacyRequired: '[Zorunlu] Veri toplamayı kabul ediyorum', marketingOptional: '[İsteğe bağlı] Pazarlama kabul',
    alreadyHaveAccount: 'Hesabınız var mı? Giriş →', noAccount: 'Hesap yok mu? Kayıt →',
    search: 'Ara', myLibrary: '📖 Kütüphane', logout: 'Çıkış',
    searchPlaceholder: 'Makale, yazar, anahtar kelime...', tagline: 'Akademik makaleleri ücretsiz arayın',
    resultsFound: 'sonuç', searching: '🔍 Aranıyor...',
    filterAll: 'Tümü', filterDomestic: 'Kore', filterInternational: 'Uluslararası',
    filterOA: 'Açık Erişim', filterFreePDF: '🆓 Ücretsiz PDF',
    sortRelevance: 'İlgililik', sortNewest: 'En Yeni', sortOldest: 'En Eski', sortCited: 'En Çok Atıf',
    prevPage: '← Önceki', nextPage: 'Sonraki →', pageUnit: 'Sayfa',
    noResults: 'Sonuç bulunamadı.',
    openAccess: 'Açık Erişim', korean: 'Korece',
    viewOriginal: '📄 Orijinal ↗', freePDF: 'Ücretsiz PDF ↗', googleOriginal: 'Google ↗',
    citation: '📋 Alıntı', saved: '★ Kaydedildi', save: '☆ Kaydet',
    backToResults: '← Geri', author: 'Yazar', journal: 'Dergi', pubYear: 'Yıl',
    volIssue: 'Cilt/Sayı', researchField: 'Alan', citedBy: 'Atıf', abstract: 'Özet',
    badgeFree: 'Ücretsiz', badgePapers: 'Ulusal ve Uluslararası', badgeOA: 'Açık Erişim',
  },
  ru: {
    login: 'Войти', signup: 'Регистрация', googleLogin: 'Через Google',
    or: 'или', name: 'ФИО *', affiliation: 'Учреждение', position: 'Должность', phone: 'Тел (необяз.)',
    email: 'Эл. почта *', password: 'Пароль *', passwordConfirm: 'Подтверждение *',
    privacyRequired: '[Обяз.] Согласие на сбор данных', marketingOptional: '[Необяз.] Согласие на рассылки',
    alreadyHaveAccount: 'Есть аккаунт? Войти →', noAccount: 'Нет аккаунта? Регистрация →',
    search: 'Поиск', myLibrary: '📖 Библиотека', logout: 'Выйти',
    searchPlaceholder: 'Статьи, авторы, ключевые слова...', tagline: 'Бесплатный поиск научных статей',
    resultsFound: 'результатов', searching: '🔍 Поиск...',
    filterAll: 'Все', filterDomestic: 'Корейские', filterInternational: 'Международные',
    filterOA: 'Открытый доступ', filterFreePDF: '🆓 Бесплатный PDF',
    sortRelevance: 'Релевантность', sortNewest: 'Новейшие', sortOldest: 'Старейшие', sortCited: 'По цитированию',
    prevPage: '← Назад', nextPage: 'Далее →', pageUnit: 'Стр.',
    noResults: 'Нет результатов.',
    openAccess: 'Открытый доступ', korean: 'Корейский',
    viewOriginal: '📄 Оригинал ↗', freePDF: 'Бесплатный PDF ↗', googleOriginal: 'Google ↗',
    citation: '📋 Цитата', saved: '★ Сохранено', save: '☆ Сохранить',
    backToResults: '← Назад', author: 'Автор', journal: 'Журнал', pubYear: 'Год',
    volIssue: 'Том/Номер', researchField: 'Область', citedBy: 'Цитирования', abstract: 'Аннотация',
    badgeFree: 'Бесплатно', badgePapers: 'Отечественные и зарубежные', badgeOA: 'Открытый доступ',
  },
  mn: {
    login: 'Нэвтрэх', signup: 'Бүртгүүлэх', googleLogin: 'Google-ээр',
    or: 'эсвэл', name: 'Нэр *', affiliation: 'Байгууллага', position: 'Тушаал', phone: 'Утас',
    email: 'И-мэйл *', password: 'Нууц үг *', passwordConfirm: 'Баталгаажуулах *',
    privacyRequired: '[Заавал] Мэдээлэл цуглуулахыг зөвшөөрнө', marketingOptional: '[Сонголт] Маркетинг зөвшөөрнө',
    alreadyHaveAccount: 'Бүртгэлтэй? Нэвтрэх →', noAccount: 'Бүртгэлгүй? Бүртгүүлэх →',
    search: 'Хайх', myLibrary: '📖 Номын сан', logout: 'Гарах',
    searchPlaceholder: 'Өгүүлэл, зохиогч хайх...', tagline: 'Эрдэм шинжилгээний өгүүлэл үнэгүй хайх',
    resultsFound: 'үр дүн', searching: '🔍 Хайж байна...',
    filterAll: 'Бүгд', filterDomestic: 'Солонгос', filterInternational: 'Олон улсын',
    filterOA: 'Нээлттэй', filterFreePDF: '🆓 Үнэгүй PDF',
    sortRelevance: 'Хамааралтай', sortNewest: 'Шинэ', sortOldest: 'Хуучин', sortCited: 'Иш татсан',
    prevPage: '← Өмнөх', nextPage: 'Дараах →', pageUnit: 'Хуудас',
    noResults: 'Үр дүн олдсонгүй.',
    openAccess: 'Нээлттэй', korean: 'Солонгос',
    viewOriginal: '📄 Эх хувь ↗', freePDF: 'Үнэгүй PDF ↗', googleOriginal: 'Google ↗',
    citation: '📋 Иш татах', saved: '★ Хадгалсан', save: '☆ Хадгалах',
    backToResults: '← Буцах', author: 'Зохиогч', journal: 'Сэтгүүл', pubYear: 'Он',
    volIssue: 'Боть/Дугаар', researchField: 'Чиглэл', citedBy: 'Иш татсан', abstract: 'Хураангуй',
    badgeFree: 'Үнэгүй', badgePapers: 'Дотоод болон гадаад', badgeOA: 'Нээлттэй',
  },
};

const PRIVACY_CONTENT = {
  required: {
    ko: `[필수] 개인정보 수집 및 이용 동의\n(주)한국지식미디어연구원(이하 "회사")은 Korea Scholar 서비스의 원활한 제공을 위해 아래와 같이 개인정보를 수집·이용합니다.\n\n■ 수집 항목: 이름, 이메일 주소, 비밀번호, 소속 기관, 직책\n■ 수집 목적: 본인 식별, 학술 정보 검색 서비스 제공, 고객 문의 응대 및 고지사항 전달\n■ 제3자 제공: 원칙적으로 제3자에게 제공하지 않으며, 법령에 의한 경우에만 예외적으로 제공합니다.\n■ 보유 및 이용 기간: 회원 탈퇴 시까지 (관계 법령에 따라 보관이 필요한 경우 해당 기간까지)\n■ 동의 거부 권리: 거부 시 회원가입 및 서비스 이용이 제한됩니다.`,
    en: `[Required] Consent to Collection and Use of Personal Information\nKorea Knowledge Media Research Institute, Inc. ("Company") collects and uses personal information as follows for the smooth provision of Korea Scholar services.\n\n■ Items collected: Name, email address, password, institution, position\n■ Purpose: User identification, academic search service, customer support\n■ Third-party provision: Not provided to third parties in principle, except as required by law.\n■ Retention period: Until membership withdrawal (or as required by applicable law)\n■ Right to refuse: Refusal may restrict membership registration and service use.`,
    zh: `[必填] 个人信息收集和使用同意\n韩国知识媒体研究院（以下简称"公司"）为顺利提供Korea Scholar服务，按如下方式收集和使用个人信息。\n\n■ 收集项目：姓名、电子邮件地址、密码、所属机构、职位\n■ 收集目的：本人识别、学术信息检索服务提供、客户咨询应对\n■ 第三方提供：原则上不向第三方提供，仅在法律规定的情况下例外提供。\n■ 保留及使用期间：至会员退出为止\n■ 拒绝权利：拒绝时，会员注册及服务使用将受到限制。`,
  },
  marketing: {
    ko: `[선택] 마케팅 목적 개인정보 수집 및 이용 동의\n수집된 정보를 활용하여 학술지 편집, 도서 출판, 학회 운영 지원 등 신규 서비스 안내, 이벤트 정보, 맞춤형 광고 전송 및 이메일·문자(SMS/LMS)·카카오톡 알림톡을 통한 광고성 정보를 수신할 수 있습니다.\n\n■ 수집 항목: 이름, 연락처, 이메일, 소속 기관, 직책\n■ 보유 기간: 회원 탈퇴 또는 마케팅 동의 철회 시까지\n■ 동의하지 않더라도 기본 검색 서비스는 이용 가능합니다.`,
    en: `[Optional] Consent to Collection and Use of Personal Information for Marketing\nThe Company may use collected information to send information about new services (journal editing, book publishing, academic society support), events, and personalized advertisements via email, SMS, and messaging apps.\n\n■ Items: Name, phone, email, institution, position\n■ Retention: Until withdrawal or revocation of marketing consent\n■ Basic search service is available even without this consent.`,
    zh: `[可选] 营销目的个人信息收集和使用同意\n公司可利用收集的信息发送学术期刊编辑、图书出版、学会运营支持等新服务介绍、活动信息及定制广告。\n\n■ 收集项目：姓名、联系方式、电子邮件、所属机构、职位\n■ 保留期间：至会员退出或撤回营销同意为止\n■ 即使不同意，也可使用基本检索服务。`,
  }
};

// ==================== 로그인/회원가입 모달 ====================
function AuthModal({ onClose }) {
  const [lang, setLang] = useState('en');
  const t = i18n[lang] || i18n.en;
  const isRTL = lang === 'ar';
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [name, setName] = useState('');
  const [affiliation, setAffiliation] = useState('');
  const [position, setPosition] = useState('');
  const [phone, setPhone] = useState('');
  const [privacyAgree, setPrivacyAgree] = useState(false);
  const [marketingAgree, setMarketingAgree] = useState(false);
  const [error, setError] = useState('');

  const handleEmail = async () => {
    setError('');
    if (mode === 'signup') {
      if (!name.trim()) { setError('이름을 입력해주세요. / Please enter your name.'); return; }
      if (password !== passwordConfirm) { setError('비밀번호가 일치하지 않습니다. / Passwords do not match.'); return; }
      if (password.length < 6) { setError('비밀번호는 6자 이상이어야 합니다. / Password must be at least 6 characters.'); return; }
      if (!privacyAgree) { setError('필수 개인정보 수집·이용에 동의해주세요. / Please agree to the required privacy policy.'); return; }
    }
    try {
      if (mode === 'login') {
        await signInWithEmail(email, password); onClose();
      } else {
        const cred = await signUpWithEmail(email, password);
        await setDoc(doc(db, 'users', cred.user.uid), {
          uid: cred.user.uid, email, name, affiliation, position, phone,
          privacyAgree: true, marketingAgree, language: lang,
          createdAt: new Date(), provider: 'email'
        });
        onClose();
      }
    } catch (e) {
      setError(e.code === 'auth/email-already-in-use' ? '이미 사용 중인 이메일입니다.' :
        e.code === 'auth/weak-password' ? '비밀번호는 6자 이상이어야 합니다.' : e.message);
    }
  };

  const handleGoogle = async () => {
    try {
      const cred = await signInWithGoogle();
      const userRef = doc(db, 'users', cred.user.uid);
      const snap = await getDoc(userRef);
      if (!snap.exists()) {
        await setDoc(userRef, {
          uid: cred.user.uid, email: cred.user.email, name: cred.user.displayName || '',
          affiliation: '', position: '', phone: '', privacyAgree: true, marketingAgree: false,
          language: lang, createdAt: new Date(), provider: 'google'
        });
      }
      onClose();
    } catch (e) { setError(e.message); }
  };

  const privacyText = PRIVACY_CONTENT.required[lang] || PRIVACY_CONTENT.required.en;
  const marketingText = PRIVACY_CONTENT.marketing[lang] || PRIVACY_CONTENT.marketing.en;

  return (
    <div className="ks-modal-overlay" onClick={onClose}>
      <div className="ks-modal" onClick={e => e.stopPropagation()}
        style={{maxHeight:'90vh', overflowY:'auto', direction: isRTL ? 'rtl' : 'ltr'}}>
        <button className="ks-modal-close" onClick={onClose}>✕</button>

        {/* 언어 선택 */}
        <div style={{display:'flex', flexWrap:'wrap', gap:'4px', marginBottom:'14px'}}>
          {Object.entries(LANGUAGES).map(([code, label]) => (
            <button key={code} onClick={() => setLang(code)}
              style={{fontSize:'11px', padding:'3px 8px', borderRadius:'6px', cursor:'pointer',
                border: lang===code ? '1.5px solid #1D9E75' : '1px solid #e5e7eb',
                background: lang===code ? '#f0fdf4' : '#fff',
                color: lang===code ? '#1D9E75' : '#555', fontWeight: lang===code ? '700' : '400'}}>
              {label}
            </button>
          ))}
        </div>

        <h2 className="ks-modal-title">{mode === 'login' ? t.login : t.signup}</h2>
        <button className="ks-btn-google" onClick={handleGoogle}>🔵 {t.googleLogin}</button>
        <div className="ks-divider">{t.or}</div>

        {mode === 'signup' && (
          <>
            <input className="ks-modal-input" type="text" placeholder={t.name} value={name} onChange={e => setName(e.target.value)} />
            <input className="ks-modal-input" type="text" placeholder={t.affiliation} value={affiliation} onChange={e => setAffiliation(e.target.value)} />
            <input className="ks-modal-input" type="text" placeholder={t.position} value={position} onChange={e => setPosition(e.target.value)} />
            <input className="ks-modal-input" type="tel" placeholder={t.phone} value={phone} onChange={e => setPhone(e.target.value)} />
          </>
        )}
        <input className="ks-modal-input" type="email" placeholder={t.email} value={email} onChange={e => setEmail(e.target.value)} />
        <input className="ks-modal-input" type="password" placeholder={t.password} value={password} onChange={e => setPassword(e.target.value)} />
        {mode === 'signup' && (
          <input className="ks-modal-input" type="password" placeholder={t.passwordConfirm} value={passwordConfirm} onChange={e => setPasswordConfirm(e.target.value)} />
        )}

        {mode === 'signup' && (
          <div style={{display:'flex', flexDirection:'column', gap:'10px'}}>
            {/* 필수 동의 */}
            <div style={{background:'#f9fafb', borderRadius:'8px', padding:'12px', fontSize:'12px'}}>
              <div style={{maxHeight:'72px', overflowY:'auto', color:'#555', lineHeight:'1.6',
                marginBottom:'10px', whiteSpace:'pre-line'}}>{privacyText}</div>
              <label style={{display:'flex', alignItems:'center', gap:'8px', cursor:'pointer',
                fontWeight:'700', color:'#1a1a1a'}}>
                <input type="checkbox" checked={privacyAgree} onChange={e => setPrivacyAgree(e.target.checked)}
                  style={{width:'16px', height:'16px', cursor:'pointer', accentColor:'#1D9E75'}} />
                {t.privacyRequired}
              </label>
            </div>
            {/* 선택 동의 */}
            <div style={{background:'#f9fafb', borderRadius:'8px', padding:'12px', fontSize:'12px'}}>
              <div style={{maxHeight:'72px', overflowY:'auto', color:'#555', lineHeight:'1.6',
                marginBottom:'10px', whiteSpace:'pre-line'}}>{marketingText}</div>
              <label style={{display:'flex', alignItems:'center', gap:'8px', cursor:'pointer',
                fontWeight:'600', color:'#374151'}}>
                <input type="checkbox" checked={marketingAgree} onChange={e => setMarketingAgree(e.target.checked)}
                  style={{width:'16px', height:'16px', cursor:'pointer', accentColor:'#f5a623'}} />
                {t.marketingOptional}
              </label>
            </div>
          </div>
        )}

        {error && <p className="ks-error">{error}</p>}
        <button className="ks-btn-submit" onClick={handleEmail}>{mode === 'login' ? t.login : t.signup}</button>
        <p className="ks-switch" onClick={() => { setMode(mode==='login'?'signup':'login'); setError(''); setPrivacyAgree(false); setMarketingAgree(false); }}>
          {mode === 'login' ? t.noAccount : t.alreadyHaveAccount}
        </p>
      </div>
    </div>
  );
}

// ==================== 마이페이지 ====================
function MyPage({ user, onSearch }) {
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({});
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const isEmailUser = user.providerData[0]?.providerId === 'password';

  useEffect(() => {
    getDoc(doc(db, 'users', user.uid)).then(snap => {
      if (snap.exists()) { setProfile(snap.data()); setEditData(snap.data()); }
    });
  }, [user]);

  const handleSaveProfile = async () => {
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        name: editData.name || '', affiliation: editData.affiliation || '',
        position: editData.position || '', phone: editData.phone || ''
      });
      setProfile({...profile, ...editData});
      setEditing(false);
      setMsg('프로필이 저장되었습니다! ✓');
      setTimeout(() => setMsg(''), 3000);
    } catch (e) { setError(e.message); }
  };

  const handlePasswordChange = async () => {
    if (!currentPassword || !newPassword) { setError('비밀번호를 모두 입력해주세요.'); return; }
    if (newPassword !== newPasswordConfirm) { setError('새 비밀번호가 일치하지 않습니다.'); return; }
    if (newPassword.length < 6) { setError('비밀번호는 6자 이상이어야 합니다.'); return; }
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
      await updatePassword(user, newPassword);
      setMsg('비밀번호가 변경되었습니다! ✓'); setError('');
      setCurrentPassword(''); setNewPassword(''); setNewPasswordConfirm('');
    } catch (e) {
      setError(e.code === 'auth/wrong-password' ? '현재 비밀번호가 틀렸습니다.' : e.message);
    }
  };

  const handleDeleteAccount = async () => {
    if (!window.confirm('정말로 탈퇴하시겠습니까? 모든 데이터가 삭제됩니다.')) return;
    try {
      if (isEmailUser) {
        const pw = window.prompt('탈퇴 확인을 위해 비밀번호를 입력해주세요:');
        if (!pw) return;
        await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, pw));
      }
      await deleteDoc(doc(db, 'users', user.uid));
      await deleteUser(user);
      onSearch(null);
    } catch (e) { setError('탈퇴 실패: ' + e.message); }
  };

  const fields = [
    { key: 'name', label: '이름', placeholder: '이름' },
    { key: 'affiliation', label: '소속', placeholder: '소속 기관' },
    { key: 'position', label: '직책', placeholder: '직책 (예: 교수, 박사과정)' },
    { key: 'phone', label: '연락처', placeholder: '연락처' },
  ];

  return (
    <div>
      <Header user={user} onSearch={onSearch} onShowAuth={() => {}} />
      <div className="ks-results">
        <div className="ks-card" style={{cursor:'default', maxWidth:'520px', margin:'0 auto'}}>
          <div className="ks-card-title" style={{fontSize:'20px', marginBottom:'20px'}}>👤 마이페이지</div>

          {/* 계정 정보 */}
          <div style={{marginBottom:'24px', padding:'16px', background:'#f7f9fc', borderRadius:'10px'}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px'}}>
              <div style={{fontSize:'14px', fontWeight:'700', color:'#1a3a5c'}}>계정 정보</div>
              <button onClick={() => { setEditing(!editing); setMsg(''); setError(''); }}
                style={{fontSize:'12px', padding:'4px 12px', borderRadius:'6px', border:'1px solid #1D9E75',
                  color: editing ? '#888' : '#1D9E75', background:'none', cursor:'pointer'}}>
                {editing ? '취소' : '✏️ 수정'}
              </button>
            </div>

            <div style={{fontSize:'13px', color:'#9ca3af', marginBottom:'4px'}}>이메일</div>
            <div style={{fontSize:'14px', fontWeight:'500', marginBottom:'12px'}}>{user.email}</div>

            {fields.map(({key, label, placeholder}) => (
              <div key={key} style={{marginBottom:'10px'}}>
                <div style={{fontSize:'13px', color:'#9ca3af', marginBottom:'4px'}}>{label}</div>
                {editing ? (
                  <input className="ks-modal-input" placeholder={placeholder}
                    value={editData[key] || ''} onChange={e => setEditData({...editData, [key]: e.target.value})}
                    style={{marginBottom:'0'}} />
                ) : (
                  <div style={{fontSize:'14px', fontWeight:'500', color: profile?.[key] ? '#1a1a1a' : '#ccc'}}>
                    {profile?.[key] || '미입력'}
                  </div>
                )}
              </div>
            ))}

            <div style={{fontSize:'13px', color:'#9ca3af', marginTop:'4px', marginBottom:'4px'}}>로그인 방식</div>
            <div style={{fontSize:'14px', fontWeight:'500'}}>{isEmailUser ? '이메일/비밀번호' : 'Google 소셜 로그인'}</div>

            {editing && (
              <button className="ks-btn-submit" onClick={handleSaveProfile} style={{marginTop:'12px'}}>저장</button>
            )}
          </div>

          {msg && <p style={{color:'#1D9E75', fontSize:'13px', marginBottom:'12px'}}>{msg}</p>}

          {/* 비밀번호 변경 */}
          {isEmailUser && (
            <div style={{marginBottom:'24px'}}>
              <div style={{fontSize:'14px', fontWeight:'700', color:'#1a3a5c', marginBottom:'12px'}}>🔒 비밀번호 변경</div>
              <input className="ks-modal-input" type="password" placeholder="현재 비밀번호"
                value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
              <input className="ks-modal-input" type="password" placeholder="새 비밀번호 (6자 이상)"
                value={newPassword} onChange={e => setNewPassword(e.target.value)} />
              <input className="ks-modal-input" type="password" placeholder="새 비밀번호 확인"
                value={newPasswordConfirm} onChange={e => setNewPasswordConfirm(e.target.value)} />
              <button className="ks-btn-submit" onClick={handlePasswordChange} style={{marginTop:'4px'}}>비밀번호 변경</button>
            </div>
          )}

          {error && <p className="ks-error" style={{marginBottom:'12px'}}>{error}</p>}

          {/* 회원 탈퇴 */}
          <div style={{borderTop:'1px solid #f3f4f6', paddingTop:'20px'}}>
            <div style={{fontSize:'14px', fontWeight:'700', color:'#e53e3e', marginBottom:'8px'}}>⚠️ 회원 탈퇴</div>
            <p style={{fontSize:'13px', color:'#888', marginBottom:'12px'}}>탈퇴 시 모든 북마크 데이터가 삭제되며 복구할 수 없습니다.</p>
            <button onClick={handleDeleteAccount}
              style={{background:'none', border:'1px solid #e53e3e', borderRadius:'8px',
                padding:'8px 16px', color:'#e53e3e', fontSize:'13px', cursor:'pointer'}}>회원 탈퇴</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== 내 서재 ====================
function LibraryPage({ user, bookmarks, onPaperClick, onSearch, onShowAuth, onRemoveBookmark }) {
  return (
    <div>
      <Header user={user} onSearch={onSearch} onShowAuth={onShowAuth} />
      <div className="ks-results">
        <div className="ks-results-meta">📖 내 서재 — {bookmarks.length}편 저장됨</div>
        {bookmarks.length === 0 ? (
          <div className="ks-card" style={{cursor:'default', color:'#888', textAlign:'center', padding:'40px'}}>
            저장된 논문이 없습니다.<br/>검색 후 ☆ 버튼으로 저장해보세요!
          </div>
        ) : bookmarks.map(b => (
          <div key={b.id} className="ks-card">
            <div className="ks-card-title" onClick={() => onPaperClick(b.paperData)} style={{cursor:'pointer'}}>{b.title}</div>
            <div className="ks-card-meta">{b.authors}{b.year&&` · ${b.year}`}</div>
            <div className="ks-card-footer">
              <div></div>
              <div style={{display:'flex', gap:'6px'}}>
                {b.paperData && <CitationButton paper={b.paperData} />}
                <button className="ks-pdf-btn" style={{borderColor:'#f5a623', color:'#f5a623'}}
                  onClick={() => onRemoveBookmark(b.id)}>★ 저장 취소</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==================== 메인 앱 ====================
export default function App() {
  const [page, setPage] = useState('home');
  const [siteLang, setSiteLang] = useState(detectLanguage());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPaper, setSelectedPaper] = useState(null);
  const [user, setUser] = useState(null);
  const [showAuth, setShowAuth] = useState(false);
  const [bookmarks, setBookmarks] = useState([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => {
      setUser(u);
      if (u) loadBookmarks(u.uid);
      else { setBookmarks([]); setPage('home'); }
    });
    return unsub;
  }, []);

  const loadBookmarks = async (uid) => {
    const q = query(collection(db, 'bookmarks'), where('uid', '==', uid));
    const snap = await getDocs(q);
    setBookmarks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  const handleBookmark = async (paper) => {
    if (!user) { setShowAuth(true); return; }
    const existing = bookmarks.find(b => b.paperId === paper.id);
    if (existing) {
      await deleteDoc(doc(db, 'bookmarks', existing.id));
      setBookmarks(prev => prev.filter(b => b.id !== existing.id));
    } else {
      const newDoc = await addDoc(collection(db, 'bookmarks'), {
        uid: user.uid, paperId: paper.id, title: paper.title || '',
        authors: paper.authorships?.map(a => a.author?.display_name).filter(Boolean).join(', ') || '',
        year: paper.publication_year || '', paperData: paper, savedAt: new Date()
      });
      setBookmarks(prev => [...prev, { id: newDoc.id, paperId: paper.id, title: paper.title,
        authors: '', year: paper.publication_year, paperData: paper }]);
    }
  };

  const handleSearch = (q) => {
    if (!q) { setPage('home'); return; }
    if (q === '__library__') { setPage('library'); return; }
    if (q === '__mypage__') { setPage('mypage'); return; }
    setSearchQuery(q); setPage('results');
  };

  const commonProps = { user, onSearch: handleSearch, onShowAuth: () => setShowAuth(true), siteLang, onLangChange: setSiteLang };

  return (
    <div>
      {page === 'home' && <HomePage {...commonProps} />}
      {page === 'results' && (
        <ResultsPage query={searchQuery} onPaperClick={p => { setSelectedPaper(p); setPage('detail'); }}
          bookmarks={bookmarks} onBookmark={handleBookmark} {...commonProps} />
      )}
      {page === 'detail' && selectedPaper && (
        <DetailPage paper={selectedPaper} onBack={() => setPage('results')}
          bookmarks={bookmarks} onBookmark={handleBookmark} {...commonProps} />
      )}
      {page === 'library' && (
        <LibraryPage bookmarks={bookmarks}
          onPaperClick={p => { setSelectedPaper(p); setPage('detail'); }}
          onRemoveBookmark={async (id) => {
            await deleteDoc(doc(db, 'bookmarks', id));
            setBookmarks(prev => prev.filter(b => b.id !== id));
          }} {...commonProps} />
      )}
      {page === 'mypage' && user && <MyPage user={user} onSearch={handleSearch} />}
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </div>
  );
}