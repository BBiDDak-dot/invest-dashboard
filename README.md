# invest-dashboard

개인용 투자 분석 대시보드. 국내·미국 관심종목, 경제지표, 공시를 한곳에서 봄.

```
collector/  Python 수집기 (GitHub Actions가 평일 하루 2번 실행)
supabase/   DB 스키마
web/        Next.js 화면 (Vercel 배포)
```

## 처음 설정 (한 번만)

1. **API 키 발급** (모두 무료)
   - DART: https://opendart.fss.or.kr
   - FRED: https://fred.stlouisfed.org/docs/api/api_key.html
2. **Supabase**: https://supabase.com 에서 프로젝트 생성 → SQL Editor에 `supabase/schema.sql` 파일 내용을 전부 복사해 붙여넣고 Run.
   설정 > API에서 Project URL과 `service_role` 키를 확인함.
3. **GitHub Secrets** (저장소 Settings > Secrets and variables > Actions):
   `SUPABASE_URL`, `SUPABASE_KEY`(service_role), `DART_API_KEY`, `FRED_API_KEY`
4. **첫 수집**: Actions 탭 > collect > Run workflow, days에 `1000` 입력.
5. **Vercel 배포**: https://vercel.com 에서 이 저장소 import → Root Directory를 `web`으로 지정 →
   환경변수 `SUPABASE_URL`, `SUPABASE_KEY` 입력.
   무료 플랜에서는 사이트 주소를 아는 사람은 누구나 볼 수 있음(공개 시장 데이터만 표시함).

## 관심종목 추가

Supabase Table Editor에서 `watchlist`에 행 추가.
- 국내: `ticker`=종목코드(예: 005930), `market`=KR, `corp_code`=DART 고유번호(공시 수집용)
- 미국: `ticker`=심볼(예: AAPL), `market`=US

경제지표 목록은 `collector/config.py`에서 수정함. 목록에서 뺀 지표는 다음 수집 때 DB에서도 지워짐.
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
- [ ] 1단계 후반: 재무제표(DART·SEC EDGAR)
- [ ] 2단계: 수급(투자자별 매매, 외국인 보유, 공매도)
- [ ] 3단계: 증권사 리포트 AI 요약, 알림
