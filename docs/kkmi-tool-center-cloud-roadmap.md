# KKMI 도구 센터 — 클라우드 SaaS 통합 로드맵 (미러)

> 원본: `kkmi-25/the-journal-cloud:docs/kkmi-tool-center-cloud-roadmap.md`
> 이 사본은 `korea-scholar` 측에서도 동일 컨텍스트로 작업할 수 있도록 미러링된 것이다.
> 변경 시 반드시 양쪽을 동기화한다.

---

## 0. 배경과 방향 전환

이전 구상안은 "파이썬 데스크톱 설치 → 더 저널 클라우드 연계" 형태였으나,
실제 학회 사무국 사용 패턴과 SaaS 확장성을 고려해 **풀 클라우드 웹 플랫폼**으로 재정의한다.

### 결정 근거
- **참조 사례**: 치과 EMR(전자차트). 단일 데스크톱에 모든 환자/차트/수납이 들어 있는 구조 → 우리는 이걸 **테넌트(학회)별 클라우드 워크스페이스**로 옮긴다.
- **사용자**: 학회 사무국 담당자. 출근하면 PC를 켜고 브라우저로 들어와 하루 업무를 시작한다.
- **연계 자산**: 이미 `the-journal-cloud`(논문 투고/심사) 인프라가 있으므로, 도구 센터는 이를 **SSO·데이터·알림으로 양방향 연동**한다.

---

## 1. 플랫폼 개요

| 항목 | 내용 |
|---|---|
| 배포 | Web SaaS (브라우저) — 별도 설치 없음 |
| 인증 | 더 저널 클라우드와 SSO (단일 계정) |
| 격리 | 학회별 테넌트 (DB row-level + 파일 prefix 분리) |
| 청구 | 월 구독 + 용량 추가 구매 + 옵션 모듈 |
| 다국어 | KO 기본, EN/ZH 확장 (글로벌 사용 고려) |

도메인 제안:
- `tools.kkmi.cloud` — 도구 센터 메인
- `<society>.tools.kkmi.cloud` — 학회별 서브도메인 (선택)
- `journal.kkmi.cloud` — 더 저널 클라우드 (기존)

---

## 2. 학회별 용량(쿼터) 모델

### 2.1 기본 쿼터 (예시)
| 플랜 | 월 구독 | 기본 용량 | 시트 | 핵심 모듈 |
|---|---|---|---|---|
| Starter | ₩99,000 | 50 GB | 3명 | 회원·회비·메일 |
| Pro | ₩299,000 | 200 GB | 10명 | + 학술대회·QR·식권·회계 |
| Enterprise | 협의 | 1 TB+ | 무제한 | + 다국어·맞춤 도메인·전용 지원 |

### 2.2 용량 카운트 대상
회원 DB·첨부, 회비 영수증 PDF, 학술대회 자료(포스터·영상·발표자료), QR/식권 발급 이력, 회계 증빙·세금계산서 사본, 메일 본문 첨부.

### 2.3 추가 구매
- 단위: 10 / 50 / 100 GB 팩
- 80% 도달 시 배너 → 결제 → 즉시 자동 증설
- 대시보드 상단 영구 게이지

### 2.4 구현 노트
S3 호환 오브젝트 스토리지(학회별 prefix), Redis 카운터 + 야간 정합성 잡, 초과 시 신규 업로드 차단(읽기는 허용).

---

## 3. 출근 업무 에이전트 (Daily Briefing Agent)

오전 9시 로그인 시 자동 실행되어 그날 처리해야 할 일을 정리·브리핑한다.

수집: 회비 미납자, 심사 마감 임박(저널 API), 학술대회 D-Day, 미답변 문의, 어제 결제·환불.
출력: 우선순위 카드 + 자연어 명령창("미납 회원에 안내 메일 초안 만들어 줘" 등) + 퇴근 리포트.

내부 도구(LLM tool):
`members.*`, `dues.list_unpaid / issue_receipt / email_receipt`, `conference.*`, `qr.generate / scan_log`, `meal.issue_voucher / redeem`, `mail.draft / send_bulk`, `journal.review_status`, `accounting.summary`.

권한: 로그인 사용자의 RBAC 범위 안에서만 호출. 모든 호출 audit log.

---

## 4. 모듈 구성 (Phase 1)

- **회원**: 가입·등급·이력·중복 검출, 저널 저자 매핑
- **회비**: PG 결제 + **개별 PDF 영수증 + 개별 메일 발송** (학술대회 현장 발급 포함), 재발급 1-click
- **학술대회**:
  - **개별 QR 코드** (1인 1코드, 입장 스캔 → 출석 자동 기록, 세션 통계)
  - **식권 관리** (등록자별 발급, 모바일 1회 사용 처리, 중복 차단)
  - 행사 일정/공지는 모바일 앱 학회 페이지로 자동 노출
  - *(보류)* 장소·호텔·항공권 예약 — Phase 5 이후 검토
- **논문 심사**: 저널 클라우드 양방향 (도구 센터는 read-only 위젯 + 마감 알림)
- **커뮤니케이션**: 단체 메일·SMS·푸시 + 발송 템플릿
- **회계**: 수입/지출, 전자세금계산서, 결산 리포트

---

## 5. 글로벌 확장 (다국어)

- UI: `react-i18next`로 ko/en/zh 분리
- 콘텐츠: 학회가 입력하는 텍스트는 `name_ko/_en/_zh` 다국어 필드
- 메일/영수증: 회원 언어 설정 기반 자동 선택
- 결제: 다통화(KRW/USD/CNY) 단계적, 1차 KRW
- 데이터 거주(서울 + 추가 리전), PIPA·GDPR·PIPL 대응
- **i18n 인프라만 1단계에 깔아두면 추가 개발 부담 없이 글로벌 확장 가능**

---

## 6. 기술 아키텍처 (초안)

기존 `the-journal-cloud` 스택과 정합:
- Backend Django + DRF, Celery + Redis
- DB PostgreSQL (Phase 1: shared schema with `society_id` 컬럼)
- Storage S3 호환 (개발 MinIO / 운영 AWS S3 또는 NCloud Object)
- Frontend Next.js + Tailwind
- AI Agent Anthropic Claude (Sonnet 4.6 기본 + Opus 4.7 무거운 분석, 프롬프트 캐싱 필수)
- 인증 SSO via 더 저널 클라우드 (OAuth2/OIDC)

디렉터리(제안):
```
the-journal-cloud/
├── backend/tool_center/
│   ├── members/ dues/ conference/ qr/ meal/ mail/ accounting/
│   ├── quota/   (용량 측정·과금)
│   └── agent/   (Daily Briefing Agent)
└── frontend-app/app/tools/
```

테넌트 격리: 모든 모델에 `society_id` FK + DRF permission에서 강제, 파일 키 `s3://kkmi-tools/<society_id>/...`.
쿼터: `QuotaUsage(society_id, bytes_used, bytes_limit)` + 시그널 + 야간 reconcile.

---

## 7. 단계별 로드맵

| Phase | 기간 | 산출물 |
|---|---|---|
| P0 — 기반 | 2주 | SSO, 테넌트 모델, 쿼터 인프라, 도구 센터 셸 UI |
| P1 — 핵심 업무 | 6주 | 회원·회비(영수증/메일)·메일·기본 회계 |
| P2 — 학술대회 | 6주 | 대회·QR 출석·식권·세션 통계 |
| P3 — 에이전트 | 4주 | Daily Briefing + 자연어 명령 도구 호출 |
| P4 — 글로벌 | 4주 | i18n EN/ZH, 다통화 결제 옵션 |
| P5 — 보류 검토 | TBD | 호텔/항공/장소 예약 OTA 연동 |

---

## 8. 보류 항목 (Backlog)

장소·호텔·항공권 예약, 의료 CME 평점 자동 신고. 외부 시스템·라이선스 의존이 크므로 P5에서 별도 PoC.

---

## 9. 다음 작업 (Action Items)

즉시 착수: `backend/tool_center/` 스캐폴딩, `Society/Membership/QuotaUsage` 모델, SSO 토큰 검증 미들웨어, 프론트 `app/tools/` 셸.
P1 진입 전 결정: 결제 PG, 메일 인프라, 영수증 PDF 렌더러, QR 라이브러리(서명 토큰).
디자인: Daily Briefing 시스템 프롬프트, 모듈별 도구 JSON Schema, 다국어 키 가이드.

---

## 10. 사용자 요구 원문 요약

- 치과 EMR처럼 한 화면에 사무국 업무 통합 + 학회별 용량 할당 + 추가 구매
- 출근 시 업무 에이전트가 그날 할 일 준비
- 학술대회 회비 **개별 메일 영수증** 발급
- 장소·호텔·항공권 예약은 보류
- 학술대회 **개별 QR 코드 + 식권** 필수
- 행사 일정은 앱에서 학회 페이지로
- 영어·중국어로 글로벌 접근 가능성 검토

---

*원본은 `the-journal-cloud:docs/kkmi-tool-center-cloud-roadmap.md`. 변경 시 양쪽 동기화 필수.*
