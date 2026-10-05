# invest-dashboard

개인용 투자 분석 대시보드. 국내·미국 관심종목, 재무 추이, 경제지표, 수급, 공시, 증권사 리포트 요약을 한곳에서 봄.

```
collector/  Python 수집기 (GitHub Actions가 평일 하루 2번 실행)
supabase/   DB 스키마
web/        Next.js 화면 (Vercel 배포)
```

## 처음 설정 (한 번만)

1. **API 키 발급**
   - DART: https://opendart.fss.or.kr
   - FRED: https://fred.stlouisfed.org/docs/api/api_key.html
   - Gemini API(리포트·유튜브 요약, 무료 한도 있음): https://aistudio.google.com/apikey
2. **Supabase**: https://supabase.com 에서 프로젝트 생성 → SQL Editor에 `supabase/schema.sql` 파일 내용을 전부 복사해 붙여넣고 Run.
   이어서 `supabase/migrations/` 안의 파일도 번호 순서대로 같은 방법으로 Run.
   설정 > API에서 Project URL과 `service_role` 키를 확인함.
3. **GitHub Secrets** (저장소 Settings > Secrets and variables > Actions):
   `SUPABASE_URL`, `SUPABASE_KEY`(service_role), `DART_API_KEY`, `FRED_API_KEY`
4. **첫 수집**: Actions 탭 > collect > Run workflow, days에 `1000` 입력.
   종목 검색용 목록은 Actions 탭 > securities > Run workflow (이후 주 1회 자동).
5. **Vercel 배포**: https://vercel.com 에서 이 저장소 import → Root Directory를 `web`으로 지정 →
   환경변수 `SUPABASE_URL`, `SUPABASE_KEY`, `SITE_PASSWORD`(사이트 로그인 비밀번호), `GEMINI_API_KEY` 입력.
   `SITE_PASSWORD`가 없으면 누구나 볼 수 있고 편집은 막힘.

## 관심종목 관리

사이트의 관심종목 화면에서 검색해 추가하고, 종목명을 눌러 목표주가·투자아이디어 등을 편집함.
부채비율·유보율은 최신 분기 재무상태표로 자동 계산함(유보율은 국내 종목만).

투자 지표 목록은 `collector/config.py`에서 수정함. 목록에서 뺀 지표는 다음 수집 때 DB에서도 지워짐.
ISM 제조업 PMI는 FRED에 없어서 ISM의 PR Newswire 발표문 제목에서 읽어옴.

## 로컬 실행

```bash
# 웹
cd web && cp .env.example .env.local && npm install && npm run dev

# 수집기 (SUPABASE_URL이 없으면 저장하지 않고 결과만 출력)
cd collector && pip install -r requirements.txt && python main.py --days 30
```

## 로드맵

- [x] 1단계: 관심종목 시세, 공시, 경제지표
- [x] 관심종목 검색·편집, 재무 추이(DART·SEC), 시장 수급(KOSPI·KOSDAQ), 리포트·유튜브 요약(Gemini)
- [ ] 종목별 수급, 공매도, 알림
