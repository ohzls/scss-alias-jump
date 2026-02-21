# 64GB Mac mini migration checklist (2026-02-20)

## 0) 중지 요청 반영
- 기존 작업 중지.
- 아래는 **이관 준비용 체크리스트 + 수동 복사 대상 분석 결과**.

---

## 1) 새 Mac 기본 설치 (OpenClaw 설치 전)
아래 순서로 설치 권장.

1. Xcode Command Line Tools
```bash
xcode-select --install
```

2. Homebrew
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

3. Git / Node / Python / Docker / DB 클라이언트
```bash
brew install git node pnpm pyenv uv postgresql@16
brew install --cask docker
```

4. 공통 런타임/유틸
```bash
brew install jq yq ripgrep fd wget
```

5. Java( accaidss_back 용 )
```bash
brew install temurin@17
```

6. OpenClaw 설치 후 확인
```bash
openclaw help
openclaw status
```

---

## 2) Documents/projects 내 저장소 분석 요약
Git 저장소:
- _assets
- aacaidss_front_user
- accaidss_back
- human-delivery-back
- human-delivery-front
- nlrc
- ott-sharing-back
- ott-sharing-front
- predictourist
- predictourist-backend
- predictourist-backend-chat
- predictourist-kb
- predictourist-learning
- scss-alias-jump

주의(비-Git 폴더):
- `human-delivery/`
- `ott-sharing/`

---

## 3) 자동으로 안 옮겨지는(또는 Git 제외) 핵심 파일/폴더
> `node_modules` 같은 재설치 가능한 산출물은 제외.

### A. 환경변수/레지스트리 파일 (수동 복사)
- /Users/seongwonseo/Documents/projects/human-delivery-back/.env
- /Users/seongwonseo/Documents/projects/ott-sharing-back/.env
- /Users/seongwonseo/Documents/projects/predictourist/.env
- /Users/seongwonseo/Documents/projects/predictourist-backend/.env
- /Users/seongwonseo/Documents/projects/predictourist-backend-chat/.env
- /Users/seongwonseo/Documents/projects/predictourist-kb/.env
- /Users/seongwonseo/Documents/projects/predictourist-learning/.env
- /Users/seongwonseo/Documents/projects/human-delivery-front/.npmrc
- /Users/seongwonseo/Documents/projects/ott-sharing-front/.npmrc
- /Users/seongwonseo/Documents/projects/predictourist/.npmrc
- (비-Git) /Users/seongwonseo/Documents/projects/human-delivery/.npmrc
- (비-Git) /Users/seongwonseo/Documents/projects/ott-sharing/.env

### B. 대용량/로컬 데이터(프로젝트 의존)
- /Users/seongwonseo/Documents/projects/predictourist-learning/downloads  (~892MB)
- /Users/seongwonseo/Documents/projects/predictourist-learning/datafiles  (~173MB)
- /Users/seongwonseo/Documents/projects/predictourist-learning/models     (~25MB)
- /Users/seongwonseo/Documents/projects/predictourist-learning/gcp
- /Users/seongwonseo/Documents/projects/predictourist-learning/.secrets
- /Users/seongwonseo/Documents/projects/predictourist-kb/data

### C. 로컬 DB 파일
- /Users/seongwonseo/Documents/projects/human-delivery-back/prisma/dev.db

### D. OpenClaw 관련 (프로젝트 밖이지만 필수)
- ~/.openclaw/
- ~/.gitconfig
- ~/.ssh/ (필요 시)

---

## 4) 절대 옮기지 말 것 (재설치/재생성)
- 모든 `node_modules/`
- 모든 `.venv/` / `venv/`
- `dist/`, `build/`, `.next/`, `.cache/`, `coverage/`, `logs/`, `tmp/`

---

## 5) 권장 이관 방식

### 5-1. 코드 + 설정 파일 이관
- 각 Git 저장소는 커밋/푸시 후 새 Mac에서 clone.
- 위 3-A 목록은 수동 복사(또는 암호화 보관 후 복원).

### 5-2. 대용량 데이터 이관 (predictourist-learning)
예시(rsync):
```bash
rsync -avh --progress \
  /Users/seongwonseo/Documents/projects/predictourist-learning/downloads \
  /Users/seongwonseo/Documents/projects/predictourist-learning/datafiles \
  /Users/seongwonseo/Documents/projects/predictourist-learning/models \
  /Users/seongwonseo/Documents/projects/predictourist-learning/gcp \
  /Users/seongwonseo/Documents/projects/predictourist-learning/.secrets \
  <NEW_MAC_PATH>/predictourist-learning/
```

### 5-3. Docker Postgres 데이터 이관
권장: dump/restore
```bash
# old Mac
docker exec -t predictourist_postgres pg_dumpall -U predictourist > /tmp/predictourist_pg_dump.sql

# new Mac (container up 후)
cat /tmp/predictourist_pg_dump.sql | docker exec -i predictourist_postgres psql -U predictourist
```

---

## 6) 새 Mac에서 프로젝트별 복구 순서(자동화 스크립트 작성 기준)
1. 저장소 clone
2. `.env/.npmrc/.secrets` 복원
3. 의존성 설치
   - Node 프로젝트: `npm ci` (or `pnpm i --frozen-lockfile`)
   - Python 프로젝트: `python -m venv .venv && .venv/bin/pip install -r requirements.txt`
   - Java(gradle): `./gradlew build`
4. Docker 서비스 기동
5. DB 연결 확인
6. smoke test 실행

---

## 7) 빠른 검증 체크
- `docker ps`에서 DB 컨테이너 healthy
- 각 프로젝트 `npm ci` / python deps 설치 성공
- predictourist-learning: DB 접속 + 핵심 스크립트 dry-run 통과
- OpenClaw: `openclaw status` 정상
