# Predictourist Super-App Masterplan v2 (고3 정책 본계획서)

작성일: 2026-02-16  
작성자: OpenClaw Subagent  
문서 성격: 전략/아키텍처/정책/운영 통합 마스터플랜 (장기 기준서)

---

## 문서 사용 원칙
- 본 문서는 **제품 전략 + 기술 설계 + 운영/법무 통제**를 하나의 실행 가능한 체계로 묶는다.
- v1의 핵심 의사결정은 보존하며, 본 문서는 상세화/정량화/운영화한다.
- “고3 정책”을 최상위 품질 통제 프레임으로 적용한다.
  - 단계1/2/3 게이트
  - 각 게이트는 항목별 **3회 연속 PASS** 필요
  - 단 1회 FAIL 발생 시 해당 단계 카운트 **0/3 즉시 리셋**
- 빅뱅 전환 금지. 모든 전환은 **지표 임계치 기반 점진 이전**.

---

# 0. v1 의사결정 보존 선언 (변경 금지 핵심)

다음 항목은 v1에서 확정된 내용으로 본 문서에서 유지한다.

1. 제품 정체성: 관광 데이터 앱을 넘어, 신뢰 인프라 기반 도시 생활 네트워크로 진화.
2. 서비스 3축 + 공통 2요소:
   - A 관광 혼잡도/가이드
   - B 휴먼택배
   - C OTT 공동구매/정산(약관 허용 범위 한정)
   - D 신뢰점수
   - E 개인화/접근성 프로필
3. AS-IS 인식 유지:
   - `/api/chat` 운영 중
   - 엔진 스위치 구조 유지(OpenClaw/qwen 계열)
   - 관광 외 질의 가드/모델질의 고정응답 규칙 유지
   - user_id/ip/query/reply/rag/source 로그 체계 유지·강화
4. 고3 게이트 구조 유지:
   - 단계1(정책/안전성) → 단계2(통합 최소기능) → 단계3(확장/운영준비)
   - FAIL 시 카운트 리셋
5. 인프라 결론 유지:
   - 초기~중기 Firebase/GCS 중심
   - 임계치 도달 시 분석/트랜잭션/RAG 순으로 점진 분리
6. 법무 원칙 유지:
   - UID/IP/채팅 로그 수집의 고지 명확성
   - 보관/파기/제3자 제공/국외이전/책임경계 명시

---

# 1. 제품 전략 (Product Strategy)

## 1.1 북극성
“사용자의 **실제 이동·방문·거래·정산**을 신뢰 데이터로 연결해, 도시 생활의 의사결정 비용을 줄인다.”

## 1.2 전략 목표 (3년)
- G1. 관광 추천 정확도/설명가능성으로 Acquisition 우위 확보
- G2. 휴먼택배 거래 성공률로 수익화 축 형성
- G3. OTT 정산 자동화로 Retention·현금흐름 안정화
- G4. 공통 신뢰점수/정책엔진으로 리스크 비용 최소화

## 1.3 제품 포트폴리오 역할
- A 관광: 검색 유입 + 반복 방문 + 데이터 학습 기반 형성
- B 휴먼택배: 거래 밀도 + 수수료 + 신뢰점수 신호 고품질 확보
- C OTT: 월 구독형 리텐션 + 결제 규율 + 체류시간 증대

## 1.4 가치 제안
- 사용자: “언제 가면 덜 붐비는지 + 이동 중 배송 기회 + 고정비 절감”
- 공급자(배송자): “기존 이동동선의 유휴 가치를 수익화”
- 플랫폼: “행동 데이터 축적 → 추천/매칭 정확도 상승 → 네트워크 효과”

## 1.5 경쟁우위 가설
1. 단일 기능 앱 대비 멀티 도메인 행동데이터 연결
2. 신뢰점수 기반 거래 안전장치
3. 출처·근거 중심 RAG로 설명가능한 추천
4. 고3 게이트로 품질 회귀(regression) 방지

## 1.6 수익 모델
- 관광: 제휴/광고/프리미엄 추천 슬롯(광고표기 의무)
- 휴먼택배: 매칭 수수료 + 긴급건 프리미엄 수수료
- OTT: 정산 대행 수수료 + 리스크 프리미엄(고위험 그룹)
- B2B 확장: 이동량 인사이트 API(익명·집계 데이터 한정)

## 1.7 제품 원칙 (Non-Negotiables)
- P1. 약관·정책 위반 수익화 금지(특히 OTT)
- P2. 불확실한 답변은 “불확실”로 표기
- P3. 신뢰점수는 제재 수단이 아닌 **리스크 통제 수단**
- P4. 운영 가능성 없는 기능은 출시 금지
- P5. 데이터 최소수집·목적외 이용 금지

---

# 2. 고3 정책 운영체계 (단계 게이트 + 리셋 규율)

## 2.1 공통 규칙
- 각 단계는 필수 검증 항목 세트를 가진다.
- 항목별 3회 연속 PASS를 만족해야 단계 통과.
- 단일 항목 FAIL 시 해당 단계의 모든 항목 카운트 0/3 리셋.
- 상위 단계 FAIL은 하위 단계를 무효화하지 않음(단계 독립).
- 단, 단계1 FAIL 발생 시 단계2/3 진행 일시 중지.

## 2.2 단계1: 정책·데이터 안전성 게이트
### PASS 항목
1. 관광 외 질의 차단 규칙
2. 모델/버전 문의 고정 응답 규칙
3. user_id/ip/query/reply/rag/source 로그 저장 무결성
4. 약관 버전 + 동의 이력 버저닝
5. 민감 로그 마스킹(IP 보관정책 포함)

### 측정 기준
- 테스트 샘플: 일 30케이스(정적 20 + 랜덤 10)
- 허용 오류율: 0%
- 로그 누락 허용치: 0%

## 2.3 단계2: 통합 최소 기능 게이트
### PASS 항목
1. 메인 검색→챗봇 직행 UX 성공
2. 요약카드+출처+RAG 리스트 렌더
3. 휴먼택배 MVP: 등록→매칭 시뮬→완료
4. 신뢰점수 업데이트 배치 반영
5. 계정 링크/세션 유지(구글 기준, 네이버 후보)

### 측정 기준
- 주요 플로우 성공률 99%+
- p95 응답시간 1.5s 이하(핵심 API)
- 치명 결함(결제/정산 오차) 0건

## 2.4 단계3: 확장·운영준비 게이트
### PASS 항목
1. 동시요청/지연/오류율 부하테스트
2. 악용 시나리오(보상/패널티 우회) 방어
3. 운영콘솔(분쟁·정산·알림) 점검
4. 비용/성능 임계치 경보 정상 동작
5. 장애 대응 Runbook 리허설

### 측정 기준
- SLO: 가용성 99.9%, p95<1.8s, 오류율<1%
- 월 운영 수동시간: 80h 미만

## 2.5 리셋 실행 프로토콜
- FAIL 감지 즉시:
  1) 실패증적 저장(로그·영상·재현조건)
  2) 원인 분류(정책/코드/데이터/운영)
  3) 핫픽스 여부 결정(24h 룰)
  4) 검증셋 확장 후 0/3부터 재시험

---

# 3. 도메인 분해 (Domain Decomposition)

## 3.1 바운디드 컨텍스트
1. Identity & Consent
2. Tourism Intelligence
3. Mobility & Delivery
4. OTT Group Billing
5. Trust & Risk Engine
6. Notification & Messaging
7. RAG Content Pipeline
8. Admin & Operations
9. Analytics & Experimentation

## 3.2 컨텍스트 간 계약 원칙
- 동기 API는 최소화, 비핵심은 이벤트 기반 비동기 처리
- 신뢰점수 반영은 eventual consistency 허용(최대 5분)
- 정산/결제는 강한 일관성 우선

## 3.3 핵심 상호작용
- Tourism 행동 이벤트 → Trust 신호 입력
- Delivery 완료/분쟁 결과 → Trust 가중치 반영
- OTT 미납/탈퇴 이력 → Risk 등급 변경
- Trust 등급 → Delivery 매칭 우선순위·보증금 요구값 조정

---

# 4. 데이터 모델 & ERD 제안 (논리 스키마)

> 표기: PK(기본키), FK(외래키), UQ(유니크), IDX(인덱스)

## 4.1 Identity & Consent
### users
- user_id (PK, uuid)
- primary_provider (google/naver/guest)
- email (UQ nullable)
- phone (UQ nullable)
- status (active/suspended/deleted)
- created_at, updated_at

### auth_identities
- identity_id (PK)
- user_id (FK users)
- provider (google/naver)
- provider_uid (UQ(provider, provider_uid))
- provider_email
- linked_at
- last_login_at

### user_profiles
- user_id (PK/FK users)
- nickname
- locale
- timezone
- accessibility_profile_id (FK)
- marketing_opt_in
- birth_year (nullable)

### consent_documents
- doc_id (PK)
- doc_type (terms/privacy/location/marketing/chatlog)
- version
- effective_at
- content_hash

### user_consents
- consent_id (PK)
- user_id (FK)
- doc_id (FK)
- agreed (bool)
- agreed_at
- ip_hash
- user_agent_hash

## 4.2 Tourism Intelligence
### poi
- poi_id (PK)
- name_ko, name_en
- category
- lat, lng
- region_code
- official_site

### congestion_snapshots
- snapshot_id (PK)
- poi_id (FK)
- observed_at (IDX)
- congestion_score (0-100)
- source_type (public/crowd/sensor/inferred)
- confidence

### congestion_forecasts
- forecast_id (PK)
- poi_id (FK)
- target_time (IDX)
- predicted_score
- model_version
- feature_version
- generated_at

### tourism_queries
- query_id (PK)
- user_id (FK)
- query_text
- intent
- answer_id (FK)
- created_at

### tourism_answers
- answer_id (PK)
- summary
- confidence
- evidence_count
- rag_trace_id
- created_at

## 4.3 Mobility & Delivery
### delivery_orders
- order_id (PK)
- requester_user_id (FK users)
- pickup_lat/lng
- dropoff_lat/lng
- pickup_window_start/end
- max_weight_kg
- item_type
- status (requested/matched/in_transit/completed/cancelled/disputed)
- created_at

### delivery_candidates
- candidate_id (PK)
- order_id (FK)
- courier_user_id (FK users)
- route_similarity_score
- eta_minutes
- bid_price
- status (suggested/accepted/rejected)

### delivery_assignments
- assignment_id (PK)
- order_id (FK UQ)
- courier_user_id (FK)
- accepted_at
- completed_at
- proof_type (photo/code/gps)

### delivery_settlements
- settlement_id (PK)
- order_id (FK)
- amount
- fee
- payout_amount
- currency
- status (pending/paid/reversed)
- settled_at

### delivery_disputes
- dispute_id (PK)
- order_id (FK)
- raised_by_user_id
- reason_code
- evidence_url
- decision (pending/requester_win/courier_win/split)
- resolved_at

## 4.4 OTT Group Billing
### ott_services
- service_id (PK)
- name
- policy_status (allowed/restricted/banned)
- policy_note
- reviewed_at

### ott_groups
- group_id (PK)
- service_id (FK)
- owner_user_id
- billing_cycle_day
- max_members
- status

### ott_memberships
- membership_id (PK)
- group_id (FK)
- user_id (FK)
- role (owner/member)
- joined_at
- left_at
- status

### ott_invoices
- invoice_id (PK)
- group_id (FK)
- period_yyyymm
- total_amount
- per_member_amount
- due_date
- status

### ott_payments
- payment_id (PK)
- invoice_id (FK)
- user_id (FK)
- amount
- paid_at
- status

## 4.5 Trust & Risk
### trust_scores
- user_id (PK)
- score (0-1000)
- level (T0~T5)
- last_updated_at

### trust_events
- trust_event_id (PK)
- user_id (FK)
- domain (tourism/delivery/ott/platform)
- event_type
- delta
- weight
- reason
- created_at

### risk_flags
- flag_id (PK)
- user_id (FK)
- risk_type (fraud/abuse/nonpayment/multiact)
- severity (low/med/high/critical)
- status (open/monitoring/closed)
- created_at

## 4.6 로그/감사
### chat_logs
- log_id (PK)
- request_id
- session_id
- user_id
- query
- reply
- rag_payload_json
- source_payload_json
- ip_hash/raw_ip_policy
- created_at

### audit_logs
- audit_id (PK)
- actor_user_id
- action
- target_type
- target_id
- before_json
- after_json
- created_at

---

# 5. API 계약 (Contract-First)

## 5.1 공통 규칙
- Base path: `/api/v2`
- Auth: Bearer JWT (provider token 교환 후 내부 토큰 발급)
- Idempotency-Key: 결제/정산/주문 생성 필수
- 표준 응답: `{success, data, error, meta}`
- 표준 오류코드:
  - `AUTH_401`, `AUTH_403`
  - `VALIDATION_400`
  - `NOT_FOUND_404`
  - `CONFLICT_409`
  - `RATE_LIMIT_429`
  - `INTERNAL_500`

## 5.2 Auth/Account Linking
### POST /auth/google/exchange
- 입력: google_id_token
- 출력: access_token, refresh_token, user_profile

### POST /auth/naver/exchange
- 입력: naver_access_token
- 출력: access_token, refresh_token, user_profile

### POST /auth/link
- 입력: target_provider, provider_token
- 동작: 동일 이메일/전화/본인확인 기반 링크 후보 제시
- 출력: link_result(merged/new_link/pending_manual_review)

### POST /auth/unlink
- 제약: 최소 1개 로그인 수단 유지 필요

## 5.3 Tourism
### POST /tourism/query
- 입력: query_text, location(optional), time_context(optional)
- 출력: summary, recommendations[], evidence[], confidence
- 가드: 관광 외 질의는 정책 응답 반환

### GET /tourism/poi/{poiId}/forecast?from=&to=
- 출력: 시간대별 혼잡도 예측 배열

## 5.4 Delivery
### POST /delivery/orders
- 입력: pickup/dropoff/time_window/max_weight/item_type
- 출력: order_id, status=requested

### POST /delivery/orders/{orderId}/match/simulate
- 출력: candidates[] (route_similarity, eta, est_fee)

### POST /delivery/orders/{orderId}/accept
- 입력: candidate_id
- 출력: assignment_id

### POST /delivery/orders/{orderId}/complete
- 입력: proof(photo/code/gps)
- 출력: completion_status + settlement_preview

### POST /delivery/disputes
- 입력: order_id, reason_code, evidence

## 5.5 OTT
### POST /ott/groups
- 전제: service policy_status=allowed

### POST /ott/groups/{groupId}/join
### POST /ott/invoices/{invoiceId}/pay
### POST /ott/nonpayment/replace-candidate

## 5.6 Trust
### GET /trust/me
- 출력: score, level, recent_factors[]

### POST /trust/recalculate (admin)
- 배치/재학습 트리거

## 5.7 Admin
### GET /admin/disputes
### POST /admin/disputes/{id}/resolve
### GET /admin/settlements/reconcile
### GET /admin/policy/ott-matrix

---

# 6. 이벤트 분류체계 (Event Taxonomy)

## 6.1 표준 이벤트 Envelope
```json
{
  "event_id": "uuid",
  "event_name": "delivery.order.created",
  "event_version": "1.0",
  "occurred_at": "2026-02-16T00:00:00Z",
  "producer": "delivery-service",
  "user_id": "uuid|null",
  "session_id": "string|null",
  "trace_id": "string",
  "payload": {},
  "privacy_tier": "P0|P1|P2",
  "retention_days": 365
}
```

## 6.2 도메인별 이벤트 예시
- auth.login.succeeded / auth.link.completed
- consent.document.agreed
- tourism.query.submitted / tourism.answer.generated / tourism.guard.blocked
- delivery.order.created / delivery.match.suggested / delivery.assignment.completed
- delivery.dispute.opened / delivery.dispute.resolved
- ott.invoice.issued / ott.payment.completed / ott.member.replaced
- trust.score.updated / risk.flag.opened

## 6.3 이벤트 품질 규칙
- 스키마 레지스트리 필수
- breaking change 금지(버전 증가)
- PII 필드 허용목록 관리
- 누락률 0.1% 초과 시 알람

---

# 7. 인증/계정연동 아키텍처 (Google + Naver)

## 7.1 목표
- 소셜 로그인 다중연동 허용
- 단일 사용자 엔터티(users)로 통합
- 계정 충돌/탈취 위험 최소화

## 7.2 흐름
1. Provider 토큰 수신
2. 서버에서 provider 검증
3. 내부 user 조회(UID 우선, 이메일 보조)
4. 신규면 users+auth_identities 생성
5. 기존이면 세션 발급
6. 링크 요청 시 고위험 조건은 수동승인 큐

## 7.3 충돌 처리 규칙
- 이메일 동일, 기기/행동 패턴 불일치 → pending_manual_review
- 단기간 다중 계정 링크 시도 → risk_flag(multiact)
- 계정 링크 후 24시간 고위험 동작 제한(대금이체/그룹소유권 이전)

## 7.4 보안
- refresh token rotation
- device fingerprint hash(선택)
- 비정상 로그인 탐지(불가능 이동/짧은 간격 국가변경)

---

# 8. Firebase + GCS 확장/이전 전략

## 8.1 현행 유지가 유리한 구간
- DAU < 10k
- 팀 규모 10명 내외
- 실험 속도 우선
- 복잡한 트랜잭션 낮음

## 8.2 이전 임계치 (2개월 연속 2개 이상 충족 시 검토)
1. 인프라비용/매출총이익 > 25%
2. Firestore 읽기/쓰기 비용 급증(전월 대비 40%+)
3. 핵심 API p95 > 1.5s 지속
4. 운영 수동처리(분쟁/정산) > 80h/월
5. 분석 적체(T+1 이상 지연) 지속

## 8.3 단계적 이전안
### Phase A (유지 + 관측 강화)
- Firebase Auth + Firestore + GCS 지속
- BigQuery로 이벤트 로그 분리 적재
- 비용 대시보드/알림 구축

### Phase B (핵심 트랜잭션 분리)
- Delivery/OTT 정산: Postgres 이전
- 큐: Redis Streams 또는 Pub/Sub
- Firestore는 프로필·저빈도 데이터 유지

### Phase C (검색/RAG 분리)
- 문서 저장: Object Storage + 메타DB
- 벡터 인덱스: 전용 엔진
- RAG 서빙 캐시 레이어 도입

### Phase D (도메인 독립 운영)
- 서비스별 DB 소유권
- CDC 기반 분석 파이프라인
- 장애 격리/독립 배포

## 8.4 대안 비교 매트릭스 (비용/운영)
| 대안 | 장점 | 단점 | 월비용 경향 | 운영난이도 | 권장 시점 |
|---|---|---|---|---|---|
| A Firebase 중심 유지 | 개발속도 빠름 | 대규모 비용 변동성 | 중~상 | 낮음 | 초기 |
| B Firebase+Postgres 하이브리드 | 비용최적화/정산정합성 | 이중운영 복잡 | 중 | 중 | 중기 |
| C 마이크로도메인 분리 | 확장성/격리 우수 | 인력요구 큼 | 중~상(초기), 장기 최적 | 높음 | 대규모 |

## 8.5 의사결정 체크리스트
- 트래픽 증가가 일시인지 구조적인지?
- 병목이 DB인지 앱 로직인지?
- 팀의 온콜/DBA 역량 확보 여부?
- 6개월 내 기능로드맵과 아키텍처 정합성?

---

# 9. 법무/약관 체크리스트 (UID/IP/채팅로그 중심)

## 9.1 수집 항목 고지
- UID(소셜 provider UID)
- IP(원문/해시 보관 정책 분리 명시)
- 채팅 로그(query/reply)
- RAG 출처/근거 메타데이터
- 기기/접속기록(보안 목적)

## 9.2 필수 문서
1. 서비스 이용약관
2. 개인정보처리방침
3. 위치기반서비스 약관(해당 시)
4. 채팅기록 활용 고지(모델 품질 개선 범위)
5. 제3자 제공/국외 이전 고지

## 9.3 보관/파기
- 법정 보관항목과 운영 로그 분리
- 기본 보관기간 표준화(예: 채팅 12개월, 감사로그 24개월)
- 파기 프로세스 자동화(월 배치 + 샘플 감사)

## 9.4 권리행사 대응
- 열람/정정/삭제/처리정지 요청 API/CS 절차
- 삭제요청 시 백업/아카이브 반영 지연 고지

## 9.5 위험 문구(금지)
- “모든 데이터 영구 보관” 류 포괄 문구
- “목적 외 이용 가능” 포괄 동의

---

# 10. RAG 콘텐츠 품질 루프

## 10.1 파이프라인
수집 → 정제 → 신뢰도 평가 → 색인 → 생성 → 평가 → 피드백 반영

## 10.2 품질 게이트
- Source 신뢰등급(S/A/B/C)
- 시의성 점수(최근성)
- 중복/충돌 감지
- 금칙어/정책위반 필터

## 10.3 답변 품질 지표
- Evidence Coverage: 답변 문장 대비 근거 연결 비율
- Hallucination Rate: 근거 미일치 비율
- Abstention Accuracy: 모를 때 모른다고 말한 비율
- User Satisfaction(thumbs)

## 10.4 휴먼 인 더 루프
- 저신뢰 답변 자동 큐잉
- 운영자 라벨링(정확/부분정확/부정확)
- 재학습 데이터셋 주기 반영

## 10.5 정책 연계
- 관광 외 질의는 고정 가드 응답
- 모델 내부정보/버전 노출 금지 응답 유지

---

# 11. 신뢰점수 모델 (Trust Score Model v1)

## 11.1 점수 범위
- 0~1000점
- 레벨: T0(0-199), T1(200-399), T2(400-599), T3(600-749), T4(750-899), T5(900-1000)

## 11.2 신호 가중치 예시
### 가점
- 관광 일정 실제 완료 +5
- 배송 완료(분쟁無) +20
- OTT 3개월 연속 납부 +15
- 신고 정합(허위 아님) +10

### 감점
- 노쇼 -30
- 배송 지연 반복 -15
- 허위 제보 -40
- 미납 -25
- 분쟁 패소 -20

## 11.3 시간감쇠
- 최근 90일 가중치 1.0
- 91~180일 0.6
- 181일+ 0.3

## 11.4 악용 방지
- 셀프거래 탐지(연관 계정)
- 단기 점수부스팅 패턴 차단
- 리스크 플래그 보유 시 상한 캡 적용

## 11.5 활용 정책
- 매칭 우선순위
- 보증금 비율
- 수동심사 필요 여부
- 고위험 사용자 기능 제한

---

# 12. 리스크 레지스터

| ID | 리스크 | 가능성 | 영향도 | 조기징후 | 대응전략 | 오너 |
|---|---|---:|---:|---|---|---|
| R1 | OTT 약관 위반 노출 | 중 | 매우큼 | 신고/계정정지 증가 | 허용 서비스 화이트리스트, 법무 사전검토 | Biz+Legal |
| R2 | 계정연동 탈취/충돌 | 중 | 큼 | 링크 실패/문의 급증 | 수동승인 큐, 2차 검증 | Auth Lead |
| R3 | 배송 분쟁 폭증 | 중 | 큼 | dispute rate 상승 | 증빙강화, SLA/패널티 조정 | Ops |
| R4 | Firestore 비용 급증 | 높음 | 큼 | read/write 급증 | 로그/분석 분리, 쿼리 최적화 | Platform |
| R5 | RAG 허위정보 | 중 | 큼 | CS 불만/정정요청 | 근거표시 강화, 저신뢰 차단 | AI Lead |
| R6 | 개인정보 이슈 | 낮음~중 | 매우큼 | 민원/감사요청 | 최소수집, 파기자동화, 감사로그 | Security |
| R7 | 신뢰점수 편향 | 중 | 중~큼 | 특정집단 불이익 지표 | 공정성 모니터링, 가중치 재조정 | Data |

---

# 13. KPI 트리

## 13.1 North Star
- 월 활성 실거래/실방문 연결 사용자수 (Connected Active Users)

## 13.2 선행지표
- 관광 질의 성공률(근거 포함)
- 일정 등록률/완료율
- 배송 매칭 성사율
- OTT 납부 성공률
- 신뢰점수 상승 사용자 비율

## 13.3 후행지표
- MAU/WAU
- 매출/기여이익
- 분쟁율/환불율
- 이탈률

## 13.4 운영지표
- p95 latency
- 에러율
- 비용/사용자
- 수동처리 시간

## 13.5 KPI 목표 예시(초기 2분기)
- 관광 답변 근거포함률 95%+
- 배송 매칭 성사율 60%+
- OTT 월 납부 성공률 92%+
- 분쟁율 < 3%
- p95 < 1.5s

---

# 14. 롤아웃 게이트 & 출시 전략

## 14.1 롤아웃 원칙
- 내부(alpha) → 제한(beta) → 공개(ga)
- 도메인별 독립 롤아웃
- 고3 단계 통과 없는 확장 금지

## 14.2 알파 체크
- 내부 QA + 운영자 시나리오 테스트
- 장애주입 테스트(타임아웃/외부 API 실패)

## 14.3 베타 체크
- 지역 제한/사용자군 제한
- 위험 기능(정산/소유권 이전) 기능플래그

## 14.4 GA 체크
- 온콜 체계 확립
- 법무 문서 발행 완료
- CS 매뉴얼 배포 완료

---

# 15. 운영 모델 (SOP)

## 15.1 분쟁 처리 SOP
1. 접수
2. 증빙 검증
3. 임시조치(정산 보류)
4. 판정
5. 신뢰점수 반영
6. 재심 프로세스

## 15.2 정산 실패 SOP
- 자동 재시도 3회
- 실패 시 사용자 알림 + 대체 결제 유도
- 72시간 미납 시 제한정책 발동

## 15.3 보안사고 SOP
- 탐지
- 영향평가
- 계정/토큰 폐기
- 법정 통지 요건 검토
- 사후 재발방지

---

# 16. 관측성/모니터링 설계

## 16.1 필수 대시보드
- API 성능(서비스별)
- 결제/정산 성공률
- 분쟁 큐 적체
- 신뢰점수 분포
- 비용 대시보드(Firebase/GCS/외부 API)

## 16.2 알림 기준
- 오류율 1% 초과 5분 지속
- p95 1.8s 초과 10분 지속
- 분쟁율 일 5% 초과
- 미납률 주간 10% 초과

## 16.3 로깅 정책
- PII 마스킹
- 샘플링 정책(고빈도 이벤트)
- 감사로그 불변성 저장

---

# 17. 실험/성장 프레임

## 17.1 A/B 테스트 우선순위
1. 관광 답변 카드 UI
2. 배송 후보 노출 정렬
3. OTT 미납 리마인드 문구

## 17.2 실험 가드레일
- 분쟁율 악화 시 즉시 롤백
- 결제성공률 하락 시 즉시 중단

---

# 18. 백로그 구조 (P0/P1/P2)

## P0
- UID/IP 실서버 유입 모니터
- 고3 게이트 자동 리포트
- 신뢰점수 배치 v1
- 관광 답변 근거 노출 안정화

## P1
- 휴먼택배 도메인 모델 + 정산 엔진
- 분쟁 처리 콘솔
- 네이버 로그인 연동 + 계정링크

## P2
- OTT 허용 서비스 한정 MVP
- 고급 리스크 스코어링
- 벡터 검색 고도화

---

# 19. 부록 A — API 스키마 예시

## A.1 배송 주문 생성 Request
```json
{
  "pickup": {"lat": 37.5, "lng": 127.0},
  "dropoff": {"lat": 37.4, "lng": 127.1},
  "pickup_window": {"start": "2026-02-16T10:00:00+09:00", "end": "2026-02-16T11:00:00+09:00"},
  "max_weight_kg": 2.5,
  "item_type": "document"
}
```

## A.2 관광 질의 Response
```json
{
  "success": true,
  "data": {
    "summary": "오전 9시~10시 방문 권장",
    "confidence": 0.82,
    "recommendations": ["대체 장소 A"],
    "evidence": [{"title": "공식 혼잡도", "url": "https://..."}]
  },
  "meta": {"trace_id": "..."}
}
```

---

# 20. 부록 B — 법무 점검 체크리스트 (실행용)

- [ ] 약관/개인정보처리방침 최신 버전 반영
- [ ] UID/IP/채팅 로그 수집 목적·보관기간 명시
- [ ] 미성년자 정책/대리동의 문구 점검
- [ ] 국외 이전/제3자 제공 문구 점검
- [ ] 파기 자동화 배치 동작 증빙 확보
- [ ] 열람/삭제 요청 SLA 문서화

---

# 21. 부록 C — 고3 운영 체크리스트

## 단계1
- [ ] 관광 외 질의 차단 PASS (1/3,2/3,3/3)
- [ ] 모델/버전 고정 응답 PASS
- [ ] 로그 저장 무결성 PASS
- [ ] 동의 버전 저장 PASS
- [ ] FAIL 발생 시 0/3 리셋 수행 기록

## 단계2
- [ ] 검색→챗봇 직행 PASS
- [ ] 요약카드/출처/RAG PASS
- [ ] 배송 MVP 플로우 PASS
- [ ] 신뢰점수 반영 PASS
- [ ] FAIL 시 0/3 리셋

## 단계3
- [ ] 부하/장애 PASS
- [ ] 악용 시나리오 PASS
- [ ] 운영콘솔 PASS
- [ ] 비용 임계치 모니터 PASS
- [ ] FAIL 시 0/3 리셋

---

# 22. 부록 D — 마이그레이션 의사결정 로그 템플릿

```markdown
## Decision Record
- Date:
- Trigger Metrics:
- Current Stage: A/B/C
- Options Considered:
- Cost Estimate (6m/12m):
- Ops Impact:
- Risks:
- Decision:
- Rollback Plan:
- Owner:
```

---

# 23. 부록 E — 데이터 거버넌스 규정 요약

- 데이터 등급: Public / Internal / Sensitive / Restricted
- 접근통제: 최소권한 + 정기 권한검토(월 1회)
- 키관리: KMS 사용, 키 순환정책
- 백업: RPO/RTO 목표 정의
- 감사: 관리자 행위 로그 24개월

---

# 24. 실행 우선순위 요약 (90일)

## 0~30일
- 고3 단계1 자동검증 완성
- UID/IP/채팅로그 법무 문구 최종화
- 관광 RAG 품질 대시보드 구축

## 31~60일
- 배송 MVP 실거래 파일럿
- 신뢰점수 v1 적용
- 분쟁 SOP 운영 리허설

## 61~90일
- OTT 허용 서비스 한정 베타
- 비용 임계치 경보 운영
- Phase B 이전 여부 의사결정

---

# 25. 최종 전략 문장 (v2)

**Predictourist는 고3 정책으로 품질을 강제하면서, 관광(유입)·배송(거래)·정산(잔존)을 신뢰데이터로 연결해 확장 가능한 도시 생활 슈퍼앱으로 진화한다.**

---

# 26. 상세 도메인 설계서 (심화)

## 26.1 Tourism Intelligence 심화

### 26.1.1 기능 서브도메인
1. POI 메타 관리
2. 혼잡도 관측 수집
3. 혼잡도 예측 모델 서빙
4. 사용자 질의 해석(Intent)
5. 근거 결합형 답변 생성(RAG)
6. 답변 품질 평가/재학습 피드백

### 26.1.2 상태 전이
- `query_received` → `policy_guard_checked` → `rag_retrieved` → `answer_generated` → `answer_scored` → `logged`
- 정책위반 시: `policy_guard_blocked`로 단락 종료

### 26.1.3 예측모델 버전관리
- model_version: `tourism-forecast-x.y.z`
- feature_version: `featurepack-yyyymmdd`
- 서빙 정책:
  - canary 5% → 20% → 50% → 100%
  - KPI 하락(정확도, 응답지연) 시 즉시 rollback

### 26.1.4 POI 확장 스키마
#### poi_opening_hours
- id (PK)
- poi_id (FK)
- day_of_week
- open_time / close_time
- special_note

#### poi_tags
- id (PK)
- poi_id (FK)
- tag (family/festival/night/indoor 등)

#### poi_accessibility
- id (PK)
- poi_id (FK)
- wheelchair_access (bool)
- stroller_access (bool)
- elevator_available (bool)
- restroom_access_note

### 26.1.5 캐시 정책
- POI 기본정보: 24h TTL
- 혼잡도 예측: 30m TTL
- 실시간 관측치: 5m TTL

## 26.2 Mobility & Delivery 심화

### 26.2.1 주문 유형
- Standard: 일반 배송
- Urgent: 긴급 배송(추가 수수료)
- Verified: 검증 사용자 전용

### 26.2.2 주문 상태머신
- requested
- candidate_generated
- matched
- pickup_confirmed
- in_transit
- dropoff_confirmed
- completed
- cancelled
- disputed

상태 전이 규칙:
- `requested` → `matched`: 후보 수락 필요
- `matched` → `pickup_confirmed`: OTP/사진 중 1개 이상 증빙 필수
- `dropoff_confirmed` → `completed`: 양측 확인 또는 타임아웃 자동확정
- `disputed`: 정산 즉시 hold

### 26.2.3 정산 정책
- 플랫폼 수수료 계산: `fee = max(min_fee, amount * fee_rate)`
- 긴급건 가산율: `urgent_multiplier`
- 고위험 사용자 보증금: trust level 기반 차등

### 26.2.4 SLA
- 매칭 제안 최초 제공: 60초 이내
- 매칭 확정 후 픽업 지연 허용: 15분
- 배송 완료 확인 타임아웃: 24시간

### 26.2.5 분쟁 판정 매트릭스
- 증빙 없음 + 상대 증빙 충분: 패소
- 지연 사유 불가항력(공식 교통장애): 감경
- 반복 분쟁 패소(30일 내 3회): 자동 제한

## 26.3 OTT Group Billing 심화

### 26.3.1 정책 등급
- Allowed: 서비스 약관상 허용 또는 공식 요금제 범위 내
- Restricted: 조건부 허용(지역/요금제 제한)
- Banned: 금지

### 26.3.2 그룹 생애주기
- draft → recruiting → active → grace(nonpayment) → frozen → closed

### 26.3.3 미납 시나리오
- D+1: 1차 리마인드
- D+3: 기능 일부 제한
- D+7: 대체 인원 추천
- D+14: 자동 퇴출 및 채권처리 정책 적용

### 26.3.4 소유권 이전 규칙
- owner 미납/휴면 시 소유권 이전 가능
- 이전 대상 우선순위:
  1) 신뢰점수 상위
  2) 납부 연속성
  3) 계정활성도

## 26.4 Trust & Risk Engine 심화

### 26.4.1 계산 주기
- 실시간 반영: 중대 이벤트(미납, 분쟁판정, 계정탈취 의심)
- 배치 반영: 일반 이벤트(방문완료, 리뷰)

### 26.4.2 설명가능성(Explainability)
- 사용자에게 최근 점수 변동 Top3 요인 제공
- 운영자에게 전체 피처 기여도 제공

### 26.4.3 제재 레벨
- L1: 경고/안내
- L2: 일부 기능 제한
- L3: 고위험 거래 차단
- L4: 계정 정지(수동 승인 필요)

---

# 27. ERD 물리 설계 초안 (인덱스/파티셔닝/무결성)

## 27.1 인덱스 원칙
- 조회 패턴 우선 인덱싱
- 쓰기 부담 과도한 복합 인덱스 최소화
- 이벤트/로그 테이블은 시간 파티션 우선

## 27.2 핵심 인덱스 제안

### tourism_queries
- IDX(user_id, created_at desc)
- IDX(intent, created_at desc)

### congestion_forecasts
- IDX(poi_id, target_time)
- IDX(target_time)

### delivery_orders
- IDX(status, created_at desc)
- IDX(requester_user_id, created_at desc)
- GEO index (pickup, dropoff)

### delivery_candidates
- IDX(order_id, route_similarity_score desc)
- IDX(courier_user_id, created_at desc)

### ott_invoices
- UQ(group_id, period_yyyymm)
- IDX(status, due_date)

### trust_events
- IDX(user_id, created_at desc)
- IDX(domain, event_type, created_at)

### chat_logs
- IDX(user_id, created_at desc)
- IDX(request_id)
- PARTITION(created_at 월단위)

## 27.3 참조 무결성 정책
- users 삭제 시 hard delete 금지 (status=deleted)
- 결제/정산 이력은 법정 보관 요구 충족 위해 soft delete + 익명화
- consent_documents는 immutable(수정 금지, 신규 버전 발행)

## 27.4 데이터 보존 정책(초안)
- 운영 로그: 12개월
- 감사 로그: 24개월
- 결제/정산: 법정기준 준수(국가별 템플릿 분기)
- RAG 소스 캐시: 90일(원문 저작권 정책 준수)

---

# 28. API 상세 계약서 (요청/응답/에러/재시도)

## 28.1 공통 헤더
- `X-Request-Id` 필수
- `X-Idempotency-Key` (POST 주문/결제 필수)
- `X-Client-Version` (디버깅/롤백 대응)

## 28.2 재시도 정책
- 5xx/timeout: exponential backoff (max 3)
- 409(CONFLICT): 재조회 후 사용자 확인
- 결제 API: 멱등키 동일 시 기존 결과 반환

## 28.3 Delivery API 상세

### POST /delivery/orders
검증 규칙:
- pickup/dropoff distance 최소 500m 이상(옵션)
- max_weight_kg 범위: 0.1~20
- pickup_window end > start

실패 코드:
- `DELIVERY_001_INVALID_WINDOW`
- `DELIVERY_002_UNSUPPORTED_REGION`
- `DELIVERY_003_RISK_RESTRICTED`

### GET /delivery/orders/{id}
응답 포함:
- current_status
- timeline[]
- settlement_preview
- trust_requirements

### POST /delivery/orders/{id}/cancel
규칙:
- matched 이전: 수수료 없음
- pickup_confirmed 이후: 취소 수수료 발생

## 28.4 OTT 결제 API 상세
### POST /ott/invoices/{invoiceId}/pay
입력:
- payment_method_id
- amount (서버 검증)

실패 코드:
- `OTT_101_INVOICE_CLOSED`
- `OTT_102_AMOUNT_MISMATCH`
- `OTT_103_PAYMENT_DECLINED`

## 28.5 Admin API 상세
### POST /admin/disputes/{id}/resolve
입력:
- decision
- reason
- trust_delta_override(optional)

감사로그 필수:
- actor
- before/after
- decision evidence hash

---

# 29. 이벤트 카탈로그 상세 (운영용)

## 29.1 Auth 이벤트
- auth.login.succeeded
- auth.login.failed
- auth.link.requested
- auth.link.completed
- auth.link.rejected

payload 필드 표준:
- provider
- risk_score
- device_hash
- geo_region

## 29.2 Tourism 이벤트
- tourism.query.submitted
- tourism.guard.blocked
- tourism.retrieval.completed
- tourism.answer.generated
- tourism.answer.feedback

## 29.3 Delivery 이벤트
- delivery.order.created
- delivery.match.generated
- delivery.candidate.accepted
- delivery.pickup.confirmed
- delivery.dropoff.confirmed
- delivery.settlement.paid
- delivery.dispute.opened/resolved

## 29.4 OTT 이벤트
- ott.group.created
- ott.member.joined/left
- ott.invoice.issued
- ott.payment.failed/succeeded
- ott.member.replaced

## 29.5 Trust/Risk 이벤트
- trust.score.updated
- trust.level.changed
- risk.flag.opened/closed
- risk.action.applied

## 29.6 데이터 품질 지표
- 수집 지연(Lag)
- 누락률(Missing)
- 중복률(Duplicate)
- 스키마위반률(Schema violation)

---

# 30. 인증/계정연동 위협모델 및 대응

## 30.1 위협 시나리오
1. OAuth 토큰 탈취
2. 계정 병합 오판(동명이인/재활용 이메일)
3. 자동화 봇 가입
4. 계정 복구 악용

## 30.2 통제수단
- provider 토큰 서버검증
- high-risk 링크 시 2단계 확인(이메일/전화)
- 신규 계정 rate limit + CAPTCHA
- 이상행동 탐지 시 refresh token 폐기

## 30.3 수동심사 기준
- 24시간 내 다중 provider 링크 시도 3회+
- 결제수단 변경 직후 고액 거래
- 계정 생성 직후 반복 분쟁 제기

---

# 31. 비용/운영 의사결정 매트릭스 (정량)

## 31.1 평가축
- C1 직접비용
- C2 개발생산성
- C3 운영복잡도
- C4 장애격리
- C5 법무대응 용이성

점수(1~5) 예시:
| 아키텍처 | C1 | C2 | C3 | C4 | C5 | 총점 |
|---|---:|---:|---:|---:|---:|---:|
| Firebase 단일 | 3 | 5 | 4 | 2 | 3 | 17 |
| Hybrid | 4 | 4 | 3 | 4 | 4 | 19 |
| 분리형 | 5(장기) | 2 | 2 | 5 | 5 | 19 |

해석:
- 초기엔 Firebase 단일이 유리
- 중기부터 Hybrid가 균형점
- 분리형은 팀 역량 확보 후

## 31.2 임계치 대시보드 항목
- Firestore read/write unit 추이
- GCS egress 비용
- 외부 LLM 호출비
- 인건비(수동운영 시간 x 표준시급)

## 31.3 전환 비용 항목
- 데이터 이관 스크립트 개발
- 이중쓰기 기간 운영비
- QA/회귀테스트 비용
- 온콜/교육비용

---

# 32. 법무 상세 체크리스트 (국문 약관 문안 가이드)

## 32.1 채팅 로그 고지 예시 요소
- 수집 목적: 답변 품질 향상, 분쟁 대응, 서비스 안전성
- 수집 항목: 질의/응답, 요청시각, UID, IP(정책에 따른 처리)
- 보관 기간: 명시 (예: 12개월)
- 이용자 권리: 열람·정정·삭제·처리정지

## 32.2 IP 처리 정책
- 운영보안 목적의 단기 원문 저장(예: 30일)
- 장기분석은 해시/익명화 데이터 사용
- 접근권한 최소화

## 32.3 휴먼택배 책임경계
- 금지물품 목록
- 파손/분실 책임범위
- 불가항력 조항
- 분쟁 접수 기한

## 32.4 OTT 컴플라이언스
- 서비스별 허용범위 표
- 금지 시 즉시 판매중단/환불정책
- 약관 변경 모니터링 담당자 지정

---

# 33. RAG 품질보증 체계 (QA + Eval)

## 33.1 오프라인 평가셋
- 지역/카테고리/시간대 균형 샘플
- 정답 근거 문서 매핑
- 금칙 질의셋(관광 외 질의 포함)

## 33.2 온라인 평가
- 클릭/체류/피드백 기반 약지도 학습
- 근거 링크 클릭률
- 답변 재질의율(재질의 높으면 품질 경고)

## 33.3 품질 루프 운영주기
- 일간: 품질경보 확인
- 주간: 오답 상위 50건 교정
- 월간: 소스 신뢰등급 재평가

## 33.4 차단/완화 정책
- 근거 부족(coverage<0.6): 제한된 답변 + 경고 배지
- 상충 근거 다수: “정보 상충” 문구 표기
- 저신뢰 소스 단독: 답변 생성 금지

---

# 34. 신뢰점수 모델 상세 (수식/피처/검증)

## 34.1 기본 수식
`Score_t = clip( Base + Σ(w_i * signal_i * decay_i) - Penalty_risk, 0, 1000 )`

## 34.2 피처군
- 행동성실: 완료율, 지연율, 응답속도
- 거래건전: 미납률, 분쟁패소율
- 계정안정: 로그인 패턴 안정성, 다중계정 의심도
- 커뮤니티기여: 유효 신고, 도움 피드백

## 34.3 모델 검증
- 안정성: 한 이벤트가 점수 과도변동 유발 금지
- 공정성: 특정 지역/기기 편향 검사
- 설명성: 상위 영향요인 3개 추출 가능

## 34.4 운영 룰
- 레벨 하락 시 사용자 안내 + 회복 가이드 제공
- 자동 제재는 L2까지, L3+는 운영자 승인

---

# 35. 위험대응 플레이북

## 35.1 장애 등급
- Sev1: 결제/정산 불능, 대규모 로그인 실패
- Sev2: 핵심 기능 성능저하
- Sev3: 부분 기능 오류

## 35.2 사고 대응 타임라인
- 0~15분: 감지/분류/지휘선언
- 15~60분: 우회조치/롤백
- 60분+: 근본원인 분석 착수
- 24시간 이내: 임시보고
- 72시간 이내: RCA 문서

## 35.3 커뮤니케이션 템플릿
- 내부: 영향범위/임시조치/ETA
- 외부: 사실 기반 공지 + 재발방지 계획

---

# 36. KPI 트리 심화 (계산식 포함)

## 36.1 관광 품질
- Evidence Coverage = 근거연결 문장수 / 전체 핵심문장수
- Answer Success Rate = 긍정피드백 답변수 / 전체답변수

## 36.2 배송 효율
- Match Success Rate = 매칭완료 주문 / 생성 주문
- On-Time Delivery Rate = SLA 내 완료 / 완료 주문

## 36.3 OTT 건전성
- Payment Success Rate = 정상납부 / 발행청구
- Churn Rate = 이탈멤버 / 전체멤버

## 36.4 리스크
- Dispute Rate = 분쟁건 / 완료거래
- Fraud Detection Precision = 실제사기 적발 / 사기의심 플래그

---

# 37. 롤아웃 세부 시나리오

## 37.1 지역 확장 순서
- 도시 A(관광 데이터 풍부) → 도시 B(배송 수요 밀집) → 도시 C

## 37.2 사용자군 확장
- 내부 테스트 그룹
- 초대코드 베타
- 공개가입

## 37.3 기능 플래그 정책
- `feature.delivery_settlement_v2`
- `feature.ott_replacement_auto`
- `feature.rag_source_badge`

롤백 규칙:
- KPI 가드레일 2개 이상 붕괴 시 즉시 off

---

# 38. 조직/역할/의사결정 구조

## 38.1 RACI
- Product: 요구사항 우선순위
- Engineering: 구현/품질
- Data/AI: 모델/평가
- Legal: 약관/규제
- Ops/CS: 운영/분쟁

## 38.2 승인 게이트
- 정책변경: Product+Legal 공동승인
- 정산로직 변경: Product+Finance+Engineering 승인
- 신뢰모델 변경: Data+Ops 승인

---

# 39. 테스트 전략 (기능/회귀/부하/보안)

## 39.1 기능 테스트
- 도메인별 happy path + edge case

## 39.2 회귀 테스트
- 고3 단계 체크리스트 자동화
- 이전 장애 재현 테스트셋 유지

## 39.3 부하 테스트
- 동시 사용자 1k/5k/10k 단계별
- p95, error rate, queue lag 측정

## 39.4 보안 테스트
- 인증 우회
- 권한 상승
- 민감정보 노출

---

# 40. 데이터 마이그레이션 런북

## 40.1 사전
- 스키마 동결 창구 지정
- 매핑 문서 확정
- 백필 스크립트 검증

## 40.2 실행
1. 이중쓰기 시작
2. 백필 실행
3. 읽기 전환(Shadow → Partial → Full)
4. 안정화 관측

## 40.3 사후
- 구 스토어 정리
- 비용 비교 리포트
- 장애/성능 회고

---

# 41. 보안/개인정보 기술통제

- 전송구간 TLS
- 저장구간 암호화(KMS)
- 비밀정보 Vault 관리
- 최소권한 IAM
- 접근로그 이상탐지
- 데이터 반출 통제

---

# 42. CS/운영 콘솔 요구사항

## 42.1 분쟁 콘솔
- 사건 타임라인
- 증빙 파일 뷰어
- 유사 분쟁 추천
- 판정 템플릿

## 42.2 정산 콘솔
- 청구/납부 상태
- 실패 사유 분류
- 수동 조정 기능(감사로그 필수)

## 42.3 신뢰 콘솔
- 사용자 score 추이
- 이벤트 기여도
- 제재 이력

---

# 43. 재무 시뮬레이션 프레임(개념)

- 입력: DAU, 주문수, 평균거래액, 수수료율, 미납률, 분쟁률
- 출력: 매출, 변동비, 인프라비, 운영비, 공헌이익
- 시나리오: 보수/기준/공격

---

# 44. 국제화/접근성 설계

- 다국어(ko/en/ja 우선)
- 접근성 토큰 공통화(fontScale, contrast, motionReduce)
- 화면리더 레이블 표준
- 색맹 대비 팔레트

---

# 45. 정책 엔진 규칙집 (초안)

## 45.1 질의 정책
- 관광 외 질의 → 안내 템플릿 응답
- 모델/버전/내부정보 질의 → 고정 응답

## 45.2 거래 정책
- 고위험 사용자 긴급배송 제한
- 반복 미납 시 OTT 신규가입 제한

## 45.3 리워드 정책
- 유효 신고 보상
- 허위 신고 패널티

---

# 46. 감사/컴플라이언스 운영

- 분기별 접근권한 점검
- 반기별 약관 문구 재검토
- 연 1회 모의침해/사고 대응훈련

---

# 47. 부록 F — 상세 체크리스트 묶음

## F.1 출시 전(기술)
- [ ] API 문서 최신화
- [ ] 스키마 마이그레이션 검증
- [ ] 백업/복구 테스트 완료
- [ ] 알람 룰 검증

## F.2 출시 전(운영)
- [ ] CS FAQ 업데이트
- [ ] 분쟁 템플릿 배포
- [ ] 온콜 캘린더 확정

## F.3 출시 전(법무)
- [ ] 약관 버전 공지
- [ ] 개인정보처리방침 반영
- [ ] 제3자 제공 목록 검토

---

# 48. 부록 G — SQL/쿼리 예시

```sql
-- 최근 30일 사용자 신뢰점수 변동 추이
SELECT user_id, date_trunc('day', created_at) d, SUM(delta) delta_sum
FROM trust_events
WHERE created_at >= now() - interval '30 day'
GROUP BY 1,2;
```

```sql
-- 배송 분쟁율(주간)
SELECT date_trunc('week', created_at) w,
       SUM(CASE WHEN status='disputed' THEN 1 ELSE 0 END)::float / COUNT(*) AS dispute_rate
FROM delivery_orders
GROUP BY 1
ORDER BY 1 DESC;
```

---

# 49. 부록 H — 운영 지표 대시보드 템플릿

- Acquisition
  - 신규가입수
  - 관광 질의수
- Activation
  - 첫 일정 등록률
  - 첫 배송 주문률
- Revenue
  - 주문당 매출
  - 정산 성공액
- Retention
  - 4주 재방문율
  - OTT 그룹 잔존율
- Risk
  - 분쟁율
  - 미납률

---

# 50. 최종 결론

1. 현재 단계에서는 Firebase/GCS 중심 운영이 타당하다.
2. 단, 비용/성능/운영시간 임계치가 확인되면 Hybrid 전환을 즉시 준비한다.
3. 고3 정책의 강제 리셋 구조는 품질 퇴행을 막는 핵심 안전장치다.
4. 신뢰점수·법무·운영을 제품 기능과 동급 우선순위로 둬야 슈퍼앱 확장이 가능하다.
5. 본 문서는 전략 문서가 아니라 **실행 표준서**이며, 모든 변경은 의사결정 로그를 남긴다.
